export const LEGAL_STATUS = "13. August 2026";

function legalEnv(key: string, fallback = "Noch einzutragen vor Live-Verkauf") {
  return process.env[key]?.trim() || fallback;
}

export function getLegalProfile() {
  return {
    businessName: legalEnv("BLOOMMD_LEGAL_BUSINESS_NAME"),
    ownerName: legalEnv("BLOOMMD_LEGAL_OWNER_NAME"),
    street: legalEnv("BLOOMMD_LEGAL_STREET"),
    postalCity: legalEnv("BLOOMMD_LEGAL_POSTAL_CITY"),
    country: legalEnv("BLOOMMD_LEGAL_COUNTRY", "Deutschland"),
    email: legalEnv("BLOOMMD_LEGAL_EMAIL"),
    phone: legalEnv("BLOOMMD_LEGAL_PHONE", "Nicht angegeben"),
    registerCourt: legalEnv("BLOOMMD_LEGAL_REGISTER_COURT", "Nicht angegeben"),
    registerNumber: legalEnv("BLOOMMD_LEGAL_REGISTER_NUMBER", "Nicht angegeben"),
    vatId: legalEnv("BLOOMMD_LEGAL_VAT_ID", "Nicht angegeben"),
    responsibleContent: legalEnv("BLOOMMD_LEGAL_RESPONSIBLE_CONTENT"),
  };
}
