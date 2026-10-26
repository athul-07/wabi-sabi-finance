import React, { useState, useRef } from 'react';
import { Lock, Check, Info } from 'lucide-react';
import { money, shiftDate, prices, totals, bookingError, returnError } from './rental-workflow';

const modes = ['Cash', 'UPI', 'Bank Transfer', 'Card', 'Cheque'];
export default function RentalForm({ db, rental, update, onClose, ui, helpers }) {
  const { Modal, Field, TextInput, Select, Btn } = ui;
  const { today, inr, available, nextId, custByPhone, toast } = helpers;
  const [id, setId] = useState(rental?.id);
  const [form, setForm] = useState(() => ({ bookingDate: today(), phone: '', customer: '', itemId: '', qty: 1, eventDate: '', pickup: '', returnDue: '', rentalFee: 0, discount: 0, deposit: 0, damage: 0, mode: 'Cash', received: '', returnMode: 'Cash', returnReceived: '', workflowVersion: 1, ...rental, dailyRate: rental?.dailyRate ?? prices(db.inventory.find(i => i.id === rental?.itemId), rental?.qty || 1, db.settings).dailyRate, actualReturn: rental ? rental.actualReturn || today() : '' }));
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const saved = db.rentals.find(r => r.id === id);
  const completed = !!saved?.actualReturn;
  const item = db.inventory.find(i => i.id === form.itemId);
  const preview = id ? form : { ...form, ...prices(item, form.qty, db.settings) };
  const t = totals(preview);
  const bookingIssue = bookingError(preview), returnIssue = returnError(preview);
  const remaining = id ? t.remaining : money(t.bookingTotal - Number(form.received || 0));
  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));
  const save = async () => {
    if (saving.current || (id ? returnIssue || completed : bookingIssue)) return;
    saving.current = true; setBusy(true);
    try {
      const next = structuredClone(db);
      let row;
      if (id) {
        row = { ...saved, actualReturn: form.actualReturn, damage: money(form.damage), returnMode: form.returnMode, returnReceived: money(form.returnReceived) };
        next.rentals[next.rentals.findIndex(r => r.id === id)] = row;
      } else {
        row = { ...preview, id: nextId(next.rentals, 'WSB-', 4), received: money(form.received), actualReturn: '', returnReceived: 0 };
        next.rentals.push(row);
        if (!custByPhone(next, form.phone)) next.customers.push({ id: nextId(next.customers, 'CUST-', 3), phone: form.phone.trim(), name: form.customer.trim(), email: '', address: '', notes: 'Added from a rental' });
      }
      if (await update(next)) {
        if (id) { onClose(); toast('Return completed', 'success'); }
        else { setId(row.id); setForm({ ...row, actualReturn: today(), returnReceived: '' }); toast('Booking saved · details locked', 'success'); }
      }
    } finally { saving.current = false; setBusy(false); }
  };
  const modeField = key => <Field label="Payment mode"><Select disabled={busy || (key === 'mode' ? !!id : !id || completed)} value={form[key]} onChange={e => set(key, e.target.value)}>{modes.map(m => <option key={m}>{m}</option>)}</Select></Field>;
  const readField = (label, value) => <Field label={label}><TextInput value={value} readOnly /></Field>;
  return <Modal className="rental-modal" title="Rental details" onClose={() => { if (!busy) onClose(); }} wide><div className="rental-form">
    <div className="rental-section-heading"><span>01</span><h3>Booking details</h3>{id && <span className="rental-lock"><Lock size={14} /> Saved · Locked</span>}</div>
    <fieldset disabled={!!id || busy} className="rental-fields">
      <div className="rental-grid two">
        <Field label="Phone"><TextInput value={form.phone} placeholder="Phone number" onChange={e => { const c = custByPhone(db, e.target.value); setForm({ ...form, phone: e.target.value, customer: c?.name || form.customer }); }} /></Field>
        <Field label="Customer ID / name"><TextInput list="rental-customers" value={form.customer} placeholder="Select or enter a customer" onChange={e => { const c = db.customers.find(c => c.id === e.target.value); setForm({ ...form, customer: c?.name || e.target.value, phone: c?.phone || form.phone }); }} /><datalist id="rental-customers">{db.customers.map(c => <option key={c.id} value={c.id}>{c.name} · {c.phone}</option>)}</datalist></Field>
      </div>
      <div className="rental-grid item-quantity">
        <Field label="Item ID / Name"><Select disabled={!!id || busy} value={form.itemId} onChange={e => setForm({ ...form, itemId: e.target.value, qty: 1 })}><option value="">Select an item</option>{db.inventory.filter(i => available(db, i) > 0 || i.id === form.itemId).map(i => <option key={i.id} value={i.id}>{`${i.id} · ${i.name}`}</option>)}</Select></Field>
        <Field label="Quantity"><Select disabled={!!id || busy} value={form.qty} onChange={e => set('qty', Number(e.target.value))}>{Array.from({ length: Math.max(1, id ? Number(form.qty) : item ? available(db, item) : 1) }, (_, i) => <option key={i + 1}>{i + 1}</option>)}</Select></Field>
      </div>
      <div className="rental-grid three">
        <Field label="Event date"><TextInput type="date" value={form.eventDate} onChange={e => setForm({ ...form, eventDate: e.target.value, pickup: shiftDate(e.target.value, -1), returnDue: shiftDate(e.target.value, 1) })} /></Field>
        <Field label="Pickup date" hint="Auto: 1 day before event"><TextInput type="date" value={form.pickup} readOnly /></Field>
        <Field label="Return date" hint="Auto: 1 day after event"><TextInput type="date" value={form.returnDue} readOnly /></Field>
      </div>
      <div className="rental-grid three">{readField('Rental fee', inr(preview.rentalFee))}{readField('Discount %', preview.discount)}{readField('Security deposit', inr(preview.deposit))}</div>
      <p className="rental-hint">Rental fee, discount and security deposit auto-fill from the selected item and quantity.</p>
      <div className="rental-grid two">{modeField('mode')}<Field label="Booking amount"><TextInput type="number" min={preview.deposit} max={t.bookingTotal} step="0.01" value={form.received} onChange={e => set('received', e.target.value)} /></Field></div>
    </fieldset>
    <div className="rental-save-row"><p className="rental-hint">{id ? 'Booking details cannot be edited after saving.' : bookingIssue || 'Ready to save. Booking details will be locked.'}</p><Btn disabled={!!id || busy || !!bookingIssue} onClick={save}>{id ? <Lock size={15} /> : <Check size={15} />}{id ? 'Booking saved' : busy ? 'Saving…' : 'Save booking'}</Btn></div>
    <div className="rental-section-heading return-heading"><span>02</span><h3>Return details</h3></div>
    <p className="rental-hint">{id ? 'Enter return details anytime. Complete only when balance is ₹0.' : 'Save the booking to enable return details.'}</p>
    <fieldset disabled={!id || completed || busy} className="rental-fields">
      <div className="rental-grid three">
        <Field label="Actual return"><TextInput type="date" value={form.actualReturn} onChange={e => set('actualReturn', e.target.value)} /></Field>
        <Field label="Damage charge"><TextInput type="number" min="0" step="0.01" value={form.damage} onChange={e => set('damage', e.target.value)} /></Field>
        {readField('Extra charge', inr(t.extraCharge))}
      </div>
      <div className="rental-grid two">{readField('Balance amount', inr(id ? t.due : 0))}{readField('Deposit refund', inr(id ? preview.deposit : 0))}</div>
      <div className="rental-grid two">{modeField('returnMode')}<Field label="Balance payment received" hint={id && t.due >= 0 ? `Enter the exact outstanding amount: ${inr(t.due)}.` : ''}><TextInput type="number" min="0" step="0.01" value={form.returnReceived} onChange={e => set('returnReceived', e.target.value)} /></Field></div>
    </fieldset>
    <div className="rental-summary" aria-live="polite"><div>Total amount<strong>{inr(id ? t.total : t.bookingTotal)}</strong></div><div>Balance amount<strong className={remaining ? 'balance-due' : ''}>{inr(remaining)}</strong></div><div>Status<strong>{completed ? 'Returned' : id ? 'Booked' : 'New booking'}</strong></div></div>
    {id && !completed && <div className={`rental-settlement ${returnIssue ? 'pending' : 'ready'}`} role="status"><Info size={18} />{returnIssue || 'Balance settled. Ready to complete this return.'}</div>}
    <div className="rental-actions"><Btn kind="ghost" disabled={busy} onClick={onClose}>Close</Btn><Btn disabled={!id || completed || busy || !!returnIssue || remaining !== 0} onClick={save}><Lock size={15} />{busy && id ? 'Saving…' : completed ? 'Return completed' : 'Complete return'}</Btn></div>
  </div></Modal>;
}
