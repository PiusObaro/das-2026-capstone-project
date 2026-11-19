
import { DomainError } from "../domain/errors.js";
import { newId } from "../domain/ids.js";
import {
  hashPassword,
  verifyPassword,
} from "../auth/passwords.js";
import { createToken } from "../auth/tokens.js";

export function createUserService(db, tokenSecret) {
  const findUserByEmail = db.prepare(`
    SELECT * FROM users
    WHERE email = ?
  `);

  const findUserById = db.prepare(`
    SELECT id, name, email, role
    FROM users
    WHERE id = ?
  `);

  const insertUser = db.prepare(`
    INSERT INTO users (
      id, name, email, password_hash, role
    )
    VALUES (?, ?, ?, ?, ?)
  `);

  async function signup({
    name,
    email,
    password,
    role = "attendee",
  }) {
    if (typeof name !== "string" || !name.trim()) {
      throw new DomainError("Name is required.", "VALIDATION");
    }

    if (typeof email !== "string" || !email.trim()) {
      throw new DomainError("Email is required.", "VALIDATION");
    }

    if (
      typeof password !== "string" ||
      password.length < 8
    ) {
      throw new DomainError(
        "Password must contain at least 8 characters.",
        "VALIDATION"
      );
    }

    if (!["organizer", "attendee"].includes(role)) {
  throw new DomainError(
    "Public signup is only available for attendees and organizers.",
    "VALIDATION"
  );
}
    const normalizedEmail = email.trim().toLowerCase();

    if (findUserByEmail.get(normalizedEmail)) {
      throw new DomainError(
        "Email is already registered.",
        "CONFLICT"
      );
    }

    const id = newId();
    const passwordHash = await hashPassword(password);

    insertUser.run(
      id,
      name.trim(),
      normalizedEmail,
      passwordHash,
      role
    );

    const user = findUserById.get(id);
    const token = createToken(user, tokenSecret);

    return { user, token };
  }

  async function login({ email, password }) {
    if (
      typeof email !== "string" ||
      typeof password !== "string"
    ) {
      throw new DomainError(
        "Email and password are required.",
        "VALIDATION"
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    const userRecord = findUserByEmail.get(normalizedEmail);

    if (!userRecord) {
      throw new DomainError(
        "Invalid email or password.",
        "UNAUTHORIZED"
      );
    }

    const validPassword = await verifyPassword(
      password,
      userRecord.password_hash
    );

    if (!validPassword) {
      throw new DomainError(
        "Invalid email or password.",
        "UNAUTHORIZED"
      );
    }

    const user = findUserById.get(userRecord.id);
    const token = createToken(user, tokenSecret);

    return { user, token };
  }

  return { signup, login };
}
