const { test } = require('node:test');
const assert = require('node:assert/strict');
const { shiftDate, totals, enforceRentals, returnError } = require('../src/rental-workflow');
const validate = require('../src/validate-data');
const fixture = () => ({ inventory: [{ id: 'I', stockQty: 3, rentalPrice: 1000, rentalDiscount: 10, deposit: 500, extraDayCharge: 100 }], rentals: [], sales: [], customers: [], transactions: [], settings: { lateFeePerDay: 50 } });
const booking = () => ({ id: 'R', itemId: 'I', qty: 2, phone: '9876543210', customer: 'Customer', eventDate: '2026-12-31', bookingDate: '2026-10-27', received: 1000, mode: 'Cash' });
function book() { const db = fixture(); db.rentals.push(booking()); enforceRentals(db, fixture()); validate(db); return db; }
test('booking snapshots quantity prices, calendar dates, deposit-only minimum and stock reservation', () => {
  const db = book(), r = db.rentals[0];
  assert.equal(r.rentalFee, 2000); assert.equal(r.deposit, 1000); assert.equal(r.dailyRate, 200);
  assert.equal(r.pickup, '2026-12-30'); assert.equal(r.returnDue, '2027-01-01');
  assert.equal(totals(r).bookingTotal, 2800);
  assert.equal(shiftDate('2028-03-01', -1), '2028-02-29');
  for (const received of [999, 2801]) {
    const bad = fixture(); bad.rentals.push({ ...booking(), received });
    assert.throws(() => enforceRentals(bad, fixture()), /booking amount/);
  }
  const overbooked = structuredClone(db); overbooked.rentals.push({ ...r, id: 'R2' });
  assert.throws(() => validate(overbooked), /Insufficient stock/);
});
test('saved fields cannot be changed, including attempts to remove the workflow marker', () => {
  const db = book();
  for (const [field, value] of Object.entries({ received: 2000, qty: 1, itemId: 'OTHER', phone: '1', eventDate: '2027-01-01', deposit: 0, discount: 99, rentalFee: 1, dailyRate: 0, mode: 'UPI', workflowVersion: undefined })) {
    const changed = structuredClone(db); changed.rentals[0][field] = value;
    assert.throws(() => enforceRentals(changed, db), /locked/, field);
  }
});
test('return uses saved prices, exact settlement, separate immutable payments and releases quantity', () => {
  const db = book(), next = structuredClone(db);
  next.inventory[0].deposit = 9000; next.inventory[0].extraDayCharge = 999;
  Object.assign(next.rentals[0], { actualReturn: '2027-01-03', damage: 100, returnMode: 'UPI', returnReceived: 1300, depositRefunded: 0, extraCharge: 0 });
  for (const amount of [1299, 1301]) {
    const bad = structuredClone(next); bad.rentals[0].returnReceived = amount;
    assert.throws(() => enforceRentals(bad, db), /Enter exactly ₹1,300/);
  }
  enforceRentals(next, db); validate(next);
  const r = next.rentals[0];
  assert.equal(r.extraCharge, 400); assert.equal(r.depositRefunded, 1000);
  assert.equal(r.bookingPayment.amount, 1000); assert.equal(r.bookingPayment.mode, 'Cash');
  assert.equal(r.returnPayment.amount, 1300); assert.equal(r.returnPayment.mode, 'UPI');
  assert.equal(totals(r).remaining, 0);
  const retry = structuredClone(next); enforceRentals(retry, next); assert.deepEqual(retry, next);
  const edit = structuredClone(next); edit.rentals[0].damage = 999;
  assert.throws(() => enforceRentals(edit, next), /locked/);
  next.sales.push({ id: 'S', itemId: 'I', qty: 3 }); validate(next);
});
test('zero payment, early returns, refund-required cases and paise remain explicit', () => {
  const r = { ...book().rentals[0], actualReturn: '2026-12-30', received: 1800, returnMode: 'Cash', returnReceived: 0 };
  assert.equal(returnError(r), ''); assert.equal(totals(r).extraCharge, 0);
  assert.match(returnError({ ...r, received: 2800 }), /Refund settlement required/);
  const fractional = { ...r, rentalFee: 100.05, discount: 10, deposit: 20, received: 20, returnReceived: 70.05 };
  assert.equal(totals(fractional).due, 70.05); assert.equal(returnError(fractional), '');
});
