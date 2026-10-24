
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";

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

  serverProcess = spawn(
    process.execPath,
    ["src/server/server.js"],
    {
      cwd: process.cwd(),
      env: { ...process.env, PORT: String(port) },
      stdio: "ignore",
    }
  );

  t.after(() => {
    if (serverProcess && !serverProcess.killed) {
      serverProcess.kill();
    }
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
  const createResponse = await fetch(`${baseUrl}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
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

  // 2. Add a ticket tier.
  const tierResponse = await fetch(
    `${baseUrl}/api/events/${event.id}/tiers`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "General Admission",
        priceCents: 500000,
        capacity: 5,
      }),
    }
  );

  assert.equal(tierResponse.status, 201);

  const { tier } = await tierResponse.json();
  assert.equal(tier.available, 5);

  // 3. Publish the event.
  const publishResponse = await fetch(
    `${baseUrl}/api/events/${event.id}/publish`,
    { method: "POST" }
  );

  assert.equal(publishResponse.status, 200);

  const published = await publishResponse.json();
  assert.equal(published.event.published, true);

  // 4. Find the published event.
  const searchResponse = await fetch(`${baseUrl}/api/events?city=Lagos`);

  assert.equal(searchResponse.status, 200);

  const searchResult = await searchResponse.json();
  assert.ok(searchResult.events.some((item) => item.id === event.id));

  // 5. Create a booking.
  const bookingResponse = await fetch(
    `${baseUrl}/api/tiers/${tier.id}/bookings`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName: "Test Customer",
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
    { method: "POST" }
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName: "Another Customer",
        quantity: 1,
      }),
    }
  );

  assert.equal(secondBookingResponse.status, 201);

  const second = await secondBookingResponse.json();

  const cancelResponse = await fetch(
    `${baseUrl}/api/bookings/${second.booking.reference}/cancel`,
    { method: "POST" }
  );

  assert.equal(cancelResponse.status, 200);

  const cancelled = await cancelResponse.json();
  assert.equal(cancelled.booking.status, "CANCELLED");

  // 8. Payment for a cancelled booking must fail consistently.
  const invalidPayResponse = await fetch(
    `${baseUrl}/api/bookings/${second.booking.reference}/pay`,
    { method: "POST" }
  );

  assert.equal(invalidPayResponse.status, 409);

  const errorBody = await invalidPayResponse.json();
  assert.equal(errorBody.error.code, "INVALID_STATE");
  assert.equal(
    typeof errorBody.error.message,
    "string"
  );
});
