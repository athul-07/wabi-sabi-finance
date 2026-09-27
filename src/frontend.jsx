import React, { useState, useEffect, useRef } from "react";
import Dashboard from './dashboard';
import { createRoot } from "react-dom/client";
import {
  LayoutDashboard, ShoppingBag, CalendarClock, Package, Users, ReceiptText,
  Settings as SettingsIcon, ShieldCheck, Plus, Trash2, Pencil, X, Check, Search,
  LogOut, Cloud, CloudOff, Lock, Sun, Moon, ArrowUpRight, ArrowDownLeft,
  Wallet, TrendingUp, CircleDollarSign, ArrowRight, Sparkles, ChevronRight, Menu
} from "lucide-react";

/* ---------------- theme ---------------- */
const C = {
  maroon: "var(--accent)", maroonDk: "var(--ink)", maroon2: "var(--surface-soft)",
  gold: "var(--gold)", goldSoft: "var(--muted)", cream: "var(--canvas)", card: "var(--surface)",
  ink: "var(--ink)", muted: "var(--muted)", line: "var(--line)",
  green: "var(--green)", red: "var(--red)",
};
const SERIF = "'Fraunces','Playfair Display',Georgia,serif";
const SANS = "'Inter',system-ui,-apple-system,sans-serif";

const ThemeContext = React.createContext(null);
function ThemeProvider({ children }) {
  const [theme, applyTheme] = useState(() => document.documentElement.dataset.theme || 'light');
  const account = useRef(null);
  useEffect(() => {
    const load = event => { account.current = event.detail; applyTheme(event.detail?.preferences?.theme || 'light'); };
    window.addEventListener('wabi-user', load);
    return () => window.removeEventListener('wabi-user', load);
  }, []);
  const setTheme = async value => {
    const previous = theme;
    applyTheme(value);
    if (account.current) {
      try { await api('/preferences', { method: 'PUT', body: { theme: value } }); }
      catch (error) { applyTheme(previous); alert(error.message); }
    }
  };
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#191315' : '#f6f1e8');
  }, [theme]);
  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}
function ThemeToggle() {
  const { theme, setTheme } = React.useContext(ThemeContext);
  return <button className="theme-toggle" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}<span>{theme === 'dark' ? 'Light' : 'Dark'}</span></button>;
}
function AppearanceSettings() {
  const { theme, setTheme } = React.useContext(ThemeContext);
  return <section className="panel appearance-panel"><div className="panel-heading"><div><h3>Appearance</h3><p>Make this workspace feel like yours. Saved to your account.</p></div></div><div className="appearance-options">{['light', 'dark'].map(mode => <button key={mode} className={`appearance-option ${theme === mode ? 'selected' : ''}`} aria-pressed={theme === mode} onClick={() => setTheme(mode)}><span className={`theme-preview preview-${mode}`}><i /><span><b /><b /><b /></span></span><span>{mode === 'light' ? <Sun size={15} /> : <Moon size={15} />}{mode === 'light' ? 'Light mode' : 'Dark mode'}{theme === mode && <Check size={15} />}</span></button>)}</div></section>;
}

/* ---------------- toasts ---------------- */
const toast = (msg, type = "success", persistent = false) => {
  const id = Date.now() + Math.random();
  window.dispatchEvent(new CustomEvent("toast", { detail: { id, msg, type, persistent } }));
  return id;
};
const dismissToast = id => window.dispatchEvent(new CustomEvent("toast-dismiss", { detail: id }));
function ToastContainer() {
  const [toasts, setToasts] = useState([]);
  useEffect(() => {
    const timers = new Map();
    const handle = (e) => {
      const { id, persistent } = e.detail;
      setToasts(prev => [...prev, e.detail]);
      if (!persistent) timers.set(id, setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
        timers.delete(id);
      }, 3000));
    };
    const dismiss = (e) => {
      clearTimeout(timers.get(e.detail));
      timers.delete(e.detail);
      setToasts(prev => prev.filter(t => t.id !== e.detail));
    };
    window.addEventListener("toast", handle);
    window.addEventListener("toast-dismiss", dismiss);
    return () => {
      window.removeEventListener("toast", handle);
      window.removeEventListener("toast-dismiss", dismiss);
      timers.forEach(clearTimeout);
    };
  }, []);
  return <div className="toast-container" role="status" aria-live="polite">{toasts.map(t => <div key={t.id} className={`toast toast-${t.type}`}>{t.type === 'loading' ? <Cloud size={16} /> : t.type === 'error' ? <Trash2 size={16} /> : <Check size={16} />} <span>{t.msg}</span></div>)}</div>;
}

const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const monthOf = (d) => (d || "").slice(0, 7);
const inr = (n) => (n < 0 ? "-" : "") + "₹" + Math.abs(Math.round(+n || 0)).toLocaleString("en-IN");
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

const PRODUCT_CATS = ["Bride", "Groom", "Save the Date", "Bride to Be", "Party wear", "Maternity", "Model Shoot", "Dance Costume", "Event Costume", "Jewellery", "Accessories", "Other"];
const ITEM_STATUSES = ["Available", "Reserved", "Rented", "Cleaning", "Repair", "Sold", "Retired"];
const PAY_MODES = ["Cash", "UPI", "Bank Transfer", "Card", "Cheque"];
const INCOME_CATS = ["Sales", "Rentals", "Customization", "Accessories", "Late Fee", "Damage Charge", "Cleaning Charge", "Other Income"];
const EXPENSE_CATS = ["Stock Purchase", "Cleaning/Laundry", "Repair/Maintenance", "Alteration", "Staff Salary", "Rent", "Electricity", "Marketing/Ads", "Courier/Transport", "Packaging", "Software/Subscriptions", "Refund", "Taxes/Fees", "Other Expense"];
const RENT_ACTIVE = ["Booked", "Reserved", "Out", "Overdue"];
const PERM_PAGES = ["Dashboard", "Sales", "Rentals", "Inventory", "Customers", "Transactions", "Settings"];

