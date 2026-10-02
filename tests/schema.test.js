const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const seed = require('./helpers/shop.cjs');
test('Postgres schema creates trusted profiles atomically, protects data and checks revocation', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth;
      create table auth.users (id uuid primary key, email text, raw_app_meta_data jsonb);
      create table auth.sessions (id uuid primary key, user_id uuid, not_after timestamptz);
      create table public.wabi_users (username text primary key, name text, hash text, role text, permissions text);
      insert into public.wabi_users values ('legacy-owner', 'Legacy Owner', 'retained-hash', 'admin', '');
      create table public.wabi_kv (k text primary key, v jsonb not null);`);
    const shopData = structuredClone(seed);
    shopData.inventory[0].rentalDiscount = 20;
    shopData.sales = [{ id: 'SALE-TEST', date: '2026-09-24', phone: '9876543210', customer: 'Test Customer', itemId: seed.inventory[0].id, qty: 2, unitPrice: 100, discount: 5, mode: 'UPI', received: 150, notes: 'sale note' }];
    shopData.rentals = [{ id: 'RENT-TEST', bookingDate: '2026-09-24', phone: '9000000000', customer: 'Rental Customer', itemId: seed.inventory[1].id, eventDate: '2026-09-25', pickup: '2026-09-25', returnDue: '2026-09-26', actualReturn: '', rentalFee: 3200, deposit: 1500, damage: 0, mode: 'Cash', received: 1000, depositRefunded: 0, notes: 'rental note' }];
    shopData.transactions = [{ id: 'TX-TEST', date: '2026-09-25', type: 'Income', category: 'Rentals', desc: 'Booking RENT-TEST', party: 'Rental Customer', itemId: seed.inventory[1].id, mode: 'Cash', account: 'Till', amount: 100, notes: 'transaction note' }];
    await db.query('insert into public.wabi_kv values ($1, $2)', ['shop', { data: shopData, version: 1, updatedAt: '2026-09-25T10:00:00.000Z', updatedBy: 'owner' }]);
    const schema = fs.readFileSync(path.join(__dirname, '../supabase/schema.sql'), 'utf8');
    await db.exec(schema);
    await db.exec(schema); // Safe to apply to an existing deployment.
    assert.equal((await db.query('select hash from wabi_legacy_users where username = $1', ['legacy-owner'])).rows[0].hash, 'retained-hash');
    assert.equal((await db.query('select to_regclass($1) as table_name', ['public.wabi_kv'])).rows[0].table_name, null);
    assert.equal((await db.query('select count(*)::int as n from wabi_inventory where is_active')).rows[0].n, shopData.inventory.length);
    assert.equal(Number((await db.query('select discount from wabi_inventory where id = $1', [shopData.inventory[0].id])).rows[0].discount), 0);
    assert.equal(Number((await db.query('select rental_discount from wabi_inventory where id = $1', [shopData.inventory[0].id])).rows[0].rental_discount), 20);
    assert.equal((await db.query('select count(*)::int as n from wabi_customers where is_active')).rows[0].n, shopData.customers.length);
    assert.equal((await db.query('select count(*)::int as n from wabi_sales where is_active')).rows[0].n, shopData.sales.length);
    assert.equal((await db.query('select count(*)::int as n from wabi_rentals where is_active')).rows[0].n, shopData.rentals.length);
    assert.equal((await db.query('select count(*)::int as n from wabi_transactions where is_active')).rows[0].n, shopData.transactions.length);
    for (const [table, column] of [['wabi_sales', 'payload'], ['wabi_rentals', 'payload'], ['wabi_transactions', 'payload'], ['wabi_shop_meta', 'settings']]) {
      assert.equal((await db.query('select count(*)::int as n from information_schema.columns where table_schema = $1 and table_name = $2 and column_name = $3', ['public', table, column])).rows[0].n, 0);
    }
    assert.equal((await db.query('select item_id, qty, unit_price, received from wabi_sales where id = $1', ['SALE-TEST'])).rows[0].item_id, seed.inventory[0].id);
    assert.equal(Number((await db.query('select amount from wabi_transactions where id = $1', ['TX-TEST'])).rows[0].amount), 100);
    const backfilled = (await db.query('select wabi_get_shop() as shop')).rows[0].shop;
    assert.equal(backfilled.version, 1);
    assert.equal(backfilled.updatedBy, 'owner');
    assert.equal(backfilled.data.inventory.length, shopData.inventory.length);
    assert.deepEqual(backfilled.data.sales, shopData.sales);
    assert.deepEqual(backfilled.data.rentals, shopData.rentals.map(row => ({ ...row, discount: 0 })));
    assert.deepEqual(backfilled.data.transactions, shopData.transactions);
    const saved = { data: { ...shopData, inventory: [{ ...shopData.inventory[0], salePrice: 9999, discount: 12, rentalDiscount: 25 }], rentals: shopData.rentals.map(row => ({ ...row, discount: 30 })), customers: [] }, version: 2, updatedAt: '2026-09-26T10:00:00.000Z', updatedBy: 'owner' };
    assert.equal((await db.query('select wabi_save_shop($1::jsonb, $2::integer) as saved', [saved, 1])).rows[0].saved, true);
    assert.equal(Number((await db.query('select sale_price from wabi_inventory where id = $1', [seed.inventory[0].id])).rows[0].sale_price), 9999);
    assert.equal(Number((await db.query('select discount from wabi_inventory where id = $1', [seed.inventory[0].id])).rows[0].discount), 12);
    assert.equal(Number((await db.query('select rental_discount from wabi_inventory where id = $1', [seed.inventory[0].id])).rows[0].rental_discount), 25);
    const roundTrip = (await db.query('select wabi_get_shop() as shop')).rows[0].shop;
    assert.equal(roundTrip.data.inventory[0].rentalDiscount, 25);
    assert.equal(roundTrip.data.rentals[0].discount, 30);
    assert.equal((await db.query('select count(*)::int as n from wabi_inventory where is_active')).rows[0].n, 1);
    assert.equal((await db.query('select count(*)::int as n from wabi_customers where is_active')).rows[0].n, 0);
    assert.equal((await db.query('select wabi_save_shop($1::jsonb, $2::integer) as saved', [saved, 1])).rows[0].saved, false);
    const id = '00000000-0000-4000-8000-000000000001';
    const sid = '00000000-0000-4000-8000-000000000002';
    await db.query('insert into auth.users values ($1,$2,$3)', [id, 'owner@example.com', { wabi: { username: 'owner', name: 'Owner', role: 'admin' } }]);
    const profile = (await db.query('select * from wabi_users')).rows[0];
    assert.equal(profile.id, id);
    assert.equal(profile.role, 'admin');
    assert.equal(profile.permissions.Sales, 'write');
    await assert.rejects(db.query('insert into auth.users values ($1,$2,$3)', [sid, 'other@example.com', { wabi: { username: 'owner', role: 'admin' } }]));
    assert.equal((await db.query('select count(*)::int as n from auth.users')).rows[0].n, 1);
    await db.query('insert into auth.sessions values ($1,$2,null)', [sid, id]);
    assert.equal((await db.query('select wabi_session_active($1,$2) as active', [sid, id])).rows[0].active, true);
    await db.query('delete from auth.sessions where id=$1', [sid]);
    assert.equal((await db.query('select wabi_session_active($1,$2) as active', [sid, id])).rows[0].active, false);
    await db.exec('set role anon');
    await assert.rejects(db.query('select * from wabi_users'), /permission denied/);
    await assert.rejects(db.query('select * from wabi_shop_meta'), /permission denied/);
    await db.exec('reset role');
    await assert.rejects(db.query('delete from auth.users where id=$1', [id]), /administrator/);
    await db.query('insert into auth.users values ($1,$2,$3)', [sid, 'second@example.com', { wabi: { username: 'second', role: 'admin' } }]);
    await db.query('delete from auth.users where id=$1', [id]);
    assert.equal((await db.query('select count(*)::int as n from wabi_users where id=$1', [id])).rows[0].n, 0);
    await db.query('insert into auth.users values ($1,$2,$3)', [id, 'stranger@example.com', {}]);
    assert.equal((await db.query('select count(*)::int as n from wabi_users where id=$1', [id])).rows[0].n, 0);
  } finally { await db.close(); }
});

test('Postgres schema removes the unused legacy user table only when empty', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth;
      create table auth.users (id uuid primary key, email text, raw_app_meta_data jsonb);
      create table auth.sessions (id uuid primary key, user_id uuid, not_after timestamptz);
      create table public.wabi_users (username text primary key, name text, hash text, role text, permissions text);`);
    const schema = fs.readFileSync(path.join(__dirname, '../supabase/schema.sql'), 'utf8');
    await db.exec(schema);
    assert.equal((await db.query("select to_regclass('public.wabi_legacy_users') as table_name")).rows[0].table_name, null);
    assert.equal((await db.query("select to_regclass('public.wabi_users') as table_name")).rows[0].table_name, 'wabi_users');
    const initialize = fs.readFileSync(path.join(__dirname, '../supabase/initialize-empty.sql'), 'utf8');
    await db.exec(initialize);
    await db.exec(initialize);
    const shop = (await db.query('select wabi_get_shop() as shop')).rows[0].shop;
    assert.equal(shop.version, 1);
    assert.deepEqual(shop.data.inventory, []);
    assert.deepEqual(shop.data.customers, []);
    assert.equal(shop.data.settings.shopName, 'Wabi Sabi');
    assert.equal((await db.query('select shop_name, late_fee_per_day from wabi_shop_meta where singleton')).rows[0].shop_name, 'Wabi Sabi');
  } finally { await db.close(); }
});

test('Postgres schema preserves wabi_kv when it contains unrecognized records', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth;
      create table auth.users (id uuid primary key, email text, raw_app_meta_data jsonb);
      create table auth.sessions (id uuid primary key, user_id uuid, not_after timestamptz);
      create table public.wabi_kv (k text primary key, v jsonb not null);
      insert into public.wabi_kv values ('other-record', '{"keep":true}');`);
    const schema = fs.readFileSync(path.join(__dirname, '../supabase/schema.sql'), 'utf8');
    await assert.rejects(db.exec(schema), /wabi_kv contains non-shop records/);
    await db.exec('rollback');
    assert.deepEqual((await db.query('select k, v from public.wabi_kv')).rows, [{ k: 'other-record', v: { keep: true } }]);
  } finally { await db.close(); }
});
