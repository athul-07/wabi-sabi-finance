const express = require('express');
const path = require('node:path');
const provisionUser = require('./provision-user');
const { DEFAULT_STAFF_PERMS, cleanPerms, parsePerms, publicUser, visibleRecord } = require('./permissions');
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const checkPassword = p => { if (typeof p !== 'string' || p.length < 12 || p.length > 128) throw fail('Use a password of 12 to 128 characters.'); };

function createApp({ db, authClient }) {
  const app = express();
  app.disable('x-powered-by');
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    // Reject cross-site cookie-authenticated mutations, including login/logout.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (req.headers['sec-fetch-site'] === 'cross-site') return res.status(403).json({ error: 'Cross-site request blocked.' });
      const origin = req.headers.origin;
      const expected = process.env.APP_ORIGIN || `${req.protocol}://${req.get('host')}`;
      if (origin && origin !== expected) return res.status(403).json({ error: 'Invalid request origin.' });
      if (req.get('content-type')?.split(';')[0].trim() !== 'application/json') return res.status(415).json({ error: 'JSON request required.' });
    }
    next();
  });
  app.use(express.json({ limit: '10mb' }));
  app.use('/api', (req, res, next) => { req.supabase = authClient(req, res); next(); });
  const auth = asyncRoute(async (req, res, next) => {
    const { data, error } = await req.supabase.auth.getUser();
    if (error?.status >= 500) throw fail('Authentication is temporarily unavailable.', 503);
    if (error || !data.user) return res.status(401).json({ error: 'Please sign in.' });
    const { data: sessionData } = await req.supabase.auth.getSession();
    let sessionId;
    // getUser has already verified this access token with Supabase Auth.
    try { sessionId = JSON.parse(Buffer.from(sessionData.session.access_token.split('.')[1], 'base64url').toString()).session_id; } catch { }
    if (!sessionId || !await db.isSessionActive(sessionId, data.user.id)) return res.status(401).json({ error: 'Session expired. Please sign in.' });
    req.user = await db.getUserById(data.user.id);
    if (!req.user) return res.status(403).json({ error: 'No workspace access. Contact an administrator.' });
    next();
  });
  const requireAdmin = (req, res, next) => req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Admins only.' });

  app.post('/api/login', asyncRoute(async (req, res) => {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || username.length > 254 || password.length > 128) throw fail('Username and password are required.');
    const profile = await db.getUser(username.trim().toLowerCase());
    // Always call Auth, even for an unknown username, to avoid a fast account probe.
    const { error } = await req.supabase.auth.signInWithPassword({ email: profile?.email || 'unknown-account@invalid.example', password });
    if (error?.status >= 500) throw fail('Authentication is temporarily unavailable.', 503);
    if (error || !profile) {
      if (error?.status === 429) throw fail('Too many sign-in attempts. Try again later.', 429);
      return res.status(401).json({ error: 'Wrong username or password.' });
    }
    res.json({ user: publicUser(profile) });
  }));
  app.post('/api/logout', asyncRoute(async (req, res) => {
    const { error } = await req.supabase.auth.signOut({ scope: 'local' });
    if (error) throw fail('Could not sign out. Please try again.', 503);
    res.json({ ok: true });
  }));
  app.get('/api/me', auth, (req, res) => res.json({ user: publicUser(req.user) }));
  app.put('/api/preferences', auth, asyncRoute(async (req, res) => {
    if (!['light', 'dark'].includes(req.body?.theme)) throw fail('Invalid theme.');
    await db.updateUser(req.user.id, { preferences: { ...req.user.preferences, theme: req.body.theme } });
    res.json({ ok: true });
  }));
  app.post('/api/change-password', auth, asyncRoute(async (req, res) => {
    const { current, next } = req.body || {};
    checkPassword(next);
    if (typeof current !== 'string') throw fail('Current password is required.');
    // Reauthenticate before changing credentials.
    const { error: verifyError } = await req.supabase.auth.signInWithPassword({ email: req.user.email, password: current });
    if (verifyError) throw fail('Current password is incorrect.');
    const { error } = await req.supabase.auth.updateUser({ password: next });
    if (error) throw fail(error.message);
    const { error: logoutError } = await req.supabase.auth.signOut({ scope: 'global' });
    if (logoutError) throw fail('Password changed, but session revocation failed. Please sign out.', 503);
    res.json({ ok: true, signedOut: true });
  }));

  app.get('/api/users', auth, requireAdmin, asyncRoute(async (req, res) => res.json((await db.listUsers()).map(publicUser))));
  app.post('/api/users', auth, requireAdmin, asyncRoute(async (req, res) => {
    const { username, email, name, password, role, permissions } = req.body || {};
    checkPassword(password);
    const uname = typeof username === 'string' ? username.trim().toLowerCase() : '';
    if (!/^[a-z0-9][a-z0-9_.-]{2,39}$/.test(uname)) throw fail('Username must be 3–40 letters, numbers, dots, underscores or hyphens.');
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw fail('A valid email address is required.');
    if (name != null && (typeof name !== 'string' || name.length > 100)) throw fail('Name must be at most 100 characters.');
    if (await db.getUser(uname)) throw fail('That username already exists.');
    const r = role === 'admin' ? 'admin' : 'staff';
    const profile = await provisionUser(db, {
      email: email.trim().toLowerCase(), password, email_confirm: true,
      app_metadata: { wabi: { username: uname, name: name || uname, role: r, permissions: cleanPerms(permissions ?? DEFAULT_STAFF_PERMS) } }
    });
    res.status(201).json({ ok: true, user: publicUser(profile) });
  }));
  app.put('/api/users/:username', auth, requireAdmin, asyncRoute(async (req, res) => {
    const target = await db.getUser(req.params.username);
    if (!target) throw fail('User not found.', 404);
    const { name, role, permissions, password } = req.body || {};
    if (name != null && (typeof name !== 'string' || name.length > 100)) throw fail('Name must be at most 100 characters.');
    if (role != null && !['admin', 'staff'].includes(role)) throw fail('Invalid role.');
    if (target.id === req.user.id && role && role !== 'admin') throw fail('You cannot remove your own administrator access.');
    if (password) {
      checkPassword(password);
      const { error } = await db.admin.updateUserById(target.id, { password });
      if (error) throw fail(error.message);
      await db.revokeUserSessions(target.id);
    }
    await db.updateUser(target.id, { name: name ?? target.name, role: role ?? target.role, permissions: permissions == null ? target.permissions : cleanPerms(permissions) });
    res.json({ ok: true });
  }));
  app.delete('/api/users/:username', auth, requireAdmin, asyncRoute(async (req, res) => {
    const target = await db.getUser(req.params.username);
    if (!target) throw fail('User not found.', 404);
    if (target.id === req.user.id) throw fail('You cannot delete your own account.');
    const { error } = await db.admin.deleteUser(target.id);
    if (error) throw fail(error.message);
    res.json({ ok: true });
  }));

  // ---- shared shop data ----
  app.get("/api/data", auth, asyncRoute(async (req, res) => {
    const rec = await db.getShop();
    if (!rec) throw fail("Shop data is not initialized. Run the database schema.", 503);
    res.json(visibleRecord(rec, req.user));
  }));

  // Writes are filtered by the signed-in user's live permissions, so a page they
  // can't write to is never changed even if the request contains it.
  app.put("/api/data", auth, asyncRoute(async (req, res) => {
    const { data, baseVersion } = req.body || {};
    if (!data || typeof data !== 'object' || Array.isArray(data)) return res.status(400).json({ error: "No data provided." });
    const cur = (await db.getShop()) || { version: 0, data: {} };
    if (!Number.isInteger(baseVersion)) return res.status(400).json({ error: "A base version is required." });
    if (baseVersion !== cur.version)
      return res.status(409).json({ error: "conflict", serverVersion: cur.version, server: visibleRecord(cur, req.user) });

    const u = req.user;
    const isAdmin = u.role === "admin";
    const perms = parsePerms(u);
    const canWrite = (page) => isAdmin || perms[page] === "write";
    const curData = cur.data || {};
    const merged = Object.fromEntries(['inventory', 'sales', 'rentals', 'transactions', 'settings', 'customers'].map((key) => [key, data[key] ?? curData[key]]));
    if (!canWrite("Inventory")) merged.inventory = curData.inventory;
    if (!canWrite("Sales")) merged.sales = curData.sales;
    if (!canWrite("Rentals")) merged.rentals = curData.rentals;
    if (!canWrite("Transactions")) merged.transactions = curData.transactions;
    if (!canWrite("Settings")) merged.settings = curData.settings;
    // adding customers is part of the sales/rentals flow, so allow it for those writers too
    if (!(canWrite("Customers") || canWrite("Sales") || canWrite("Rentals"))) merged.customers = curData.customers;

    if (!canWrite('Customers') && (canWrite('Sales') || canWrite('Rentals'))) {
      if (!Array.isArray(merged.customers)) return res.status(400).json({ error: 'Invalid customers.' });
      merged.customers = [...curData.customers, ...merged.customers.filter(c => c && !curData.customers.some(old => old.id === c.id || old.phone === c.phone))];
    }
    try { require('./validate-data')(merged); }
    catch (error) { return res.status(400).json({ error: error.message }); }

    const rec = { data: merged, version: (cur.version || 0) + 1, updatedAt: new Date().toISOString(), updatedBy: req.user.username };
    if (!await db.compareAndSetShop(rec, baseVersion)) {
      const latest = await db.getShop();
      return res.status(409).json({ error: "conflict", serverVersion: latest?.version, server: visibleRecord(latest, req.user) });
    }
    res.json(visibleRecord(rec, req.user));
  }));

  app.get('/api/health', asyncRoute(async (req, res) => {
    const record = await db.getShop();
    if (!record) return res.status(503).json({ ok: false, engine: db.engine, error: 'Shop data is missing in Supabase.' });
    res.json({ ok: true, engine: db.engine });
  }));

  app.use((error, req, res, next) => {
    console.error(error.message);
    res.status(error.status || 500).json({ error: error.status ? error.message : "Database operation failed. Please try again." });
  });

  const pub = path.join(__dirname, "..", "public");
  app.use(express.static(pub));
  app.get("*", (req, res) => res.sendFile(path.join(pub, "index.html")));


  return app;
}
module.exports = { createApp };
