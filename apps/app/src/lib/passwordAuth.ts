import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

const HASH_ALGORITHM = "sha256";
const HASH_ITERATIONS = 310_000;
const HASH_KEY_LENGTH = 32;
const DUMMY_PASSWORD_HASH = `pbkdf2-${HASH_ALGORITHM}$${HASH_ITERATIONS}$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;

export function assertStrongPassword(password: string) {
  if (password.length < 10) {
    throw new Error("Das Passwort muss mindestens 10 Zeichen lang sein.");
  }
  if (!/[a-z]/i.test(password) || !/[0-9]/.test(password)) {
    throw new Error("Das Passwort muss Buchstaben und Zahlen enthalten.");
  }
}

export function hashPassword(password: string) {
  assertStrongPassword(password);
  const salt = randomBytes(16).toString("base64url");
  const hash = pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_KEY_LENGTH, HASH_ALGORITHM).toString("base64url");
  return `pbkdf2-${HASH_ALGORITHM}$${HASH_ITERATIONS}$${salt}$${hash}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [algorithmPart, iterationsPart, salt, hash] = storedHash.split("$");
  if (!algorithmPart || !iterationsPart || !salt || !hash) return false;
  const [, algorithm] = algorithmPart.split("-");
  if (algorithm !== HASH_ALGORITHM) return false;

  const iterations = Number(iterationsPart);
  if (!Number.isSafeInteger(iterations) || iterations < HASH_ITERATIONS) return false;

  const actual = Buffer.from(hash, "base64url");
  const expected = pbkdf2Sync(password, salt, iterations, actual.length, algorithm).toString("base64url");
  const expectedBuffer = Buffer.from(expected, "base64url");
  return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
}

/** Always performs PBKDF2 so an unknown account does not have a faster login path. */
export function verifyPasswordOrDummy(password: string, storedHash?: string | null) {
  const valid = verifyPassword(password, storedHash || DUMMY_PASSWORD_HASH);
  return Boolean(storedHash) && valid;
}
