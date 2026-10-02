const PAGES = ['Dashboard', 'Sales', 'Rentals', 'Inventory', 'Customers', 'Transactions', 'Settings'];
const DEFAULT_STAFF_PERMS = Object.fromEntries(PAGES.map(p => [p, ['Sales', 'Rentals'].includes(p) ? 'write' : 'none']));
const cleanPerms = p => Object.fromEntries(PAGES.map(pg => [pg, ['read', 'write'].includes(p?.[pg]) ? p[pg] : 'none']));
const parsePerms = u => cleanPerms(u.permissions);
const publicUser = u => ({ id: u.id, username: u.username, email: u.email, name: u.name, role: u.role, preferences: u.preferences || {}, permissions: u.role === 'admin' ? Object.fromEntries(PAGES.map(p => [p, 'write'])) : parsePerms(u) });
const pick = (row, keys) => Object.fromEntries(keys.filter(k => k in row).map(k => [k, row[k]]));
// Order-entry screens need shared customer and stock lookup fields.
function visibleRecord(rec, user) {
  if (!rec || user.role === 'admin') return rec;
  const p = parsePerms(user);
  const read = page => p[page] !== 'none';
  const summary = read('Dashboard') || read('Transactions');
  const orders = read('Sales') || read('Rentals');
  const lookup = orders || read('Inventory') || read('Customers') || summary;
  const d = rec.data;
  return { ...rec, data: {
    inventory: read('Inventory') || summary ? d.inventory : lookup ? d.inventory.map(r => pick(r, ['id', 'name', 'category', 'salePrice', 'discount', 'rentalPrice', 'rentalDiscount', 'deposit', 'status', 'stockQty'])) : [],
    customers: read('Customers') || summary ? d.customers : orders ? d.customers.map(r => pick(r, ['id', 'name', 'phone'])) : [],
    sales: read('Sales') || read('Customers') || summary ? d.sales : lookup ? d.sales.map(r => pick(r, ['id', 'itemId', 'qty'])) : [],
    rentals: read('Rentals') || read('Customers') || summary ? d.rentals : lookup ? d.rentals.map(r => pick(r, ['id', 'itemId', 'pickup', 'returnDue', 'actualReturn'])) : [],
    transactions: read('Transactions') || read('Dashboard') ? d.transactions : [],
    settings: read('Settings') || summary ? d.settings : pick(d.settings, ['shopName', 'lateFeePerDay']),
  } };
}
module.exports = { PAGES, DEFAULT_STAFF_PERMS, cleanPerms, parsePerms, publicUser, visibleRecord };
