
import http from "node:http";
import { DomainError } from "../domain/errors.js";
import { createStore } from "../domain/inventory.js";
import { createEventService } from "../services/eventService.js";

const store = createStore();
const service = createEventService(store);

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
  if (code === "NOT_FOUND") return 404;
  if (code === "METHOD_NOT_ALLOWED") return 405;
  if (code === "SOLD_OUT" || code === "INVALID_STATE") return 409;
  return 500;
}

function methodNotAllowed() {
  throw new DomainError("Method not allowed for this endpoint.", "METHOD_NOT_ALLOWED");
}

export async function handleApiRequest(req, res) {
  const url = new URL(req.url, "http://localhost");

  if (url.pathname !== "/api" && !url.pathname.startsWith("/api/")) {
    return false;
  }

  try {
    const { pathname, searchParams } = url;

    if (pathname === "/api/events") {
      if (req.method === "POST") {
        const body = await readJson(req);
        const event = service.createEvent(body);
        return sendJson(res, 201, { event: eventResponse(event) });
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

    let match = pathname.match(/^\/api\/events\/([^/]+)\/tiers$/);

    if (match) {
      if (req.method !== "POST") methodNotAllowed();

      const body = await readJson(req);
      const tier = service.addTier(decodeURIComponent(match[1]), body);

      return sendJson(res, 201, { tier });
    }

    match = pathname.match(/^\/api\/events\/([^/]+)\/publish$/);

    if (match) {
      if (req.method !== "POST") methodNotAllowed();

      const event = service.publishEvent(decodeURIComponent(match[1]));

      return sendJson(res, 200, { event: eventResponse(event) });
    }

    match = pathname.match(/^\/api\/tiers\/([^/]+)\/bookings$/);

    if (match) {
      if (req.method !== "POST") methodNotAllowed();

      const body = await readJson(req);
      const booking = service.createBooking(
        decodeURIComponent(match[1]),
        body.customerName,
        body.quantity ?? 1
      );

      return sendJson(res, 201, { booking });
    }

    match = pathname.match(/^\/api\/bookings\/([^/]+)\/pay$/);

    if (match) {
      if (req.method !== "POST") methodNotAllowed();

      const booking = await service.payBooking(
        decodeURIComponent(match[1])
      );

      return sendJson(res, 200, { booking });
    }

    match = pathname.match(/^\/api\/bookings\/([^/]+)\/cancel$/);

    if (match) {
      if (req.method !== "POST") methodNotAllowed();

      const booking = service.cancelUnpaidBooking(
        decodeURIComponent(match[1])
      );

      return sendJson(res, 200, { booking });
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
