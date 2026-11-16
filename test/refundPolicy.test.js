
import test from "node:test";
import assert from "node:assert/strict";

import {
  getRefundPercentage,
  calculateRefund
} from "../src/domain/refundPolicy.js";

test("Refund is 100% when event is 10 or more days away", () => {
  assert.equal(getRefundPercentage(10), 100);
  assert.equal(getRefundPercentage(15), 100);
});

test("Refund is 50% when event is 3 to 9 days away", () => {
  assert.equal(getRefundPercentage(3), 50);
  assert.equal(getRefundPercentage(9), 50);
  assert.equal(getRefundPercentage(5), 50);
});

test("Refund is 0% when event is less than 3 days away", () => {
  assert.equal(getRefundPercentage(2), 0);
  assert.equal(getRefundPercentage(1), 0);
  assert.equal(getRefundPercentage(0), 0);
});

test("Refund amount is calculated correctly", () => {
  const result = calculateRefund(
    500000,
    "2026-11-21",
    new Date("2026-11-16T12:00:00.000Z")
  );

  assert.deepEqual(result, {
    daysUntilEvent: 5,
    percentage: 50,
    refundAmountCents: 250000
  });
});

test("Invalid booking amount is rejected", () => {
  assert.throws(() => {
    calculateRefund(-500, "2026-11-21");
  }, /non-negative integer/);
});
