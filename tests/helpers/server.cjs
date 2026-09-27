// Test-only service doubles. Production never imports this file.
const { randomUUID } = require('node:crypto');
const { createApp } = require('../../src/app');
const { DEFAULT_STAFF_PERMS } = require('../../src/permissions');
const users = new Map();
const passwords = new Map();
const sessions = new Map();
let shop = { data: structuredClone(require('./shop.cjs')), version: 1 };
function add(u, password) { users.set(u.id, u); passwords.set(u.email, password); }
add({ id: randomUUID(), username: 'admin', email: 'owner@example.com', name: 'Owner', role: 'admin', permissions: {}, preferences: {} }, 'owner-test-password');
const db = {
  engine: 'supabase-test-double',
  getKV: async () => structuredClone(shop),
  compareAndSetKV: async (k, value, version) => { if (shop.version !== version) return false; shop = structuredClone(value); return true; },
  getUser: async name => structuredClone([...users.values()].find(u => u.username === name)),
  getUserById: async id => structuredClone(users.get(id)),
  listUsers: async () => structuredClone([...users.values()]),
  updateUser: async (id, values) => { Object.assign(users.get(id), values); return users.get(id); },
  isSessionActive: async (id, uid) => sessions.get(id) === uid,
  revokeUserSessions: async uid => { for (const [id, user] of sessions) if (user === uid) sessions.delete(id); },
  admin: {
    createUser: async ({ email, password, app_metadata }) => {
      const p = app_metadata.wabi;
      if ([...users.values()].some(u => u.username === p.username || u.email === email)) return { error: { message: 'Account exists.' } };
      const u = { id: randomUUID(), email, ...p, preferences: {}, permissions: p.permissions || DEFAULT_STAFF_PERMS };
      add(u, password); return { data: { user: u }, error: null };
    },
    updateUserById: async (id, { password }) => { passwords.set(users.get(id).email, password); return { error: null }; },
    deleteUser: async id => { users.delete(id); return { error: null }; },
  },
};
function authClient(req, res) {
  let sid = req.headers.cookie?.match(/test_session=([^;]*)/)?.[1];
  return { auth: {
    getUser: async () => ({ data: { user: users.get(sessions.get(sid)) || null }, error: null }),
    getSession: async () => ({ data: { session: { access_token: 'test.' + Buffer.from(JSON.stringify({ session_id: sid })).toString('base64url') + '.test' } } }),
    signInWithPassword: async ({ email, password }) => {
      const u = [...users.values()].find(u => u.email === email);
      if (!u || passwords.get(email) !== password) return { error: { message: 'Wrong credentials.' } };
      sid = randomUUID(); sessions.set(sid, u.id);
      res.cookie('test_session', sid, { httpOnly: true, sameSite: 'lax' });
      return { data: { user: u }, error: null };
    },
    updateUser: async ({ password }) => { passwords.set(users.get(sessions.get(sid)).email, password); return { error: null }; },
    signOut: async ({ scope }) => {
      const uid = sessions.get(sid);
      if (scope === 'global') for (const [id, user] of sessions) { if (user === uid) sessions.delete(id); }
      else sessions.delete(sid);
      res.clearCookie('test_session'); return { error: null };
    },
  } };
}
const server = createApp({ db, authClient }).listen(0, () => console.log('http://localhost:' + server.address().port));