/* ---------------- api ---------------- */
async function api(path, { method = "GET", body } = {}) {
  const res = await fetch("/api" + path, {
    method,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && path !== "/login") { window.dispatchEvent(new Event("wabi-signed-out")); throw Object.assign(new Error("Please sign in."), { status: 401 }); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 409) throw Object.assign(new Error(data.error || "Something went wrong."), { status: res.status, data });
  return { status: res.status, data };
}

/* ---------------- computed ---------------- */
const normalizePhone = (phone) => String(phone || '').replace(/\D/g, '');
const custByPhone = (db, phone) => normalizePhone(phone) ? db.customers.find((c) => normalizePhone(c.phone) === normalizePhone(phone)) : undefined;
const custName = (db, phone) => custByPhone(db, phone)?.name || "";
const itemById = (db, id) => db.inventory.find((i) => i.id === id);
function rentalStatus(r) {
  if (r.actualReturn) return "Returned";
  const t = today();
  if (r.returnDue && t > r.returnDue) return "Overdue";
  if (r.pickup && t >= r.pickup) return "Out";
  return "Booked";
}
function rentalLateFee(db, r) { if (!r.returnDue || !r.actualReturn) return 0; return Math.max(0, daysBetween(r.returnDue, r.actualReturn)) * (+db.settings.lateFeePerDay || 0); }
function rentalCharges(db, r) { const item = itemById(db, r.itemId) || {}; const fee = r.rentalFee === "" || r.rentalFee == null ? +item.rentalPrice || 0 : +r.rentalFee; return fee + rentalDeposit(db, r) + rentalLateFee(db, r); }
function rentalDeposit(db, r) { const item = itemById(db, r.itemId) || {}; return r.deposit === "" || r.deposit == null ? +item.deposit || 0 : +r.deposit; }
const soldQty = (db, id) => db.sales.filter((s) => s.itemId === id).reduce((a, s) => a + (+s.qty || 0), 0);
const onRent = (db, id) => db.rentals.filter((r) => r.itemId === id && RENT_ACTIVE.includes(rentalStatus(r))).length;
const available = (db, item) => Math.max(0, (+item.stockQty || 0) - soldQty(db, item.id) - onRent(db, item.id));
const saleTotal = (s) => (+s.unitPrice || 0) * (+s.qty || 1) * (1 - (+s.discount || 0) / 100);
const saleBalance = (s) => Math.max(0, saleTotal(s) - (+s.received || 0));
const saleStatus = (s) => { const rec = +s.received || 0, tot = saleTotal(s); return rec <= 0 ? "Unpaid" : rec >= tot ? "Paid" : "Partly Paid"; };
function autoTx(db) {
  const out = [];
  db.sales.forEach((s) => { if (+s.received > 0) out.push({ id: "auto-S-" + s.id, date: s.date, type: "Income", category: "Sales", desc: "Sale " + s.id, party: custName(db, s.phone) || s.customer || "", mode: s.mode, amount: +s.received, ref: s.id, auto: true }); });
  db.rentals.forEach((r) => { if (+r.received > 0) out.push({ id: "auto-R-" + r.id, date: r.bookingDate, type: "Income", category: "Rentals", desc: "Booking " + r.id, party: custName(db, r.phone) || r.customer || "", mode: r.mode, amount: +r.received, ref: r.id, auto: true }); });
  return out;
}
const allTx = (db) => [...db.transactions.map((t) => ({ ...t, auto: false })), ...autoTx(db)];
function custStats(db, phone) {
  const s = db.sales.filter((x) => normalizePhone(x.phone) === normalizePhone(phone)), r = db.rentals.filter((x) => normalizePhone(x.phone) === normalizePhone(phone));
  const billed = s.reduce((a, x) => a + saleTotal(x), 0) + r.reduce((a, x) => a + rentalCharges(db, x), 0);
  const outstanding = s.reduce((a, x) => a + saleBalance(x), 0) + r.reduce((a, x) => a + Math.max(0, rentalCharges(db, x) - (+x.received || 0)), 0);
  return { orders: s.length + r.length, billed, outstanding };
}
function liveRental(db, id) {
  const rs = db.rentals.filter((r) => r.itemId === id);
  const c = (s) => rs.filter((r) => rentalStatus(r) === s).length;
  const overdue = c("Overdue"), out = c("Out"), booked = c("Booked") + c("Reserved");
  if (overdue) return { label: `Overdue (${overdue})`, tone: "red" };
  if (out) return { label: `Rented out (${out})`, tone: "amber" };
  if (booked) return { label: `Booked (${booked})`, tone: "grey" };
  return { label: "In stock", tone: "green" };
}
function nextId(list, prefix, pad) {
  const nums = list.map((x) => parseInt(String(x.id).replace(/\D/g, ""), 10)).filter((n) => !isNaN(n));
  return prefix + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(pad, "0");
}

/* ---------------- ui bits ---------------- */
function Field({ label, children, hint }) {
  const id = React.useId();
  return (<div className="block mb-3"><label htmlFor={id} className="block text-sm mb-1" style={{ color: C.ink, fontWeight: 600 }}>{label}</label>{React.Children.map(children, child => React.isValidElement(child) && [TextInput, Select].includes(child.type) ? React.cloneElement(child, { id, 'aria-describedby': hint ? `${id}-hint` : undefined }) : child)}{hint && <span id={`${id}-hint`} className="block text-xs mt-1" style={{ color: C.muted }}>{hint}</span>}</div>);
}
const inputStyle = { border: `1px solid ${C.line}`, borderRadius: 10, padding: "10px 12px", width: "100%", fontSize: 14, color: C.ink, background: C.card, outline: "none" };
const TextInput = (p) => <input {...p} style={{ ...inputStyle, ...(p.style || {}) }} />;
const Select = ({ children, ...p }) => <select {...p} style={{ ...inputStyle, ...(p.style || {}) }}>{children}</select>;
function Modal({ title, onClose, children, wide }) {
  return (<div className="fixed inset-0 z-50 flex items-start justify-center p-3 overflow-auto" style={{ background: "rgba(42,35,32,0.55)" }} onClick={onClose}>
    <div role="dialog" aria-modal="true" aria-label={title} className="w-full my-6" style={{ maxWidth: wide ? 760 : 520, background: C.card, borderRadius: 14, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }} onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between px-5 py-4" style={{ background: C.card, borderBottom: `1px solid ${C.line}`, borderTopLeftRadius: 14, borderTopRightRadius: 14 }}>
        <h3 style={{ color: C.ink, fontSize: 20, fontWeight: 600, margin: 0 }}>{title}</h3>
        <button onClick={onClose} style={{ color: C.goldSoft }} aria-label="Close"><X size={20} /></button>
      </div>
      <div className="p-5">{children}</div>
    </div></div>);
}
function Btn({ children, onClick, kind = "primary", type = "button", small }) {
  return <button type={type} onClick={onClick} className={`btn btn-${kind}${small ? ' btn-small' : ''}`}>{children}</button>;
}
function Pill({ children, tone }) {
  return <span className={`pill pill-${tone || 'grey'}`}><i />{children}</span>;
}
const statusTone = (s) => ({ Paid: "green", Unpaid: "red", "Partly Paid": "amber", Returned: "green", Overdue: "red", Out: "amber", Booked: "grey", Reserved: "grey" }[s] || "grey");
function TableWrap({ head, children, empty, emptyText }) {
  return (<div className="table-card">
    <div className="overflow-x-auto"><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
      <thead><tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
      <tbody>{children}</tbody></table></div>
    {empty && <div className="empty-state"><span className="empty-icon"><ShoppingBag size={25} /></span><strong>{emptyText || 'Nothing here yet'}</strong><p>Your records will appear here once you add them.</p></div>}</div>);
}
const Td = ({ children, style }) => <td style={{ padding: "9px 12px", borderTop: `1px solid ${C.line}`, color: C.ink, whiteSpace: "nowrap", ...style }}>{children}</td>;
function SectionHead({ title, subtitle, action, readonly }) {
  return (<div className="section-head"><div>
    <h2>{title} {readonly && <span style={{ fontFamily: SANS, fontSize: 12 }}><Pill tone="grey">View only</Pill></span>}</h2>
    {subtitle && <p style={{ color: C.muted, margin: "4px 0 0", fontSize: 14, maxWidth: 620 }}>{subtitle}</p>}</div>{action}</div>);
}
function PageStats({ items }) {
  return <div className="page-stats">{items.map(([label, value, Icon]) => <div key={label}><span className="metric-icon purple"><Icon size={19} /></span><div><span>{label}</span><strong>{value}</strong></div></div>)}</div>;
}

/* ---------------- views ---------------- */
function CustomerFields({ db, form, set }) {
  const known = custByPhone(db, form.phone);
  useEffect(() => { if (known && known.name !== form.customer) set({ ...form, customer: known.name }); /* eslint-disable-next-line */ }, [form.phone]);
  return (<div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
    <Field label="Phone" hint={known ? "Saved customer — details filled in" : "New number — it will be saved automatically"}>
      <TextInput list="phones" value={form.phone} onChange={(e) => set({ ...form, phone: e.target.value })} placeholder="98765 43210" />
      <datalist id="phones">{db.customers.map((c) => <option key={c.id} value={c.phone}>{c.name}</option>)}</datalist>
    </Field>
    <Field label="Customer name"><TextInput value={form.customer} onChange={(e) => set({ ...form, customer: e.target.value })} placeholder="Name" readOnly={!!known} style={known ? { background: C.cream } : {}} /></Field>
  </div>);
}
function ItemPicker({ db, value, onChange, label = "Item" }) {
  const selected = db.inventory.find((i) => i.id === value);
  const [query, setQuery] = useState(selected ? `${selected.id} · ${selected.name}` : "");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (selected) setQuery(`${selected.id} · ${selected.name}`);
    else if (!value && !open) setQuery("");
  }, [selected?.id, selected?.name, value, open]);
  const items = db.inventory.filter((i) => available(db, i) > 0 || i.id === value);
  const normalizedQuery = query.trim().toLowerCase();
  const matches = items.filter((item) => !normalizedQuery || `${item.id} ${item.name}`.toLowerCase().includes(normalizedQuery));
  const choose = (item) => {
    setQuery(`${item.id} · ${item.name}`);
    setOpen(false);
    onChange(item.id);
  };
  return (<Field label={label} hint="Type an item ID or name to search.">
    <div className="item-picker">
      <TextInput aria-label={label} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls="inventory-item-options" value={query}
        onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onChange={(e) => { setQuery(e.target.value); onChange(""); setOpen(true); }}
        onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }} placeholder="Type an item ID or name" autoComplete="off" />
      {open && <div className="item-picker-options" id="inventory-item-options" role="listbox">
        {matches.length ? matches.map((item) => <button key={item.id} type="button" role="option" aria-selected={item.id === value}
          className="item-picker-option" onMouseDown={(e) => e.preventDefault()} onClick={() => choose(item)}>
          <span><strong>{item.id}</strong><span>{item.name}</span></span><small>{available(db, item)} available</small>
        </button>) : <div className="item-picker-empty">No matching items</div>}
      </div>}
    </div>
  </Field>);
}
function RecordFilters({ search, setSearch, searchLabel, status, setStatus, statusLabel, statuses }) {
  return (<div className="flex items-center gap-3 mb-3" style={{ flexWrap: "wrap" }}>
    <label className="flex items-center gap-2 px-3" style={{ flex: "1 1 250px", maxWidth: 420, minWidth: 0, border: `1px solid ${C.line}`, borderRadius: 9, background: C.card }}>
      <Search size={16} color={C.muted} />
      <input className="record-filter-search" aria-label={searchLabel} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={searchLabel} style={{ border: "none", outline: "none", padding: "9px 0", width: "100%", minWidth: 0, fontSize: 14 }} />
    </label>
    <Select aria-label={statusLabel} value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: "auto", minWidth: 180 }}>
      <option value="">All statuses</option>{statuses.map((value) => <option key={value} value={value}>{value}</option>)}
    </Select>
  </div>);
}
function SalesView({ db, update, canWrite, initialOpen }) {
  const [open, setOpen] = useState(!!initialOpen); const [edit, setEdit] = useState(null);
  const [search, setSearch] = useState(""); const [statusFilter, setStatusFilter] = useState("");
  const blank = { id: "", date: today(), phone: "", customer: "", itemId: "", qty: 1, discount: 0, unitPrice: "", mode: "Cash", received: "", notes: "" };
  const [form, setForm] = useState(blank);
  const openNew = () => { setEdit(null); setForm(blank); setOpen(true); };
  const openEdit = (s) => { setEdit(s.id); setForm({ ...blank, ...s }); setOpen(true); };
  const item = itemById(db, form.itemId);
  const unit = form.unitPrice === "" ? (item?.salePrice || 0) : +form.unitPrice;
  const preview = { ...form, unitPrice: unit };
  const save = async () => {
    if (!form.itemId) return;
    const next = structuredClone(db); const row = { ...form, unitPrice: unit };
    if (edit) next.sales[next.sales.findIndex((x) => x.id === edit)] = row;
    else { row.id = nextId(next.sales, "GR-", 3); next.sales.push(row); }
    if (form.phone && !custByPhone(next, form.phone)) next.customers.push({ id: nextId(next.customers, "CUST-", 3), phone: form.phone.trim(), name: form.customer || "", email: "", address: "", notes: "Added from a sale" });
    if (await update(next)) { setOpen(false); toast(edit ? "Sale updated" : "Sale saved"); }
  };
  const del = async (id) => { const next = structuredClone(db); next.sales = next.sales.filter((x) => x.id !== id); if (await update(next)) toast("Sale deleted", "error"); };
  const rows = db.sales.filter((s) => {
    const needle = search.trim().toLowerCase();
    const phoneNeedle = normalizePhone(needle);
    const text = `${s.id} ${custName(db, s.phone)} ${s.customer || ""} ${s.phone || ""} ${itemById(db, s.itemId)?.name || ""}`.toLowerCase();
    return (!needle || text.includes(needle) || (phoneNeedle && normalizePhone(s.phone).includes(phoneNeedle))) && (!statusFilter || saleStatus(s) === statusFilter);
  });
  const head = ["Sale", "Date", "Customer", "Item", "Qty", "Total", "Received", "Balance", "Status"]; if (canWrite) head.push("");
  return (<div>
    <SectionHead title="Sales" readonly={!canWrite} subtitle="One row per item sold. Enter a phone — a saved customer fills in, a new one is saved automatically. The amount received posts to the ledger on its own."
      action={canWrite ? <Btn kind="gold" onClick={openNew}><Plus size={16} /> New sale</Btn> : null} />
    <PageStats items={[["Total sales", db.sales.length, ShoppingBag], ["Payments received", inr(db.sales.reduce((n, s) => n + Number(s.received || 0), 0)), Wallet], ["Outstanding balance", inr(db.sales.reduce((n, s) => n + saleBalance(s), 0)), CircleDollarSign]]} />
    <RecordFilters search={search} setSearch={setSearch} searchLabel="Search sales by name or phone" status={statusFilter} setStatus={setStatusFilter} statusLabel="Filter sales by status" statuses={["Paid", "Partly Paid", "Unpaid"]} />
    <TableWrap head={head} empty={rows.length === 0} emptyText={db.sales.length ? "No sales match these filters." : "No sales yet."}>
      {rows.map((s) => (<tr key={s.id}>
        <Td>{s.id}</Td><Td>{s.date}</Td><Td>{custName(db, s.phone) || s.customer || <span style={{ color: C.muted }}>—</span>}</Td>
        <Td>{itemById(db, s.itemId)?.name || s.itemId}</Td><Td>{s.qty}</Td><Td>{inr(saleTotal(s))}</Td><Td>{inr(s.received)}</Td><Td>{inr(saleBalance(s))}</Td>
        <Td><Pill tone={statusTone(saleStatus(s))}>{saleStatus(s)}</Pill></Td>
        {canWrite && <Td><div className="flex gap-2"><button aria-label="Edit record" onClick={() => openEdit(s)} style={{ color: C.maroon }}><Pencil size={16} /></button><button aria-label="Delete record" onClick={() => del(s.id)} style={{ color: C.red }}><Trash2 size={16} /></button></div></Td>}
      </tr>))}
    </TableWrap>
    {open && canWrite && (<Modal title={edit ? "Edit sale" : "New sale"} onClose={() => setOpen(false)} wide>
      <CustomerFields db={db} form={form} set={setForm} />
      <ItemPicker db={db} value={form.itemId} onChange={(v) => { const selectedItem = itemById(db, v); setForm({ ...form, itemId: v, unitPrice: selectedItem ? selectedItem.salePrice : "", discount: selectedItem ? (selectedItem.discount ?? 0) : 0 }); }} />
      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
        <Field label="Date"><TextInput type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
        <Field label="Quantity"><TextInput type="number" min="1" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} /></Field>
        <Field label="Discount %" hint="Auto-set from the selected item."><TextInput type="number" value={form.discount} readOnly disabled tabIndex={-1} style={{ background: C.cream, cursor: "default", opacity: 1 }} /></Field>
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
        <Field label="Unit price" hint="Auto-set from the selected item."><TextInput type="number" value={unit} readOnly disabled tabIndex={-1} style={{ background: C.cream, cursor: "default", opacity: 1 }} /></Field>
        <Field label="Payment mode"><Select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>{PAY_MODES.map((m) => <option key={m}>{m}</option>)}</Select></Field>
        <Field label="Amount received"><TextInput type="number" value={form.received} onChange={(e) => setForm({ ...form, received: e.target.value })} /></Field>
      </div>
      <Field label="Notes"><TextInput value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
      <div className="flex items-center justify-between mt-2 p-3 flex-wrap gap-2" style={{ background: C.cream, borderRadius: 10 }}>
        <div style={{ fontSize: 14, color: C.ink }}>Sale total <b>{inr(saleTotal(preview))}</b> · Balance <b>{inr(saleBalance(preview))}</b></div>
        <div className="flex gap-2"><Btn kind="ghost" onClick={() => setOpen(false)}>Cancel</Btn><Btn onClick={save}><Check size={16} /> Save sale</Btn></div>
      </div>
    </Modal>)}
  </div>);
}
function RentalsView({ db, update, canWrite, initialOpen }) {
  const [open, setOpen] = useState(!!initialOpen); const [edit, setEdit] = useState(null);
  const [search, setSearch] = useState(""); const [statusFilter, setStatusFilter] = useState("");
  const blank = { id: "", bookingDate: today(), phone: "", customer: "", itemId: "", eventDate: "", pickup: "", returnDue: "", actualReturn: "", rentalFee: "", deposit: "", damage: 0, mode: "Cash", received: "", depositRefunded: 0, notes: "" };
  const [form, setForm] = useState(blank);
  const openNew = () => { setEdit(null); setForm(blank); setOpen(true); };
  const openEdit = (r) => { setEdit(r.id); setForm({ ...blank, ...r }); setOpen(true); };
  const item = itemById(db, form.itemId);
  const preview = { ...form, rentalFee: form.rentalFee === "" ? (item?.rentalPrice || 0) : +form.rentalFee, deposit: form.deposit === "" ? (item?.deposit || 0) : +form.deposit };
  const save = async () => {
    if (!form.itemId) return;
    const next = structuredClone(db);
    const row = { ...form, rentalFee: form.rentalFee === "" ? (item?.rentalPrice || 0) : +form.rentalFee, deposit: form.deposit === "" ? (item?.deposit || 0) : +form.deposit };
    if (edit) next.rentals[next.rentals.findIndex((x) => x.id === edit)] = row;
    else { row.id = nextId(next.rentals, "WSB-", 4); next.rentals.push(row); }
    if (form.phone && !custByPhone(next, form.phone)) next.customers.push({ id: nextId(next.customers, "CUST-", 3), phone: form.phone.trim(), name: form.customer || "", email: "", address: "", notes: "Added from a rental" });
    if (await update(next)) { setOpen(false); toast(edit ? "Rental updated" : "Rental saved"); }
  };
  const del = async (id) => { const next = structuredClone(db); next.rentals = next.rentals.filter((x) => x.id !== id); if (await update(next)) toast("Rental deleted", "error"); };
  const markReturned = async (r) => { const next = structuredClone(db); next.rentals[next.rentals.findIndex((x) => x.id === r.id)] = { ...r, actualReturn: today() }; if (await update(next)) toast("Marked as returned", "info"); };
  const rows = db.rentals.filter((r) => {
    const needle = search.trim().toLowerCase();
    const phoneNeedle = normalizePhone(needle);
    const text = `${r.id} ${custName(db, r.phone)} ${r.customer || ""} ${r.phone || ""} ${itemById(db, r.itemId)?.name || ""}`.toLowerCase();
    return (!needle || text.includes(needle) || (phoneNeedle && normalizePhone(r.phone).includes(phoneNeedle))) && (!statusFilter || rentalStatus(r) === statusFilter);
  });
  const head = ["Booking", "Customer", "Item", "Return due", "Charges", "Received", "Balance", "Status", "Deposit held"]; if (canWrite) head.push("");
  return (<div>
    <SectionHead title="Rentals" readonly={!canWrite} subtitle="One row per booking. Late fee, status and deposit are worked out for you. The rent received posts to the ledger automatically."
      action={canWrite ? <Btn kind="gold" onClick={openNew}><Plus size={16} /> New rental</Btn> : null} />
    <PageStats items={[["Active rentals", db.rentals.filter(r => !r.actualReturn).length, CalendarClock], ["Overdue returns", db.rentals.filter(r => rentalStatus(r) === 'Overdue').length, Package], ["Rental payments", inr(db.rentals.reduce((n, r) => n + Number(r.received || 0), 0)), Wallet]]} />
    <RecordFilters search={search} setSearch={setSearch} searchLabel="Search rentals by name or phone" status={statusFilter} setStatus={setStatusFilter} statusLabel="Filter rentals by status" statuses={["Out", "Returned", "Booked", "Overdue"]} />
    <TableWrap head={head} empty={rows.length === 0} emptyText={db.rentals.length ? "No rentals match these filters." : "No rentals yet."}>
      {rows.map((r) => {
        const st = rentalStatus(r); const held = Math.max(0, rentalDeposit(db, r) - (+r.damage || 0) - (+r.depositRefunded || 0)); return (<tr key={r.id}>
          <Td>{r.id}</Td><Td>{custName(db, r.phone) || r.customer || <span style={{ color: C.muted }}>—</span>}</Td><Td>{itemById(db, r.itemId)?.name || r.itemId}</Td>
          <Td>{r.returnDue || "—"}</Td><Td>{inr(rentalCharges(db, r))}</Td><Td>{inr(r.received)}</Td><Td>{inr(Math.max(0, rentalCharges(db, r) - (+r.received || 0)))}</Td>
          <Td><Pill tone={statusTone(st)}>{st}</Pill></Td><Td>{inr(held)}</Td>
          {canWrite && <Td><div className="flex gap-2">{st !== "Returned" && <button title="Mark returned" onClick={() => markReturned(r)} style={{ color: C.green }}><Check size={16} /></button>}
            <button aria-label="Edit record" onClick={() => openEdit(r)} style={{ color: C.maroon }}><Pencil size={16} /></button><button aria-label="Delete record" onClick={() => del(r.id)} style={{ color: C.red }}><Trash2 size={16} /></button></div></Td>}
        </tr>);
      })}
    </TableWrap>
    {open && canWrite && (<Modal title={edit ? "Edit rental" : "New rental"} onClose={() => setOpen(false)} wide>
      <CustomerFields db={db} form={form} set={setForm} />
      <ItemPicker db={db} value={form.itemId} onChange={(v) => { const selectedItem = itemById(db, v); setForm({ ...form, itemId: v, rentalFee: selectedItem ? selectedItem.rentalPrice : "", deposit: selectedItem ? selectedItem.deposit : "" }); }} />
      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
        <Field label="Event date"><TextInput type="date" value={form.eventDate} onChange={(e) => setForm({ ...form, eventDate: e.target.value })} /></Field>
        <Field label="Pickup"><TextInput type="date" value={form.pickup} onChange={(e) => setForm({ ...form, pickup: e.target.value })} /></Field>
        <Field label="Return due"><TextInput type="date" value={form.returnDue} onChange={(e) => setForm({ ...form, returnDue: e.target.value })} /></Field>
        <Field label="Actual return" hint="Fill on return"><TextInput type="date" value={form.actualReturn} onChange={(e) => setForm({ ...form, actualReturn: e.target.value })} /></Field>
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
        <Field label="Rental fee" hint="Set from the selected item; cannot be edited."><TextInput type="number" value={preview.rentalFee} readOnly style={{ background: C.cream }} /></Field>
        <Field label="Security deposit" hint="Set from the selected item; cannot be edited."><TextInput type="number" value={preview.deposit} readOnly style={{ background: C.cream }} /></Field>
        <Field label="Damage charge"><TextInput type="number" value={form.damage} onChange={(e) => setForm({ ...form, damage: e.target.value })} /></Field>
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
        <Field label="Payment mode"><Select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>{PAY_MODES.map((m) => <option key={m}>{m}</option>)}</Select></Field>
        <Field label="Amount received"><TextInput type="number" value={form.received} onChange={(e) => setForm({ ...form, received: e.target.value })} /></Field>
        <Field label="Deposit refunded"><TextInput type="number" value={form.depositRefunded} onChange={(e) => setForm({ ...form, depositRefunded: e.target.value })} /></Field>
      </div>
      <div className="flex items-center justify-between mt-2 p-3 flex-wrap gap-2" style={{ background: C.cream, borderRadius: 10 }}>
        <div style={{ fontSize: 14, color: C.ink }}>Late fee <b>{inr(rentalLateFee(db, preview))}</b> · Charges <b>{inr(rentalCharges(db, preview))}</b> · Balance <b>{inr(Math.max(0, rentalCharges(db, preview) - (+form.received || 0)))}</b> · Status <b>{rentalStatus(form)}</b></div>
        <div className="flex gap-2"><Btn kind="ghost" onClick={() => setOpen(false)}>Cancel</Btn><Btn onClick={save}><Check size={16} /> Save rental</Btn></div>
      </div>
    </Modal>)}
  </div>);
}
function InventoryView({ db, update, canWrite }) {
  const [open, setOpen] = useState(false); const [edit, setEdit] = useState(null); const [q, setQ] = useState("");
  const blank = { id: "", name: "", category: "Party wear", purchaseCost: 0, salePrice: 0, discount: 0, rentalPrice: 0, deposit: 1500, cleaning: 450, repair: 1000, status: "Available", stockQty: 1, purchaseDate: "" };
  const [form, setForm] = useState(blank);
  const openNew = () => { setEdit(null); setForm({ ...blank, id: nextId(db.inventory, "WS-", 3) }); setOpen(true); };
  const openEdit = (i) => { setEdit(i.id); setForm({ ...blank, ...i }); setOpen(true); };
  const save = async () => { if (!form.name) return; const next = structuredClone(db); if (edit) next.inventory[next.inventory.findIndex((x) => x.id === edit)] = form; else next.inventory.push(form); if (await update(next)) { setOpen(false); toast(edit ? "Item updated" : "Item added"); } };
  const del = async (id) => { const next = structuredClone(db); next.inventory = next.inventory.filter((x) => x.id !== id); if (await update(next)) toast("Item deleted", "error"); };
  const rows = db.inventory.filter((i) => (i.name + i.id + i.category).toLowerCase().includes(q.toLowerCase()));
  const head = ["ID", "Item", "Category", "Sale price", "Discount", "Rental", "Deposit", "Stock", "Available", "Rental status", "Item status"]; if (canWrite) head.push("");
  return (<div>
    <SectionHead title="Inventory" readonly={!canWrite} subtitle="Your outfits and items. “Available” drops as things are sold or rented out, and returns when a rental comes back."
      action={canWrite ? <Btn kind="gold" onClick={openNew}><Plus size={16} /> Add item</Btn> : null} />
    <PageStats items={[["Collection", `${db.inventory.length} items`, Package], ["Units available", db.inventory.reduce((n, i) => n + available(db, i), 0), ShoppingBag], ["On rental / reserved", db.rentals.filter(r => !r.actualReturn).length, CalendarClock]]} />
    <div className="mb-3" style={{ maxWidth: 320 }}><div className="flex items-center gap-2 px-3" style={{ border: `1px solid ${C.line}`, borderRadius: 9, background: C.card }}><Search size={16} color={C.muted} /><input className="record-filter-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search items" style={{ border: "none", outline: "none", padding: "8px 0", width: "100%", fontSize: 14 }} /></div></div>
    <TableWrap head={head}>
      {rows.map((i) => {
        const av = available(db, i); const lr = liveRental(db, i.id); const itemStatus = av === 0 ? "Unavailable" : i.status; return (<tr key={i.id}>
          <Td>{i.id}</Td><Td>{i.name}</Td><Td>{i.category}</Td><Td>{inr(i.salePrice)}</Td><Td>{Number(i.discount || 0)}%</Td><Td>{inr(i.rentalPrice)}</Td><Td>{inr(i.deposit)}</Td>
          <Td>{i.stockQty}</Td><Td><b style={{ color: av === 0 ? C.red : C.green }}>{av}</b></Td>
          <Td><Pill tone={lr.tone}>{lr.label}</Pill></Td><Td><Pill tone={itemStatus === "Available" ? "green" : itemStatus === "Unavailable" ? "red" : "grey"}>{itemStatus}</Pill></Td>
          {canWrite && <Td><div className="flex gap-2"><button aria-label="Edit record" onClick={() => openEdit(i)} style={{ color: C.maroon }}><Pencil size={16} /></button><button aria-label="Delete record" onClick={() => del(i.id)} style={{ color: C.red }}><Trash2 size={16} /></button></div></Td>}
        </tr>);
      })}
    </TableWrap>
    {open && canWrite && (<Modal title={edit ? "Edit item" : "Add item"} onClose={() => setOpen(false)} wide>
      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 2fr 1fr" }}>
        <Field label="Item ID"><TextInput value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} /></Field>
        <Field label="Item / outfit"><TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Category"><Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{PRODUCT_CATS.map((c) => <option key={c}>{c}</option>)}</Select></Field>
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
        <Field label="Purchase cost"><TextInput type="number" value={form.purchaseCost} onChange={(e) => setForm({ ...form, purchaseCost: e.target.value })} /></Field>
        <Field label="Sale price"><TextInput type="number" value={form.salePrice} onChange={(e) => setForm({ ...form, salePrice: e.target.value })} /></Field>
        <Field label="Discount %"><TextInput type="number" min="0" max="100" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} /></Field>
        <Field label="Rental price"><TextInput type="number" value={form.rentalPrice} onChange={(e) => setForm({ ...form, rentalPrice: e.target.value })} /></Field>
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
        <Field label="Security deposit"><TextInput type="number" value={form.deposit} onChange={(e) => setForm({ ...form, deposit: e.target.value })} /></Field>
        <Field label="Cleaning cost"><TextInput type="number" value={form.cleaning} onChange={(e) => setForm({ ...form, cleaning: e.target.value })} /></Field>
        <Field label="Repair cost"><TextInput type="number" value={form.repair} onChange={(e) => setForm({ ...form, repair: e.target.value })} /></Field>
        <Field label="Stock quantity"><TextInput type="number" value={form.stockQty} onChange={(e) => setForm({ ...form, stockQty: e.target.value })} /></Field>
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Field label="Status"><Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{ITEM_STATUSES.map((s) => <option key={s}>{s}</option>)}</Select></Field>
        <Field label="Purchase date"><TextInput type="date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} /></Field>
      </div>
      <div className="flex justify-end gap-2 mt-2"><Btn kind="ghost" onClick={() => setOpen(false)}>Cancel</Btn><Btn onClick={save}><Check size={16} /> Save item</Btn></div>
    </Modal>)}
  </div>);
}
function CustomersView({ db, update, canWrite }) {
  const [open, setOpen] = useState(false); const [edit, setEdit] = useState(null);
  const blank = { id: "", phone: "", name: "", email: "", address: "", notes: "" }; const [form, setForm] = useState(blank);
  const openNew = () => { setEdit(null); setForm(blank); setOpen(true); };
  const openEdit = (c) => { setEdit(c.id); setForm({ ...c }); setOpen(true); };
  const save = async () => { if (!form.phone && !form.name) return; const next = structuredClone(db); if (edit) next.customers[next.customers.findIndex((x) => x.id === edit)] = form; else next.customers.push({ ...form, id: nextId(next.customers, "CUST-", 3) }); if (await update(next)) { setOpen(false); toast(edit ? "Customer updated" : "Customer saved"); } };
  const del = async (id) => { const next = structuredClone(db); next.customers = next.customers.filter((x) => x.id !== id); if (await update(next)) toast("Customer deleted", "error"); };
  const head = ["ID", "Name", "Phone", "Email", "Orders", "Billed", "Outstanding"]; if (canWrite) head.push("");
  return (<div>
    <SectionHead title="Customers" readonly={!canWrite} subtitle="Everyone you've served. New customers are added here the moment you enter them on a sale or rental."
      action={canWrite ? <Btn kind="gold" onClick={openNew}><Plus size={16} /> Add customer</Btn> : null} />
    <PageStats items={[["Your community", `${db.customers.length} customers`, Users], ["Total orders", db.sales.length + db.rentals.length, ShoppingBag], ["Repeat customers", db.customers.filter(c => custStats(db, c.phone).orders > 1).length, Sparkles]]} />
    <TableWrap head={head} empty={db.customers.length === 0} emptyText="No customers yet.">
      {db.customers.map((c) => {
        const st = custStats(db, c.phone); return (<tr key={c.id}>
          <Td>{c.id}</Td><Td>{c.name}</Td><Td>{c.phone}</Td><Td>{c.email || "—"}</Td><Td>{st.orders}</Td><Td>{inr(st.billed)}</Td><Td>{inr(st.outstanding)}</Td>
          {canWrite && <Td><div className="flex gap-2"><button aria-label="Edit record" onClick={() => openEdit(c)} style={{ color: C.maroon }}><Pencil size={16} /></button><button aria-label="Delete record" onClick={() => del(c.id)} style={{ color: C.red }}><Trash2 size={16} /></button></div></Td>}
        </tr>);
      })}
    </TableWrap>
    {open && canWrite && (<Modal title={edit ? "Edit customer" : "Add customer"} onClose={() => setOpen(false)}>
      <Field label="Phone"><TextInput value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
      <Field label="Name"><TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
      <Field label="Email"><TextInput value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
      <Field label="Address"><TextInput value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
      <Field label="Notes"><TextInput value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
      <div className="flex justify-end gap-2 mt-2"><Btn kind="ghost" onClick={() => setOpen(false)}>Cancel</Btn><Btn onClick={save}><Check size={16} /> Save customer</Btn></div>
    </Modal>)}
  </div>);
}
function TransactionsView({ db, update, canWrite }) {
  const [open, setOpen] = useState(false);
  const [dateFilter, setDateFilter] = useState("");
  const blank = { id: "", date: today(), type: "Expense", category: "Rent", desc: "", party: "", mode: "Cash", account: "", amount: "", notes: "" };
  const [form, setForm] = useState(blank);
  const save = async () => { if (!form.amount) return; const next = structuredClone(db); next.transactions.push({ ...form, id: nextId(next.transactions, "TX-", 1) }); if (await update(next)) { setOpen(false); setForm(blank); toast("Transaction saved"); } };
  const del = async (id) => { const next = structuredClone(db); next.transactions = next.transactions.filter((x) => x.id !== id); if (await update(next)) toast("Transaction deleted", "error"); };
  const allRows = allTx(db).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const rows = allRows.filter((t) => !dateFilter || String(t.date || "").slice(0, 10) === dateFilter);
  const summaryRows = dateFilter ? rows : allRows;
  const cats = form.type === "Income" ? INCOME_CATS : EXPENSE_CATS;
  const head = ["Date", "Type", "Category", "Description", "Party", "Mode", "Amount", "Source"]; if (canWrite) head.push("");
  return (<div>
    <SectionHead title="Transactions" readonly={!canWrite} subtitle="Your money diary. Sale and rental receipts appear here on their own (marked Auto). Add expenses and refunds yourself."
      action={canWrite ? <Btn kind="gold" onClick={() => { setForm(blank); setOpen(true); }}><Plus size={16} /> Add expense / entry</Btn> : null} />
    <PageStats items={[[dateFilter ? "Income on date" : "All-time income", inr(summaryRows.filter(t => t.type === 'Income').reduce((n, t) => n + Number(t.amount || 0), 0)), ArrowDownLeft], [dateFilter ? "Expenses on date" : "All-time expenses", inr(summaryRows.filter(t => t.type === 'Expense').reduce((n, t) => n + Number(t.amount || 0), 0)), ArrowUpRight], [dateFilter ? "Entries on date" : "Ledger entries", summaryRows.length, ReceiptText]]} />
    <div className="flex items-end gap-2" style={{ flexWrap: "wrap", marginBottom: 14 }}>
      <Field label="Filter by date"><TextInput type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} style={{ maxWidth: 220 }} /></Field>
      {dateFilter && <Btn kind="ghost" small onClick={() => setDateFilter("")}><X size={15} /> All dates</Btn>}
    </div>
    <TableWrap head={head} empty={rows.length === 0} emptyText={dateFilter ? "No transactions for this date." : "No transactions yet."}>
      {rows.map((t) => (<tr key={t.id} style={t.auto ? { background: C.cream } : {}}>
        <Td>{t.date}</Td><Td><Pill tone={t.type === "Income" ? "green" : "red"}>{t.type}</Pill></Td><Td>{t.category}</Td><Td>{t.desc || "—"}</Td><Td>{t.party || "—"}</Td><Td>{t.mode || "—"}</Td>
        <Td style={{ color: t.type === "Income" ? C.green : C.red, fontWeight: 600 }}>{inr(t.amount)}</Td>
        <Td>{t.auto ? <Pill tone="grey">Auto</Pill> : <Pill tone="maroon">Manual</Pill>}</Td>
        {canWrite && <Td>{t.auto ? <span style={{ color: C.muted, fontSize: 12 }}>from {t.ref}</span> : <button aria-label="Delete record" onClick={() => del(t.id)} style={{ color: C.red }}><Trash2 size={16} /></button>}</Td>}
      </tr>))}
    </TableWrap>
    {open && canWrite && (<Modal title="Add transaction" onClose={() => setOpen(false)}>
      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Field label="Date"><TextInput type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
        <Field label="Type"><Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value, category: (e.target.value === "Income" ? INCOME_CATS : EXPENSE_CATS)[0] })}><option>Expense</option><option>Income</option></Select></Field>
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Field label="Category"><Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{cats.map((c) => <option key={c}>{c}</option>)}</Select></Field>
        <Field label="Payment mode"><Select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>{PAY_MODES.map((m) => <option key={m}>{m}</option>)}</Select></Field>
      </div>
      <Field label="Description"><TextInput value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} /></Field>
      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Field label="Party / payee"><TextInput value={form.party} onChange={(e) => setForm({ ...form, party: e.target.value })} /></Field>
        <Field label="Amount"><TextInput type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
      </div>
      <div className="flex justify-end gap-2 mt-2"><Btn kind="ghost" onClick={() => setOpen(false)}>Cancel</Btn><Btn onClick={save}><Check size={16} /> Save entry</Btn></div>
    </Modal>)}
  </div>);
}
function SettingsView({ db, update, me, onSignOut, canWrite }) {
  const [fee, setFee] = useState(db.settings.lateFeePerDay);
  const [pw, setPw] = useState({ current: "", next: "" }); const [msg, setMsg] = useState("");
  const changePw = async () => { setMsg(""); try { await api("/change-password", { method: "POST", body: pw }); toast("Password changed"); setTimeout(() => window.dispatchEvent(new Event("wabi-signed-out")), 1500); setPw({ current: "", next: "" }); } catch (e) { setMsg(e.message); } };
  const saveSettings = async () => { const next = structuredClone(db); next.settings.lateFeePerDay = +fee || 0; if (await update(next)) toast("Settings saved"); };
  return (<div style={{ maxWidth: 560 }}>
    <SectionHead title="Settings" subtitle={`Signed in as ${me?.name || me?.username} · ${me?.role === "admin" ? "Admin" : "Staff"}.`} />
    <AppearanceSettings />
    {canWrite && (<div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
      <Field label="Late fee per day (₹)" hint="Used to work out overdue rental charges."><TextInput type="number" value={fee} onChange={(e) => setFee(e.target.value)} style={{ maxWidth: 200 }} /></Field>
      <Btn onClick={saveSettings}><Check size={16} /> Save settings</Btn>
    </div>)}
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
      <h3 style={{ fontFamily: SERIF, color: C.maroonDk, margin: "0 0 10px", fontSize: 18 }}>Change your password</h3>
      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Field label="Current password"><TextInput type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
        <Field label="New password"><TextInput type="password" minLength={12} autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
      </div>
      <div className="flex items-center gap-3"><Btn onClick={changePw}><Check size={16} /> Update password</Btn>{msg && <span style={{ color: C.muted, fontSize: 13 }}>{msg}</span>}</div>
    </div>
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 20 }}>
      <h3 style={{ fontFamily: SERIF, color: C.maroonDk, margin: "0 0 6px", fontSize: 18 }}>Session</h3>
      <p style={{ color: C.muted, fontSize: 14, margin: "0 0 12px" }}>Data is stored on your shop server and shared across every signed-in device.</p>
      <Btn kind="danger" onClick={onSignOut}><LogOut size={16} /> Sign out</Btn>
    </div>
  </div>);
}

