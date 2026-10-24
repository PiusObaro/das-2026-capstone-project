
# Build 4: API Examples

This document demonstrates the Event Ticketing API using curl.
The API stores data in memory, so events and bookings are lost when
the server stops or restarts.

## 1. Start the server

From the project root, run:

```bash
npm start
```

The server runs at `http://localhost:3000`.

Keep this terminal open. Use another terminal to run the curl commands.

## 2. Check server health

```bash
curl http://localhost:3000/health
```

Expected response:

```json
{"status":"ok"}
```

## 3. Create an event

```bash
curl -X POST http://localhost:3000/api/events -H "Content-Type: application/json" -d "{\"title\":\"Lagos Music Festival\",\"city\":\"Lagos\",\"venue\":\"Eko Hotel\",\"date\":\"2026-12-05\"}"
```

Expected status: `201 Created`.

Save the event ID from the response for the next requests.

## 4. Add a ticket tier

Replace `EVENT_ID` with the ID returned when creating the event.

```bash
curl -X POST http://localhost:3000/api/events/EVENT_ID/tiers -H "Content-Type: application/json" -d "{\"name\":\"General Admission\",\"priceCents\":500000,\"capacity\":100}"
```

Expected status: `201 Created`.

The price is stored in kobo. `500000` kobo equals ₦5,000.

Save the ticket tier ID from the response.

## 5. Publish the event

Replace `EVENT_ID` with the event ID.

```bash
curl -X POST http://localhost:3000/api/events/EVENT_ID/publish
```

Expected status: `200 OK`. The event should show `"published":true`.

## 6. Search published events

Get all published events:

```bash
curl http://localhost:3000/api/events
```

Search by city:

```bash
curl "http://localhost:3000/api/events?city=Lagos"
```

Search by title:

```bash
curl "http://localhost:3000/api/events?q=Music"
```

Filter by date range:

```bash
curl "http://localhost:3000/api/events?from=2026-12-01&to=2026-12-31"
```

Filter by maximum ticket price:

```bash
curl "http://localhost:3000/api/events?maxPriceCents=500000"
```

Sort by price:

```bash
curl "http://localhost:3000/api/events?sort=price"
```

## 7. Create a booking

Replace `TIER_ID` with the ticket tier ID.

```bash
curl -X POST http://localhost:3000/api/tiers/TIER_ID/bookings -H "Content-Type: application/json" -d "{\"customerName\":\"John Doe\",\"quantity\":2}"
```

Expected status: `201 Created`.

The booking should initially have `"status":"PENDING"` and
`"paymentStatus":"UNPAID"`.

Save the booking reference from the response.

## 8. Pay for a booking

Replace `BOOKING_REFERENCE` with the booking reference.

```bash
curl -X POST http://localhost:3000/api/bookings/BOOKING_REFERENCE/pay
```

Expected status: `200 OK`. The booking should show
`"status":"CONFIRMED"` and `"paymentStatus":"PAID"`.

This is a mock payment; it does not charge real money.

## 9. Cancel an unpaid booking

Create another booking using section 7, but do not pay for it.

Replace `BOOKING_REFERENCE` with that unpaid booking's reference.

```bash
curl -X POST http://localhost:3000/api/bookings/BOOKING_REFERENCE/cancel
```

Expected status: `200 OK`. The booking should show `"status":"CANCELLED"`.

The ticket quantity is returned to available inventory.

## 10. Test an invalid payment

Attempt to pay for the cancelled booking:

```bash
curl -X POST http://localhost:3000/api/bookings/BOOKING_REFERENCE/pay
```

Expected status: `409 Conflict`.

The response uses this consistent error format:

```json
{
  "error": {
    "code": "INVALID_STATE",
    "message": "Cannot pay for a booking with status CANCELLED."
  }
}
```

## 11. Error responses

API errors use the shape:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Description of the error."
  }
}
```

Common HTTP status codes:

- `400 Bad Request`: invalid input or malformed JSON.
- `404 Not Found`: event, tier, or booking does not exist.
- `405 Method Not Allowed`: unsupported HTTP method.
- `409 Conflict`: invalid booking state or insufficient ticket availability.
- `500 Internal Server Error`: unexpected server error.

## 12. Automated tests

Run all tests from the project root:

```bash
npm test
```

The tests cover domain behaviour and the API workflow, including event
creation, tier creation, publishing, searching, booking, mock payment,
cancellation, and consistent error responses.
