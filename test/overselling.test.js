
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

test("50 people compete for the last ticket: exactly one succeeds", async (t) => {
  const portServer = createServer();

  await new Promise((resolve, reject) => {
    portServer.once("error", reject);
    portServer.listen(0, "127.0.0.1", resolve);
  });

  const port = portServer.address().port;

  await new Promise((resolve, reject) => {
    portServer.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  const databaseDirectory = mkdtempSync(
    path.join(tmpdir(), "ticket-overselling-")
  );
  const databasePath = path.join(databaseDirectory, "test.sqlite");

  const serverProcess = spawn(
    process.execPath,
    ["src/server/server.js"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(port),
        DATABASE_PATH: databasePath,
      },
      stdio: "ignore",
    }
  );

  t.after(async () => {
    if (serverProcess.exitCode === null && serverProcess.signalCode === null) {
      const exited = new Promise((resolve) => {
        serverProcess.once("exit", resolve);
      });

      serverProcess.kill();
      await exited;
    }

    rmSync(databaseDirectory, { recursive: true, force: true });
  });

  // Wait for the API server to start.
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

  // Create an event.
  const eventResponse = await fetch(`${baseUrl}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Last Ticket Test",
      city: "Lagos",
      venue: "Test Hall",
      date: "2026-12-21",
    }),
  });

  assert.equal(eventResponse.status, 201);

  const { event } = await eventResponse.json();

  // Create a tier with only one ticket.
  const tierResponse = await fetch(
    `${baseUrl}/api/events/${event.id}/tiers`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Last Ticket",
        priceCents: 5000,
        capacity: 1,
      }),
    }
  );

  assert.equal(tierResponse.status, 201);

  const { tier } = await tierResponse.json();
  assert.equal(tier.available, 1);

  // Publish the event.
  const publishResponse = await fetch(
    `${baseUrl}/api/events/${event.id}/publish`,
    { method: "POST" }
  );

  assert.equal(publishResponse.status, 200);

  // Send 50 booking requests at the same time.
  const attempts = Array.from({ length: 50 }, (_, index) =>
    fetch(`${baseUrl}/api/tiers/${tier.id}/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName: `Customer ${index + 1}`,
        quantity: 1,
      }),
    })
  );

  const responses = await Promise.all(attempts);

  const successfulBookings = responses.filter(
    (response) => response.status === 201
  );

  const rejectedBookings = responses.filter(
    (response) => response.status === 409
  );

  assert.equal(
    successfulBookings.length,
    1,
    "Exactly one customer should get the last ticket"
  );

  assert.equal(
    rejectedBookings.length,
    49,
    "The other 49 customers should be rejected"
  );

  console.log("Booking attempts:", responses.length);
  console.log("Successful bookings:", successfulBookings.length);
  console.log("Rejected bookings:", rejectedBookings.length);
});
