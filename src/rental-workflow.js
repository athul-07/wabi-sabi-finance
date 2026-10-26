const modes = ['Cash', 'UPI', 'Bank Transfer', 'Card', 'Cheque'];
const money = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const shiftDate = (value, days) => validDate(value) ? new Date(Date.parse(value) + days * 86400000).toISOString().slice(0, 10) : '';
function prices(item = {}, qty = 1, settings = {}) {
  return { rentalFee: money(Number(item.rentalPrice || 0) * qty), discount: Number(item.rentalDiscount || 0), deposit: money(Number(item.deposit || 0) * qty), dailyRate: money(Number(item.extraDayCharge === '' || item.extraDayCharge == null ? settings.lateFeePerDay || 0 : item.extraDayCharge) * qty) };
}
function totals(r) {
  const bookingTotal = money(money(Number(r.rentalFee || 0) * (1 - Number(r.discount || 0) / 100)) + Number(r.deposit || 0));
  const days = validDate(r.actualReturn) && validDate(r.returnDue) ? Math.max(0, (Date.parse(r.actualReturn) - Date.parse(r.returnDue)) / 86400000) : 0;
  const extraCharge = money(days * Number(r.dailyRate || 0));
  const total = money(bookingTotal + extraCharge + Number(r.damage || 0));
  const due = money(total - Number(r.received || 0) - Number(r.deposit || 0));
  return { bookingTotal, extraCharge, total, due, remaining: money(due - Number(r.returnReceived || 0)) };
}
const rupees = n => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
function bookingError(r) {
  if (!r.phone?.trim() || !r.customer?.trim() || !r.itemId || !validDate(r.eventDate) || !validDate(r.pickup) || !validDate(r.returnDue)) return 'Enter the customer, item and booking dates.';
  if (!Number.isInteger(Number(r.qty)) || Number(r.qty) < 1) return 'Select a valid quantity.';
  if (!modes.includes(r.mode)) return 'Select a booking payment mode.';
  if (r.received === '' || !Number.isFinite(Number(r.received))) return 'Enter the booking amount.';
  if (money(r.received) < money(r.deposit)) return `The minimum booking amount is ${rupees(r.deposit)}, equal to the security deposit.`;
  if (money(r.received) > totals(r).bookingTotal) return `The booking amount cannot exceed the total amount of ${rupees(totals(r).bookingTotal)}.`;
  return '';
}
function returnError(r) {
  if (!validDate(r.actualReturn)) return 'Enter the actual return date.';
  if (r.actualReturn < r.pickup) return 'Actual return cannot be before pickup.';
  if (!Number.isFinite(Number(r.damage)) || Number(r.damage) < 0) return 'Damage charge must be zero or greater.';
  const t = totals(r);
  if (t.due < 0) return `Refund settlement required: ${rupees(-t.due)} is owed to the customer. This return cannot be completed as a payment received.`;
  if (!modes.includes(r.returnMode)) return 'Select a return payment mode.';
  if (r.returnReceived === '' || !Number.isFinite(Number(r.returnReceived)) || money(r.returnReceived) !== t.due) return `Payment amount mismatch. Enter exactly ${rupees(t.due)} to settle the balance.`;
  return '';
}
// Runs inside the versioned shop update: booking, reservations and payment records commit together.
function enforceRentals(data, previous) {
  const locked = ['bookingDate', 'phone', 'customer', 'itemId', 'qty', 'eventDate', 'pickup', 'returnDue', 'rentalFee', 'discount', 'deposit', 'dailyRate', 'mode', 'received', 'workflowVersion'];
  data.rentals = data.rentals.map(input => {
    const r = { ...input }, old = previous.rentals?.find(x => x.id === r.id);
    if (old) {
      if (JSON.stringify(r) === JSON.stringify(old)) return r;
      for (const key of locked) if (JSON.stringify(r[key]) !== JSON.stringify(old[key])) throw new Error('Saved booking details are locked.');
      if (old.actualReturn && JSON.stringify(r) !== JSON.stringify(old)) throw new Error('Completed returns are locked.');
      if (old.actualReturn) return r;
    } else {
      r.workflowVersion = 1;
      Object.assign(r, prices(data.inventory.find(i => i.id === r.itemId), r.qty, data.settings));
      r.pickup = shiftDate(r.eventDate, -1); r.returnDue = shiftDate(r.eventDate, 1);
      const error = bookingError(r); if (error) throw new Error(error);
      if (r.actualReturn) throw new Error('Save the booking before completing its return.');
      r.received = money(r.received);
    }
    if (r.actualReturn) {
      if (r.dailyRate == null) r.dailyRate = prices(data.inventory.find(i => i.id === r.itemId), r.qty || 1, data.settings).dailyRate;
      const error = returnError(r); if (error) throw new Error(error);
      r.extraCharge = totals(r).extraCharge; r.depositRefunded = money(r.deposit); r.returnReceived = money(r.returnReceived);
      r.returnPayment = { id: `auto-R-return-${r.id}`, date: r.actualReturn, amount: r.returnReceived, mode: r.returnMode };
    } else {
      r.damage = 0; r.extraCharge = 0; r.depositRefunded = 0; r.returnReceived = 0; delete r.returnPayment;
    }
    r.bookingPayment = old?.bookingPayment || { id: `auto-R-${r.id}`, date: r.bookingDate, amount: money(r.received), mode: r.mode };
    return r;
  });
}
module.exports = { money, validDate, shiftDate, prices, totals, bookingError, returnError, enforceRentals };
