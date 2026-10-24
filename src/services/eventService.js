import { DomainError } from "../domain/errors.js";
import {
  createEvent as createDomainEvent,
  addTier as addDomainTier,
  publishEvent as publishDomainEvent,
  listEventSummaries,
} from "../domain/inventory.js";
import { searchEvents } from "../domain/eventSearch.js";
import { newId, newReference } from "../domain/ids.js";
import {
  BOOKING_STATES,
  transitionBooking,
} from "../domain/bookingStateMachine.js";

function fail(message, code = "VALIDATION") {
  throw new DomainError(message, code);
}

export function createEventService(store) {
  function getBooking(reference) {
    const booking = store.bookingsByReference.get(reference);

    if (!booking) {
      fail("Booking not found.", "NOT_FOUND");
    }

    return booking;
  }

  return {
    createEvent(data) {
      return createDomainEvent(store, data);
    },

    addTier(eventId, data) {
      return addDomainTier(store, eventId, data);
    },

    publishEvent(eventId) {
      return publishDomainEvent(store, eventId);
    },

    search(criteria = {}, sortBy = "date") {
      const events = listEventSummaries(store);
      return searchEvents(events, criteria, sortBy);
    },

    createBooking(tierId, customerName, quantity = 1) {
      const tier = store.tiers.get(tierId);

      if (!tier) {
        fail("Ticket tier not found.", "NOT_FOUND");
      }

      const event = store.events.get(tier.eventId);

      if (!event || !event.published) {
        fail("Tickets can only be booked for published events.", "INVALID_STATE");
      }

      if (
        typeof customerName !== "string" ||
        !customerName.trim()
      ) {
        fail("Customer name must not be empty.");
      }

      if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10) {
        fail("Ticket quantity must be a whole number from 1 to 10.");
      }

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
        customerName: customerName.trim(),
        quantity,
        totalCents,
        status: BOOKING_STATES.PENDING,
        paymentStatus: "UNPAID",
      };

      tier.available -= quantity;
      store.bookingsByReference.set(reference, booking);

      return booking;
    },

    async payBooking(reference) {
      const booking = getBooking(reference);

      if (booking.status !== BOOKING_STATES.PENDING) {
        fail(
          `Cannot pay for a booking with status ${booking.status}.`,
          "INVALID_STATE"
        );
      }

      // Simulate a successful payment without a real payment provider.
      await Promise.resolve();

      const paidBooking = transitionBooking(
        booking,
        BOOKING_STATES.CONFIRMED
      );

      paidBooking.paymentStatus = "PAID";
      store.bookingsByReference.set(reference, paidBooking);

      return paidBooking;
    },

    cancelUnpaidBooking(reference) {
      const booking = getBooking(reference);

      if (booking.status !== BOOKING_STATES.PENDING) {
        fail(
          "Only unpaid pending bookings can be cancelled.",
          "INVALID_STATE"
        );
      }

      const tier = store.tiers.get(booking.tierId);

      if (!tier) {
        fail("Ticket tier not found.", "NOT_FOUND");
      }

      const cancelledBooking = transitionBooking(
        booking,
        BOOKING_STATES.CANCELLED
      );

      tier.available += booking.quantity;
      store.bookingsByReference.set(reference, cancelledBooking);

      return cancelledBooking;
    },
  };
}