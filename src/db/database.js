
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);

// Store the database in the project's data folder.
const dataDirectory = path.resolve(currentDirectory, "../../data");
mkdirSync(dataDirectory, { recursive: true });

const databasePath =
  process.env.DATABASE_PATH ||
  path.join(dataDirectory, "events.sqlite");

export function openDatabase() {
  const db = new DatabaseSync(databasePath);

  // Make SQLite enforce relationships between tables.
  db.exec("PRAGMA foreign_keys = ON;");

  // Create tables if they do not already exist.
  db.exec(`
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

  return db;
}
