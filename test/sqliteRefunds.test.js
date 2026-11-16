
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
