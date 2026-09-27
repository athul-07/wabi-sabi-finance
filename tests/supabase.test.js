const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createClient } = require('@supabase/supabase-js');
const createDatabase = require('../src/supabase-db');
const seed = require('./helpers/shop.cjs');

test('Supabase adapter preserves JSON, uses atomic version filters, and propagates errors', async () => {
  let value = { data: seed, version: 1 };
  let fail = false;
  const client = createClient('https://example.supabase.co', 'server-test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, options) => {
      if (fail) return new Response(JSON.stringify({ message: 'database unavailable' }), { status: 503 });
      const url = new URL(input);
      assert.equal(url.pathname, '/rest/v1/wabi_kv');
      assert.equal(url.searchParams.get('k'), 'eq.shop');
      if (options.method === 'PATCH') {
        assert.equal(url.searchParams.get('select'), 'k');
        const matches = url.searchParams.get('v->>version') === `eq.${value.version}`;
        if (matches) value = JSON.parse(options.body).v;
        return new Response(JSON.stringify(matches ? [{ k: 'shop' }] : []));
      }
      return new Response(JSON.stringify([{ v: value }]));
    } },
  });
  const db = createDatabase(client);
  assert.deepEqual(await db.getKV('shop'), value);
  const attempts = await Promise.all([
    db.compareAndSetKV('shop', { data: seed, version: 2 }, 1),
    db.compareAndSetKV('shop', { data: seed, version: 2 }, 1),
  ]);
  assert.deepEqual(attempts.sort(), [false, true]);
  assert.equal((await db.getKV('shop')).version, 2);
  fail = true;
  await assert.rejects(db.getKV('shop'), /database unavailable/);
});
