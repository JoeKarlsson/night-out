import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('security.txt has a contact and does not expire within 30 days', () => {
  const text = readFileSync(new URL('../public/.well-known/security.txt', import.meta.url), 'utf8');
  assert.match(text, /^Contact: /m);
  const expires = new Date(text.match(/^Expires: (.+)$/m)[1]);
  assert.ok(expires - Date.now() > 30 * 864e5, `security.txt expires ${expires.toISOString()}; push the date out a year`);
});
