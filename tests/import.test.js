const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const ExcelJS = require('exceljs');

test('workbook import preserves column mappings, dates, and numeric values', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'wabi-import-'));
  try {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Inventory');
    sheet.getRow(4).values = ['WS-TEST', 'Test outfit', 'Groom', new Date('2026-09-25T00:00:00Z'), 1000, 2000, null, 500, 'Available', 200, 50, 0, null, null, null, null, null, 2];
    const customers = workbook.addWorksheet('Customers');
    customers.getRow(4).values = ['CUST-TEST', '9000000000', 'Test customer', 'test@example.com'];
    const file = path.join(temp, 'workbook.xlsx');
    await workbook.xlsx.writeFile(file);
    const data = await require('../src/import-workbook').readWorkbook(file);
    assert.equal(data.inventory[0].stockQty, 2);
    assert.equal(data.inventory[0].rentalPrice, 500);
    assert.equal(data.inventory[0].purchaseDate, '2026-09-25');
    assert.equal(data.customers[0].name, 'Test customer');
  } finally {
    if (path.dirname(temp) === os.tmpdir() && path.basename(temp).startsWith('wabi-import-')) fs.rmSync(temp, { recursive: true, force: true });
  }
});
