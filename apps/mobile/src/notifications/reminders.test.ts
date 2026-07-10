/**
 * Unit tests for the PURE parts of the local-reminders scaffold.
 *
 * NODE-only: imports ONLY the module's pure constants. It must never import
 * `expo-notifications` / `expo-secure-store` — those are resolved lazily inside the
 * async functions, so they are deliberately not exercised here.
 *
 * These pin the "non-annoying, opt-in" contract at the data level:
 *   - exactly ONE reminder identifier (we never stack multiple types),
 *   - a daytime trigger (never a night-time ping),
 *   - copy that nudges gently and never claims a dish is "safe".
 */
import { describe, expect, it } from 'vitest';
import { DAILY_REMINDER, parseEnabled, REMINDER_ID, REMINDERS_ENABLED_KEY } from './reminders';

describe('local reminders — pure config', () => {
  it('uses a single stable reminder identifier', () => {
    expect(REMINDER_ID).toBe('bocado.daily-menu-reminder');
    expect(REMINDERS_ENABLED_KEY).toContain('bocado.');
  });

  it('fires during the day, never at night', () => {
    expect(DAILY_REMINDER.hour).toBeGreaterThanOrEqual(8);
    expect(DAILY_REMINDER.hour).toBeLessThanOrEqual(20);
    expect(DAILY_REMINDER.minute).toBeGreaterThanOrEqual(0);
    expect(DAILY_REMINDER.minute).toBeLessThan(60);
  });

  it('has gentle copy that never claims safety', () => {
    expect(DAILY_REMINDER.title.length).toBeGreaterThan(0);
    expect(DAILY_REMINDER.body.length).toBeGreaterThan(0);
    expect(`${DAILY_REMINDER.title} ${DAILY_REMINDER.body}`.toLowerCase()).not.toContain('safe');
  });
});

describe('parseEnabled — the on/off flag serialization', () => {
  it('is true ONLY for the exact string "true"', () => {
    expect(parseEnabled('true')).toBe(true);
  });

  it('is false (the non-annoying default) for null, empty, and any other value', () => {
    expect(parseEnabled(null)).toBe(false);
    expect(parseEnabled('')).toBe(false);
    expect(parseEnabled('false')).toBe(false);
    expect(parseEnabled('1')).toBe(false);
    expect(parseEnabled('TRUE')).toBe(false);
    expect(parseEnabled(' true ')).toBe(false);
    expect(parseEnabled('yes')).toBe(false);
  });
});
