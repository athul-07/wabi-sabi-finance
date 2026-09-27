import React, { useState } from 'react';
import { ArrowUpRight, ArrowDownLeft, Wallet, TrendingUp, CircleDollarSign, ShoppingBag, CalendarClock, Package, ArrowRight, Plus, ReceiptText, Banknote, Smartphone, Landmark, CreditCard, FileText } from 'lucide-react';

function PaymentMethods({ transactions, month, monthOf, inr }) {
  const methods = [
    { name: 'Cash', Icon: Banknote },
    { name: 'UPI', Icon: Smartphone },
    { name: 'Bank Transfer', Icon: Landmark },
    { name: 'Card', Icon: CreditCard },
    { name: 'Cheque', Icon: FileText },
  ];
  return <section className="panel payment-panel">
    <div className="panel-heading"><div><h3>Payment methods</h3><p>Monthly income, expenses, and balance by payment method</p></div><Wallet size={18} className="muted" /></div>
    <div className="payment-grid">{methods.map(({ name, Icon }) => {
      const rows = transactions.filter(t => monthOf(t.date) === month && t.mode === name);
      const received = rows.filter(t => t.type === 'Income').reduce((n, t) => n + Number(t.amount || 0), 0);
      const spent = rows.filter(t => t.type === 'Expense').reduce((n, t) => n + Number(t.amount || 0), 0);
      return <div key={name}><span className="payment-method-label"><Icon size={16} aria-hidden="true" />{name}</span><strong>{inr(received - spent)}</strong><p>In {inr(received)} · Out {inr(spent)}</p></div>;
    })}</div>
  </section>;
}

