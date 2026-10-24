import { DomainError } from "./errors.js";
import { mergeSort } from "./sorting.js";

function fail(message, code = "VALIDATION") {
  throw new DomainError(message, code);
}

export function filterEvents(
  summaries,
  {
    q,
    city,
    from,
    to,
    maxPriceCents,
    onlyAvailable = false
  } = {}
) {
  if (!Array.isArray(summaries)) {
    fail("Events must be provided as an array.");
  }

  if (from !== undefined && Number.isNaN(Date.parse(from))) {
    fail("Invalid start date.");
  }

  if (to !== undefined && Number.isNaN(Date.parse(to))) {
    fail("Invalid end date.");
  }

  if (
    maxPriceCents !== undefined &&
    (!Number.isSafeInteger(maxPriceCents) || maxPriceCents < 0)
  ) {
    fail("Maximum price must be a non-negative whole number.");
  }

  const query = typeof q === "string" ? q.trim().toLowerCase() : "";
  const selectedCity =
    typeof city === "string" ? city.trim().toLowerCase() : "";

  return summaries.filter((event) => {
    if (query) {
      const title = (event.title ?? "").toLowerCase();
      const venue = (event.venue ?? "").toLowerCase();

      if (!title.includes(query) && !venue.includes(query)) {
        return false;
      }
    }

    if (
      selectedCity &&
      (event.city ?? "").toLowerCase() !== selectedCity
    ) {
      return false;
    }

    if (from && event.date < from) {
      return false;
    }

    if (to && event.date.slice(0, 10) > to.slice(0, 10)) {
      return false;
    }

    if (
      maxPriceCents !== undefined &&
      (event.cheapestPriceCents === null ||
        event.cheapestPriceCents === undefined ||
        event.cheapestPriceCents > maxPriceCents)
    ) {
      return false;
    }

    if (onlyAvailable && !(event.totalAvailable > 0)) {
      return false;
    }

    return true;
  });
}



function compareText(a, b) {
  return String(a).localeCompare(String(b));
}

export function sortEvents(summaries, sortBy = "date") {
  if (!Array.isArray(summaries)) {
    throw new DomainError("Events must be provided as an array.", "VALIDATION");
  }

  const validSortOptions = ["date", "price", "availability"];

  if (!validSortOptions.includes(sortBy)) {
    fail("Unknown sort option.");
  }

  function compareEvents(a, b) {
    let result = 0;

    if (sortBy === "date") {
      result = compareText(a.date, b.date);
    }

    if (sortBy === "price") {
      const priceA = a.cheapestPriceCents;
      const priceB = b.cheapestPriceCents;

      if (priceA == null && priceB == null) result = 0;
      else if (priceA == null) result = 1;
      else if (priceB == null) result = -1;
      else result = priceA - priceB;
    }

    if (sortBy === "availability") {
      result = b.totalAvailable - a.totalAvailable;
    }

    return result || compareText(a.title, b.title) || compareText(a.id, b.id);
  }

  return mergeSort(summaries, compareEvents);
}

export function searchEvents(summaries, criteria = {}, sortBy = "date") {
  return sortEvents(filterEvents(summaries, criteria), sortBy);
}