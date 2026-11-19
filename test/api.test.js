
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";


let serverProcess;
let baseUrl;

async function getFreePort() {
  const server = createServer();

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const port = server.address().port;

  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  return port;
}

test("Build 4 API works end to end", async (t) => {
  const port = await getFreePort();
  baseUrl = `http://127.0.0.1:${port}`;

    const testDataDirectory = await mkdtemp(
    path.join(os.tmpdir(), "event-ticketing-test-")
  );

  const databasePath = path.join(
    testDataDirectory,
    "events.sqlite"
  );
  serverProcess = spawn(
    process.execPath,
    ["src/server/server.js"],
    {
      cwd: process.cwd(),
env: {
  ...process.env,
  PORT: String(port),
  DATABASE_PATH: databasePath,
},     stdio: "inherit",
    }
  );

    t.after(async () => {
    if (serverProcess && serverProcess.exitCode === null) {
      const stopped = new Promise((resolve) => {
        serverProcess.once("exit", resolve);
      });

      serverProcess.kill();
      await stopped;
    }

    await rm(testDataDirectory, {
      recursive: true,
      force: true,
    });
  });

  // Wait for the server to become ready.
  let ready = false;

  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      // The server may still be starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  assert.equal(ready, true, "API server should start");

  // 1. Create an event.
    // Sign up an organizer.
  const signupResponse = await fetch(
    `${baseUrl}/api/auth/signup`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test Organizer",
        email: "organizer@example.com",
        password: "Password123",
        role: "organizer",
      }),
    }
  );

  assert.equal(signupResponse.status, 201);

  const { token } = await signupResponse.json();

    // Check that an attendee can sign up.
  const attendeeSignupResponse = await fetch(
    `${baseUrl}/api/auth/signup`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test Attendee",
        email: "attendee@example.com",
        password: "Password123",
        role: "attendee",
      }),
    }
  );

  assert.equal(attendeeSignupResponse.status, 201);

  // Check that public staff signup is rejected.
  const staffSignupResponse = await fetch(
    `${baseUrl}/api/auth/signup`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test Staff",
        email: "staff@example.com",
        password: "Password123",
        role: "staff",
      }),
    }
  );

  assert.equal(staffSignupResponse.status, 400);
   const authHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  // Check that an invalid token is rejected.
  const invalidTokenResponse = await fetch(
    `${baseUrl}/api/events`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer invalid.token.value",
      },
      body: JSON.stringify({
        title: "Unauthorized Event",
        city: "Lagos",
        venue: "Test Hall",
        date: "2026-12-05",
      }),
    }
  );

  assert.equal(invalidTokenResponse.status, 401);
  const createResponse = await fetch(`${baseUrl}/api/events`, {
    method: "POST",
    headers: authHeaders,    body: JSON.stringify({
      title: "API Test Festival",
      city: "Lagos",
      venue: "Test Hall",
      date: "2026-12-05",
    }),
  });

  assert.equal(createResponse.status, 201);

  const { event } = await createResponse.json();
  assert.equal(event.title, "API Test Festival");
  assert.equal(event.published, false);

    // Sign up a second organizer.
  const secondOrganizerSignup = await fetch(
    `${baseUrl}/api/auth/signup`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Second Organizer",
        email: "organizer2@example.com",
        password: "Password123",
        role: "organizer",
      }),
    }
  );

  assert.equal(secondOrganizerSignup.status, 201);

  const secondOrganizer = await secondOrganizerSignup.json();
    // The first organizer should see their own event.
  const myEventsResponse = await fetch(
    `${baseUrl}/api/my-events`,
    {
      headers: authHeaders,
    }
  );

  assert.equal(myEventsResponse.status, 200);

  const myEvents = await myEventsResponse.json();

  assert.ok(
    myEvents.events.some((item) => item.id === event.id)
  );

  // The second organizer must not see the first organizer's event.
  const secondMyEventsResponse = await fetch(
    `${baseUrl}/api/my-events`,
    {
      headers: {
        Authorization: `Bearer ${secondOrganizer.token}`,
      },
    }
  );

  assert.equal(secondMyEventsResponse.status, 200);

  const secondMyEvents = await secondMyEventsResponse.json();

  assert.equal(secondMyEvents.events.length, 0);

  // Check that the second organizer cannot add tiers to the first organizer's event.
  const ownershipResponse = await fetch(
    `${baseUrl}/api/events/${event.id}/tiers`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secondOrganizer.token}`,
      },
      body: JSON.stringify({
        name: "Unauthorized Tier",
        priceCents: 500000,
        capacity: 5,
      }),
    }
  );

  assert.equal(ownershipResponse.status, 403);
  // 2. Add a ticket tier.
      // 2. Add a ticket tier.
  const tierResponse = await fetch(
    `${baseUrl}/api/events/${event.id}/tiers`,
    {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        name: "General Admission",
        priceCents: 500000,
        capacity: 5,
      }),
    }
  );

  assert.equal(tierResponse.status, 201);

  assert.equal(tierResponse.status, 201);

  const { tier } = await tierResponse.json();
  assert.equal(tier.available, 5);

  // 3. Publish the event.
  const publishResponse = await fetch(
    `${baseUrl}/api/events/${event.id}/publish`,
    {
  method: "POST",
  headers: authHeaders,
}
  );

  assert.equal(publishResponse.status, 200);

  const published = await publishResponse.json();
  assert.equal(published.event.published, true);

  // 4. Find the published event.
  const searchResponse = await fetch(`${baseUrl}/api/events?city=Lagos`);

  assert.equal(searchResponse.status, 200);

  const searchResult = await searchResponse.json();
  assert.ok(searchResult.events.some((item) => item.id === event.id));


    // Sign up an attendee.
  
  const attendee = await attendeeSignupResponse.json();

  const attendeeHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${attendee.token}`,
  };

    // Create a second ticket tier for multi-tier booking.
  const vipTierResponse = await fetch(
    `${baseUrl}/api/events/${event.id}/tiers`,
    {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        name: "VIP",
        priceCents: 1000000,
        capacity: 5,
      }),
    }
  );

  assert.equal(vipTierResponse.status, 201);

  const { tier: vipTier } = await vipTierResponse.json();

  // Book tickets from two different tiers together.
  const multiTierBookingResponse = await fetch(
    `${baseUrl}/api/events/${event.id}/bookings`,
    {
      method: "POST",
      headers: attendeeHeaders,
      body: JSON.stringify({
        customerName: "Multi-Tier Customer",
        items: [
          { tierId: tier.id, quantity: 1 },
          { tierId: vipTier.id, quantity: 1 },
        ],
      }),
    }
  );

  assert.equal(multiTierBookingResponse.status, 201);

  const { bookings: multiTierBookings } =
    await multiTierBookingResponse.json();

  assert.equal(multiTierBookings.length, 2);

  assert.equal(
    multiTierBookings.reduce(
      (total, booking) => total + booking.totalCents,
      0
    ),
    1500000
  );

  // Test batch payment for multiple ticket bookings.
