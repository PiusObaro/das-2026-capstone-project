import { DomainError } from "../domain/errors.js";
import { newId, newReference } from "../domain/ids.js";

function fail(message, code = "VALIDATION") {
  throw new DomainError(message, code);
}

export function createSqliteEventService(db) {
 const insertEvent = db.prepare(`
  INSERT INTO events (
    id,
    name,
    city,
    venue,
    date,
    published,
    organizer_id
  )
  VALUES (?, ?, ?, ?, ?, 0, ?)
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
    createEvent({
  title,
  name,
  city = "",
  venue = "",
  date,
  organizerId = null,
}) {
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
      date,
      organizerId
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

  tiers: listTiers.all(row.id).map((tier) => ({
    id: tier.id,
    eventId: tier.event_id,
    name: tier.name,
    priceCents: tier.price_cents,
    capacity: tier.capacity,
    available: tier.available,
  })),
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

        // Get events belonging to one organizer.
getOrganizerEvents(organizerId) {
  const events = db.prepare(`
    SELECT
      id,
      name,
      city,
      venue,
      date,
      published
    FROM events
    WHERE organizer_id = ?
    ORDER BY date ASC
  `).all(organizerId);

  return events.map((event) => ({
    id: event.id,
    title: event.name,
    city: event.city,
    venue: event.venue,
    date: event.date,
    published: Boolean(event.published),
  }));
},
          // Get bookings belonging to one attendee.
    getAttendeeBookings(attendeeId) {
      const bookings = db.prepare(`
        SELECT
          bookings.id,
          bookings.reference,
          bookings.customer_name,
          bookings.quantity,
          bookings.total_cents,
          bookings.status,
          bookings.payment_status,
          events.id AS event_id,
          events.name AS event_name,
          events.city,
          events.venue,
          events.date,
          tiers.name AS tier_name
        FROM bookings
        JOIN tiers ON bookings.tier_id = tiers.id
        JOIN events ON tiers.event_id = events.id
        WHERE bookings.attendee_id = ?
        ORDER BY bookings.id DESC
      `).all(attendeeId);

      return bookings.map((booking) => ({
        id: booking.id,
        reference: booking.reference,
        customerName: booking.customer_name,
        quantity: booking.quantity,
        totalCents: booking.total_cents,
        status: booking.status,
        paymentStatus: booking.payment_status,
        event: {
          id: booking.event_id,
          name: booking.event_name,
          city: booking.city,
          venue: booking.venue,
          date: booking.date
        },
        tierName: booking.tier_name
      }));
    },

        createBooking(tierId, customerName, quantity = 1, attendeeId) {      if (
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
          attendeeId,
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
            attendee_id,
            customer_name,
            quantity,
            total_cents,
            status,
            payment_status
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          booking.id,
          booking.reference,
          booking.tierId,
          booking.attendeeId,
          booking.customerName,
          booking.quantity,
          booking.totalCents,
          booking.status,
          booking.paymentStatus
        );

         return booking;
      });
    },
    // Create multiple ticket bookings in one transaction.
createBookings(eventId, items, customerName, attendeeId) {
  if (
    typeof customerName !== "string" ||
    !customerName.trim()
  ) {
    fail("Customer name must not be empty.");
  }

  if (!Array.isArray(items) || items.length === 0) {
    fail("Select at least one ticket.");
  }

  return runTransaction(() => {
    const event = findEvent.get(eventId);

    if (!event) {
      fail("Event not found.", "NOT_FOUND");
    }

    if (!event.published) {
      fail(
        "Tickets can only be booked for published events.",
        "INVALID_STATE"
      );
    }

    const bookings = [];

    for (const item of items) {
      const tierId = item?.tierId;
      const quantity = item?.quantity;

      if (
        typeof tierId !== "string" ||
        !tierId.trim()
      ) {
        fail("Invalid ticket tier.");
      }

      if (
        !Number.isSafeInteger(quantity) ||
        quantity < 1 ||
        quantity > 10
      ) {
        fail("Ticket quantity must be between 1 and 10.");
      }

      const tier = findTier.get(tierId);

      if (!tier || tier.event_id !== eventId) {
        fail("Ticket tier not found.", "NOT_FOUND");
      }

      const update = db.prepare(`
        UPDATE tiers
        SET available = available - ?
        WHERE id = ? AND available >= ?
      `).run(quantity, tierId, quantity);

      if (Number(update.changes) !== 1) {
        fail("Not enough tickets available.", "SOLD_OUT");
      }

      const booking = {
        id: newId(),
        reference: newReference(),
        tierId,
        attendeeId,
        customerName: customerName.trim(),
        quantity,
        totalCents: tier.price_cents * quantity,
        status: "PENDING",
        paymentStatus: "UNPAID",
      };

      db.prepare(`
        INSERT INTO bookings (
          id,
          reference,
          tier_id,
          attendee_id,
          customer_name,
          quantity,
          total_cents,
          status,
          payment_status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        booking.id,
        booking.reference,
        booking.tierId,
        booking.attendeeId,
        booking.customerName,
        booking.quantity,
        booking.totalCents,
        booking.status,
        booking.paymentStatus
      );

      bookings.push(booking);
    }

    return bookings;
  });
},

       async payBooking(reference, attendeeId) {
  return runTransaction(() => {
    const booking = db.prepare(`
      SELECT *
      FROM bookings
      WHERE reference = ?
    `).get(reference);

    if (!booking) {
      fail("Booking not found.", "NOT_FOUND");
    }

    if (booking.attendee_id !== attendeeId) {
      fail("You are not allowed to access this booking.", "FORBIDDEN");
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

      // Pay for multiple bookings in one transaction.
payBookings(references, attendeeId) {
  if (
    !Array.isArray(references) ||
    references.length === 0 ||
    references.some((reference) =>
      typeof reference !== "string" || !reference.trim()
    )
  ) {
    fail("Invalid booking references.");
  }

  if (new Set(references).size !== references.length) {
    fail("Duplicate booking references are not allowed.");
  }

  return runTransaction(() => {
    const bookings = references.map((reference) =>
      db.prepare(`
        SELECT *
        FROM bookings
        WHERE reference = ?
      `).get(reference)
    );

    for (const booking of bookings) {
      if (!booking) {
        fail("Booking not found.", "NOT_FOUND");
      }

      if (booking.attendee_id !== attendeeId) {
        fail("You are not allowed to access this booking.", "FORBIDDEN");
      }

      if (
        booking.status !== "PENDING" ||
        booking.payment_status !== "UNPAID"
      ) {
        fail("All bookings must be pending and unpaid.", "INVALID_STATE");
      }
    }

    const update = db.prepare(`
      UPDATE bookings
      SET status = 'CONFIRMED',
          payment_status = 'PAID'
      WHERE reference = ?
        AND status = 'PENDING'
        AND payment_status = 'UNPAID'
    `);

    for (const booking of bookings) {
      const result = update.run(booking.reference);

      if (Number(result.changes) !== 1) {
        fail("A booking can no longer be paid.", "INVALID_STATE");
      }
    }

    return bookings.map((booking) => ({
      id: booking.id,
      reference: booking.reference,
      tierId: booking.tier_id,
      customerName: booking.customer_name,
      quantity: booking.quantity,
      totalCents: booking.total_cents,
      status: "CONFIRMED",
      paymentStatus: "PAID",
    }));
  });
},

// Cancel multiple unpaid bookings in one transaction.
cancelBookings(references, attendeeId) {
  if (
    !Array.isArray(references) ||
    references.length === 0 ||
    references.some((reference) =>
      typeof reference !== "string" || !reference.trim()
    )
  ) {
    fail("Invalid booking references.");
  }

  if (new Set(references).size !== references.length) {
    fail("Duplicate booking references are not allowed.");
  }

  return runTransaction(() => {
    const bookings = references.map((reference) =>
      db.prepare(`
        SELECT *
        FROM bookings
        WHERE reference = ?
      `).get(reference)
    );

    for (const booking of bookings) {
      if (!booking) {
        fail("Booking not found.", "NOT_FOUND");
      }

      if (booking.attendee_id !== attendeeId) {
        fail("You are not allowed to access this booking.", "FORBIDDEN");
      }

      if (
        booking.status !== "PENDING" ||
        booking.payment_status !== "UNPAID"
      ) {
        fail("Only unpaid pending bookings can be cancelled.", "INVALID_STATE");
      }
    }

    const cancel = db.prepare(`
      UPDATE bookings
      SET status = 'CANCELLED'
      WHERE reference = ?
        AND status = 'PENDING'
        AND payment_status = 'UNPAID'
    `);

    const restore = db.prepare(`
      UPDATE tiers
      SET available = available + ?
      WHERE id = ?
        AND available + ? <= capacity
    `);

    for (const booking of bookings) {
      const cancelled = cancel.run(booking.reference);

      if (Number(cancelled.changes) !== 1) {
        fail("A booking can no longer be cancelled.", "INVALID_STATE");
      }

      const restored = restore.run(
        booking.quantity,
        booking.tier_id,
        booking.quantity
      );

      if (Number(restored.changes) !== 1) {
        fail("Could not restore ticket availability.", "INVALID_STATE");
      }
    }

    return bookings.map((booking) => ({
      id: booking.id,
      reference: booking.reference,
      tierId: booking.tier_id,
      customerName: booking.customer_name,
      quantity: booking.quantity,
      totalCents: booking.total_cents,
      status: "CANCELLED",
      paymentStatus: "UNPAID",
    }));
  });
},

        cancelUnpaidBooking(reference, attendeeId) {      return runTransaction(() => {
        const booking = db.prepare(`
          SELECT *
          FROM bookings
          WHERE reference = ?
        `).get(reference);

        if (!booking) {
  fail("Booking not found.", "NOT_FOUND");
}

if (booking.attendee_id !== attendeeId) {
  fail("You are not allowed to access this booking.", "FORBIDDEN");
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
