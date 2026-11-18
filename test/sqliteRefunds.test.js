
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


test("unpaid booking expires after 15 minutes and restores tickets", async (t) => {
  const db = openDatabase(":memory:");
  t.after(() => db.close());

  // Use a controllable clock.
  let currentTime = new Date("2026-11-17T12:00:00.000Z");

  const service = createSqliteEventService(db, {
    now: () => new Date(currentTime)
  });

  const attendeeId = "expiry-test-attendee";

  db.prepare(`
    INSERT INTO users (id, name, email, password_hash, role)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    attendeeId,
    "Expiry Test Attendee",
    "expiry@test.com",
    "test-password-hash",
    "attendee"
  );

  const event = service.createEvent({
    title: "Expiry Test Concert",
    city: "Lagos",
    venue: "Test Hall",
    date: "2026-12-05"
  });

  const tier = service.addTier(event.id, {
    name: "General Admission",
    priceCents: 500000,
    capacity: 5
  });

  service.publishEvent(event.id);

  // Create one unpaid booking.
  const booking = service.createBooking(
    tier.id,
    "Expiry Test Attendee",
    1,
    attendeeId
  );

  assert.equal(booking.status, "PENDING");

  // Confirm the booking expires 15 minutes after creation.
  assert.equal(
    booking.expiresAt,
    "2026-11-17T12:15:00.000Z"
  );

  // Move the clock forward by 16 minutes.
  currentTime = new Date("2026-11-17T12:16:00.000Z");

  // Expire unpaid bookings.
  const expiredCount = service.expireUnpaidBookings();

  assert.equal(expiredCount, 1);

  // Check the booking status in the database.
  const updatedBooking = db.prepare(`
    SELECT status
    FROM bookings
    WHERE reference = ?
  `).get(booking.reference);

  assert.equal(updatedBooking.status, "EXPIRED");

  // Check that the ticket has been restored.
  const updatedTier = db.prepare(`
    SELECT available
    FROM tiers
    WHERE id = ?
  `).get(tier.id);

  assert.equal(updatedTier.available, 5);

  // Running expiry again must not expire the same booking twice.
  assert.equal(service.expireUnpaidBookings(), 0);
});


test("expired unpaid booking cannot be paid and tickets are restored", async (t) => {
  const db = openDatabase(":memory:");
  t.after(() => db.close());

  let currentTime = new Date("2026-11-17T12:00:00.000Z");

  const service = createSqliteEventService(db, {
    now: () => new Date(currentTime)
  });

  const attendeeId = "expired-payment-attendee";

  db.prepare(`
    INSERT INTO users (id, name, email, password_hash, role)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    attendeeId,
    "Expired Payment Attendee",
    "expired-payment@test.com",
    "test-password-hash",
    "attendee"
  );

  const event = service.createEvent({
    title: "Expired Payment Concert",
    city: "Lagos",
    venue: "Test Hall",
    date: "2026-12-05"
  });

  const tier = service.addTier(event.id, {
    name: "General Admission",
    priceCents: 500000,
    capacity: 5
  });

  service.publishEvent(event.id);

  const booking = service.createBooking(
    tier.id,
    "Expired Payment Attendee",
    1,
    attendeeId
  );

  // Move the clock beyond the 15-minute payment deadline.
  currentTime = new Date("2026-11-17T12:16:00.000Z");

  await assert.rejects(
  () => service.payBooking(booking.reference, attendeeId),
  /expired/i
);
  const updatedBooking = db.prepare(`
    SELECT status, payment_status
    FROM bookings
    WHERE reference = ?
  `).get(booking.reference);

  assert.equal(updatedBooking.status, "EXPIRED");
  assert.equal(updatedBooking.payment_status, "UNPAID");

  const updatedTier = db.prepare(`
    SELECT available
    FROM tiers
    WHERE id = ?
  `).get(tier.id);

  assert.equal(updatedTier.available, 5);
});


test("bulk payment rejects expired bookings and restores their tickets", async (t) => {
  const db = openDatabase(":memory:");
  t.after(() => db.close());

  let currentTime = new Date("2026-11-17T12:00:00.000Z");

  const service = createSqliteEventService(db, {
    now: () => new Date(currentTime)
  });

  const attendeeId = "bulk-expiry-attendee";

  db.prepare(`
    INSERT INTO users (id, name, email, password_hash, role)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    attendeeId,
    "Bulk Expiry Attendee",
    "bulk-expiry@test.com",
    "test-password-hash",
    "attendee"
  );

  const event = service.createEvent({
    title: "Bulk Expiry Concert",
    city: "Lagos",
    venue: "Test Hall",
    date: "2026-12-05"
  });

  const tier = service.addTier(event.id, {
    name: "General Admission",
    priceCents: 500000,
    capacity: 5
  });

  service.publishEvent(event.id);

  const bookingOne = service.createBooking(
    tier.id,
    "Bulk Expiry Attendee One",
    1,
    attendeeId
  );

  const bookingTwo = service.createBooking(
    tier.id,
    "Bulk Expiry Attendee Two",
    1,
    attendeeId
  );

  // Move beyond the 15-minute payment deadline.
  currentTime = new Date("2026-11-17T12:16:00.000Z");

  assert.throws(
  () => service.payBookings(
    [bookingOne.reference, bookingTwo.reference],
    attendeeId
  ),
  /expired/i
);

  const expiredBookings = db.prepare(`
    SELECT status, payment_status
    FROM bookings
    WHERE reference IN (?, ?)
  `).all(bookingOne.reference, bookingTwo.reference);

  assert.equal(expiredBookings.length, 2);

  for (const booking of expiredBookings) {
    assert.equal(booking.status, "EXPIRED");
    assert.equal(booking.payment_status, "UNPAID");
  }

  const updatedTier = db.prepare(`
    SELECT available
    FROM tiers
    WHERE id = ?
  `).get(tier.id);

  assert.equal(updatedTier.available, 5);
});

