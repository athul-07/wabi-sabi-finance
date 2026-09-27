const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium, expect } = require('@playwright/test');

const root = path.join(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'wabi-test-'));
let server, base, admin;
async function request(route, method = 'GET', body, token = admin) {
  const response = await fetch(base + '/api' + route, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Cookie: token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
before(async () => {
  server = spawn(process.execPath, ['tests/helpers/server.cjs'], { cwd: root, env: { ...process.env, APP_ORIGIN: '' }, windowsHide: true });
  base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server startup timed out')), 15000);
    server.stdout.on('data', chunk => {
      const match = String(chunk).match(/http:\/\/localhost:(\d+)/);
      if (match) { clearTimeout(timer); resolve(match[0]); }
    });
    server.on('error', reject);
    server.on('exit', code => { if (code) reject(new Error(`Server exited: ${code}`)); });
  });
  admin = (await request('/login', 'POST', { username: 'admin', password: 'owner-test-password' }, null)).cookie;
});
after(async () => {
  if (server && server.exitCode === null) {
    const stopped = new Promise(resolve => server.once('exit', resolve));
    server.kill(); await stopped;
  }
  // Only remove this test's newly-created directory.
  if (path.dirname(temp) === os.tmpdir() && path.basename(temp).startsWith('wabi-test-')) fs.rmSync(temp, { recursive: true, force: true });
});

test('authentication, seeded data, permissions, validation, conflicts, and revoked accounts', async () => {
  assert.equal((await request('/data', 'GET', undefined, null)).status, 401);
  assert.equal((await request('/login', 'POST', { username: 'admin', password: 'wrong' }, null)).status, 401);
  const original = (await request('/data')).data;
  assert.equal(original.data.inventory.length, 24);
  assert.equal(original.data.customers.length, 1);
  await request('/users', 'POST', { username: 'teststaff', email: 'staff@example.com', password: 'staff-test-password', permissions: { Sales: 'write', Rentals: 'write' } });
  const staff = (await request('/login', 'POST', { username: 'teststaff', password: 'staff-test-password' }, null)).cookie;
  assert.equal((await request('/users', 'GET', undefined, staff)).status, 403);
  const attempted = structuredClone(original.data);
  attempted.settings.lateFeePerDay = 1;
  attempted.inventory[0].salePrice = 1;
  attempted.customers = [];
  attempted.sales.push({ id: 'GR-STAFF-001', itemId: 'WS-002', qty: 1, unitPrice: 100, received: 100 });
  const saved = await request('/data', 'PUT', { data: attempted, baseData: original.data, baseVersion: original.version }, staff);
  assert.equal(saved.status, 200);
  assert.equal(saved.data.data.settings.lateFeePerDay, 1000);
  assert.equal(saved.data.data.inventory[0].salePrice, original.data.inventory[0].salePrice);
  assert.equal(saved.data.data.sales.some(sale => sale.id === 'GR-STAFF-001'), true);
  assert.equal(saved.data.data.customers.length, 1);
  const adminEdit = structuredClone(original.data);
  adminEdit.inventory[0].salePrice += 50;
  const mergedSave = await request('/data', 'PUT', { data: adminEdit, baseData: original.data, baseVersion: original.version });
  assert.equal(mergedSave.status, 200);
  assert.equal(mergedSave.data.data.inventory[0].salePrice, original.data.inventory[0].salePrice + 50);
  assert.equal(mergedSave.data.data.sales.some(sale => sale.id === 'GR-STAFF-001'), true);
  const conflictingEdit = structuredClone(original.data);
  conflictingEdit.inventory[0].salePrice += 100;
  const conflict = await request('/data', 'PUT', { data: conflictingEdit, baseData: original.data, baseVersion: original.version });
  assert.equal(conflict.status, 409);
  assert.deepEqual(conflict.data.conflicts, ['inventory.WS-001.salePrice']);
  const staffSnapshot = (await request('/data', 'GET', undefined, staff)).data;
  const adminConcurrentEdit = structuredClone(mergedSave.data.data);
  adminConcurrentEdit.settings.lateFeePerDay = 1200;
  const staffConcurrentEdit = structuredClone(staffSnapshot.data);
  staffConcurrentEdit.sales.push({ id: 'GR-STAFF-002', itemId: 'WS-003', qty: 1, unitPrice: 100, received: 100 });
  const [adminConcurrentSave, staffConcurrentSave] = await Promise.all([
    request('/data', 'PUT', { data: adminConcurrentEdit, baseData: mergedSave.data.data, baseVersion: mergedSave.data.version }),
    request('/data', 'PUT', { data: staffConcurrentEdit, baseData: staffSnapshot.data, baseVersion: staffSnapshot.version }, staff),
  ]);
  assert.equal(adminConcurrentSave.status, 200);
  assert.equal(staffConcurrentSave.status, 200);
  const latest = (await request('/data')).data;
  assert.equal(latest.data.settings.lateFeePerDay, 1200);
  assert.equal(latest.data.sales.some(sale => sale.id === 'GR-STAFF-002'), true);
  assert.equal((await request('/me')).status, 200);
  assert.equal((await request('/me', 'GET', undefined, staff)).status, 200);
  const bad = structuredClone(latest.data);
  bad.sales.push({ id: 'GR-001', itemId: 'WS-001', qty: 2, unitPrice: 100, received: 100 });
  assert.equal((await request('/data', 'PUT', { data: bad, baseData: latest.data, baseVersion: latest.version })).status, 400);
  const badDiscount = structuredClone(latest.data);
  badDiscount.inventory[0].discount = 101;
  assert.equal((await request('/data', 'PUT', { data: badDiscount, baseData: latest.data, baseVersion: latest.version })).status, 400);
  assert.equal((await request('/data', 'PUT', { data: original.data })).status, 400);
  assert.equal((await request('/users/teststaff', 'DELETE')).status, 200);
  assert.equal((await request('/data', 'GET', undefined, staff)).status, 401);
  const afterConcurrency = (await request('/data')).data;
  const restored = await request('/data', 'PUT', { data: original.data, baseData: afterConcurrency.data, baseVersion: afterConcurrency.version });
  assert.equal(restored.status, 200);
});

