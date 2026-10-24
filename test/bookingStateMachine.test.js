import test from "node:test";
import assert from "node:assert/strict";

import {
  BOOKING_STATES,
  canTransitionBooking,
  transitionBooking,
} from "../src/domain/bookingStateMachine.js";

test("pending booking can be confirmed", () => {
  const booking = { reference: "BK001", status: "PENDING" };

  const updated = transitionBooking(booking, BOOKING_STATES.CONFIRMED);

  assert.equal(updated.status, "CONFIRMED");
  assert.equal(booking.status, "PENDING");
});

test("pending booking can be cancelled", () => {
  const booking = { reference: "BK002", status: "PENDING" };

  const updated = transitionBooking(booking, BOOKING_STATES.CANCELLED);

  assert.equal(updated.status, "CANCELLED");
});

test("cancelled booking cannot be confirmed", () => {
  const booking = { reference: "BK003", status: "CANCELLED" };

  assert.equal(
    canTransitionBooking("CANCELLED", "CONFIRMED"),
    false
  );

  assert.throws(
    () => transitionBooking(booking, BOOKING_STATES.CONFIRMED),
    /Cannot change booking/
  );
});

test("confirmed booking cannot be cancelled", () => {
  const booking = { reference: "BK004", status: "CONFIRMED" };

  assert.throws(
    () => transitionBooking(booking, BOOKING_STATES.CANCELLED),
    /Cannot change booking/
  );
});

test("invalid next state is rejected", () => {
  const booking = { reference: "BK005", status: "PENDING" };

  assert.throws(
    () => transitionBooking(booking, "PAID"),
    /Invalid next booking state/
  );
});