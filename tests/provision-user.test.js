const { test } = require('node:test');
const assert = require('node:assert/strict');
const provisionUser = require('../src/provision-user');
const attributes = { email: 'fixture@example.com', password: 'test-only-password', app_metadata: { wabi: { username: 'fixture', name: 'Fixture', role: 'staff', permissions: { Sales: 'write' } } } };
function database(options = {}) {
  let profile = options.profile;
  const state = { deleted: false, inserted: false };
  const db = {
    admin: {
      createUser: async () => ({ data: { user: { id: 'test-id', email: attributes.email } } }),
      deleteUser: async id => { assert.equal(id, 'test-id'); state.deleted = true; return {}; },
    },
    getUserById: async () => profile,
    insertUser: async value => { if (options.fail) throw new Error('Database unavailable'); state.inserted = true; profile = value; },
  };
  return { db, state };
}
test('creates and reads back the missing profile when Auth succeeds without firing profile trigger', async () => {
  const { db, state } = database();
  const profile = await provisionUser(db, attributes);
  assert.equal(profile.username, 'fixture');
  assert.equal(profile.email, attributes.email);
  assert.equal(profile.role, 'staff');
  assert.deepEqual(state, { inserted: true, deleted: false });
});
test('uses the profile already created by the trigger', async () => {
  const { db, state } = database({ profile: { id: 'test-id', username: 'fixture' } });
  await provisionUser(db, attributes);
  assert.deepEqual(state, { inserted: false, deleted: false });
});
test('failed profile insert fails the operation and removes only the new Auth account', async () => {
  const { db, state } = database({ fail: true });
  await assert.rejects(provisionUser(db, attributes), /profile could not be saved/);
  assert.equal(state.deleted, true);
});
