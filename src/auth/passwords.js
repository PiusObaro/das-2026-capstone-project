
import {
  randomBytes,
  scrypt,
  timingSafeEqual,
} from "node:crypto";

import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

const KEY_LENGTH = 64;
const COST = 16384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;

export async function hashPassword(password) {
  if (typeof password !== "string" || password.length < 8) {
    throw new Error("Password must contain at least 8 characters.");
  }

  const salt = randomBytes(16).toString("hex");

  const hash = await scryptAsync(
    password,
    salt,
    KEY_LENGTH,
    {
      N: COST,
      r: BLOCK_SIZE,
      p: PARALLELIZATION,
      maxmem: 64 * 1024 * 1024,
    }
  );

  return [
    "scrypt",
    COST,
    BLOCK_SIZE,
    PARALLELIZATION,
    salt,
    hash.toString("hex"),
  ].join("$");
}

export async function verifyPassword(password, storedHash) {
  if (
    typeof password !== "string" ||
    typeof storedHash !== "string"
  ) {
    return false;
  }

  const parts = storedHash.split("$");

  if (
    parts.length !== 6 ||
    parts[0] !== "scrypt" ||
    Number(parts[1]) !== COST ||
    Number(parts[2]) !== BLOCK_SIZE ||
    Number(parts[3]) !== PARALLELIZATION ||
    !/^[a-f0-9]{32}$/.test(parts[4]) ||
    !/^[a-f0-9]{128}$/.test(parts[5])
  ) {
    return false;
  }

  const salt = parts[4];
  const originalHash = Buffer.from(parts[5], "hex");

  const newHash = await scryptAsync(
    password,
    salt,
    KEY_LENGTH,
    {
      N: COST,
      r: BLOCK_SIZE,
      p: PARALLELIZATION,
      maxmem: 64 * 1024 * 1024,
    }
  );

  return timingSafeEqual(originalHash, newHash);
}