/* ---------------- Users (admin) ---------------- */
const PERM_LEVELS = ["none", "read", "write"];
const defaultNewPerms = () => ({ Dashboard: "none", Sales: "write", Rentals: "write", Inventory: "none", Customers: "none", Transactions: "none", Settings: "none" });
function accessSummary(u) {
  if (u.role === "admin") return "Full access";
  const w = PERM_PAGES.filter((p) => u.permissions[p] === "write");
  const r = PERM_PAGES.filter((p) => u.permissions[p] === "read");
  const parts = [];
  if (w.length) parts.push(w.join(", ") + " (edit)");
  if (r.length) parts.push(r.join(", ") + " (view)");
  return parts.join(" · ") || "No pages";
}
function UsersView({ me }) {
  const [users, setUsers] = useState(null);
  const [open, setOpen] = useState(false); const [edit, setEdit] = useState(null); const [err, setErr] = useState("");
  const blank = { username: "", email: "", name: "", password: "", role: "staff", permissions: defaultNewPerms() };
  const [form, setForm] = useState(blank);
  const load = async () => { const { data } = await api("/users"); setUsers(data); };
  useEffect(() => { load(); }, []);
  const openNew = () => { setEdit(null); setForm(blank); setErr(""); setOpen(true); };
  const openEdit = (u) => { setEdit(u.username); setForm({ username: u.username, email: u.email, name: u.name, password: "", role: u.role, permissions: { ...defaultNewPerms(), ...u.permissions } }); setErr(""); setOpen(true); };
  const save = async () => {
    setErr("");
    try {
      if (edit) await api("/users/" + encodeURIComponent(edit), { method: "PUT", body: { name: form.name, role: form.role, permissions: form.permissions, password: form.password || undefined } });
      else await api("/users", { method: "POST", body: form });
      await load(); setOpen(false); toast(edit ? "User updated" : "User added");
    } catch (e) { setErr(e.message); }
  };
  const del = async (u) => { if (!confirm(`Remove ${u.name || u.username}?`)) return; try { await api("/users/" + encodeURIComponent(u.username), { method: "DELETE" }); load(); toast("User removed", "error"); } catch (e) { alert(e.message); } };
  if (!users) return <div className="section-loader"><div className="loader-ring" /><span>Loading users…</span></div>;
  return (<div>
    <SectionHead title="Users & access" subtitle="Add staff logins and choose what each person can see. New staff can use Sales and Rentals by default; give them more only if needed."
      action={<Btn kind="gold" onClick={openNew}><Plus size={16} /> Add user</Btn>} />
    <TableWrap head={["Name", "Username", "Role", "Access", ""]}>
      {users.map((u) => (<tr key={u.username}>
        <Td>{u.name}</Td><Td>{u.username}</Td>
        <Td>{u.role === "admin" ? <Pill tone="gold">Admin</Pill> : <Pill tone="grey">Staff</Pill>}</Td>
        <Td style={{ whiteSpace: "normal", color: C.muted, fontSize: 13 }}>{accessSummary(u)}</Td>
        <Td><div className="flex gap-2">
          <button aria-label="Edit record" onClick={() => openEdit(u)} style={{ color: C.maroon }}><Pencil size={16} /></button>
          {u.username !== me.username && <button aria-label="Delete record" onClick={() => del(u)} style={{ color: C.red }}><Trash2 size={16} /></button>}
        </div></Td>
      </tr>))}
    </TableWrap>
    {open && (<Modal title={edit ? "Edit user" : "Add user"} onClose={() => setOpen(false)} wide>
      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Field label="Full name"><TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Meena" /></Field>
        <Field label="Email" hint="Used by Supabase to manage this account"><TextInput type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} disabled={!!edit} required /></Field>
        <Field label="Username" hint={edit ? "Can't be changed" : "Used to sign in"}><TextInput value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} disabled={!!edit} placeholder="meena" /></Field>
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Field label={edit ? "New password (optional)" : "Password"}><TextInput type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={12} placeholder={edit ? "leave blank to keep" : "At least 12 characters"} /></Field>
        <Field label="Role"><Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} disabled={edit === me.username}><option value="staff">Staff</option><option value="admin">Admin (full access)</option></Select></Field>
      </div>
      {form.role === "staff" && (<div style={{ background: C.cream, borderRadius: 10, padding: "12px 14px" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginBottom: 8 }}>Page access</div>
        <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
          {PERM_PAGES.map((p) => (<div key={p} className="flex items-center justify-between" style={{ gap: 8 }}>
            <span style={{ fontSize: 14, color: C.ink }}>{p}</span>
            <Select value={form.permissions[p]} onChange={(e) => setForm({ ...form, permissions: { ...form.permissions, [p]: e.target.value } })} style={{ width: 120 }}>
              {PERM_LEVELS.map((l) => <option key={l} value={l}>{l === "none" ? "Hidden" : l === "read" ? "View only" : "Can edit"}</option>)}
            </Select>
          </div>))}
        </div>
      </div>)}
      {form.role === "admin" && <p style={{ color: C.muted, fontSize: 13 }}>Admins can see and edit every page, including this Users page.</p>}
      {err && <div style={{ color: C.red, fontSize: 13, marginTop: 10 }}>{err}</div>}
      <div className="flex justify-end gap-2 mt-3"><Btn kind="ghost" onClick={() => setOpen(false)}>Cancel</Btn><Btn onClick={save}><Check size={16} /> {edit ? "Save changes" : "Create user"}</Btn></div>
    </Modal>)}
  </div>);
}

