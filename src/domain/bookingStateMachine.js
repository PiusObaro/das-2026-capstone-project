export const BOOKING_STATES = Object.freeze({
  PENDING: "PENDING",
  CONFIRMED: "CONFIRMED",
  CANCELLED: "CANCELLED",
});

const ALLOWED_TRANSITIONS = {
  [BOOKING_STATES.PENDING]: [
    BOOKING_STATES.CONFIRMED,
    BOOKING_STATES.CANCELLED,
  ],
  [BOOKING_STATES.CONFIRMED]: [],
  [BOOKING_STATES.CANCELLED]: [],
};

export function canTransitionBooking(currentState, nextState) {
  return ALLOWED_TRANSITIONS[currentState]?.includes(nextState) ?? false;
}

export function transitionBooking(booking, nextState) {
  if (!booking || typeof booking !== "object") {
    throw new TypeError("A booking object is required.");
  }

  if (!Object.values(BOOKING_STATES).includes(booking.status)) {
    throw new Error(`Invalid current booking state: ${booking.status}`);
  }

  if (!Object.values(BOOKING_STATES).includes(nextState)) {
    throw new Error(`Invalid next booking state: ${nextState}`);
  }

  if (!canTransitionBooking(booking.status, nextState)) {
    throw new Error(
      `Cannot change booking from ${booking.status} to ${nextState}.`
    );
  }

  return { ...booking, status: nextState };
}
