import { describe, it, expect } from 'vitest';
import { CANONICAL_VOCABULARY } from '@bocado/nutrition';

import { buildPerceptionMessages } from './prompt';

const IMAGE = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

/** Pull the system message text out of a built message list. */
function systemText(messages: ReturnType<typeof buildPerceptionMessages>): string {
  const sys = messages[0]!;
  expect(sys.role).toBe('system');
  expect(typeof sys.content).toBe('string');
  return sys.content as string;
}

/** Pull the user turn's leading text block. */
function userText(messages: ReturnType<typeof buildPerceptionMessages>): string {
  const user = messages[1]!;
  expect(user.role).toBe('user');
  const parts = user.content as Array<{ type: string; text?: string }>;
  const textPart = parts.find((p) => p.type === 'text');
  return textPart?.text ?? '';
}

describe('buildPerceptionMessages — static system prompt (cache prefix)', () => {
  it('keeps the system prompt byte-identical across display locales', () => {
    const en = systemText(buildPerceptionMessages(IMAGE, 'en'));
    const es = systemText(buildPerceptionMessages(IMAGE, 'es'));
    const multi = systemText(buildPerceptionMessages([IMAGE, IMAGE], 'fr'));
    // The whole system message — including the canonical vocabulary — must be a single
    // shared cache prefix regardless of locale or page count.
    expect(en).toBe(es);
    expect(en).toBe(multi);
  });

  it('carries no per-request placeholder and still embeds the canonical vocabulary', () => {
    const sys = systemText(buildPerceptionMessages(IMAGE, 'en'));
    expect(sys).not.toContain('{{LOCALE}}');
    expect(sys).toContain('CANONICAL VOCABULARY');
    // A real vocabulary term is present, so the cache prefix carries the bulk tokens.
    expect(CANONICAL_VOCABULARY.length).toBeGreaterThan(0);
    expect(sys).toContain(CANONICAL_VOCABULARY[0]!);
  });

  it('conveys the locale in the variable user turn instead', () => {
    expect(userText(buildPerceptionMessages(IMAGE, 'es'))).toContain('"es"');
    expect(userText(buildPerceptionMessages(IMAGE, 'en'))).toContain('"en"');
  });

  it('states the page count for multi-image scans in the user turn', () => {
    const two = userText(buildPerceptionMessages([IMAGE, IMAGE], 'en'));
    expect(two).toContain('2 menu pages');
    const one = userText(buildPerceptionMessages(IMAGE, 'en'));
    expect(one).toContain('Read this menu');
  });
});
