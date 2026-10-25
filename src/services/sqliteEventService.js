import { DomainError } from "../domain/errors.js";
import { newId, newReference } from "../domain/ids.js";

function fail(message, code = "VALIDATION") {
  throw new DomainError(message, code);
}

export function createSqliteEventService(db) {
  const insertEvent = db.prepare(`
    INSERT INTO events (id, name, city, venue, date, published)
    VALUES (?, ?, ?, ?, ?, 0)
  `);

  const insertTier = db.prepare(`
    INSERT INTO tiers
      (id, event_id, name, price_cents, capacity, available)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const findEvent = db.prepare(
    "SELECT * FROM events WHERE id = ?"
  );

  const findTier = db.prepare(
    "SELECT * FROM tiers WHERE id = ?"
  );

  const listTiers = db.prepare(
    "SELECT * FROM tiers WHERE event_id = ?"
  );

  // Run related database operations as one transaction.
  // If any operation fails, roll back all changes.
  function runTransaction(callback) {
    db.exec("BEGIN IMMEDIATE");

    try {
      const result = callback();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // Preserve the original error.
      }

      throw error;
    }
  }

  // Convert a database event row into the format
  // used by the existing API.
  function eventResponse(row) {
    if (!row) {
      return null;
    }

    const tiers = new Map();

    for (const tier of listTiers.all(row.id)) {
      tiers.set(tier.id, {
        id: tier.id,
        eventId: tier.event_id,
        name: tier.name,
        priceCents: tier.price_cents,
        capacity: tier.capacity,
        available: tier.available,
      });
    }

    return {
      id: row.id,
      name: row.name,
      city: row.city,
      venue: row.venue,
      date: row.date,
      published: Boolean(row.published),
      tiers,
    };
  }

  return {
    createEvent({ title, name, city = "", venue = "", date }) {
      const eventName = title ?? name;

      if (
        typeof eventName !== "string" ||
        !eventName.trim()
      ) {
        fail("Event title must not be empty.");
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) {
        fail("Date must be a valid date in YYYY-MM-DD format.");
      }

      const parsedDate = new Date(`${date}T00:00:00Z`);

      if (
        Number.isNaN(parsedDate.getTime()) ||
        parsedDate.toISOString().slice(0, 10) !== date
      ) {
        fail("Date must be a valid date in YYYY-MM-DD format.");
      }

      for (const [value, label] of [
        [city, "City"],
        [venue, "Venue"],
      ]) {
        if (typeof value !== "string") {
          fail(`${label} must be text.`);
        }
      }

      const eventId = newId();

      insertEvent.run(
        eventId,
        eventName.trim(),
        city.trim(),
        venue.trim(),
        date
      );

      return eventResponse(findEvent.get(eventId));
    },

    addTier(eventId, { name, priceCents, capacity }) {
      const event = findEvent.get(eventId);

      if (!event) {
        fail("Event not found.", "NOT_FOUND");
      }

      if (
        typeof name !== "string" ||
        !name.trim()
      ) {
        fail("Tier name must not be empty.");
      }

      if (
        !Number.isSafeInteger(priceCents) ||
        priceCents < 0
      ) {
        fail("Price must be a non-negative whole number.");
      }

      if (
        !Number.isSafeInteger(capacity) ||
        capacity < 1
      ) {
        fail("Capacity must be a positive whole number.");
      }

      const existingTiers = listTiers.all(eventId);

      if (
        existingTiers.some(
          (tier) =>
            tier.name.toLowerCase() === name.trim().toLowerCase()
        )
      ) {
        fail("A ticket tier with this name already exists.");
      }

      const tier = {
        id: newId(),
        eventId,
        name: name.trim(),
        priceCents,
        capacity,
        available: capacity,
      };

      insertTier.run(
        tier.id,
        eventId,
        tier.name,
        tier.priceCents,
        tier.capacity,
        tier.available
      );

      return tier;
    },

    publishEvent(eventId) {
      const event = findEvent.get(eventId);

      if (!event) {
        fail("Event not found.", "NOT_FOUND");
      }

      if (listTiers.all(eventId).length === 0) {
        fail(
          "An event must have at least one ticket tier before publishing.",
          "INVALID_STATE"
        );
      }

      db.prepare(`
        UPDATE events
        SET published = 1
        WHERE id = ?
      `).run(eventId);

      return eventResponse(findEvent.get(eventId));
    },

    search(criteria = {}, sortBy = "date") {
      if (
        !["date", "price", "availability"].includes(sortBy)
      ) {
        fail("Sort must be date, price, or availability.");
      }

      let rows = db.prepare(`
        SELECT
          e.*,
          MIN(t.price_cents) AS cheapest_price_cents,
          COALESCE(SUM(t.available), 0) AS total_available
        FROM events e
        LEFT JOIN tiers t ON t.event_id = e.id
        WHERE e.published = 1
        GROUP BY e.id
      `).all();

      rows = rows.map((row) => ({
        id: row.id,
        title: row.name,
        city: row.city,
        venue: row.venue,
        date: row.date,
        published: Boolean(row.published),
        cheapestPriceCents: row.cheapest_price_cents,
        totalAvailable: row.total_available,
      }));

      if (criteria.q) {
        const query = criteria.q.toLowerCase();

        rows = rows.filter((event) =>
          `${event.title} ${event.city} ${event.venue}`
            .toLowerCase()
            .includes(query)
        );
      }

      if (criteria.city) {
        rows = rows.filter(
          (event) =>
            event.city.toLowerCase() ===
            criteria.city.toLowerCase()
        );
      }

      if (criteria.from) {
        rows = rows.filter(
          (event) => event.date >= criteria.from
        );
      }

      if (criteria.to) {
        rows = rows.filter(
          (event) => event.date <= criteria.to
        );
      }

      if (criteria.maxPriceCents !== undefined) {
        if (
          !Number.isSafeInteger(criteria.maxPriceCents) ||
          criteria.maxPriceCents < 0
        ) {
          fail("Maximum price must be a non-negative whole number.");
        }

        rows = rows.filter(
          (event) =>
            event.cheapestPriceCents !== null &&
            event.cheapestPriceCents <= criteria.maxPriceCents
        );
      }

      if (criteria.onlyAvailable) {
        rows = rows.filter(
          (event) => event.totalAvailable > 0
        );
      }

      rows.sort((a, b) => {
        if (sortBy === "price") {
          const priceDifference =
            (a.cheapestPriceCents ?? Infinity) -
            (b.cheapestPriceCents ?? Infinity);

          return priceDifference ||
            a.title.localeCompare(b.title);
        }

        if (sortBy === "availability") {
          return (
            b.totalAvailable - a.totalAvailable ||
            a.title.localeCompare(b.title)
          );
        }

        return (
          a.date.localeCompare(b.date) ||
          a.title.localeCompare(b.title)
        );
      });

      return rows;
    },

    createBooking(tierId, customerName, quantity = 1) {
      if (
        typeof customerName !== "string" ||
        !customerName.trim()
      ) {
        fail("Customer name must not be empty.");
      }

      if (
        !Number.isSafeInteger(quantity) ||
        quantity < 1 ||
        quantity > 10
      ) {
        fail("Ticket quantity must be a whole number from 1 to 10.");
      }

      return runTransaction(() => {
        // Read the latest ticket information inside the transaction.
        const tier = findTier.get(tierId);

        if (!tier) {
          fail("Ticket tier not found.", "NOT_FOUND");
        }

        const event = findEvent.get(tier.event_id);

        if (!event || !event.published) {
          fail(
            "Tickets can only be booked for published events.",
            "INVALID_STATE"
          );
        }

        const totalCents = tier.price_cents * quantity;

        if (!Number.isSafeInteger(totalCents)) {
          fail("Booking total is too large.");
        }

        // Only reduce availability if enough tickets remain.
        const update = db.prepare(`
          UPDATE tiers
          SET available = available - ?
          WHERE id = ?
            AND available >= ?
        `).run(quantity, tierId, quantity);

        if (Number(update.changes) !== 1) {
          fail("Not enough tickets available.", "SOLD_OUT");
        }

        const booking = {
          id: newId(),
          reference: newReference(),
          tierId,
          customerName: customerName.trim(),
          quantity,
          totalCents,
          status: "PENDING",
          paymentStatus: "UNPAID",
        };

        // The ticket reduction and booking insertion commit together.
        db.prepare(`
          INSERT INTO bookings (
            id,
            reference,
            tier_id,
            customer_name,
            quantity,
            total_cents,
            status,
            payment_status
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          booking.id,
          booking.reference,
          booking.tierId,
          booking.customerName,
          booking.quantity,
          booking.totalCents,
          booking.status,
          booking.paymentStatus
        );

        return booking;
      });
    },

    async payBooking(reference) {
      return runTransaction(() => {
        const booking = db.prepare(`
          SELECT *
          FROM bookings
          WHERE reference = ?
        `).get(reference);

        if (!booking) {
          fail("Booking not found.", "NOT_FOUND");
        }

        if (
          booking.status !== "PENDING" ||
          booking.payment_status !== "UNPAID"
        ) {
          fail(
            `Cannot pay for a booking with status ${booking.status}.`,
            "INVALID_STATE"
          );
        }

        const result = db.prepare(`
          UPDATE bookings
          SET status = 'CONFIRMED',
              payment_status = 'PAID'
          WHERE reference = ?
            AND status = 'PENDING'
            AND payment_status = 'UNPAID'
        `).run(reference);

        if (Number(result.changes) !== 1) {
          fail("Booking can no longer be paid.", "INVALID_STATE");
        }

        return {
          id: booking.id,
          reference: booking.reference,
          tierId: booking.tier_id,
          customerName: booking.customer_name,
          quantity: booking.quantity,
          totalCents: booking.total_cents,
          status: "CONFIRMED",
          paymentStatus: "PAID",
        };
      });
    },

    cancelUnpaidBooking(reference) {
      return runTransaction(() => {
        const booking = db.prepare(`
          SELECT *
          FROM bookings
          WHERE reference = ?
        `).get(reference);

        if (!booking) {
          fail("Booking not found.", "NOT_FOUND");
        }

        if (
          booking.status !== "PENDING" ||
          booking.payment_status !== "UNPAID"
        ) {
          fail(
            "Only unpaid pending bookings can be cancelled.",
            "INVALID_STATE"
          );
        }

        const result = db.prepare(`
          UPDATE bookings
          SET status = 'CANCELLED'
          WHERE reference = ?
            AND status = 'PENDING'
            AND payment_status = 'UNPAID'
        `).run(reference);

        if (Number(result.changes) !== 1) {
          fail("Booking can no longer be cancelled.", "INVALID_STATE");
        }

        const restored = db.prepare(`
          UPDATE tiers
          SET available = available + ?
          WHERE id = ?
            AND available + ? <= capacity
        `).run(
          booking.quantity,
          booking.tier_id,
          booking.quantity
        );

        if (Number(restored.changes) !== 1) {
          fail(
            "Could not restore ticket availability.",
            "INVALID_STATE"
          );
        }

        return {
          id: booking.id,
          reference: booking.reference,
          tierId: booking.tier_id,
          customerName: booking.customer_name,
          quantity: booking.quantity,
          totalCents: booking.total_cents,
          status: "CANCELLED",
          paymentStatus: "UNPAID",
        };
      });
    },
  };
}
