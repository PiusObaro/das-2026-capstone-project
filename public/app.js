
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
// Login form elements.
const loginForm = document.querySelector("#loginForm");
const loginEmail = document.querySelector("#loginEmail");
const loginPassword = document.querySelector("#loginPassword");
const loginMessage = document.querySelector("#loginMessage");

// Signup form elements.
const signupForm = document.querySelector("#signupForm");
const signupName = document.querySelector("#signupName");
const signupEmail = document.querySelector("#signupEmail");
const signupPassword = document.querySelector("#signupPassword");
const signupRole = document.querySelector("#signupRole");
const signupMessage = document.querySelector("#signupMessage");
// Create Event form elements.
const createEventForm = document.querySelector("#createEventForm");
const eventTitle = document.querySelector("#eventTitle");
const eventCity = document.querySelector("#eventCity");
const eventVenue = document.querySelector("#eventVenue");
const eventDate = document.querySelector("#eventDate");
const createEventMessage = document.querySelector("#createEventMessage");
// Keep track of the logged-in user.
let currentUser = null;
let authToken = sessionStorage.getItem("authToken");
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

// Store events retrieved from the real database API.
let publishedEvents = [];

// Show one section and hide the others.
function showSection(sectionToShow) {
  [
    eventsSection,
    eventDetailsSection,
    checkoutSection,
    confirmationSection,
    document.querySelector("#loginSection"),
    document.querySelector("#myTicketsSection"),
    document.querySelector("#organizerDashboardSection")
  ].forEach((section) => {
    section.hidden = section !== sectionToShow;
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
}
// Handle new user registration.
signupForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  signupMessage.textContent = "Creating your account...";
  signupMessage.className = "form-message";

  try {
    const response = await fetch("/api/auth/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: signupName.value.trim(),
        email: signupEmail.value.trim(),
        password: signupPassword.value,
        role: signupRole.value,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error?.message || "Signup failed.");
    }

    signupMessage.textContent = "Account created successfully! You can now log in.";
    signupForm.reset();
  } catch (error) {
    signupMessage.textContent = error.message;
    signupMessage.className = "form-message payment-error";
  }
});

// Handle event creation.
createEventForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  createEventMessage.textContent = "Creating event...";
  createEventMessage.className = "form-message";

  try {
    const response = await fetch("/api/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        title: eventTitle.value.trim(),
        city: eventCity.value.trim(),
        venue: eventVenue.value.trim(),
        date: eventDate.value,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.error?.message || "Could not create event."
      );
    }

    createEventMessage.textContent =
      "Event created successfully! You can now add ticket tiers.";

    createEventForm.reset();

    await loadOrganizerEvents();
  } catch (error) {
    createEventMessage.textContent = error.message;
    createEventMessage.className = "form-message payment-error";
  }
});

// Handle user login.
loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  loginMessage.textContent = "Logging in...";
  loginMessage.className = "form-message";

  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email: loginEmail.value.trim(),
        password: loginPassword.value
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Login failed.");
    }

    currentUser = result.user;
    authToken = result.token;

    sessionStorage.setItem("authToken", authToken);

    loginMessage.textContent = "Login successful!";
    loginForm.reset();

    if (currentUser.role === "organizer") {
  loadOrganizerEvents();
} else {
  showSection(eventsSection);
}
  } catch (error) {
    loginMessage.textContent = error.message;
    loginMessage.className = "form-message payment-error";
  }
});

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


// Load published events from the real API.

async function loadPublishedEvents() {
  eventsGrid.textContent = "Loading events...";

  try {
    const response = await fetch("/api/events");
    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.error?.message || "Could not load events."
      );
    }

    const sampleEventsByTitle = new Map(
      getEvents().map((event) => [
        event.title.trim().toLowerCase(),
        event
      ])
    );

    publishedEvents = result.events.map((event) => {
      const sample = sampleEventsByTitle.get(
        event.title.trim().toLowerCase()
      );

      return {
        ...event,
        category: sample?.category || "Other",
        description:
          sample?.description || "No event description provided yet.",
        image: sample?.image || "",
        time: sample?.time || "Time to be announced",
        tiers: event.tiers || [],
      };
    });

    renderEvents();
  } catch (error) {
    eventsGrid.textContent = error.message;
    eventCount.textContent = "Unable to load events";
  }
}


// Find an event in the real published-events list.
function getPublishedEventById(eventId) {
  return publishedEvents.find(
    (event) => String(event.id) === String(eventId)
  ) || null;
}

