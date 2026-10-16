/**
 * UG number rules. The database is authoritative (platform_settings.ug_regex); this default
 * is only for instant client feedback. We NEVER silently "fix" malformed input.
 */
export const DEFAULT_UG_REGEX = /^UG\/\d{2}\/\d{5}$/;

/** Canonical stored form: upper-case, trimmed. Display value is preserved separately. */
export function normaliseUg(input: string): string {
  return input.trim().toUpperCase();
}

export function isValidUg(input: string, regex: RegExp = DEFAULT_UG_REGEX): boolean {
  return regex.test(normaliseUg(input));
}
