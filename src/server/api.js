

import { DomainError } from "../domain/errors.js";
import { openDatabase } from "../db/database.js";
import { createSqliteEventService } from "../services/sqliteEventService.js";
import { createUserService } from "../services/userService.js";
import { verifyToken } from "../auth/tokens.js";

const db = openDatabase();
const service = createSqliteEventService(db);

const tokenSecret = process.env.TOKEN_SECRET;

if (!tokenSecret || Buffer.byteLength(tokenSecret) < 32) {
  throw new Error("TOKEN_SECRET must be at least 32 bytes.");
}

const userService = createUserService(db, tokenSecret);

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(data));
}

async function readJson(req) {
  let raw = "";

  for await (const chunk of req) {
    raw += chunk.toString();

    if (raw.length > 1_000_000) {
      throw new DomainError("Request body is too large.", "VALIDATION");
    }
  }

  if (!raw.trim()) return {};

  try {
    return JSON.parse(raw);
  } catch {
    throw new DomainError("Request body must contain valid JSON.", "VALIDATION");
  }
}

function eventResponse(event) {
  return {
    id: event.id,
    title: event.name,
    city: event.city,
    venue: event.venue,
    date: event.date,
    published: event.published,
    tiers: Array.from(event.tiers.values()),
  };
}

function errorStatus(code) {
  if (code === "VALIDATION") return 400;
  if (code === "UNAUTHORIZED") return 401;
  if (code === "FORBIDDEN") return 403;
  if (code === "NOT_FOUND") return 404;
  if (code === "METHOD_NOT_ALLOWED") return 405;

  if (
    code === "CONFLICT" ||
    code === "SOLD_OUT" ||
    code === "INVALID_STATE"
  ) {
    return 409;
  }

  return 500;
}

function methodNotAllowed() {
  throw new DomainError("Method not allowed for this endpoint.", "METHOD_NOT_ALLOWED");
}


function authenticate(req) {
  const authorization = req.headers.authorization;

  if (
    typeof authorization !== "string" ||
    !authorization.startsWith("Bearer ")
  ) {
    throw new DomainError(
      "Authentication required.",
      "UNAUTHORIZED"
    );
  }

  const token = authorization.slice(7);
  const user = verifyToken(token, tokenSecret);

  if (!user) {
    throw new DomainError(
      "Invalid or expired token.",
      "UNAUTHORIZED"
    );
  }

  return user;
}

function requireRole(user, role) {
  if (user.role !== role) {
    throw new DomainError(
      `Only ${role}s can access this endpoint.`,
      "FORBIDDEN"
    );
  }
}

function requireEventOwner(eventId, user) {
  const event = db.prepare(`
    SELECT organizer_id
    FROM events
    WHERE id = ?
  `).get(eventId);

  if (!event) {
    throw new DomainError(
      "Event not found.",
      "NOT_FOUND"
    );
  }

  if (
    user.role !== "organizer" ||
    event.organizer_id !== user.sub
  ) {
    throw new DomainError(
      "You are not allowed to manage this event.",
      "FORBIDDEN"
    );
  }
}

