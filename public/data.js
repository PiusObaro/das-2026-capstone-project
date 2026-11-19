
const events = [
  {
    id: 1,
    title: "Lagos Music Festival",
    category: "Music",
    city: "Lagos",
    venue: "Tafawa Balewa Square",
    date: "2026-12-12",
    time: "5:00 PM",
    description:
      "Enjoy an unforgettable evening of live music, exciting performances and great entertainment.",
    image:
      "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=900&q=80",
    tiers: [
      { id: 101, name: "Regular", priceCents: 1500000, capacity: 100, available: 65 },
      { id: 102, name: "VIP", priceCents: 3500000, capacity: 30, available: 12 },
      { id: 103, name: "Early Bird", priceCents: 1000000, capacity: 50, available: 0 }
    ]
  },
  {
    id: 2,
    title: "Tech Innovation Summit",
    category: "Technology",
    city: "Lagos",
    venue: "Eko Convention Centre",
    date: "2026-11-20",
    time: "9:00 AM",
    description:
      "Meet technology professionals, learn about software development and explore new ideas.",
    image:
      "https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=900&q=80",
    tiers: [
      { id: 201, name: "Standard", priceCents: 2000000, capacity: 100, available: 72 },
      { id: 202, name: "Premium", priceCents: 5000000, capacity: 40, available: 15 }
    ]
  },
  {
    id: 3,
    title: "Lagos Food and Culture Fair",
    category: "Food",
    city: "Lagos",
    venue: "Muri Okunola Park",
    date: "2026-11-28",
    time: "12:00 PM",
    description:
      "Discover Nigerian dishes, local culture and exciting food experiences with friends and family.",
    image:
      "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=900&q=80",
    tiers: [
      { id: 301, name: "General Entry", priceCents: 500000, capacity: 200, available: 120 },
      { id: 302, name: "Family Pass", priceCents: 2000000, capacity: 50, available: 20 }
    ]
  },
  {
    id: 4,
    title: "Live Comedy Night",
    category: "Comedy",
    city: "Abuja",
    venue: "Transcorp Hilton",
    date: "2026-12-05",
    time: "7:00 PM",
    description:
      "Enjoy a night of laughter with talented comedians and entertaining live performances.",
    image:
      "https://images.unsplash.com/photo-1503095396549-807759245b35?auto=format&fit=crop&w=900&q=80",
    tiers: [
      { id: 401, name: "Regular", priceCents: 1000000, capacity: 100, available: 55 },
      { id: 402, name: "VIP", priceCents: 2500000, capacity: 25, available: 0 }
    ]
  },
  {
    id: 5,
    title: "Creative Arts Exhibition",
    category: "Arts",
    city: "Port Harcourt",
    venue: "Rivers Arts Centre",
    date: "2026-12-18",
    time: "10:00 AM",
    description:
      "Explore creative works from emerging artists, including painting, sculpture and photography.",
    image:
      "https://images.unsplash.com/photo-1577083552431-6e5fd01aa342?auto=format&fit=crop&w=900&q=80",
    tiers: [
      { id: 501, name: "General Entry", priceCents: 700000, capacity: 80, available: 45 }
    ]
  }
];

export function getEvents() {
  return events.map((event) => ({
    ...event,
    tiers: event.tiers.map((tier) => ({ ...tier }))
  }));
}

export function getEventById(id) {
  const event = events.find((item) => item.id === Number(id));

  if (!event) {
    return null;
  }

  return {
    ...event,
    tiers: event.tiers.map((tier) => ({ ...tier }))
  };
}

// All mock payment behaviour stays in this data-access file.
// Use 4242424242424242 for success.
// Use 4000000000000002 to simulate a declined card.
export function mockPay({ cardNumber }) {
  const digits = String(cardNumber).replace(/\s/g, "");

  if (digits === "4242424242424242") {
    return {
      success: true,
      message: "Payment successful. Your tickets are confirmed."
    };
  }

  if (digits === "4000000000000002") {
    return {
      success: false,
      message: "Your card was declined. Please try another test card."
    };
  }

  return {
    success: false,
    message: "Invalid test card. Please use one of the test card numbers."
  };
}


const mockBookings = new Map();

export function createMockBooking(eventId, quantities) {
  const event = events.find((item) => item.id === Number(eventId));

  if (!event) {
    return { success: false, message: "Event not found." };
  }

  const selectedTiers = [];

  for (const [tierId, quantity] of Object.entries(quantities)) {
    if (!Number.isInteger(quantity) || quantity < 1) {
      return { success: false, message: "Please select valid ticket quantities." };
    }

    const tier = event.tiers.find((item) => item.id === Number(tierId));

    if (!tier || tier.available < quantity) {
      return {
        success: false,
        message: "Not enough tickets are available. Please check your selection."
      };
    }

    selectedTiers.push({ tier, quantity });
  }

  if (selectedTiers.length === 0) {
    return { success: false, message: "Please choose at least one ticket." };
  }

  // Check every tier first, then reserve the tickets.
  for (const { tier, quantity } of selectedTiers) {
    tier.available -= quantity;
  }

  const tickets = selectedTiers.map(({ tier, quantity }) => ({
    tierId: tier.id,
    name: tier.name,
    quantity,
    priceCents: tier.priceCents
  }));

  const totalCents = tickets.reduce(
    (total, ticket) => total + ticket.priceCents * ticket.quantity,
    0
  );

  const reference = `DEMO-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  const booking = {
    reference,
    eventId: event.id,
    eventTitle: event.title,
    tickets,
    totalCents,
    status: "PENDING"
  };

  mockBookings.set(reference, booking);

  return { success: true, booking: { ...booking, tickets: [...tickets] } };
}

export function releaseMockBooking(reference) {
  const booking = mockBookings.get(reference);

  if (!booking || booking.status !== "PENDING") {
    return false;
  }

  const event = events.find((item) => item.id === booking.eventId);

  if (event) {
    for (const ticket of booking.tickets) {
      const tier = event.tiers.find((item) => item.id === ticket.tierId);

      if (tier) {
        tier.available = Math.min(
          tier.capacity,
          tier.available + ticket.quantity
        );
      }
    }
  }

  booking.status = "EXPIRED";
  return true;
}

export function confirmMockBooking(reference) {
  const booking = mockBookings.get(reference);

  if (!booking || booking.status !== "PENDING") {
    return false;
  }

  booking.status = "CONFIRMED";
  return true;
}

