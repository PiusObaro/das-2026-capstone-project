
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);

const dataDirectory = path.resolve(currentDirectory, "../../data");
mkdirSync(dataDirectory, { recursive: true });

const databasePath =
  process.env.DATABASE_PATH ||
  path.join(dataDirectory, "events.sqlite");

function addColumnIfMissing(db, table, column, definition) {
  const columns = db.prepare(
    `PRAGMA table_info(${table})`
  ).all();

  const exists = columns.some(
    (item) => item.name === column
  );

  if (!exists) {
    db.exec(
      `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`
    );
  }
}

export function openDatabase(filePath = databasePath) {
  const db = new DatabaseSync(filePath);
  console.log("DATABASE IN USE:", filePath);
  db.exec("PRAGMA foreign_keys = ON;");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL COLLATE NOCASE UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL
        CHECK (role IN ('organizer', 'attendee', 'staff')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      city TEXT NOT NULL DEFAULT '',
      venue TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL,
      published INTEGER NOT NULL DEFAULT 0
        CHECK (published IN (0, 1))
    );

    CREATE TABLE IF NOT EXISTS tiers (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      name TEXT NOT NULL,
      price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
      capacity INTEGER NOT NULL CHECK (capacity > 0),
      available INTEGER NOT NULL
        CHECK (available >= 0 AND available <= capacity),
      FOREIGN KEY (event_id) REFERENCES events(id),
      UNIQUE (event_id, name)
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      reference TEXT NOT NULL UNIQUE,
      tier_id TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 10),
      total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
      status TEXT NOT NULL,
      payment_status TEXT NOT NULL,
      FOREIGN KEY (tier_id) REFERENCES tiers(id)
    );
  `); 

  // Add ownership fields without deleting existing records.
  addColumnIfMissing(
    db,
    "events",
    "organizer_id",
    "TEXT REFERENCES users(id)"
  );

  addColumnIfMissing(
    db,
    "bookings",
    "attendee_id",
    "TEXT REFERENCES users(id)"
  );


  // Build 8: booking expiry and refund information.
  addColumnIfMissing(
    db,
    "bookings",
    "expires_at",
    "TEXT"
  );

  addColumnIfMissing(
    db,
    "bookings",
    "cancelled_at",
    "TEXT"
  );

  addColumnIfMissing(
    db,
    "bookings",
    "refund_amount_cents",
    "INTEGER NOT NULL DEFAULT 0"
  );

  addColumnIfMissing(
    db,
    "bookings",
    "refund_status",
    "TEXT NOT NULL DEFAULT 'NONE'"
  );


  // Make user and ownership lookups faster.
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_email
    ON users(email);

    CREATE INDEX IF NOT EXISTS idx_events_organizer
    ON events(organizer_id);

    CREATE INDEX IF NOT EXISTS idx_bookings_attendee
    ON bookings(attendee_id);
  `);

  return db;
}
