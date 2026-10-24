import test from "node:test";
import assert from "node:assert/strict";

import { mergeSort } from "../src/domain/sorting.js";

test("sorts numbers in ascending order", () => {
  const numbers = [8, 3, 6, 1, 5];

  const result = mergeSort(numbers, (a, b) => a - b);

  assert.deepEqual(result, [1, 3, 5, 6, 8]);
});

test("does not change the original array", () => {
  const numbers = [8, 3, 6, 1, 5];
  const original = [...numbers];

  mergeSort(numbers, (a, b) => a - b);

  assert.deepEqual(numbers, original);
});

test("handles an empty array", () => {
  assert.deepEqual(
    mergeSort([], (a, b) => a - b),
    []
  );
});

test("handles an array with one item", () => {
  assert.deepEqual(
    mergeSort([7], (a, b) => a - b),
    [7]
  );
});

test("preserves the order of equal items", () => {
  const items = [
    { name: "First", score: 10 },
    { name: "Second", score: 5 },
    { name: "Third", score: 10 }
  ];

  const result = mergeSort(
    items,
    (a, b) => a.score - b.score
  );

  assert.deepEqual(
    result.map(item => item.name),
    ["Second", "First", "Third"]
  );
});