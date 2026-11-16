
import test from "node:test";
import assert from "node:assert/strict";

import { openDatabase } from "../src/db/database.js";
import { createSqliteEventService } from "../src/services/sqliteEventService.js";

test("paid booking cancellation records refund and restores tickets", async (t) => {
  // Use a separate in-memory database.
  const db = openDatabase(":memory:");
  t.after(() => db.close());

  // Freeze time so the refund calculation is predictable.
  const fixedNow = () => new Date("2026-11-16T12:00:00.000Z");

  const service = createSqliteEventService(db, {
    now: fixedNow
  });

  const attendeeId = "attendee-test-1";

  // Create a test attendee.
  db.prepare(`
    INSERT INTO users (id, name, email, password_hash, role)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    attendeeId,
    "Test Attendee",
    "attendee@test.com",
    "test-password-hash",
    "attendee"
  );

  // Create and publish an event.
  const event = service.createEvent({
    title: "Refund Test Concert",
    city: "Lagos",
    venue: "Test Hall",
    date: "2026-11-30"
  });

  const tier = service.addTier(event.id, {
    name: "General Admission",
    priceCents: 500000,
    capacity: 5
  });

  service.publishEvent(event.id);

  // Book two tickets.
  const booking = service.createBooking(
    tier.id,
    "Test Attendee",
    2,
    attendeeId
  );

  assert.equal(booking.status, "PENDING");

  // Pay for the booking.
  const paidBooking = await service.payBooking(
    booking.reference,
    attendeeId
  );

  assert.equal(paidBooking.status, "CONFIRMED");
  assert.equal(paidBooking.paymentStatus, "PAID");

  // Cancel the paid booking.
  const cancelledBooking = service.cancelUnpaidBooking(
    booking.reference,
    attendeeId
  );

  // Check the refund.
  assert.equal(cancelledBooking.status, "CANCELLED");
  assert.equal(cancelledBooking.refundAmountCents, 1000000);
  assert.equal(cancelledBooking.refundPercentage, 100);
  assert.equal(cancelledBooking.refundStatus, "SIMULATED");

  // Check that the two tickets have been restored.
  const updatedTier = db.prepare(`
    SELECT available
    FROM tiers
    WHERE id = ?
  `).get(tier.id);

  assert.equal(updatedTier.available, 5);

  // A second cancellation must be rejected.
  assert.throws(() => {
    service.cancelUnpaidBooking(
      booking.reference,
      attendeeId
    );
  });
});

test("refund policy handles the 10-day, 9-day, 3-day and 2-day boundaries", async (t) => {
  const cases = [
    { days: 10, expectedPercentage: 100 },
    { days: 9, expectedPercentage: 50 },
    { days: 3, expectedPercentage: 50 },
    { days: 2, expectedPercentage: 0 }
  ];

  for (const item of cases) {
    const db = openDatabase(":memory:");
    const fixedNow = () => new Date("2026-11-16T12:00:00.000Z");

    t.after(() => db.close());

    const service = createSqliteEventService(db, {
      now: fixedNow
    });

    const attendeeId = `attendee-${item.days}`;

    db.prepare(`
      INSERT INTO users (id, name, email, password_hash, role)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      attendeeId,
      "Test Attendee",
      `attendee${item.days}@test.com`,
      "test-password-hash",
      "attendee"
    );

    const eventDate = new Date(
      Date.UTC(2026, 10, 16 + item.days)
    ).toISOString().slice(0, 10);

    const event = service.createEvent({
      title: `Refund Test ${item.days} Days`,
      city: "Lagos",
      venue: "Test Hall",
      date: eventDate
    });

    const tier = service.addTier(event.id, {
      name: "General Admission",
      priceCents: 500000,
      capacity: 5
    });

    service.publishEvent(event.id);

    const booking = service.createBooking(
      tier.id,
      "Test Attendee",
      1,
      attendeeId
    );

    await service.payBooking(booking.reference, attendeeId);

    const cancelled = service.cancelUnpaidBooking(
      booking.reference,
      attendeeId
    );

    assert.equal(
      cancelled.refundPercentage,
      item.expectedPercentage,
      `${item.days} days before event`
    );

    assert.equal(
      cancelled.refundAmountCents,
      500000 * item.expectedPercentage / 100
    );
  }
});
