
import {
  getEvents,
  getEventById,
  createMockBooking,
  releaseMockBooking,
  confirmMockBooking,
  mockPay
} from "./data.js";

// Get the HTML elements we need.
const eventsSection = document.querySelector("#eventsSection");
const eventDetailsSection = document.querySelector("#eventDetailsSection");
const checkoutSection = document.querySelector("#checkoutSection");
const confirmationSection = document.querySelector("#confirmationSection");

const eventsGrid = document.querySelector("#eventsGrid");
const eventCount = document.querySelector("#eventCount");
const emptyState = document.querySelector("#emptyState");

const filterForm = document.querySelector("#filterForm");
const searchInput = document.querySelector("#searchInput");
const cityFilter = document.querySelector("#cityFilter");
const categoryFilter = document.querySelector("#categoryFilter");
const sortFilter = document.querySelector("#sortFilter");

const eventDetails = document.querySelector("#eventDetails");
const checkoutForm = document.querySelector("#checkoutForm");
const countdown = document.querySelector("#countdown");
const paymentMessage = document.querySelector("#paymentMessage");
const payButton = document.querySelector("#payButton");
const payButtonAmount = document.querySelector("#payButtonAmount");
const orderSummary = document.querySelector("#orderSummary");

const confirmationMessage = document.querySelector("#confirmationMessage");
const bookingReference = document.querySelector("#bookingReference");

// Format prices stored in kobo as Nigerian naira.
const money = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0
});

function formatMoney(amountInKobo) {
  return money.format(amountInKobo / 100);
}

