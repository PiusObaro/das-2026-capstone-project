
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

// Determine how many calendar days remain before the event.
export function getDaysUntilEvent(eventDate, now = new Date()) {
  const event = new Date(`${eventDate}T00:00:00.000Z`);

  if (Number.isNaN(event.getTime())) {
    throw new Error("Invalid event date.");
  }

  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );

  return Math.floor(
    (event.getTime() - today) / DAY_IN_MILLISECONDS
  );
}

// Apply the EventHub refund policy.
export function getRefundPercentage(daysUntilEvent) {
  if (daysUntilEvent >= 10) {
    return 100;
  }

  if (daysUntilEvent >= 3) {
    return 50;
  }

  return 0;
}

// Calculate the refund amount.
export function calculateRefund(totalCents, eventDate, now = new Date()) {
  if (!Number.isInteger(totalCents) || totalCents < 0) {
    throw new Error("Booking amount must be a non-negative integer.");
  }

  const daysUntilEvent = getDaysUntilEvent(eventDate, now);
  const percentage = getRefundPercentage(daysUntilEvent);

  return {
    daysUntilEvent,
    percentage,
    refundAmountCents: Math.round(totalCents * percentage / 100)
  };
}