// Display the events on the page.
function renderEvents() {
  const searchText = searchInput.value.trim().toLowerCase();
  const selectedCity = cityFilter.value;
  const selectedCategory = categoryFilter.value;
  const sortBy = sortFilter.value;

let filteredEvents = publishedEvents.filter((event) => {    const matchesSearch =
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
const event = getPublishedEventById(eventId);
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

async function beginCheckout() {
  const event = getPublishedEventById(currentEventId);

  if (!event) return;

  if (!authToken || currentUser?.role !== "attendee") {
    showTicketSelectionError(
      "Please log in with an attendee account before booking."
    );
    showSection(document.querySelector("#loginSection"));
    return;
  }

  const items = [];
  const quantityInputs =
    eventDetails.querySelectorAll(".ticket-quantity");

  for (const input of quantityInputs) {
    const quantity = Number(input.value);
    const tierId = input.dataset.tierId;

    const tier = event.tiers.find(
      (item) => String(item.id) === String(tierId)
    );

    if (!Number.isInteger(quantity) || quantity < 0) {
      showTicketSelectionError(
        "Enter a whole-number ticket quantity."
      );
      return;
    }

    if (quantity > 0) {
      if (!tier || quantity > tier.available || quantity > 10) {
        showTicketSelectionError(
          "That quantity is not available. Please check your selection."
        );
        return;
      }

      items.push({
        tierId: String(tierId),
        quantity,
      });
    }
  }

  if (items.length === 0) {
    showTicketSelectionError("Please choose at least one ticket.");
    return;
  }

  try {
    const response = await fetch(
      `/api/events/${encodeURIComponent(event.id)}/bookings`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ items }),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.error?.message || "Could not reserve tickets."
      );
    }

    const bookings = result.bookings;

    currentBooking = {
      eventTitle: event.title,
      bookings,
      references: bookings.map((booking) => booking.reference),
      totalCents: bookings.reduce(
        (total, booking) => total + booking.totalCents,
        0
      ),
      tickets: bookings.map((booking) => {
        const tier = event.tiers.find(
          (item) => String(item.id) === String(booking.tierId)
        );

        return {
          quantity: booking.quantity,
          name: tier?.name || "Ticket",
          priceCents: tier?.priceCents || 0,
        };
      }),
    };

    paymentMessage.textContent = "";
    paymentMessage.className = "payment-message";
    checkoutForm.reset();

    renderOrderSummary(currentBooking);
    startCountdown();
    showSection(checkoutSection);

  } catch (error) {
    showTicketSelectionError(error.message);
  }
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

// Cancel all unpaid bookings created during checkout.
async function cancelCurrentBooking() {
  if (!currentBooking) {
    return true;
  }

  try {
    const response = await fetch("/api/booking-batches/cancel", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        references: currentBooking.references,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.error?.message || "Could not cancel bookings."
      );
    }

    currentBooking = null;
    return true;

  } catch (error) {
    paymentMessage.textContent = error.message;
    paymentMessage.className = "payment-message payment-error";
    return false;
  }
}

