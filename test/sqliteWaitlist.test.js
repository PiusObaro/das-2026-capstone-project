
import test from "node:test";
import assert from "node:assert/strict";

import { openDatabase } from "../src/db/database.js";
import { createSqliteEventService } from "../src/services/sqliteEventService.js";

test("expired waitlist offer passes tickets to the next attendee", async (t) => {
  const db = openDatabase(":memory:");
  t.after(() => db.close());

  // Use a controllable clock.
  let currentTime = new Date("2026-11-19T12:00:00.000Z");

  const service = createSqliteEventService(db, {
    now: () => new Date(currentTime)
  });

  // Create three test attendees.
  const attendees = [
    ["buyer-1", "buyer@test.com"],
    ["waitlist-1", "first@test.com"],
    ["waitlist-2", "second@test.com"]
  ];

  const insertUser = db.prepare(`
    INSERT INTO users (id, name, email, password_hash, role)
    VALUES (?, ?, ?, ?, 'attendee')
  `);

  for (const [id, email] of attendees) {
    insertUser.run(id, "Test Attendee", email, "test-password");
  }

  // Create an event and a tier with one ticket.
  const event = service.createEvent({
    title: "Waitlist Test Concert",
    city: "Lagos",
    venue: "Test Hall",
    date: "2026-12-30"
  });

  const tier = service.addTier(event.id, {
    name: "General Admission",
    priceCents: 500000,
    capacity: 1
  });

  service.publishEvent(event.id);

  // The buyer takes the only available ticket.
  const booking = service.createBooking(
    tier.id,
    "Test Buyer",
    1,
    "buyer-1"
  );

  // Add two people to the waitlist in FIFO order.
  const insertWaitlist = db.prepare(`
    INSERT INTO waitlist (
      id, tier_id, attendee_id, customer_name,
      quantity, status, created_at
    )
    VALUES (?, ?, ?, ?, 1, 'WAITING', ?)
  `);

  insertWaitlist.run(
    "wait-1",
    tier.id,
    "waitlist-1",
    "First Attendee",
    "2026-11-19 10:00:00"
  );

  insertWaitlist.run(
    "wait-2",
    tier.id,
    "waitlist-2",
    "Second Attendee",
    "2026-11-19 10:01:00"
  );

  // Cancel the buyer's booking.
  // The first waitlisted attendee should receive the ticket.
  service.cancelUnpaidBooking(booking.reference, "buyer-1");

  let entries = db.prepare(`
    SELECT id, status, expires_at
    FROM waitlist
    ORDER BY created_at ASC
  `).all();

  assert.equal(entries[0].status, "OFFERED");
  assert.equal(entries[1].status, "WAITING");

  // Move the clock forward by 16 minutes.
  currentTime = new Date("2026-11-19T12:16:00.000Z");

  const expiredCount = service.expireWaitlistOffers();

  assert.equal(expiredCount, 1);

  entries = db.prepare(`
    SELECT id, status
    FROM waitlist
    ORDER BY created_at ASC
  `).all();

  assert.equal(entries[0].status, "EXPIRED");
  assert.equal(entries[1].status, "OFFERED");

  // The second attendee now holds the reserved ticket.
  const updatedTier = db.prepare(`
    SELECT available
    FROM tiers
    WHERE id = ?
  `).get(tier.id);

  assert.equal(updatedTier.available, 0);
});


test("attendee can accept a waitlist offer and receive a booking", async (t) => {
  const db = openDatabase(":memory:");
  t.after(() => db.close());

  const currentTime = new Date("2026-11-19T12:00:00.000Z");

  const service = createSqliteEventService(db, {
    now: () => new Date(currentTime)
  });

  // Create the buyer and the waitlisted attendee.
  const insertUser = db.prepare(`
    INSERT INTO users (id, name, email, password_hash, role)
    VALUES (?, ?, ?, ?, 'attendee')
  `);

  insertUser.run("buyer-1", "Original Buyer", "buyer@test.com", "password");
  insertUser.run("waitlist-1", "Waitlist Attendee", "waitlist@test.com", "password");

  // Create an event and a ticket tier with one ticket.
  const event = service.createEvent({
    title: "Waitlist Acceptance Concert",
    city: "Lagos",
    venue: "Test Hall",
    date: "2026-12-30"
  });

  const tier = service.addTier(event.id, {
    name: "General Admission",
    priceCents: 500000,
    capacity: 1
  });

  service.publishEvent(event.id);

  // The original buyer takes the only ticket.
  const booking = service.createBooking(
    tier.id,
    "Original Buyer",
    1,
    "buyer-1"
  );

  // Add another attendee to the waitlist.
  db.prepare(`
    INSERT INTO waitlist (
      id, tier_id, attendee_id, customer_name,
      quantity, status, created_at
    )
    VALUES (?, ?, ?, ?, 1, 'WAITING', ?)
  `).run(
    "wait-1",
    tier.id,
    "waitlist-1",
    "Waitlist Attendee",
    "2026-11-19 10:00:00"
  );

  // Cancel the original buyer's booking.
  // This should create an offer for the waitlisted attendee.
  service.cancelUnpaidBooking(booking.reference, "buyer-1");

  const offer = db.prepare(`
    SELECT status
    FROM waitlist
    WHERE id = ?
  `).get("wait-1");

  assert.equal(offer.status, "OFFERED");

  // Accept the offer.
  const acceptedBooking = service.acceptWaitlistOffer(
    "wait-1",
    "waitlist-1"
  );

  assert.equal(acceptedBooking.attendeeId, "waitlist-1");
  assert.equal(acceptedBooking.tierId, tier.id);
  assert.equal(acceptedBooking.quantity, 1);
  assert.equal(acceptedBooking.status, "PENDING");
  assert.equal(acceptedBooking.paymentStatus, "UNPAID");

  // Confirm that the waitlist entry is now ACCEPTED.
  const updatedOffer = db.prepare(`
    SELECT status
    FROM waitlist
    WHERE id = ?
  `).get("wait-1");

  assert.equal(updatedOffer.status, "ACCEPTED");

  // Confirm that a booking was created.
  const savedBooking = db.prepare(`
    SELECT *
    FROM bookings
    WHERE reference = ?
  `).get(acceptedBooking.reference);

  assert.ok(savedBooking);

  // The ticket was already reserved by the offer.
  // Availability must remain zero, not become negative.
  const updatedTier = db.prepare(`
    SELECT available
    FROM tiers
    WHERE id = ?
  `).get(tier.id);

  assert.equal(updatedTier.available, 0);
});


