const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
test('Postgres schema creates trusted profiles atomically, protects data and checks revocation', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth;
      create table auth.users (id uuid primary key, email text, raw_app_meta_data jsonb);
      create table auth.sessions (id uuid primary key, user_id uuid, not_after timestamptz);`);
    const schema = fs.readFileSync(path.join(__dirname, '../supabase/schema.sql'), 'utf8');
    await db.exec(schema);
    await db.exec(schema); // Safe to apply to an existing deployment.
    const id = '00000000-0000-4000-8000-000000000001';
    const sid = '00000000-0000-4000-8000-000000000002';
    await db.query('insert into auth.users values ($1,$2,$3)', [id, 'owner@example.com', { wabi: { username: 'owner', name: 'Owner', role: 'admin' } }]);
    const profile = (await db.query('select * from wabi_profiles')).rows[0];
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
    await assert.rejects(db.query('select * from wabi_profiles'), /permission denied/);
    await assert.rejects(db.query('select * from wabi_kv'), /permission denied/);
    await db.exec('reset role');
    await assert.rejects(db.query('delete from auth.users where id=$1', [id]), /administrator/);
    await db.query('insert into auth.users values ($1,$2,$3)', [sid, 'second@example.com', { wabi: { username: 'second', role: 'admin' } }]);
    await db.query('delete from auth.users where id=$1', [id]);
    assert.equal((await db.query('select count(*)::int as n from wabi_profiles where id=$1', [id])).rows[0].n, 0);
    await db.query('insert into auth.users values ($1,$2,$3)', [id, 'stranger@example.com', {}]);
    assert.equal((await db.query('select count(*)::int as n from wabi_profiles where id=$1', [id])).rows[0].n, 0);
  } finally { await db.close(); }
});