export default function Overview({ db, me, onNavigate, canAccess, canCreate, metrics }) {
  const { today, monthOf, allTx, inr, saleBalance, rentalCharges, rentalDeposit, available, saleTotal, itemById, rentalStatus } = metrics;
  const [month, setMonth] = useState(monthOf(today()));
  const [day, setDay] = useState(today());
  const tx = allTx(db);
  const dailyRows = tx.filter(t => (t.date || '').slice(0, 10) === day).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const dailyIncome = dailyRows.filter(t => t.type === 'Income').reduce((n, t) => n + Number(t.amount || 0), 0);
  const dailyExpense = dailyRows.filter(t => t.type === 'Expense').reduce((n, t) => n + Number(t.amount || 0), 0);
  const dailyModeTotals = mode => {
    const rows = dailyRows.filter(t => t.mode === mode);
    const income = rows.filter(t => t.type === 'Income').reduce((n, t) => n + Number(t.amount || 0), 0);
    const expense = rows.filter(t => t.type === 'Expense').reduce((n, t) => n + Number(t.amount || 0), 0);
    return { income, expense, net: income - expense };
  };
  const dailyCash = dailyModeTotals('Cash');
  const dailyUpi = dailyModeTotals('UPI');
  const sum = (type, period = month) => tx.filter(t => t.type === type && monthOf(t.date) === period).reduce((n, t) => n + Number(t.amount || 0), 0);
  const income = sum('Income'), expense = sum('Expense');
  const receivable = db.sales.reduce((n, s) => n + saleBalance(s), 0) + db.rentals.reduce((n, r) => n + Math.max(0, rentalCharges(db, r) - Number(r.received || 0)), 0);
  const units = db.inventory.reduce((n, i) => n + available(db, i), 0);
  const held = db.rentals.reduce((n, r) => n + Math.max(0, rentalDeposit(db, r) - Number(r.damage || 0) - Number(r.depositRefunded || 0)), 0);
  const investment = db.inventory.reduce((n, i) => n + Number(i.purchaseCost || 0) + Number(i.cleaning || 0) + Number(i.repair || 0), 0);
  const profit = db.sales.filter(s => monthOf(s.date) === month).reduce((n, s) => n + saleTotal(s) - Number(itemById(db, s.itemId)?.purchaseCost || 0) * Number(s.qty || 1), 0);
  const catIncome = category => tx.filter(t => t.type === 'Income' && t.category === category && monthOf(t.date) === month).reduce((n, t) => n + Number(t.amount || 0), 0);
  const salesIncome = catIncome('Sales'), rentalIncome = catIncome('Rentals');
  const otherIncome = Math.max(0, income - salesIncome - rentalIncome);
  const [year, mon] = month.split('-').map(Number);
  const months = Array.from({ length: 6 }, (_, i) => {
    const date = new Date(year, mon - 6 + i, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    return { key, label: date.toLocaleDateString('en-IN', { month: 'short' }), income: sum('Income', key), expense: sum('Expense', key) };
  });
  const max = Math.max(100, ...months.flatMap(m => [m.income, m.expense]));
  const recent = tx.filter(t => monthOf(t.date) === month).sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 5);
  const states = ['Overdue', 'Out', 'Booked', 'Returned'].map(status => ({ status, count: db.rentals.filter(r => rentalStatus(r) === status).length }));
  const overdue = states[0].count;
  const firstName = (me?.name || 'there').split(' ')[0];
  const monthLabel = new Date(year, mon - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const moneyShort = n => n >= 100000 ? `₹${+(n / 100000).toFixed(1)}L` : n >= 1000 ? `₹${+(n / 1000).toFixed(1)}k` : `₹${Math.round(n)}`;
  const cards = [
    { label: 'Total income', value: income, icon: ArrowUpRight, color: 'green', caption: 'Payments received this month' },
    { label: 'Total expenses', value: expense, icon: ArrowDownLeft, color: 'orange', caption: 'Expenses recorded this month' },
    { label: 'Net cash flow', value: income - expense, icon: Wallet, color: 'purple', caption: 'Income less expenses' },
    { label: 'Amount receivable', value: receivable, icon: CircleDollarSign, color: 'blue', caption: 'Outstanding across all orders' },
  ];
  return <div className="overview">
    <div className="section-head dashboard-heading"><div><div className="eyebrow">YOUR BUSINESS, AT A GLANCE</div><h2>Dashboard</h2><p>Welcome back, {firstName}. Here’s how your shop is doing.</p></div><label className="month-picker"><CalendarClock size={16} /><span className="sr-only">Dashboard month</span><input aria-label="Dashboard month" type="month" value={month} onChange={e => e.target.value && setMonth(e.target.value)} /></label></div>
    <div className="welcome-banner"><div className="banner-copy"><span className="banner-icon"><ShoppingBag size={25} /></span><div><h3>A little order. More room to create.</h3><p>Keep your sales, rentals, and beautiful things in sync.</p></div></div><div className="banner-actions">{canCreate('Sales') && <button className="btn btn-primary" onClick={() => onNavigate('Sales', true)}><Plus size={16} /> New sale</button>}{canCreate('Rentals') && <button className="btn btn-ghost" onClick={() => onNavigate('Rentals', true)}>New rental <ArrowUpRight size={16} /></button>}</div></div>
    <div className="metric-grid">{cards.map(({ label, value, icon: Icon, color, caption }) => <article className="metric-card" key={label}><div className="metric-top"><span>{label}</span><span className={`metric-icon ${color}`}><Icon size={19} /></span></div><strong>{inr(value)}</strong><p>{caption}</p></article>)}</div>
    <PaymentMethods transactions={tx} month={month} monthOf={monthOf} inr={inr} />
    <section className="panel daily-transactions">
      <div className="panel-heading">
        <div><h3>Daily transactions</h3><p>{new Date(`${day}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · {dailyRows.length} entries</p></div>
        <label className="month-picker"><CalendarClock size={16} /><span className="sr-only">Dashboard day</span><input aria-label="Dashboard day" type="date" value={day} onChange={e => setDay(e.target.value)} /></label>
      </div>
      <div className="daily-summary">
        <div><span>Daily income</span><strong>{inr(dailyIncome)}</strong></div>
        <div><span>Daily expenses</span><strong>{inr(dailyExpense)}</strong></div>
        <div><span>Net for day</span><strong>{inr(dailyIncome - dailyExpense)}</strong></div>
        <div><span>Cash</span><strong>{inr(dailyCash.net)}</strong><small>In {inr(dailyCash.income)} · Out {inr(dailyCash.expense)}</small></div>
        <div><span>UPI</span><strong>{inr(dailyUpi.net)}</strong><small>In {inr(dailyUpi.income)} · Out {inr(dailyUpi.expense)}</small></div>
      </div>
      {dailyRows.length ? <div className="activity-list">{dailyRows.map(t => <div className="activity-row" key={t.id}><span className={`metric-icon ${t.type === 'Income' ? 'green' : 'orange'}`}>{t.type === 'Income' ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}</span><div className="activity-copy"><strong>{t.desc || t.category || t.type}</strong><span>{t.party || t.category} · {t.date}</span></div><div className="activity-amount"><strong style={{ color: t.type === 'Income' ? 'var(--green)' : 'var(--ink)' }}>{t.type === 'Income' ? '+' : '−'}{inr(t.amount)}</strong><span>{t.mode || 'Unspecified'}</span></div></div>)}</div> : <div className="empty-state"><span className="empty-icon"><ReceiptText size={24} /></span><strong>No transactions on this date</strong><p>Payments and expenses for the selected date will appear here.</p></div>}
    </section>
    <div className="dashboard-charts">
      <section className="panel cash-panel"><div className="panel-heading"><div><h3>Cash flow overview</h3><p>Income and expenses over the last six months</p></div><span className="subtle-tag">6 months</span></div><div className="chart-legend"><span><i className="income-dot" />Income</span><span><i className="expense-dot" />Expenses</span></div>
        <svg className="cash-chart" viewBox="0 0 640 235" role="img" aria-label={`Monthly income and expenses ending ${monthLabel}`}>
          {[0, 1, 2, 3].map(i => <g key={i}><line x1="62" x2="628" y1={20 + i * 55} y2={20 + i * 55} stroke="var(--line)" strokeDasharray="4 5" /><text x="0" y={24 + i * 55} fill="var(--muted)" fontSize="11">{moneyShort(max * (1 - i / 3))}</text></g>)}
          {months.map((m, i) => <g key={m.key}><rect x={91 + i * 90} y={185 - m.income / max * 165} width="20" height={m.income / max * 165} rx="4" fill="var(--chart-income)"><title>{m.label} income: {inr(m.income)}</title></rect><rect x={117 + i * 90} y={185 - m.expense / max * 165} width="20" height={m.expense / max * 165} rx="4" fill="var(--chart-expense)"><title>{m.label} expenses: {inr(m.expense)}</title></rect><text x={115 + i * 90} y="219" textAnchor="middle" fill="var(--muted)" fontSize="12">{m.label}</text></g>)}
        </svg>
        <div className="chart-footer"><span>{months.some(m => m.income || m.expense) ? 'Based on your recorded transactions' : 'No payments or expenses recorded in this period'}</span><strong>{monthLabel}</strong></div>
      </section>
      <section className="panel"><div className="panel-heading"><div><h3>Income breakdown</h3><p>{monthLabel}</p></div><TrendingUp size={18} className="muted" /></div><div className="income-donut" style={{ background: income ? `conic-gradient(var(--chart-income) 0 ${salesIncome / income * 100}%, var(--chart-expense) ${salesIncome / income * 100}% ${(salesIncome + rentalIncome) / income * 100}%, var(--gold) ${(salesIncome + rentalIncome) / income * 100}% 100%)` : 'var(--line)' }} role="img" aria-label={`Income: sales ${inr(salesIncome)}, rentals ${inr(rentalIncome)}, other ${inr(otherIncome)}`}><div><span>Total income</span><strong>{inr(income)}</strong></div></div><div className="breakdown-list">{[['Sales', salesIncome, 'income-dot'], ['Rentals', rentalIncome, 'expense-dot'], ['Other income', otherIncome, 'other-dot']].map(([label, value, color]) => <div key={label}><span><i className={color} />{label}</span><strong>{inr(value)}</strong></div>)}</div></section>
    </div>
    <div className="stock-strip"><div><span className="metric-icon purple"><Package size={20} /></span><div><strong>{units} <span>units available</span></strong><p>{db.inventory.length} items in your collection</p></div></div><div><span>Deposits held</span><strong>{inr(held)}</strong></div><div><span>Stock investment</span><strong>{inr(investment)}</strong></div><div><span>Sales gross profit · this month</span><strong>{inr(profit)}</strong></div>{canAccess('Inventory') && <button className="text-link" onClick={() => onNavigate('Inventory')}>View inventory <ArrowRight size={15} /></button>}</div>
    <div className="dashboard-charts dashboard-bottom">
      <section className="panel recent-panel"><div className="panel-heading"><div><h3>Recent transactions</h3><p>The latest activity in {monthLabel}</p></div>{canAccess('Transactions') && <button className="text-link" onClick={() => onNavigate('Transactions')}>View all <ArrowUpRight size={15} /></button>}</div>{recent.length ? <div className="activity-list">{recent.map(t => <div className="activity-row" key={t.id}><span className={`metric-icon ${t.type === 'Income' ? 'green' : 'orange'}`}>{t.type === 'Income' ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}</span><div className="activity-copy"><strong>{t.desc || t.category || t.type}</strong><span>{t.party || t.category} · {t.date}</span></div><div className="activity-amount"><strong style={{ color: t.type === 'Income' ? 'var(--green)' : 'var(--ink)' }}>{t.type === 'Income' ? '+' : '−'}{inr(t.amount)}</strong><span>{t.mode || 'Unspecified'}</span></div></div>)}</div> : <div className="empty-state"><span className="empty-icon"><ReceiptText size={24} /></span><strong>A fresh page for your business</strong><p>Your payments and expenses will appear here.</p></div>}</section>
      <section className="panel"><div className="panel-heading"><div><h3>Rentals &amp; returns</h3><p>Stay on top of your collection</p></div><CalendarClock size={18} className="muted" /></div><div className={`rental-notice ${overdue ? 'needs-attention' : ''}`}><span className={`metric-icon ${overdue ? 'orange' : 'green'}`}><CalendarClock size={18} /></span><div><strong>{overdue ? `${overdue} overdue rental${overdue > 1 ? 's' : ''}` : 'All caught up'}</strong><p>{overdue ? 'Follow up on these returns.' : 'No overdue returns to chase.'}</p></div></div><div className="rental-states">{states.map(({ status, count }) => <div key={status}><span><i className={`state-dot state-${status.toLowerCase()}`} />{status === 'Out' ? 'Rented out' : status}</span><strong>{count}</strong></div>)}</div>{canAccess('Rentals') && <button className="btn btn-ghost full-width" onClick={() => onNavigate('Rentals')}>Manage rentals <ArrowRight size={15} /></button>}</section>
    </div>
    <footer className="dashboard-footer"><span>Wabi Sabi · Made for the way you work.</span><span>All amounts in INR</span></footer>
  </div>;
}
