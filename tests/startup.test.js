const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
test('production refuses missing database credentials instead of starting a local fallback', () => {
  const result = spawnSync(process.execPath, ['src/server.js'], {
    cwd: path.join(__dirname, '..'), encoding: 'utf8', windowsHide: true,
    env: { ...process.env, SUPABASE_SECRET_KEY: '', SUPABASE_SERVICE_ROLE_KEY: '' },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Supabase requires/);
  assert.doesNotMatch(result.stdout, /running|Seeded|Created default admin/);
});
