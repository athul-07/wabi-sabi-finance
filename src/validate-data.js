module.exports = function validate(data) {
  for (const key of ['inventory', 'sales', 'rentals', 'customers', 'transactions']) {
    if (!Array.isArray(data[key])) throw new Error(`Invalid ${key} data.`);
    const ids = new Set();
    for (const row of data[key]) {
      if (!row || typeof row !== 'object' || typeof row.id !== 'string' || !row.id || ids.has(row.id)) throw new Error(`Each ${key} record needs a unique ID.`);
      ids.add(row.id);
    }
  }
  const nonnegative = (value, label) => {
    if (!Number.isFinite(Number(value)) || Number(value) < 0) throw new Error(`${label} must be zero or greater.`);
  };
  if (!data.settings || typeof data.settings !== 'object' || Array.isArray(data.settings)) throw new Error('Invalid settings.');
  nonnegative(data.settings.lateFeePerDay, 'Late fee');
  const stock = new Map();
  for (const item of data.inventory) {
    nonnegative(item.stockQty, 'Stock quantity');
    if (!Number.isInteger(Number(item.stockQty))) throw new Error('Stock quantity must be a whole number.');
    for (const key of ['purchaseCost', 'salePrice', 'discount', 'rentalPrice', 'deposit', 'cleaning', 'repair']) nonnegative(item[key] ?? 0, key);
    if (Number(item.discount || 0) > 100) throw new Error('Inventory discount cannot exceed 100%.');
    stock.set(item.id, Number(item.stockQty));
  }
  for (const sale of data.sales) {
    if (!stock.has(sale.itemId)) throw new Error('A sale references a missing inventory item.');
    if (!Number.isInteger(Number(sale.qty)) || Number(sale.qty) < 1) throw new Error('Sale quantity must be a positive whole number.');
    for (const key of ['unitPrice', 'received', 'discount']) nonnegative(sale[key] ?? 0, key);
    if (Number(sale.discount) > 100) throw new Error('Discount cannot exceed 100%.');
    stock.set(sale.itemId, stock.get(sale.itemId) - Number(sale.qty));
  }
  for (const rental of data.rentals) {
    if (!stock.has(rental.itemId)) throw new Error('A rental references a missing inventory item.');
    for (const key of ['rentalFee', 'deposit', 'received', 'damage', 'depositRefunded']) nonnegative(rental[key] ?? 0, key);
    if (rental.pickup && rental.returnDue && rental.returnDue < rental.pickup) throw new Error('Return due must be on or after pickup.');
    if (!rental.actualReturn) stock.set(rental.itemId, stock.get(rental.itemId) - 1);
  }
  for (const [id, count] of stock) if (count < 0) throw new Error(`Insufficient stock for ${id}. Reduce the quantity or return an active rental.`);
  for (const tx of data.transactions) nonnegative(tx.amount, 'Transaction amount');
};