test('session cookies, logout, account preferences, live permissions, password changes and CSRF', async () => {
  const login = await request('/login', 'POST', { username: 'admin', password: 'owner-test-password' }, null);
  assert.ok(login.cookie);
  assert.equal(login.data.token, undefined);
  const csrf = await fetch(base + '/api/users', { method: 'POST', headers: { Cookie: admin, Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(csrf.status, 403);
  assert.equal((await request('/users', 'POST', { username: 'securestaff', email: 'secure@example.com', password: 'secure-staff-password' })).status, 201);
  let staff = (await request('/login', 'POST', { username: 'securestaff', password: 'secure-staff-password' }, null)).cookie;
  let profile = (await request('/me', 'GET', undefined, staff)).data.user;
  assert.equal(profile.permissions.Sales, 'write');
  assert.equal(profile.permissions.Inventory, 'none');
  const restricted = (await request('/data', 'GET', undefined, staff)).data.data;
  assert.equal(restricted.inventory[0].purchaseCost, undefined);
  assert.deepEqual(restricted.transactions, []);
  assert.equal((await request('/preferences', 'PUT', { theme: 'dark' }, staff)).status, 200);
  assert.equal((await request('/me', 'GET', undefined, staff)).data.user.preferences.theme, 'dark');
  await request('/users/securestaff', 'PUT', { permissions: {} });
  profile = (await request('/me', 'GET', undefined, staff)).data.user;
  assert.equal(profile.permissions.Sales, 'none');
  assert.deepEqual((await request('/data', 'GET', undefined, staff)).data.data.inventory, []);
  assert.equal((await request('/change-password', 'POST', { current: 'wrong', next: 'updated-staff-password' }, staff)).status, 400);
  assert.equal((await request('/change-password', 'POST', { current: 'secure-staff-password', next: 'updated-staff-password' }, staff)).status, 200);
  assert.equal((await request('/me', 'GET', undefined, staff)).status, 401);
  assert.equal((await request('/login', 'POST', { username: 'securestaff', password: 'secure-staff-password' }, null)).status, 401);
  staff = (await request('/login', 'POST', { username: 'securestaff', password: 'updated-staff-password' }, null)).cookie;
  assert.equal((await request('/users/securestaff', 'PUT', { password: 'admin-reset-password' })).status, 200);
  assert.equal((await request('/me', 'GET', undefined, staff)).status, 401);
  staff = (await request('/login', 'POST', { username: 'securestaff', password: 'admin-reset-password' }, null)).cookie;
  assert.equal((await request('/logout', 'POST', {}, staff)).status, 200);
  assert.equal((await request('/me', 'GET', undefined, staff)).status, 401);
  assert.equal((await request('/users/securestaff', 'DELETE')).status, 200);
});

test('browser: sales, customer reuse, ledger, rentals, return, persistence, and mobile layout', { timeout: 90000 }, async () => {
  const browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'msedge' } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    await page.evaluate(() => localStorage.setItem('wabi_token', 'obsolete-local-token'));
    await page.reload();
    assert.equal(await page.evaluate(() => localStorage.getItem('wabi_token')), null);
    await page.getByLabel('Username').fill('admin');
    await page.getByLabel('Password', { exact: true }).fill('incorrect');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByText('Wrong username or password.')).toBeVisible();
    await page.getByLabel('Password', { exact: true }).fill('owner-test-password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
    assert.equal(await page.evaluate(() => localStorage.getItem('wabi_token')), null);
    await page.getByRole('button', { name: 'Sales', exact: true }).click();
    await page.getByRole('button', { name: 'New sale', exact: true }).click();
    await page.getByLabel('Phone', { exact: true }).fill('9876543210');
    await expect(page.getByLabel('Customer name')).toHaveValue('Test Customer');
    await page.getByLabel('Item', { exact: true }).fill('WS-001');
    await page.getByRole('option', { name: /WS-001 Test outfit 1/ }).click();
    await page.getByLabel('Amount received').fill('16400');
    await page.getByRole('button', { name: 'Save sale', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText('GR-001', { exact: true })).toBeVisible();
    const salesSearch = page.getByLabel('Search sales by name or phone');
    await salesSearch.fill('9876543210');
    await expect(page.getByText('GR-001', { exact: true })).toBeVisible();
    await salesSearch.fill('Test Customer');
    await expect(page.getByText('GR-001', { exact: true })).toBeVisible();
    await page.getByLabel('Filter sales by status').selectOption('Paid');
    await expect(page.getByText('GR-001', { exact: true })).toBeVisible();
    await page.getByLabel('Filter sales by status').selectOption('Unpaid');
    await expect(page.getByText('GR-001', { exact: true })).toHaveCount(0);
    await page.getByLabel('Filter sales by status').selectOption('');
    await salesSearch.fill('');
    await page.getByRole('button', { name: 'Inventory', exact: true }).click();
    const soldItem = page.locator('tbody tr').filter({ hasText: 'WS-001' });
    await expect(soldItem).toContainText('Unavailable');
    await soldItem.getByRole('button', { name: 'Edit record' }).click();
    await page.getByLabel('Discount %').fill('12');
    await page.getByRole('button', { name: 'Save item', exact: true }).click();
    await expect(page.locator('tbody tr').filter({ hasText: 'WS-001' })).toContainText('12%');
    await page.getByRole('button', { name: 'Transactions', exact: true }).click();
    await expect(page.getByText('Sale GR-001', { exact: true })).toBeVisible();
    const transactionDate = page.getByLabel('Filter by date');
    const saleDate = await page.locator('tbody tr').filter({ hasText: 'Sale GR-001' }).locator('td').first().innerText();
    assert.match(saleDate, /^\d{4}-\d{2}-\d{2}$/);
    await transactionDate.fill('2000-01-01');
    await expect(page.getByText('Sale GR-001', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Income on date', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'All dates', exact: true }).click();
    await expect(page.getByText('Sale GR-001', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
    const dashboardDay = page.getByLabel('Dashboard day');
    const dailyDetails = page.locator('.daily-transactions');
    await dashboardDay.fill(saleDate);
    await expect(dailyDetails.getByText('Sale GR-001', { exact: true })).toBeVisible();
    await dashboardDay.fill('2000-01-01');
    await expect(dailyDetails.getByText('No transactions on this date', { exact: true })).toBeVisible();
    await dashboardDay.fill(saleDate);
    await page.getByRole('button', { name: 'Rentals', exact: true }).click();
    await page.getByRole('button', { name: 'New rental', exact: true }).click();
    await page.getByLabel('Phone', { exact: true }).fill('9000000000');
    await page.getByLabel('Customer name').fill('Browser Customer');
    await page.getByLabel('Item', { exact: true }).fill('WS-002');
    await page.getByRole('option', { name: /WS-002 Test outfit 2/ }).click();
    await expect(page.getByLabel('Rental fee')).toHaveValue('3200');
    await expect(page.getByLabel('Rental fee')).toHaveAttribute('readonly', '');
    await expect(page.getByLabel('Security deposit')).toHaveValue('1500');
    await expect(page.getByLabel('Security deposit')).toHaveAttribute('readonly', '');
    await page.getByLabel('Amount received').fill('3200');
    await page.getByRole('button', { name: 'Save rental', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const rentalSearch = page.getByLabel('Search rentals by name or phone');
    await rentalSearch.fill('9000000000');
    await expect(page.getByText('WSB-0001', { exact: true })).toBeVisible();
    await rentalSearch.fill('Browser Customer');
    await expect(page.getByText('WSB-0001', { exact: true })).toBeVisible();
    await page.getByLabel('Filter rentals by status').selectOption('Booked');
    await expect(page.getByText('WSB-0001', { exact: true })).toBeVisible();
    await page.getByLabel('Filter rentals by status').selectOption('Returned');
    await expect(page.getByText('WSB-0001', { exact: true })).toHaveCount(0);
    await page.getByLabel('Filter rentals by status').selectOption('');
    await rentalSearch.fill('');
    await page.getByTitle('Mark returned').click();
    await expect(page.getByRole('table').getByText('Returned', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Customers', exact: true }).click();
    await expect(page.getByText('Browser Customer', { exact: true })).toBeVisible();
    const rec = (await request('/data')).data;
    assert.equal(rec.data.sales.length, 1);
    assert.equal(rec.data.rentals.length, 1);
    assert.ok(rec.data.rentals[0].actualReturn);
    assert.equal(rec.data.customers.length, 2);
    await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
    fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
    await page.screenshot({ path: path.join(root, 'test-results/dashboard-desktop.png'), fullPage: true });
    await page.getByRole('button', { name: 'Switch to dark mode' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.screenshot({ path: path.join(root, 'test-results/dashboard-dark.png'), fullPage: true });
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
    // Dashboard shortcuts open the working forms.
    await page.getByRole('button', { name: 'New sale', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'New sale', exact: true })).toBeVisible();
    await page.getByLabel('Customer name').fill('Unsaved customer');
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    for (const name of ['Sales', 'Rentals', 'Inventory', 'Customers', 'Transactions', 'Settings', 'Users']) {
      await page.getByRole('button', { name, exact: true }).click();
      await expect(page.getByRole('heading', { name: name === 'Users' ? 'Users & access' : name, exact: true })).toBeVisible();
      assert.equal(await page.locator('main').evaluate(el => getComputedStyle(el).color), 'rgb(244, 236, 223)');
      await page.screenshot({ path: path.join(root, `test-results/${name.toLowerCase()}-dark.png`), fullPage: true });
    }
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Light mode', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.getByRole('button', { name: 'Dark mode', exact: true }).click();
    await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('aside')).toBeHidden();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(root, 'test-results/dashboard-mobile.png'), fullPage: true });
    await page.getByRole('button', { name: 'Switch to light mode' }).click();
    await page.screenshot({ path: path.join(root, 'test-results/dashboard-mobile-light.png'), fullPage: true });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
