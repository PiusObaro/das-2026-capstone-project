
export function mergeSort(items, compare) {
  if (!Array.isArray(items)) {
    throw new TypeError("items must be an array.");
  }

  if (typeof compare !== "function") {
    throw new TypeError("compare must be a function.");
  }

  if (items.length <= 1) {
    return [...items];
  }

  const middle = Math.floor(items.length / 2);

  const left = mergeSort(items.slice(0, middle), compare);
  const right = mergeSort(items.slice(middle), compare);

  const result = [];
  let i = 0;
  let j = 0;

  while (i < left.length && j < right.length) {
    if (compare(left[i], right[j]) <= 0) {
      result.push(left[i]);
      i++;
    } else {
      result.push(right[j]);
      j++;
    }
  }

  while (i < left.length) {
    result.push(left[i]);
    i++;
  }

  while (j < right.length) {
    result.push(right[j]);
    j++;
  }

  return result;
}