export async function handleApiRequest(req, res) {
  const url = new URL(req.url, "http://localhost");

  if (url.pathname !== "/api" && !url.pathname.startsWith("/api/")) {
    return false;
  }

  try {
    const { pathname, searchParams } = url;
        let match;
        // User signup
    if (
      pathname === "/api/auth/signup" &&
      req.method === "POST"
    ) {
      const body = await readJson(req);
      const result = await userService.signup(body);

      return sendJson(res, 201, result);
    }

    // User login
    if (
      pathname === "/api/auth/login" &&
      req.method === "POST"
    ) {
      const body = await readJson(req);
      const result = await userService.login(body);

      return sendJson(res, 200, result);
    }
    if (pathname === "/api/events") {
      if (req.method === "POST") {
  const user = authenticate(req);

  if (user.role !== "organizer") {
    throw new DomainError(
      "Only organizers can create events.",
      "FORBIDDEN"
    );
  }

  const body = await readJson(req);

  const event = service.createEvent({
    ...body,
    organizerId: user.sub,
  });

  return sendJson(res, 201, {
    event: eventResponse(event),
  });
}

      if (req.method === "GET") {
        const criteria = {};

        for (const key of ["q", "city", "from", "to"]) {
          if (searchParams.has(key)) {
            criteria[key] = searchParams.get(key);
          }
        }

        if (searchParams.has("maxPriceCents")) {
          const value = searchParams.get("maxPriceCents");

          if (!/^\d+$/.test(value)) {
            throw new DomainError(
              "maxPriceCents must be a non-negative whole number.",
              "VALIDATION"
            );
          }

          criteria.maxPriceCents = Number(value);
        }

        if (searchParams.has("onlyAvailable")) {
          const value = searchParams.get("onlyAvailable");

          if (value !== "true" && value !== "false") {
            throw new DomainError(
              "onlyAvailable must be true or false.",
              "VALIDATION"
            );
          }

          criteria.onlyAvailable = value === "true";
        }

        const events = service.search(
          criteria,
          searchParams.get("sort") || "date"
        );

        return sendJson(res, 200, { events });
      }

      methodNotAllowed();
    }
    
        // Get events belonging to the logged-in organizer.
if (pathname === "/api/my-events") {
  if (req.method !== "GET") methodNotAllowed();

  const user = authenticate(req);
  requireRole(user, "organizer");

  const events = service.getOrganizerEvents(user.sub);

  return sendJson(res, 200, { events });
}
    
       // Add a ticket tier to an event (organizer only)
       // Get tickets belonging to the logged-in attendee.
if (pathname === "/api/my-tickets") {
  if (req.method !== "GET") methodNotAllowed();

  const user = authenticate(req);
  requireRole(user, "attendee");

  const bookings = service.getAttendeeBookings(user.sub);

  return sendJson(res, 200, { bookings });
}

  // Pay for multiple bookings together.
if (pathname === "/api/booking-batches/pay") {
  if (req.method !== "POST") methodNotAllowed();

  const user = authenticate(req);
  requireRole(user, "attendee");

  const body = await readJson(req);

  const bookings = service.payBookings(
    body.references,
    user.sub
  );

  return sendJson(res, 200, { bookings });
}

    match = pathname.match(/^\/api\/bookings\/([^/]+)\/pay$/);

if (match) {
  if (req.method !== "POST") methodNotAllowed();

  const user = authenticate(req);
  requireRole(user, "attendee");

  const booking = await service.payBooking(
    decodeURIComponent(match[1]),
    user.sub
  );

  return sendJson(res, 200, { booking });
}
   // Add a ticket tier to an event (organizer only)
match = pathname.match(/^\/api\/events\/([^/]+)\/tiers$/);

if (match) {
  if (req.method !== "POST") methodNotAllowed();

  const user = authenticate(req);
  const eventId = decodeURIComponent(match[1]);

  requireEventOwner(eventId, user);

  const body = await readJson(req);
  const tier = service.addTier(eventId, body);

  return sendJson(res, 201, { tier });
} 

        // Publish an event (organizer only)
    match = pathname.match(/^\/api\/events\/([^/]+)\/publish$/);

    if (match) {
      if (req.method !== "POST") methodNotAllowed();

      const user = authenticate(req);
      const eventId = decodeURIComponent(match[1]);

      requireEventOwner(eventId, user);

      const event = service.publishEvent(eventId);

      return sendJson(res, 200, {
        event: eventResponse(event),
      });
    }

    // Create multiple ticket bookings for one event.
match = pathname.match(/^\/api\/events\/([^/]+)\/bookings$/);

if (match) {
  if (req.method !== "POST") methodNotAllowed();

  const user = authenticate(req);
  requireRole(user, "attendee");

  const body = await readJson(req);

  const bookings = service.createBookings(
    decodeURIComponent(match[1]),
    body.items,
    body.customerName || user.name,
    user.sub
  );

  return sendJson(res, 201, { bookings });
}

    // Create a booking (attendee only)
   match = pathname.match(/^\/api\/tiers\/([^/]+)\/bookings$/);

if (match) {
  if (req.method !== "POST") methodNotAllowed();

  const user = authenticate(req);
  requireRole(user, "attendee");

  const body = await readJson(req);

  const booking = service.createBooking(
    decodeURIComponent(match[1]),
    body.customerName || user.name,
    body.quantity ?? 1,
    user.sub
  );

  return sendJson(res, 201, { booking });
}

// Cancel multiple unpaid bookings together.
if (pathname === "/api/booking-batches/cancel") {
  if (req.method !== "POST") methodNotAllowed();

  const user = authenticate(req);
  requireRole(user, "attendee");

  const body = await readJson(req);

  const bookings = service.cancelBookings(
    body.references,
    user.sub
  );

  return sendJson(res, 200, { bookings });
}

   match = pathname.match(/^\/api\/bookings\/([^/]+)\/cancel$/);

if (match) {
  if (req.method !== "POST") methodNotAllowed();

  const user = authenticate(req);
  requireRole(user, "attendee");

  const booking = service.cancelUnpaidBooking(
    decodeURIComponent(match[1]),
    user.sub
  );

  return sendJson(res, 200, { booking });
}


    // Join the waitlist for a sold-out ticket tier.
    match = pathname.match(/^\/api\/tiers\/([^/]+)\/waitlist$/);

    if (match) {
      if (req.method !== "POST") methodNotAllowed();

      const user = authenticate(req);
      requireRole(user, "attendee");

      const body = await readJson(req);

      const entry = service.joinWaitlist(
        decodeURIComponent(match[1]),
        body.customerName || user.name,
        body.quantity ?? 1,
        user.sub
      );

      return sendJson(res, 201, { entry });
    }

    // Get waitlist entries and offers for the logged-in attendee.
    if (pathname === "/api/my-waitlist") {
      if (req.method !== "GET") methodNotAllowed();

      const user = authenticate(req);
      requireRole(user, "attendee");

      const entries = service.getAttendeeWaitlist(user.sub);

      return sendJson(res, 200, { entries });
    }

    // Accept a waitlist offer.
    match = pathname.match(/^\/api\/waitlist\/([^/]+)\/accept$/);

    if (match) {
      if (req.method !== "POST") methodNotAllowed();

      const user = authenticate(req);
      requireRole(user, "attendee");

      const booking = service.acceptWaitlistOffer(
        decodeURIComponent(match[1]),
        user.sub
      );

      return sendJson(res, 201, { booking });
    }


    throw new DomainError("API endpoint not found.", "NOT_FOUND");
     } catch (error) {

    const knownError =
      error instanceof DomainError ||
      error instanceof TypeError;

    const code = knownError ? error.code || "VALIDATION" : "INTERNAL";
    const message = knownError
      ? error.message
      : "An unexpected server error occurred.";

    return sendJson(res, errorStatus(code), {
      error: { code, message },
    });
  }
}
