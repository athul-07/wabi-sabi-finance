const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const authClient = require('../src/auth-client');
test('real Supabase SSR client writes HttpOnly cookies and restores verified sessions', async () => {
  const id = '00000000-0000-4000-8000-000000000001';
  const user = { id, email: 'test@example.com', aud: 'authenticated' };
  const token = ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600, session_id: id })).toString('base64url'), 'signature'].join('.');
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/auth/v1/user') res.end(JSON.stringify(user));
    else if (req.url.startsWith('/auth/v1/token')) res.end(JSON.stringify({ access_token: token, refresh_token: 'test-refresh-token', token_type: 'bearer', expires_in: 3600, user }));
    else { res.statusCode = 404; res.end('{}'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const saved = { ...process.env };
  try {
    process.env.SUPABASE_URL = `http://127.0.0.1:${server.address().port}`;
    process.env.SUPABASE_PUBLISHABLE_KEY = 'test-key';
    process.env.NODE_ENV = 'production';
    const cookies = [];
    const response = { cookie: (name, value, options) => cookies.push({ name, value, options }), setHeader() {} };
    const first = authClient({ headers: {} }, response);
    const result = await first.auth.signInWithPassword({ email: user.email, password: 'test-password' });
    assert.equal(result.error, null);
    assert.ok(cookies.length > 0);
    for (const c of cookies) {
      assert.equal(c.options.httpOnly, true);
      assert.equal(c.options.secure, true);
      assert.equal(c.options.sameSite, 'lax');
      assert.ok(c.options.maxAge > 1000);
    }
    const next = authClient({ headers: { cookie: cookies.map(c => `${c.name}=${encodeURIComponent(c.value)}`).join('; ') } }, response);
    assert.equal((await next.auth.getUser()).data.user.id, id);
  } finally {
    for (const key of ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'NODE_ENV']) {
      if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
    }
    await new Promise(resolve => server.close(resolve));
  }
});