test("attendee cannot accept another attendee's waitlist offer", async (t) => {
  const db = openDatabase(":memory:");
  t.after(() => db.close());

  const service = createSqliteEventService(db);

  const insertUser = db.prepare(`
    INSERT INTO users (id, name, email, password_hash, role)
    VALUES (?, ?, ?, ?, 'attendee')
  `);

  insertUser.run("buyer-1", "Buyer", "buyer@test.com", "password");
  insertUser.run("waitlist-1", "Waitlisted", "waitlist@test.com", "password");
  insertUser.run("other-1", "Other Attendee", "other@test.com", "password");

  const event = service.createEvent({
    title: "Waitlist Security Test",
    city: "Lagos",
    venue: "Test Hall",
    date: "2026-12-30"
  });

  const tier = service.addTier(event.id, {
    name: "General Admission",
    priceCents: 500000,
    capacity: 1
  });

  service.publishEvent(event.id);

  const booking = service.createBooking(
    tier.id,
    "Buyer",
    1,
    "buyer-1"
  );

  db.prepare(`
    INSERT INTO waitlist (
      id, tier_id, attendee_id, customer_name,
      quantity, status, created_at
    )
    VALUES (?, ?, ?, ?, 1, 'WAITING', ?)
  `).run(
    "wait-1",
    tier.id,
    "waitlist-1",
    "Waitlisted Attendee",
    "2026-11-19 10:00:00"
  );

  service.cancelUnpaidBooking(booking.reference, "buyer-1");

  assert.throws(
    () => service.acceptWaitlistOffer("wait-1", "other-1"),
    {
      code: "FORBIDDEN"
    }
  );

  const offer = db.prepare(`
    SELECT status
    FROM waitlist
    WHERE id = ?
  `).get("wait-1");

  assert.equal(offer.status, "OFFERED");
});


test("expired waitlist offer cannot be accepted", async (t) => {
  const db = openDatabase(":memory:");
  t.after(() => db.close());

  let currentTime = new Date("2026-11-19T12:00:00.000Z");

  const service = createSqliteEventService(db, {
    now: () => new Date(currentTime)
  });

  const insertUser = db.prepare(`
    INSERT INTO users (id, name, email, password_hash, role)
    VALUES (?, ?, ?, ?, 'attendee')
  `);

  insertUser.run("buyer-1", "Buyer", "buyer@test.com", "password");
  insertUser.run("waitlist-1", "Waitlisted", "waitlist@test.com", "password");

  const event = service.createEvent({
    title: "Expired Offer Test",
    city: "Lagos",
    venue: "Test Hall",
    date: "2026-12-30"
  });

  const tier = service.addTier(event.id, {
    name: "General Admission",
    priceCents: 500000,
    capacity: 1
  });

  service.publishEvent(event.id);

  const booking = service.createBooking(
    tier.id,
    "Buyer",
    1,
    "buyer-1"
  );

  db.prepare(`
    INSERT INTO waitlist (
      id, tier_id, attendee_id, customer_name,
      quantity, status, created_at
    )
    VALUES (?, ?, ?, ?, 1, 'WAITING', ?)
  `).run(
    "wait-1",
    tier.id,
    "waitlist-1",
    "Waitlisted Attendee",
    "2026-11-19 10:00:00"
  );

  service.cancelUnpaidBooking(booking.reference, "buyer-1");

  // Move time forward beyond the 15-minute offer period.
  currentTime = new Date("2026-11-19T12:16:00.000Z");

  assert.throws(
    () => service.acceptWaitlistOffer("wait-1", "waitlist-1"),
    {
      code: "INVALID_STATE"
    }
  );

  const offer = db.prepare(`
    SELECT status
    FROM waitlist
    WHERE id = ?
  `).get("wait-1");

  assert.equal(offer.status, "EXPIRED");

  const bookings = db.prepare(`
    SELECT COUNT(*) AS total
    FROM bookings
    WHERE attendee_id = ?
  `).get("waitlist-1");

  assert.equal(bookings.total, 0);
});

