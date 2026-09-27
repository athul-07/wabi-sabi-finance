const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createClient } = require('@supabase/supabase-js');
const createDatabase = require('../src/supabase-db');
const seed = require('./helpers/shop.cjs');

test('Supabase adapter reads normalized shop data, saves atomically, and propagates errors', async () => {
  let value = { data: seed, version: 1 };
  let fail = false;
  const client = createClient('https://example.supabase.co', 'server-test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, options) => {
        if (fail) return new Response(JSON.stringify({ message: 'database unavailable' }), { status: 503 });
        const url = new URL(input);
        if (url.pathname === '/rest/v1/rpc/wabi_get_shop') return new Response(JSON.stringify(value));
        if (url.pathname === '/rest/v1/rpc/wabi_save_shop') {
          const { shop_record: record, expected_version: version } = JSON.parse(options.body);
          const matches = version === value.version;
          if (matches) value = record;
          return new Response(JSON.stringify(matches));
        }
        assert.fail(`Unexpected Supabase endpoint: ${url.pathname}`);
      }
    },
  });
  const db = createDatabase(client);
  assert.deepEqual(await db.getShop(), value);
  const attempts = await Promise.all([
    db.compareAndSetShop({ data: seed, version: 2 }, 1),
    db.compareAndSetShop({ data: seed, version: 2 }, 1),
  ]);
  assert.deepEqual(attempts.sort(), [false, true]);
  assert.equal((await db.getShop()).version, 2);
  fail = true;
  await assert.rejects(db.getShop(), /database unavailable/);
});