const multiTierPayResponse = await fetch(
  `${baseUrl}/api/booking-batches/pay`,
  {
    method: "POST",
    headers: attendeeHeaders,
    body: JSON.stringify({
      references: multiTierBookings.map(
        (booking) => booking.reference
      ),
    }),
  }
);

assert.equal(multiTierPayResponse.status, 200);

const { bookings: paidMultiTierBookings } =
  await multiTierPayResponse.json();

assert.equal(paidMultiTierBookings.length, 2);

assert.ok(
  paidMultiTierBookings.every(
    (booking) =>
      booking.status === "CONFIRMED" &&
      booking.paymentStatus === "PAID"
  )
);

// Create another set of multi-tier bookings.
const cancelBatchBookingResponse = await fetch(
  `${baseUrl}/api/events/${event.id}/bookings`,
  {
    method: "POST",
    headers: attendeeHeaders,
    body: JSON.stringify({
  customerName: "Cancellation Test Customer",
  items: [
    { tierId: tier.id, quantity: 1 },
    { tierId: vipTier.id, quantity: 1 },
  ],
}),
  }
);

console.log(
  "Second booking error:",
  await cancelBatchBookingResponse.clone().text()
);

assert.equal(cancelBatchBookingResponse.status, 201);

const { bookings: bookingsToCancel } =
  await cancelBatchBookingResponse.json();

// Test batch cancellation.
const batchCancelResponse = await fetch(
  `${baseUrl}/api/booking-batches/cancel`,
  {
    method: "POST",
    headers: attendeeHeaders,
    body: JSON.stringify({
      references: bookingsToCancel.map(
        (booking) => booking.reference
      ),
    }),
  }
);

assert.equal(batchCancelResponse.status, 200);

const { bookings: cancelledBookings } =
  await batchCancelResponse.json();

assert.equal(cancelledBookings.length, 2);

assert.ok(
  cancelledBookings.every(
    (booking) => booking.status === "CANCELLED"
  )
);

// Check that cancelled bookings restore ticket inventory.
const inventoryResponse = await fetch(
  `${baseUrl}/api/events?city=Lagos`
);

assert.equal(inventoryResponse.status, 200);

const inventoryResult = await inventoryResponse.json();

const updatedEvent = inventoryResult.events.find(
  (item) => item.id === event.id
);

