/*
 * Import an existing Wabi Sabi Excel workbook into the app.
 *   node src/import-workbook.js <path-to.xlsx>
 * It reads Inventory, Customers, Sales, Rentals and Transactions and loads
 * them as the live shop data. Headers are on row 3, data from row 4
 * (the layout produced by the finance workbook).
 */
const ExcelJS = require("exceljs");
async function readWorkbook(file) {
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(file);
if (!wb.getWorksheet('Inventory')) throw new Error('Workbook must contain an Inventory sheet. No data was changed.');
const cellValue = (v) => {
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    if ('result' in v) return v.result;
    if (v.richText) return v.richText.map(part => part.text).join('');
    if (v.text) return v.text;
  }
  return v;
};
const grid = (name) => {
  const ws = wb.getWorksheet(name);
  return ws ? Array.from({ length: ws.rowCount }, (_, i) => Array.from({ length: Math.max(ws.columnCount, 23) }, (_, c) => cellValue(ws.getRow(i + 1).getCell(c + 1).value))) : [];
};
const d = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : (v ? String(v).slice(0, 10) : ""));
const num = (v) => (v == null || v === "" ? 0 : +v);

const inv = grid("Inventory").slice(3).filter(r => r && r[0]).map(r => ({
  id: r[0], name: r[1] || "", category: r[2] || "Other", purchaseDate: d(r[3]),
  purchaseCost: num(r[4]), salePrice: num(r[5]), rentalPrice: num(r[7]),
  status: r[8] || "Available", deposit: num(r[9]), cleaning: num(r[10]), repair: num(r[11]),
  stockQty: num(r[17]),
}));
const customers = grid("Customers").slice(3).filter(r => r && r[1]).map((r, i) => ({
  id: r[0] || `CUST-${i + 1}`, phone: String(r[1]), name: r[2] || "", email: r[3] || "", address: r[4] || "", notes: r[5] || "",
}));
const sales = grid("Sales").slice(3).filter(r => r && r[5]).map(r => ({
  id: r[0], date: d(r[1]), phone: String(r[2] || ""), customer: r[3] || r[4] || "", itemId: r[5],
  qty: num(r[8]) || 1, unitPrice: num(r[9]), discount: num(r[10]), mode: r[12] || "Cash", received: num(r[13]), notes: r[16] || "",
}));
const rentals = grid("Rentals").slice(3).filter(r => r && r[5]).map(r => ({
  id: r[0], bookingDate: d(r[1]), phone: String(r[2] || ""), customer: r[3] || r[4] || "", itemId: r[5],
  eventDate: d(r[8]), pickup: d(r[9]), returnDue: d(r[10]), actualReturn: d(r[11]),
  rentalFee: num(r[12]), deposit: num(r[13]), damage: num(r[15]), mode: r[17] || "Cash", received: num(r[18]), depositRefunded: num(r[22]), notes: "",
}));
const transactions = grid("Transactions").slice(3, 253).filter(r => r && (r[1] === "Income" || r[1] === "Expense")).map((r, i) => ({
  id: `TX-${i + 1}`, date: d(r[0]), type: r[1], category: r[2] || "", desc: r[3] || "", party: r[4] || "",
  itemId: r[5] || "", mode: r[6] || "", account: r[7] || "", amount: num(r[8]), notes: r[10] || "",
}));

const data = { customers, inventory: inv, sales, rentals, transactions, settings: { lateFeePerDay: 1000, shopName: "Wabi Sabi" } };
require('./validate-data')(data);
return data;
}
async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Usage: npm run import -- <path-to.xlsx>');
  const data = await readWorkbook(file);
  const db = require('./db');
  const cur = await db.getKV('shop');
  if (!cur) throw new Error('Initialize the database before importing.');
  if (!await db.compareAndSetKV('shop', { data, version: cur.version + 1, updatedAt: new Date().toISOString(), updatedBy: 'import' }, cur.version)) throw new Error('Shop changed during import. Try again.');
  console.log('Workbook imported into Supabase.');
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { readWorkbook };
