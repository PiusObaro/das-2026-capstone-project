import { randomUUID, randomBytes } from "node:crypto";

export function newId() {
  return randomUUID();
}

export function newReference() {
  return randomBytes(4).toString("hex").toUpperCase();
}