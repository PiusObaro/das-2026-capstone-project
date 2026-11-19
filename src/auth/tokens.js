
import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";

const TOKEN_LIFETIME_SECONDS = 24 * 60 * 60;

const ALLOWED_ROLES = [
  "organizer",
  "attendee",
  "staff",
];

function encode(value) {
  return Buffer
    .from(JSON.stringify(value))
    .toString("base64url");
}

function sign(value, secret) {
  return createHmac("sha256", secret)
    .update(value)
    .digest("base64url");
}

function validateSecret(secret) {
  if (
    typeof secret !== "string" ||
    Buffer.byteLength(secret) < 32
  ) {
    throw new Error(
      "Token secret must be at least 32 bytes."
    );
  }
}

export function createToken(user, secret) {
  validateSecret(secret);

  if (
    !user ||
    user.id === undefined ||
    user.id === null ||
    !ALLOWED_ROLES.includes(user.role)
  ) {
    throw new Error("Invalid user information.");
  }

  const now = Math.floor(Date.now() / 1000);

  const header = {
    alg: "HS256",
    typ: "JWT",
  };

  const payload = {
    sub: String(user.id),
    role: user.role,
    email: user.email,
    iat: now,
    exp: now + TOKEN_LIFETIME_SECONDS,
  };

  const unsignedToken =
    `${encode(header)}.${encode(payload)}`;

  const signature = sign(unsignedToken, secret);

  return `${unsignedToken}.${signature}`;
}

export function verifyToken(token, secret) {
  validateSecret(secret);

  if (typeof token !== "string") {
    return null;
  }

  const parts = token.split(".");

  if (parts.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, signature] =
    parts;

  const unsignedToken =
    `${encodedHeader}.${encodedPayload}`;

  const expectedSignature = sign(
    unsignedToken,
    secret
  );

  const actualBuffer = Buffer.from(
    signature,
    "base64url"
  );

  const expectedBuffer = Buffer.from(
    expectedSignature,
    "base64url"
  );

  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const header = JSON.parse(
      Buffer.from(encodedHeader, "base64url").toString()
    );

    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString()
    );

    const now = Math.floor(Date.now() / 1000);

    if (
      header.alg !== "HS256" ||
      header.typ !== "JWT" ||
      typeof payload.sub !== "string" ||
      !payload.sub ||
      !ALLOWED_ROLES.includes(payload.role) ||
      !Number.isInteger(payload.exp) ||
      payload.exp <= now
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
