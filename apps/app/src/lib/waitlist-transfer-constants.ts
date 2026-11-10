/** The activation link of a prepared waitlist account works once and for this many days. */
export const WAITLIST_ACTIVATION_TTL_DAYS = 14;

/**
 * Days after the activation mail until a prepared account that nobody activated is deleted. Same
 * number as the retention of the waitlist entries themselves (WAITLIST_PURGE_RETENTION_DAYS in
 * apps/marketing, named in the privacy policy); the app cannot import from the marketing app.
 */
export const WAITLIST_UNACTIVATED_RETENTION_DAYS = 90;
