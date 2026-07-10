/**
 * Tests for the env-driven CORS allow-list (browser-abuse hardening, NOT auth).
 *
 * We assert the pure parser and the actual middleware behaviour over the full app:
 *  - no allow-list -> no Origin is reflected (closed by default);
 *  - an allow-listed Origin is echoed EXACTLY (never `*`);
 *  - a non-allow-listed / absent Origin gets no Access-Control-Allow-Origin;
 *  - credentials are NEVER paired with a reflected origin (no credentialed wildcard);
 *  - an OPTIONS preflight advertises DELETE + the X-Device-Id header.
 * No network, no real keys (SECURITY.md).
 */
import { describe, expect, it } from 'vitest';

import app from './index';
import { parseAllowedOrigins } from './cors';
import type { Env } from './env';
import { envWithD1, makeFakeD1 } from './test/fakeD1';

const ALLOWED = 'https://app.bocado.example';
const OTHER = 'https://evil.example';

function envWith(origins?: string): Env {
  return envWithD1(makeFakeD1(), origins === undefined ? {} : { CORS_ALLOWED_ORIGINS: origins });
}

describe('parseAllowedOrigins', () => {
  it('returns an empty set for undefined / empty / whitespace', () => {
    expect(parseAllowedOrigins(undefined).size).toBe(0);
    expect(parseAllowedOrigins('').size).toBe(0);
    expect(parseAllowedOrigins('   ').size).toBe(0);
    expect(parseAllowedOrigins(' , , ').size).toBe(0);
  });

  it('trims and de-dupes a comma-separated list', () => {
    const set = parseAllowedOrigins(' https://a.example , https://b.example ,https://a.example');
    expect([...set].sort()).toEqual(['https://a.example', 'https://b.example']);
  });
});

describe('CORS middleware over the app', () => {
  it('does not reflect any Origin when the allow-list is empty (closed by default)', async () => {
    const res = await app.request('/health', { headers: { Origin: ALLOWED } }, envWith());
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('emits no Access-Control-Allow-Origin when the request carries no Origin', async () => {
    const res = await app.request('/health', {}, envWith(ALLOWED));
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('echoes an allow-listed Origin exactly (never a wildcard)', async () => {
    const res = await app.request('/health', { headers: { Origin: ALLOWED } }, envWith(ALLOWED));
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED);
    expect(res.headers.get('Access-Control-Allow-Origin')).not.toBe('*');
    // Credentials are never enabled (no cookies in this API).
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBeNull();
  });

  it('does not reflect a non-allow-listed Origin', async () => {
    const res = await app.request('/health', { headers: { Origin: OTHER } }, envWith(ALLOWED));
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('preflights DELETE + X-Device-Id for an allow-listed Origin', async () => {
    const res = await app.request(
      '/menus/m-1',
      {
        method: 'OPTIONS',
        headers: {
          Origin: ALLOWED,
          'Access-Control-Request-Method': 'DELETE',
          'Access-Control-Request-Headers': 'X-Device-Id',
        },
      },
      envWith(ALLOWED),
    );
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED);
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('DELETE');
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('X-Device-Id');
    // Never a credentialed wildcard.
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBeNull();
  });
});