assert.ok(updatedEvent);

const updatedGeneralTier = updatedEvent.tiers.find(
  (item) => item.id === tier.id
);

const updatedVipTier = updatedEvent.tiers.find(
  (item) => item.id === vipTier.id
);

assert.equal(updatedGeneralTier.available, 4);
assert.equal(updatedVipTier.available, 4);

    // Check that an attendee cannot create an event.
  const attendeeCreateResponse = await fetch(
    `${baseUrl}/api/events`,
    {
      method: "POST",
      headers: attendeeHeaders,
      body: JSON.stringify({
        title: "Attendee Unauthorized Event",
        city: "Lagos",
        venue: "Test Hall",
        date: "2026-12-06",
      }),
    }
  );

  assert.equal(attendeeCreateResponse.status, 403);
  // 5. Create a booking.
  const bookingResponse = await fetch(
    `${baseUrl}/api/tiers/${tier.id}/bookings`,
    {
      method: "POST",
      headers: attendeeHeaders,
      body: JSON.stringify({        customerName: "Test Customer",
        quantity: 2,
      }),
    }
  );

  assert.equal(bookingResponse.status, 201);

  const { booking } = await bookingResponse.json();
  assert.equal(booking.status, "PENDING");
  assert.equal(booking.paymentStatus, "UNPAID");
  assert.equal(booking.totalCents, 1000000);

  // 6. Pay for the booking.
 const payResponse = await fetch(
  `${baseUrl}/api/bookings/${booking.reference}/pay`,
  {
    method: "POST",
    headers: attendeeHeaders,
  }
);

  assert.equal(payResponse.status, 200);

  const paid = await payResponse.json();
  assert.equal(paid.booking.status, "CONFIRMED");
  assert.equal(paid.booking.paymentStatus, "PAID");

  // 7. Create another booking, then cancel it unpaid.
  const secondBookingResponse = await fetch(
    `${baseUrl}/api/tiers/${tier.id}/bookings`,
    {
      method: "POST",
      headers: attendeeHeaders,      body: JSON.stringify({
        customerName: "Another Customer",
        quantity: 1,
      }),
    }
  );

    // The first attendee should see their own tickets.
  const myTicketsResponse = await fetch(
    `${baseUrl}/api/my-tickets`,
    {
      headers: attendeeHeaders,
    }
  );

  assert.equal(myTicketsResponse.status, 200);

  const myTickets = await myTicketsResponse.json();

  assert.ok(
    myTickets.bookings.some(
      (item) => item.reference === booking.reference
    )
  );

  

  assert.equal(secondBookingResponse.status, 201);

  const second = await secondBookingResponse.json();

    // Sign up a second attendee.
  const secondAttendeeSignup = await fetch(
    `${baseUrl}/api/auth/signup`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Second Attendee",
        email: "attendee2@example.com",
        password: "Password123",
        role: "attendee",
      }),
    }
  );

  assert.equal(secondAttendeeSignup.status, 201);

  const secondAttendee = await secondAttendeeSignup.json();

  const secondAttendeeHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${secondAttendee.token}`,
  };
  // The second attendee must not see the first attendee's tickets.
const secondMyTicketsResponse = await fetch(
  `${baseUrl}/api/my-tickets`,
  {
    headers: secondAttendeeHeaders,
  }
);

assert.equal(secondMyTicketsResponse.status, 200);

const secondMyTickets = await secondMyTicketsResponse.json();

assert.equal(secondMyTickets.bookings.length, 0);

  // A different attendee must not pay for this booking.
  const unauthorizedPayResponse = await fetch(
    `${baseUrl}/api/bookings/${second.booking.reference}/pay`,
    {
      method: "POST",
      headers: secondAttendeeHeaders,
    }
  );

  assert.equal(unauthorizedPayResponse.status, 403);

  // A different attendee must not cancel this booking.
  const unauthorizedCancelResponse = await fetch(
    `${baseUrl}/api/bookings/${second.booking.reference}/cancel`,
    {
      method: "POST",
      headers: secondAttendeeHeaders,
    }
  );

  assert.equal(unauthorizedCancelResponse.status, 403);
  const cancelResponse = await fetch(
  `${baseUrl}/api/bookings/${second.booking.reference}/cancel`,
  {
    method: "POST",
    headers: attendeeHeaders,
  }
);

  assert.equal(cancelResponse.status, 200);

  const cancelled = await cancelResponse.json();
  assert.equal(cancelled.booking.status, "CANCELLED");

  // 8. Payment for a cancelled booking must fail consistently.
 const invalidPayResponse = await fetch(
  `${baseUrl}/api/bookings/${second.booking.reference}/pay`,
  {
    method: "POST",
    headers: attendeeHeaders,
  }
);

  assert.equal(invalidPayResponse.status, 409);

  const errorBody = await invalidPayResponse.json();
  assert.equal(errorBody.error.code, "INVALID_STATE");
  assert.equal(
    typeof errorBody.error.message,
    "string"
  );



  // 9. Test the waitlist API routes.

  // Create a separate event with one ticket.
  const waitlistEventResponse = await fetch(
    `${baseUrl}/api/events`,
    {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        title: "Waitlist API Test Concert",
        city: "Lagos",
        venue: "Waitlist Test Hall",
        date: "2026-12-30",
      }),
    }
  );

  assert.equal(waitlistEventResponse.status, 201);

  const { event: waitlistEvent } =
    await waitlistEventResponse.json();

  // Add a ticket tier with capacity one.
  const waitlistTierResponse = await fetch(
    `${baseUrl}/api/events/${waitlistEvent.id}/tiers`,
    {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        name: "Waitlist General Admission",
        priceCents: 500000,
        capacity: 1,
      }),
    }
  );

  assert.equal(waitlistTierResponse.status, 201);

  const { tier: waitlistTier } =
    await waitlistTierResponse.json();

  // Publish the event.
  const waitlistPublishResponse = await fetch(
    `${baseUrl}/api/events/${waitlistEvent.id}/publish`,
    {
      method: "POST",
      headers: authHeaders,
    }
  );

  assert.equal(waitlistPublishResponse.status, 200);

  // The first attendee takes the only ticket.
  const waitlistBuyerResponse = await fetch(
    `${baseUrl}/api/tiers/${waitlistTier.id}/bookings`,
    {
      method: "POST",
      headers: attendeeHeaders,
      body: JSON.stringify({
        customerName: "Waitlist Buyer",
        quantity: 1,
      }),
    }
  );

  assert.equal(waitlistBuyerResponse.status, 201);

  const { booking: waitlistBuyerBooking } =
    await waitlistBuyerResponse.json();

  // The second attendee joins the waitlist.
  const joinWaitlistResponse = await fetch(
    `${baseUrl}/api/tiers/${waitlistTier.id}/waitlist`,
    {
      method: "POST",
      headers: secondAttendeeHeaders,
      body: JSON.stringify({
        customerName: "Waitlist Customer",
        quantity: 1,
      }),
    }
  );

  assert.equal(joinWaitlistResponse.status, 201);

  const { entry: waitlistEntry } =
    await joinWaitlistResponse.json();

  assert.ok(waitlistEntry.id);

  // Retrieve the second attendee's waitlist.
  const myWaitlistResponse = await fetch(
    `${baseUrl}/api/my-waitlist`,
    {
      headers: secondAttendeeHeaders,
    }
  );

  assert.equal(myWaitlistResponse.status, 200);

  const myWaitlist = await myWaitlistResponse.json();

  assert.ok(
    myWaitlist.entries.some(
      (entry) => entry.id === waitlistEntry.id
    )
  );

  // Cancel the original booking to create a waitlist offer.
  const releaseTicketResponse = await fetch(
    `${baseUrl}/api/bookings/${waitlistBuyerBooking.reference}/cancel`,
    {
      method: "POST",
      headers: attendeeHeaders,
    }
  );

  assert.equal(releaseTicketResponse.status, 200);

  // Retrieve the waitlist again and confirm the offer.
  const offeredWaitlistResponse = await fetch(
    `${baseUrl}/api/my-waitlist`,
    {
      headers: secondAttendeeHeaders,
    }
  );

  assert.equal(offeredWaitlistResponse.status, 200);

  const offeredWaitlist = await offeredWaitlistResponse.json();

  const offeredEntry = offeredWaitlist.entries.find(
    (entry) => entry.id === waitlistEntry.id
  );

  assert.ok(offeredEntry);
  assert.equal(offeredEntry.status, "OFFERED");

  // Accept the waitlist offer.
  const acceptWaitlistResponse = await fetch(
    `${baseUrl}/api/waitlist/${waitlistEntry.id}/accept`,
    {
      method: "POST",
      headers: secondAttendeeHeaders,
    }
  );

  assert.equal(acceptWaitlistResponse.status, 201);

  const { booking: acceptedWaitlistBooking } =
    await acceptWaitlistResponse.json();

  assert.equal(
  acceptedWaitlistBooking.attendeeId,
  secondAttendee.user.id
);
  assert.equal(
    acceptedWaitlistBooking.status,
    "PENDING"
  );

  assert.equal(
    acceptedWaitlistBooking.paymentStatus,
    "UNPAID"
  );
});
