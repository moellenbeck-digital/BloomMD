export class InvalidEmailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidEmailError";
  }
}

export function validateEmailAddress(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!/^[^<>\s]+@[^<>\s]+\.[^<>\s]+$/.test(normalized)) {
    throw new InvalidEmailError("Bitte gib eine gueltige E-Mail-Adresse ein.");
  }
  return normalized;
}