/* ---------------- login ---------------- */
function Login({ onLogin }) {
  const [u, setU] = useState(""); const [p, setP] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try { const { data } = await api("/login", { method: "POST", body: { username: u, password: p } }); onLogin(data.user); }
    catch (e2) { setErr(e2.message || "Could not sign in."); setBusy(false); }
  };
  return (<div className="login-page">
    <div className="login-theme"><ThemeToggle /></div>
    <div className="login-story"><div className="brand"><span className="brand-mark">w.</span><div>Wabi Sabi<small>SALES &amp; RENTALS</small></div></div><div><span className="eyebrow">LESS ADMIN. MORE POSSIBILITY.</span><h1>Beautiful things.<br />Simply managed.</h1><p>A thoughtful home for your collection, your customers, and every moment in between.</p></div><span className="login-story-footer">Your boutique, beautifully in balance.</span></div>
    <form className="login-form" onSubmit={submit}>
      <span className="brand-mark">w.</span><h2>Welcome back</h2>
      <p className="login-subtitle">Sign in to your Wabi Sabi workspace.</p>
      <Field label="Username"><TextInput value={u} onChange={(e) => setU(e.target.value)} autoComplete="username" required autoFocus /></Field>
      <Field label="Password"><TextInput type="password" autoComplete="current-password" required value={p} onChange={(e) => setP(e.target.value)} /></Field>
      {err && <div style={{ color: C.red, fontSize: 13, marginBottom: 10 }}>{err}</div>}
      <button type="submit" disabled={busy} className={`btn btn-primary full-width ${busy ? 'btn-loading' : ''}`}>{busy ? <><span className="loader-spinner" style={{ width: 16, height: 16 }} /> Signing in…</> : <>Sign in<ArrowRight size={16} /></>}</button>
      <div className="login-note"><Lock size={13} /> Your shop. Your private workspace.</div>
    </form>
  </div>);
}

