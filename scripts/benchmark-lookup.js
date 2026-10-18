
import { performance } from "node:perf_hooks";
import {
  createStore,
  createEvent,
  addTier,
  bookTickets
} from "../src/domain/inventory.js";

const store = createStore();

const event = createEvent(store, {
  name: "Benchmark Test Event"
});

const tier = addTier(store, event.id, {
  name: "Regular",
  priceCents: 5000,
  capacity: 5000
});

const bookings = [];

console.log("Creating 5,000 bookings...");

for (let i = 1; i <= 5000; i++) {
  const booking = bookTickets(store, tier.id, `Customer ${i}`, 1);
  bookings.push(booking);
}

const target = bookings[bookings.length - 1];
const reference = target.reference;
const iterations = 2000;

console.log("Bookings created:", bookings.length);
console.log("Searching for:", reference);
console.log("Running each test", iterations, "times...\n");

// Test Map lookup
const mapStart = performance.now();

for (let i = 0; i < iterations; i++) {
  store.bookingsByReference.get(reference);
}

const mapEnd = performance.now();

// Test Array lookup
const arrayStart = performance.now();

for (let i = 0; i < iterations; i++) {
  bookings.find((booking) => booking.reference === reference);
}

const arrayEnd = performance.now();

const mapTime = mapEnd - mapStart;
const arrayTime = arrayEnd - arrayStart;

console.log("=== LOOKUP BENCHMARK RESULTS ===");
console.log(`Map.get(): ${mapTime.toFixed(3)} milliseconds`);
console.log(`Array.find(): ${arrayTime.toFixed(3)} milliseconds`);

if (mapTime < arrayTime) {
  console.log("\nMap.get() was faster in this test.");
} else {
  console.log("\nArray.find() was faster in this test.");
}

console.log("Note: timings vary between computers and runs.");
