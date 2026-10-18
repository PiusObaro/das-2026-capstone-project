
import {
  createStore,
  createEvent,
  addTier,
  bookTickets,
  cancelBooking,
  joinWaitlist
} from "../src/domain/inventory.js";

const store = createStore();

console.log("=== EVENT TICKET BOOKING DEMO ===");

const event = createEvent(store, {
  name: "Lagos Tech Conference"
});

console.log("\nEvent created:", event.name);

const tier = addTier(store, event.id, {
  name: "Regular",
  priceCents: 500000,
  capacity: 3
});

console.log("Ticket tier:", tier.name);
console.log("Ticket capacity:", tier.capacity);

const booking1 = bookTickets(store, tier.id, "Ada", 2);
console.log(`\n${booking1.customerName} booked ${booking1.quantity} tickets.`);
console.log("Booking reference:", booking1.reference);

const booking2 = bookTickets(store, tier.id, "Bola", 1);
console.log(`\n${booking2.customerName} booked ${booking2.quantity} ticket.`);
console.log("Booking reference:", booking2.reference);

console.log("\nTickets remaining:", tier.available);

try {
  bookTickets(store, tier.id, "Chidi", 1);
} catch (error) {
  console.log("\nBooking refused:", error.message);
  console.log("Error code:", error.code);
}

const waiting1 = joinWaitlist(store, tier.id, "Chidi", 1);
const waiting2 = joinWaitlist(store, tier.id, "Dami", 1);

console.log("\nWaitlist:");
console.log("1.", waiting1.customerName);
console.log("2.", waiting2.customerName);

cancelBooking(store, booking1.reference);

console.log("\nAda's booking has been cancelled.");
console.log("Tickets now available:", tier.available);

const queue = store.waitlists.get(tier.id);
const nextPerson = queue.peek();

if (nextPerson && tier.available >= nextPerson.quantity) {
  queue.dequeue();

  const newBooking = bookTickets(
    store,
    tier.id,
    nextPerson.customerName,
    nextPerson.quantity
  );

  console.log("\nNext person in line:", nextPerson.customerName);
  console.log("Their booking reference:", newBooking.reference);
  console.log("Tickets remaining:", tier.available);
}