/* ---------------- shell ---------------- */
const ICONS = { Dashboard: LayoutDashboard, Sales: ShoppingBag, Rentals: CalendarClock, Inventory: Package, Customers: Users, Transactions: ReceiptText, Settings: SettingsIcon, Users: ShieldCheck };
const fontsLink = <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600&display=swap');`}</style>;

function Shell() {
  const [me, setMe] = useState(null);
  const [authed, setAuthed] = useState(true);
  const [db, setDb] = useState(null);
  const [tab, setTab] = useState(null);
  const [initialOpen, setInitialOpen] = useState(false);
  const navigate = (page, create = false) => { setInitialOpen(create); setTab(page); };
  const version = useRef(0);
  const baseline = useRef(null);
  const saving = useRef(false);
  const [sync, setSync] = useState("idle");
  const [loadError, setLoadError] = useState("");
  const clearSession = () => { setAuthed(false); setMe(null); setDb(null); setTab(null); setLoadError(''); baseline.current = null; window.dispatchEvent(new CustomEvent('wabi-user', { detail: null })); };
  useEffect(() => {
    window.addEventListener('wabi-signed-out', clearSession);
    return () => window.removeEventListener('wabi-signed-out', clearSession);
  }, []);

  const loadData = async () => {
    const { data } = await api('/data');
    if (!data.data) throw new Error('Shop data is missing in Supabase.');
    version.current = data.version;
    baseline.current = structuredClone(data.data);
    setDb(data.data);
  };
  useEffect(() => {
    if (!authed) return;
    (async () => {
      try { const { data } = await api("/me"); setMe(data.user); window.dispatchEvent(new CustomEvent('wabi-user', { detail: data.user })); await loadData(); } catch (error) { if (error.status === 401) clearSession(); else setLoadError(error.message); }
    })();
  }, [authed]);

  useEffect(() => {
    if (!authed) return;
    const timer = setInterval(async () => {
      if (saving.current || document.querySelector('[role="dialog"]')) return;
      const previousVersion = version.current;
      try {
        const { data: profile } = await api('/me');
        setMe(profile.user);
        const { data } = await api('/data');
        if (!saving.current && version.current === previousVersion && data.version >= previousVersion) {
          version.current = data.version; baseline.current = structuredClone(data.data); setDb(data.data);
        }
      } catch { /* Keep the last loaded data available during a temporary outage. */ }
    }, 5000);
    return () => clearInterval(timer);
  }, [authed]);

  const allowed = (page) => !me ? false : me.role === "admin" ? true : page === "Settings" ? true : ["read", "write"].includes(me.permissions[page]);
  const canWrite = (page) => !me ? false : me.role === "admin" ? true : me.permissions[page] === "write";
  const dataPages = ["Dashboard", "Sales", "Rentals", "Inventory", "Customers", "Transactions"].filter(allowed);
  const nav = [...dataPages, "Settings", ...(me?.role === "admin" ? ["Users"] : [])];

  useEffect(() => { if (me && (!tab || !nav.includes(tab))) setTab(nav[0] || "Settings"); /* eslint-disable-next-line */ }, [me]);

  const update = async (next) => {
    if (saving.current) return false;
    saving.current = true; setSync("saving");
    const savingToast = toast("Saving…", "loading", true);
    try {
      const baseData = structuredClone(baseline.current || db);
      const { status, data } = await api("/data", { method: "PUT", body: { data: next, baseData, baseVersion: version.current } });
      if (status === 409) { version.current = data.serverVersion; baseline.current = structuredClone(data.server.data); setDb(data.server.data); setSync("error"); alert("Someone changed the same record while you were editing. The latest data was reloaded; please review and save again."); return false; }
      version.current = data.version; baseline.current = structuredClone(data.data); setDb(data.data); setSync("saved"); setTimeout(() => setSync("idle"), 1200);
      return true;
    } catch (error) { setSync("error"); alert(error.message || 'Could not save. Please try again.'); return false; }
    finally { saving.current = false; dismissToast(savingToast); }
  };
  const signOut = async () => { try { await api('/logout', { method: 'POST', body: {} }); clearSession(); } catch (error) { alert(error.message); } };

  if (!authed) return <>{fontsLink}<Login onLogin={(u) => { setLoadError(''); setMe(u); setAuthed(true); window.dispatchEvent(new CustomEvent('wabi-user', { detail: u })); }} /></>;
  if (loadError) return <div className="p-8" role="alert">Could not load your shop: {loadError} <Btn onClick={() => location.reload()}>Retry</Btn></div>;
  if (!db || !me || !tab) return <div className="shop-loader">{fontsLink}<div className="loader-brand"><span className="loader-mark">w.</span></div><div className="loader-text"><strong>Wabi Sabi</strong><p>Loading your shop…</p></div><div className="loader-spinner" /><div className="loader-shimmer" /></div>;

  let View;
  if (tab === "Users") View = UsersView;
  else { const map = { Dashboard, Sales: SalesView, Rentals: RentalsView, Inventory: InventoryView, Customers: CustomersView, Transactions: TransactionsView, Settings: SettingsView }; View = map[tab]; }
  const SyncBadge = () => {
    const m = { idle: null, saving: ["Saving…", C.muted, Cloud, "sync-saving"], saved: ["Saved", C.green, Cloud, "sync-saved"], error: ["Not saved", C.red, CloudOff, ""] }[sync];
    if (!m) return null; const [txt, col, Icon, anim] = m;
    return <span className={`flex items-center gap-1 ${anim}`} style={{ color: col, fontSize: 12, fontWeight: 600 }}><Icon size={14} /> {txt}</span>;
  };
  const NavBtn = ({ name }) => {
    const Icon = ICONS[name]; const active = tab === name; return (
      <button onClick={() => navigate(name)} className={`nav-button ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined}>
        <Icon size={18} /> <span>{name}</span>{active && <span className="nav-active-dot" />}
      </button>);
  };

  return (<div className="app-shell">
    <ToastContainer />
    {fontsLink}
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">w.</span><div>Wabi Sabi<small>SALES &amp; RENTALS</small></div></div>
      <div className="workspace-badge"><span className="workspace-initial">W</span><div>Your workspace<small>{db.settings.shopName || 'Wabi Sabi'} boutique</small></div><ChevronRight size={14} /></div>
      <nav><div className="nav-label">WORKSPACE</div>{dataPages.map(n => <NavBtn key={n} name={n} />)}<div className="nav-label management-label">MANAGE</div>{nav.filter(n => !dataPages.includes(n)).map(n => <NavBtn key={n} name={n} />)}</nav>
      <div className="sidebar-note"><Sparkles size={19} /><strong>A little less busywork.</strong><p>More time for what you love.</p></div>
      <div className="sidebar-profile"><span className="avatar">{(me.name || me.username).slice(0, 1).toUpperCase()}</span><div><strong>{me.name || me.username}</strong><small>{me.role === 'admin' ? 'Administrator' : 'Team member'}</small></div><button onClick={signOut} aria-label="Sign out" title="Sign out"><LogOut size={18} /></button></div>
    </aside>
    <div className="app-content">
      <header className="topbar"><div className="breadcrumb"><span>Workspace</span><ChevronRight size={14} /><strong>{tab}</strong></div><div className="topbar-actions"><SyncBadge /><span className="today-label">{new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</span><ThemeToggle /><span className="avatar small-avatar">{(me.name || me.username).slice(0, 1).toUpperCase()}</span><button className="mobile-signout" onClick={signOut} aria-label="Sign out"><LogOut size={17} /></button></div></header>
      <nav className="mobile-nav" aria-label="Mobile navigation">{nav.map(n => <NavBtn key={n} name={n} />)}</nav>
      <main>
        <View key={tab} db={db} update={update} me={me} onSignOut={signOut} canWrite={canWrite(tab)} initialOpen={initialOpen} onNavigate={navigate} canAccess={allowed} canCreate={canWrite} onNotify={toast} metrics={{ today, monthOf, allTx, inr, saleBalance, rentalCharges, rentalDeposit, available, saleTotal, itemById, rentalStatus }} />
      </main>
    </div>
  </div>);
}

createRoot(document.getElementById("root")).render(<ThemeProvider><Shell /></ThemeProvider>);
