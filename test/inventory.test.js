
import test from "node:test";
import assert from "node:assert/strict";

import {
  createStore,
  createEvent,
  addTier,
  publishEvent,
  unpublishEvent,
  listEventSummaries
} from "../src/domain/inventory.js";

test("cannot publish an event without ticket tiers", () => {
  const store = createStore();

  const event = createEvent(store, {
  name: "Music Concert",
  date: "2026-11-20"
});

  assert.throws(
    () => publishEvent(store, event.id),
    (error) => error.code === "INVALID_STATE"
  );
});

test("publishes an event after a ticket tier is added", () => {
  const store = createStore();

  const event = createEvent(store, {
    title: "Music Concert",
    city: "Lagos",
    venue: "Eko Hotel",
    date: "2026-11-20"
  });

  addTier(store, event.id, {
    name: "Regular",
    priceCents: 5000,
    capacity: 100
  });

  publishEvent(store, event.id);

  const summaries = listEventSummaries(store);

  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].title, "Music Concert");
  assert.equal(summaries[0].city, "Lagos");
  assert.equal(summaries[0].venue, "Eko Hotel");
  assert.equal(summaries[0].published, true);
});

test("hides unpublished events from the public list", () => {
  const store = createStore();

 createEvent(store, {
  name: "Draft Event",
  date: "2026-11-20"
});

  assert.deepEqual(listEventSummaries(store), []);
});

test("unpublishes an event so it disappears from the public list", () => {
  const store = createStore();

  const event = createEvent(store, {
  name: "Music Concert",
  date: "2026-11-20"
});

  addTier(store, event.id, {
    name: "Regular",
    priceCents: 5000,
    capacity: 100
  });

  publishEvent(store, event.id);

  assert.equal(listEventSummaries(store).length, 1);

  unpublishEvent(store, event.id);

  assert.equal(listEventSummaries(store).length, 0);
});
