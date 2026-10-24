
import { DomainError } from "./errors.js";
import { newId, newReference } from "./ids.js";
import { Queue } from "./waitlistQueue.js";

function fail(message, code = "VALIDATION") {
  throw new DomainError(message, code);
}

function requireName(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    fail(`${label} must not be empty.`);
  }
  return value.trim();
}

function requireNameOrEmpty(value, label) {
  if (typeof value !== "string") {
    fail(`${label} must be text.`);
  }
  return value.trim();
}


function requireValidDate(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    fail("Date must be a valid date in YYYY-MM-DD format.");
  }

  const date = new Date(`${value}T00:00:00Z`);

  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    fail("Date must be a valid date in YYYY-MM-DD format.");
  }

  return value;
}

function requireInteger(value, label, min, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    fail(`${label} must be a whole number from ${min} to ${max}.`);
  }
  return value;
}

function getEvent(store, eventId) {
  const event = store.events.get(eventId);
  if (!event) fail("Event not found.", "NOT_FOUND");
  return event;
}

function getTier(store, tierId) {
  const tier = store.tiers.get(tierId);
  if (!tier) fail("Ticket tier not found.", "NOT_FOUND");
  return tier;
}

export function createStore() {
  return {
    events: new Map(),
    tiers: new Map(),
    bookingsByReference: new Map(),
    waitlists: new Map()
  };
}

export function createEvent(
  store,
  { name, title, city = "", venue = "", date = "" }
) {
  const eventName = requireName(title ?? name, "Event title");

  const event = {
    id: newId(),
    name: eventName,
    city: requireNameOrEmpty(city, "City"),
    venue: requireNameOrEmpty(venue, "Venue"),
    date: requireValidDate(date),    published: false,
    tiers: new Map()
  };

  store.events.set(event.id, event);
  return event;
}

export function addTier(store, eventId, { name, priceCents, capacity }) {
  const event = getEvent(store, eventId);
  const tierName = requireName(name, "Tier name");

  requireInteger(priceCents, "Price in kobo/cents", 0);
  requireInteger(capacity, "Capacity", 1);

  for (const tier of event.tiers.values()) {
    if (tier.name.toLowerCase() === tierName.toLowerCase()) {
      fail("A ticket tier with this name already exists.");
    }
  }

  const tier = {
    id: newId(),
    eventId,
    name: tierName,
    priceCents,
    capacity,
    available: capacity
  };

  event.tiers.set(tier.id, tier);
  store.tiers.set(tier.id, tier);
  store.waitlists.set(tier.id, new Queue());

  return tier;
}

export function publishEvent(store, eventId) {
  const event = getEvent(store, eventId);

  if (event.tiers.size === 0) {
    fail(
      "An event must have at least one ticket tier before publishing.",
      "INVALID_STATE"
    );
  }

  event.published = true;
  return event;
}

export function unpublishEvent(store, eventId) {
  const event = getEvent(store, eventId);
  event.published = false;
  return event;
}

export function bookTickets(store, tierId, customerName, quantity = 1) {
  const tier = getTier(store, tierId);
  const name = requireName(customerName, "Customer name");

  requireInteger(quantity, "Ticket quantity", 1, 10);

  const totalCents = tier.priceCents * quantity;
  if (!Number.isSafeInteger(totalCents)) {
    fail("Booking total is too large.");
  }

  if (tier.available < quantity) {
    fail("Not enough tickets available.", "SOLD_OUT");
  }

  let reference;
  do {
    reference = newReference();
  } while (store.bookingsByReference.has(reference));

  const booking = {
    id: newId(),
    reference,
    tierId,
    customerName: name,
    quantity,
    totalCents,
    status: "CONFIRMED"
  };

  tier.available -= quantity;
  store.bookingsByReference.set(reference, booking);
  return booking;
}

export function cancelBooking(store, reference) {
  if (typeof reference !== "string" || !reference.trim()) {
    fail("Booking reference must not be empty.");
  }

  const booking = store.bookingsByReference.get(reference);
  if (!booking) fail("Booking not found.", "NOT_FOUND");
  if (booking.status === "CANCELLED") {
    fail("This booking has already been cancelled.");
  }

  const tier = getTier(store, booking.tierId);
  if (tier.available + booking.quantity > tier.capacity) {
    fail("Cancellation would exceed ticket capacity.");
  }

  tier.available += booking.quantity;
  booking.status = "CANCELLED";
  return booking;
}

export function findBookingByReference(store, reference) {
  const booking = store.bookingsByReference.get(reference);
  if (!booking) fail("Booking not found.", "NOT_FOUND");
  return booking;
}

export function joinWaitlist(store, tierId, customerName, quantity = 1) {
  getTier(store, tierId);
  const name = requireName(customerName, "Customer name");

  requireInteger(quantity, "Ticket quantity", 1, 10);

  const queue = store.waitlists.get(tierId);
  const entry = {
    id: newId(),
    customerName: name,
    tierId,
    quantity
  };

  queue.enqueue(entry);
  return entry;
}

export function listEventSummaries(store, { publishedOnly = true } = {}) {
  const summaries = [];

  for (const event of store.events.values()) {
    if (publishedOnly && !event.published) continue;

    const tiers = Array.from(event.tiers.values());

    summaries.push({
      id: event.id,
      title: event.name,
      venue: event.venue ?? "",
      city: event.city ?? "",
      date: event.date ?? "",
      published: Boolean(event.published),
      cheapestPriceCents:
        tiers.length > 0
          ? Math.min(...tiers.map((tier) => tier.priceCents))
          : null,
      totalAvailable: tiers.reduce(
        (total, tier) => total + tier.available,
        0
      )
    });
  }

  return summaries;
}
