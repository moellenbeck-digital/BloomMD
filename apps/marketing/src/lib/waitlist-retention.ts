/**
 * How long all waitlist entries are kept after the one-time invitation mail. `purge --apply`
 * refuses to delete earlier. The privacy policy (`/datenschutz`) and the invitation mail name the
 * same number; change them together.
 */
export const WAITLIST_PURGE_RETENTION_DAYS = 90;
