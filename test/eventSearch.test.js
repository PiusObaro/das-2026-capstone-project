
import test from "node:test";
import assert from "node:assert/strict";

import {
  filterEvents,
  sortEvents,
  searchEvents
} from "../src/domain/eventSearch.js";

const events = [
  {
    id: "3",
    title: "Football Match",
    venue: "National Stadium",
    city: "Abuja",
    date: "2026-12-10",
    cheapestPriceCents: 5000,
    totalAvailable: 20
  },
  {
    id: "1",
    title: "Music Concert",
    venue: "Eko Hotel",
    city: "Lagos",
    date: "2026-11-20",
    cheapestPriceCents: 10000,
    totalAvailable: 5
  },
  {
    id: "2",
    title: "Food Festival",
    venue: "City Hall",
    city: "Lagos",
    date: "2026-11-25",
    cheapestPriceCents: 3000,
    totalAvailable: 0
  }
];

test("filters events by city without changing the original array", () => {
  const original = [...events];

  const result = filterEvents(events, { city: "Lagos" });

  assert.deepEqual(result.map(event => event.title), [
    "Music Concert",
    "Food Festival"
  ]);
  assert.deepEqual(events, original);
});

test("sorts events by price without changing the original array", () => {
  const original = [...events];

  const result = sortEvents(events, "price");

  assert.deepEqual(result.map(event => event.title), [
    "Food Festival",
    "Football Match",
    "Music Concert"
  ]);
  assert.deepEqual(events, original);
});

test("sorts events by availability", () => {
  const result = sortEvents(events, "availability");

  assert.deepEqual(result.map(event => event.title), [
    "Football Match",
    "Music Concert",
    "Food Festival"
  ]);
});

test("searches event titles without case sensitivity", () => {
  const result = searchEvents(events, { q: "music" });

  assert.deepEqual(result.map(event => event.title), [
    "Music Concert"
  ]);
});

test("returns an empty array when no events match", () => {
  assert.deepEqual(filterEvents(events, { city: "Kano" }), []);
});

test("rejects an unknown sort option", () => {
  assert.throws(
    () => sortEvents(events, "unknown"),
    error => error.code === "VALIDATION"
  );
});

test("filters events by an inclusive date range", () => {
  const result = filterEvents(events, {
    from: "2026-11-20",
    to: "2026-11-25"
  });

  assert.deepEqual(
    result.map(event => event.title).sort(),
    ["Food Festival", "Music Concert"]
  );
});

test("filters events by maximum ticket price", () => {
  const result = filterEvents(events, {
    maxPriceCents: 5000
  });

  assert.deepEqual(
    result.map(event => event.title).sort(),
    ["Food Festival", "Football Match"]
  );
});

test("filters out events with no tickets available", () => {
  const result = filterEvents(events, {
    onlyAvailable: true
  });

  assert.deepEqual(
    result.map(event => event.title).sort(),
    ["Football Match", "Music Concert"]
  );
});