function formatDate(dateString) {
  return new Date(`${dateString}T12:00:00`).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

// Keep track of the event and booking currently being viewed.
let currentEventId = null;
let currentBooking = null;
let countdownTimer = null;
let secondsRemaining = 300;

// Show one section and hide the others.
function showSection(sectionToShow) {
  [
    eventsSection,
    eventDetailsSection,
    checkoutSection,
    confirmationSection
  ].forEach((section) => {
    section.hidden = section !== sectionToShow;
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function stopCountdown() {
  if (countdownTimer !== null) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
}

function refreshEventList() {
  renderEvents();
}

// Return the cheapest tier that still has tickets available.
function getCheapestAvailableTier(event) {
  const availableTiers = event.tiers.filter((tier) => tier.available > 0);

  if (availableTiers.length === 0) {
    return event.tiers.reduce((cheapest, tier) =>
      tier.priceCents < cheapest.priceCents ? tier : cheapest
    );
  }

  return availableTiers.reduce((cheapest, tier) =>
    tier.priceCents < cheapest.priceCents ? tier : cheapest
  );
}

// Display the events on the page.
function renderEvents() {
  const searchText = searchInput.value.trim().toLowerCase();
  const selectedCity = cityFilter.value;
  const selectedCategory = categoryFilter.value;
  const sortBy = sortFilter.value;

  let filteredEvents = getEvents().filter((event) => {
    const matchesSearch =
      event.title.toLowerCase().includes(searchText) ||
      event.city.toLowerCase().includes(searchText) ||
      event.venue.toLowerCase().includes(searchText);

    const matchesCity =
      selectedCity === "" || event.city === selectedCity;

    const matchesCategory =
      selectedCategory === "" || event.category === selectedCategory;

    return matchesSearch && matchesCity && matchesCategory;
  });

  // Sort a separate array, leaving the original event list unchanged.
  if (sortBy === "date") {
    filteredEvents.sort((a, b) => a.date.localeCompare(b.date));
  } else if (sortBy === "price") {
    filteredEvents.sort(
      (a, b) =>
        getCheapestAvailableTier(a).priceCents -
        getCheapestAvailableTier(b).priceCents
    );
  } else if (sortBy === "availability") {
    filteredEvents.sort(
      (a, b) =>
        b.tiers.reduce((sum, tier) => sum + tier.available, 0) -
        a.tiers.reduce((sum, tier) => sum + tier.available, 0)
    );
  } else if (sortBy === "title") {
    filteredEvents.sort((a, b) => a.title.localeCompare(b.title));
  }

  eventsGrid.replaceChildren();
  eventCount.textContent =
    `${filteredEvents.length} event${filteredEvents.length === 1 ? "" : "s"} found`;

  emptyState.hidden = filteredEvents.length > 0;

  filteredEvents.forEach((event) => {
    const card = document.createElement("article");
    card.className = "event-card";

    const image = document.createElement("img");
    image.className = "event-image";
    image.src = event.image;
    image.alt = event.title;
    image.loading = "lazy";
    image.onerror = () => {
      image.hidden = true;
    };

    const content = document.createElement("div");
    content.className = "event-card-content";

    const category = document.createElement("p");
    category.className = "event-category";
    category.textContent = event.category;

    const title = document.createElement("h3");
    title.textContent = event.title;

    const location = document.createElement("p");
    location.textContent = `${event.city} · ${event.venue}`;

    const date = document.createElement("p");
    date.textContent = formatDate(event.date);

    const cheapestTier = getCheapestAvailableTier(event);
    const price = document.createElement("p");
    price.className = "event-price";
    price.textContent = `From ${formatMoney(cheapestTier.priceCents)}`;

    const totalAvailable = event.tiers.reduce(
      (sum, tier) => sum + tier.available,
      0
    );

    const availability = document.createElement("p");
    availability.textContent =
      totalAvailable > 0
        ? `${totalAvailable} tickets available`
        : "Sold out";

    const viewButton = document.createElement("button");
    viewButton.type = "button";
    viewButton.className = "button button-primary";
    viewButton.textContent = "View event";
    viewButton.addEventListener("click", () => {
      openEvent(event.id);
    });

    content.append(category, title, location, date, price, availability, viewButton);
    card.append(image, content);
    eventsGrid.append(card);
  });
}

// Show the details of one event.
function renderEventDetails(eventId) {
  const event = getEventById(eventId);

  if (!event) {
    showSection(eventsSection);
    return;
  }

  currentEventId = event.id;
  eventDetails.replaceChildren();

  const image = document.createElement("img");
  image.className = "detail-image";
  image.src = event.image;
  image.alt = event.title;
  image.onerror = () => {
    image.hidden = true;
  };

  const category = document.createElement("p");
  category.className = "event-category";
  category.textContent = event.category;

  const title = document.createElement("h2");
  title.textContent = event.title;

  const description = document.createElement("p");
  description.textContent = event.description;

  const information = document.createElement("p");
  information.textContent =
    `${event.city} · ${event.venue} · ${formatDate(event.date)} · ${event.time}`;

  const tiersHeading = document.createElement("h3");
  tiersHeading.textContent = "Choose your tickets";

  const tierList = document.createElement("div");
  tierList.className = "ticket-tier-list";

  event.tiers.forEach((tier) => {
    const tierCard = document.createElement("div");
    tierCard.className = "ticket-tier";

    const tierName = document.createElement("h4");
    tierName.textContent = tier.name;

    const tierPrice = document.createElement("p");
    tierPrice.textContent = formatMoney(tier.priceCents);

    const remaining = document.createElement("p");
    remaining.textContent =
      tier.available > 0
        ? `${tier.available} tickets remaining`
        : "SOLD OUT";
    if (tier.available === 0) {
      remaining.className = "sold-out";
    }

    const quantityLabel = document.createElement("label");
    quantityLabel.textContent = "Quantity ";

    const quantityInput = document.createElement("input");
    quantityInput.type = "number";
    quantityInput.min = "0";
    quantityInput.max = String(Math.min(10, tier.available));
    quantityInput.value = "0";
    quantityInput.step = "1";
    quantityInput.className = "ticket-quantity";
    quantityInput.dataset.tierId = String(tier.id);
    quantityInput.dataset.price = String(tier.priceCents);
    quantityInput.disabled = tier.available === 0;
    quantityInput.setAttribute(
      "aria-label",
      `${tier.name} ticket quantity`
    );

    quantityLabel.append(quantityInput);
    tierCard.append(tierName, tierPrice, remaining, quantityLabel);
    tierList.append(tierCard);
  });

  const continueButton = document.createElement("button");
  continueButton.type = "button";
  continueButton.className = "button button-primary";
  continueButton.textContent = "Continue to checkout";
  continueButton.addEventListener("click", beginCheckout);

  const message = document.createElement("p");
  message.id = "ticketSelectionMessage";
  message.setAttribute("role", "alert");

  eventDetails.append(
    image,
    category,
    title,
    description,
    information,
    tiersHeading,
    tierList,
    message,
    continueButton
  );

  showSection(eventDetailsSection);
}

function openEvent(eventId) {
  renderEventDetails(eventId);
}

function beginCheckout() {
  const event = getEventById(currentEventId);

  if (!event) {
    return;
  }

  const quantities = {};
  const quantityInputs = eventDetails.querySelectorAll(".ticket-quantity");

  for (const input of quantityInputs) {
    const quantity = Number(input.value);
    const tierId = Number(input.dataset.tierId);
    const tier = event.tiers.find((item) => item.id === tierId);

    if (!Number.isInteger(quantity) || quantity < 0) {
      showTicketSelectionError("Enter a whole-number ticket quantity.");
      return;
    }

    if (quantity > 0) {
      if (!tier || quantity > tier.available || quantity > 10) {
        showTicketSelectionError(
          "That quantity is not available. Please check your selection."
        );
        return;
      }

      quantities[tierId] = quantity;
    }
  }

  if (Object.keys(quantities).length === 0) {
    showTicketSelectionError("Please choose at least one ticket.");
    return;
  }

  const result = createMockBooking(currentEventId, quantities);

  if (!result.success) {
    showTicketSelectionError(result.message);
    renderEventDetails(currentEventId);
    return;
  }

  currentBooking = result.booking;
  paymentMessage.textContent = "";
  paymentMessage.className = "payment-message";
  checkoutForm.reset();

  renderOrderSummary(currentBooking);
  startCountdown();
  showSection(checkoutSection);
}

function showTicketSelectionError(message) {
  const messageElement = document.querySelector("#ticketSelectionMessage");

  if (messageElement) {
    messageElement.textContent = message;
  }
}

function renderOrderSummary(booking) {
  orderSummary.replaceChildren();

  const heading = document.createElement("h3");
  heading.textContent = booking.eventTitle;

  orderSummary.append(heading);

  booking.tickets.forEach((ticket) => {
    const line = document.createElement("p");
    line.textContent =
      `${ticket.quantity} × ${ticket.name} — ` +
      formatMoney(ticket.priceCents * ticket.quantity);
    orderSummary.append(line);
  });

  const total = document.createElement("p");
  total.className = "order-total";
  total.textContent = `Total: ${formatMoney(booking.totalCents)}`;
  orderSummary.append(total);

  payButtonAmount.textContent = formatMoney(booking.totalCents);
}

function startCountdown() {
  stopCountdown();
  secondsRemaining = 300;
  updateCountdownDisplay();

  countdownTimer = setInterval(() => {
    secondsRemaining -= 1;
    updateCountdownDisplay();

    if (secondsRemaining <= 0) {
      stopCountdown();

      if (currentBooking) {
        releaseMockBooking(currentBooking.reference);
        currentBooking = null;
      }

      paymentMessage.textContent =
        "Your checkout time expired. Your tickets have been released. Please select tickets again.";
      paymentMessage.className = "payment-message payment-error";
      refreshEventList();
      renderEventDetails(currentEventId);
      showSection(eventDetailsSection);
    }
  }, 1000);
}

function updateCountdownDisplay() {
  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;

  countdown.textContent =
    `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

// Process the mock payment. No real payment is made.
checkoutForm.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!currentBooking || secondsRemaining <= 0) {
    paymentMessage.textContent =
      "Your checkout has expired. Please select your tickets again.";
    paymentMessage.className = "payment-message payment-error";
    return;
  }

  const cardNumber = document.querySelector("#cardNumber").value;

  const paymentResult = mockPay({ cardNumber });

  if (!paymentResult.success) {
    paymentMessage.textContent = paymentResult.message;
    paymentMessage.className = "payment-message payment-error";
    return;
  }

  const confirmed = confirmMockBooking(currentBooking.reference);

  if (!confirmed) {
    paymentMessage.textContent =
      "We could not confirm this booking. Please try again.";
    paymentMessage.className = "payment-message payment-error";
    return;
  }

  stopCountdown();

  const completedBooking = currentBooking;
  currentBooking = null;

  confirmationMessage.textContent =
    `Your booking for ${completedBooking.eventTitle} was successful.`;
  bookingReference.textContent = completedBooking.reference;

  refreshEventList();
  showSection(confirmationSection);
});

// Release the temporary booking if the customer leaves checkout.
function leaveCheckout(destination) {
  stopCountdown();

  if (currentBooking) {
    releaseMockBooking(currentBooking.reference);
    currentBooking = null;
  }

  refreshEventList();

  if (destination === "details" && currentEventId !== null) {
    renderEventDetails(currentEventId);
  } else {
    showSection(eventsSection);
  }
}

// Search and filter events.
searchInput.addEventListener("input", renderEvents);
cityFilter.addEventListener("change", renderEvents);
categoryFilter.addEventListener("change", renderEvents);
sortFilter.addEventListener("change", renderEvents);

filterForm.addEventListener("submit", (event) => {
  event.preventDefault();
  renderEvents();
});

function resetFilters() {
  filterForm.reset();
  renderEvents();
}

document.querySelector("#resetFilters").addEventListener("click", resetFilters);
document.querySelector("#emptyResetButton").addEventListener("click", resetFilters);

// Navigation buttons.
document.querySelector("#homeButton").addEventListener("click", () => {
  if (currentBooking) {
    leaveCheckout("events");
  } else {
    showSection(eventsSection);
  }
});

document.querySelector("#homeLink").addEventListener("click", (event) => {
  event.preventDefault();

  if (currentBooking) {
    leaveCheckout("events");
  } else {
    showSection(eventsSection);
  }
});

document.querySelector("#eventsNavLink").addEventListener("click", (event) => {
  event.preventDefault();

  if (currentBooking) {
    leaveCheckout("events");
  } else {
    showSection(eventsSection);
  }
});

document.querySelector("#backToEvents").addEventListener("click", () => {
  showSection(eventsSection);
});

document.querySelector("#backToDetails").addEventListener("click", () => {
  leaveCheckout("details");
});

document.querySelector("#confirmationHome").addEventListener("click", () => {
  currentEventId = null;
  showSection(eventsSection);
});

// Show the initial event list.
renderEvents();
showSection(eventsSection);