function startCountdown() {
  stopCountdown();
  secondsRemaining = 300;
  updateCountdownDisplay();

  countdownTimer = setInterval(async () => {
    secondsRemaining -= 1;
    updateCountdownDisplay();

    if (secondsRemaining <= 0) {
      stopCountdown();

      const cancelled = await cancelCurrentBooking();

      if (!cancelled) {
        return;
      }

      paymentMessage.textContent =
        "Your checkout time expired. Your tickets have been released. Please select tickets again.";

      paymentMessage.className = "payment-message payment-error";

      await loadPublishedEvents();
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

// Load tickets belonging to the logged-in attendee.
async function loadMyTickets() {
  const myTicketsList = document.querySelector("#myTicketsList");

  if (!authToken) {
    myTicketsList.textContent = "Please log in to view your tickets.";
    showSection(document.querySelector("#loginSection"));
    return;
  }

  myTicketsList.textContent = "Loading your tickets...";

  try {
    const response = await fetch("/api/my-tickets", {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error?.message || "Could not load tickets.");
    }

    if (result.bookings.length === 0) {
      myTicketsList.textContent = "You have no tickets yet.";
      showSection(document.querySelector("#myTicketsSection"));
      return;
    }

    myTicketsList.innerHTML = result.bookings
      .map((booking) => `
        <div class="confirmation-card">
          <h3>${booking.event.name}</h3>
          <p>Reference: ${booking.reference}</p>
          <p>Ticket type: ${booking.tierName}</p>
          <p>Quantity: ${booking.quantity}</p>
          <p>Status: ${booking.status}</p>
          <p>Payment: ${booking.paymentStatus}</p>
          <p>Date: ${booking.event.date}</p>
          <p>Venue: ${booking.event.venue}, ${booking.event.city}</p>
        </div>
      `)
      .join("");

    showSection(document.querySelector("#myTicketsSection"));
  } catch (error) {
    myTicketsList.textContent = error.message;
    showSection(document.querySelector("#myTicketsSection"));
  }
}

// Load events belonging to the logged-in organizer.
async function loadOrganizerEvents() {
  const organizerEventsList = document.querySelector("#organizerEventsList");

  if (!authToken) {
    showSection(document.querySelector("#loginSection"));
    return;
  }

  organizerEventsList.textContent = "Loading your events...";

  try {
    const response = await fetch("/api/my-events", {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error?.message || "Could not load events.");
    }

    if (result.events.length === 0) {
      organizerEventsList.textContent = "You have not created any events yet.";
      showSection(document.querySelector("#organizerDashboardSection"));
      return;
    }

    organizerEventsList.replaceChildren();

    result.events.forEach((event) => {
      const card = document.createElement("div");
      card.className = "confirmation-card";

      const title = document.createElement("h3");
      title.textContent = event.title;
      card.append(title);

      const details = [
        `City: ${event.city}`,
        `Venue: ${event.venue}`,
        `Date: ${event.date}`,
        `Status: ${event.published ? "Published" : "Unpublished"}`,
      ];

      details.forEach((detail) => {
        const paragraph = document.createElement("p");
        paragraph.textContent = detail;
        card.append(paragraph);
      });

      // Add a ticket-tier form to this event card.
const tierForm = document.createElement("form");
tierForm.className = "tier-form";

tierForm.innerHTML = `
  <h4>Add Ticket Tier</h4>

  <div class="field">
    <label>Ticket name</label>
    <input name="tierName" type="text" required
      placeholder="General Admission">
  </div>

  <div class="field">
    <label>Price (priceCents)</label>
    <input name="priceCents" type="number"
      min="0" step="1" required>
  </div>

  <div class="field">
    <label>Ticket capacity</label>
    <input name="capacity" type="number"
      min="1" step="1" required>
  </div>

  <p class="tierMessage form-message" role="alert"></p>

  <button class="primary-button" type="submit">
    Add Ticket Tier
  </button>
`;

card.append(tierForm);

// Submit the ticket-tier form.
tierForm.addEventListener("submit", async (submitEvent) => {
  submitEvent.preventDefault();

  const message = tierForm.querySelector(".tierMessage");
  message.textContent = "Adding ticket tier...";

  try {
    const response = await fetch(
      `/api/events/${encodeURIComponent(event.id)}/tiers`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          name: tierForm.elements.tierName.value.trim(),
          priceCents: Number(tierForm.elements.priceCents.value),
          capacity: Number(tierForm.elements.capacity.value),
        }),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.error?.message || "Could not add ticket tier."
      );
    }

    message.textContent = "Ticket tier added successfully!";
    tierForm.reset();
  } catch (error) {
    message.textContent = error.message;
  }
});

// Add a Publish Event button for unpublished events.
if (!event.published) {
  const publishButton = document.createElement("button");
  publishButton.type = "button";
  publishButton.className = "primary-button";
  publishButton.textContent = "Publish Event";

  const publishMessage = document.createElement("p");
  publishMessage.className = "form-message";

  card.append(publishButton, publishMessage);

  publishButton.addEventListener("click", async () => {
    publishMessage.textContent = "Publishing event...";
    publishButton.disabled = true;

    try {
      const response = await fetch(
        `/api/events/${encodeURIComponent(event.id)}/publish`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error?.message || "Could not publish event."
        );
      }

      publishMessage.textContent = "Event published successfully!";
      publishButton.textContent = "Published";

      const statusParagraph = Array.from(
        card.querySelectorAll("p")
      ).find((paragraph) =>
        paragraph.textContent.startsWith("Status:")
      );

      if (statusParagraph) {
        statusParagraph.textContent = "Status: Published";
      }

    } catch (error) {
      publishMessage.textContent = error.message;
      publishButton.disabled = false;
    }
  });
}

      organizerEventsList.append(card);
    });

    showSection(document.querySelector("#organizerDashboardSection"));
  } catch (error) {
    organizerEventsList.textContent = error.message;
    showSection(document.querySelector("#organizerDashboardSection"));
  }
}

// Navigation buttons.
// Open the login section.
document.querySelector("#loginNavLink").addEventListener("click", (event) => {
  event.preventDefault();
  showSection(document.querySelector("#loginSection"));
});

// Open My Tickets and load the attendee's bookings.
document.querySelector("#myTicketsNavLink").addEventListener("click", (event) => {
  event.preventDefault();
  loadMyTickets();
});

// Open the Organizer Dashboard and load the organizer's events.
document.querySelector("#dashboardNavLink").addEventListener("click", (event) => {
  event.preventDefault();
  loadOrganizerEvents();
});

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
showSection(eventsSection);
loadPublishedEvents();