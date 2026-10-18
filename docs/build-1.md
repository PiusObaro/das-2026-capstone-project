# Build 1: Domain Core in the Terminal

## Overview

This build implements the core domain logic for an event ticketing and booking system using JavaScript ES modules and Node.js.

## Features implemented

- Created events and ticket tiers.
- Added ticket booking with a maximum of 10 tickets per booking.
- Enforced ticket capacity and rejected bookings when tickets are unavailable.
- Generated unique booking IDs and readable booking references using `node:crypto`.
- Implemented booking cancellation and ticket inventory restoration.
- Implemented a FIFO waitlist using a linked-list queue.
- Added booking lookup using a `Map`.
- Created a terminal demo and a lookup benchmark.

## How to run

Run the demo:

```bash
npm run demo
```

Run the lookup benchmark:

```bash
npm run benchmark
```

## Benchmark results

The recorded test results were:

- `Map.get()`: 0.162 milliseconds
- `Array.find()`: 298.328 milliseconds

These are measurements from one run. Results can vary between runs and computers.

## Implementation notes

- The project uses plain JavaScript ES modules.
- No external packages, server, or database are required.
- Ticket prices are stored as integer kobo/cents.
- The booking reference lookup uses `Map.get()`.
- The waitlist uses a linked list rather than `Array.shift()`.

## Verification

The terminal demo successfully displayed ticket sales, a rejected sold-out booking, waitlist entries, a cancellation, and the next person in line.

The benchmark completed and printed timings for both lookup methods.
