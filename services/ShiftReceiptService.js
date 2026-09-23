function esc(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function money(value) {
  return Number(value || 0).toFixed(2);
}

function dateTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Karachi' });
}

function dateOnly(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('en-PK', { dateStyle: 'medium', timeZone: 'Asia/Karachi' });
}

function row(label, value, strong = false) {
  return `<div class="row${strong ? ' strong' : ''}"><span>${esc(label)}</span><span>${esc(value)}</span></div>`;
}

function renderShiftReceiptPage(details, options = {}) {
  const { shift, summary, shop } = details;
  const sales = Array.isArray(details.sales) ? details.sales : [];
  const ledgerEntries = Array.isArray(details.ledgerEntries) ? details.ledgerEntries : [];
  const cashDrops = Array.isArray(details.cashDrops) ? details.cashDrops : [];
  const orderLabel = sale => sale ? `#${sale.order_number || sale.id}` : '-';
  const currency = shop?.currency && shop.currency !== 'PKR' ? shop.currency : 'Rs.';
  const durationMs = Math.max(0, new Date(shift.end_time).getTime() - new Date(shift.start_time).getTime());
  const durationMinutes = Math.round(durationMs / 60000);
  const duration = `${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60}m`;
  const expectedClosing = shift.status === 'closed' && shift.expected_balance != null
    ? Number(shift.expected_balance)
    : Number(summary.expected_balance || 0);
  const discrepancy = Number(shift.closing_balance || 0) - expectedClosing;
  const result = Math.abs(discrepancy) <= 0.01 ? 'BALANCED' : discrepancy > 0 ? `OVER +${currency} ${money(discrepancy)}` : `SHORT -${currency} ${money(Math.abs(discrepancy))}`;
  const paidBySale = ledgerEntries.reduce((totals, entry) => {
    if (entry.type === 'payment') totals[entry.sale_id] = Number(totals[entry.sale_id] || 0) + Number(entry.amount || 0);
    return totals;
  }, {});
  const pendingBills = sales.map(sale => {
    const directPaid = Math.min(Number(sale.total || 0), Number(sale.amount_received || 0));
    const outstanding = Math.max(0, Number(sale.total || 0) - directPaid - Number(paidBySale[sale.id] || 0));
    return { ...sale, outstanding };
  }).filter(sale => sale.order_status === 'payment_pending' || sale.outstanding > 0.01);
  const verifiedDrops = cashDrops.filter(drop => drop.status === 'verified');
  const dropReasons = verifiedDrops.map(drop => drop.note).filter(Boolean);
  const cashBeforeDrop = Number(summary.opening_balance || 0)
    + Number(summary.net_cash_sales || 0)
    + Number(summary.debt_collections || 0)
    + Number(summary.cash_tips || 0)
    - Number(summary.total_cash_refunds || 0);
  const autoPrint = options.autoPrint !== false;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Shift ${shift.id} Z Report</title><style>
    @page{size:74mm auto;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;width:74mm;background:#fff;color:#000}body{font-family:'Courier New',Courier,monospace}.receipt{width:74mm;padding:3mm;font-size:12px;font-weight:600;line-height:1.3;color:#000;background:#fff;text-rendering:optimizeLegibility;-webkit-print-color-adjust:exact;print-color-adjust:exact}.center{text-align:center}.title{font-size:18px;font-weight:900}.subtitle{font-size:14px;font-weight:900;margin-top:2px}.rule{border-top:1px dashed #000;margin:7px 0}.heavy{border-top:2px solid #000}.row{display:flex;justify-content:space-between;gap:8px;padding:2px 0}.row span:first-child{flex:1}.row span:last-child{text-align:right;font-weight:800}.strong{font-size:14px;font-weight:900}.section{font-weight:900;text-align:center;margin:7px 0 3px}.result{border:2px solid #000;padding:7px;text-align:center;font-size:15px;font-weight:900;margin:8px 0}.note{white-space:pre-wrap;overflow-wrap:anywhere;font-weight:600}.footer{text-align:center;font-size:10px;font-weight:600;margin-top:10px}@media print{html,body{width:74mm}.receipt{width:100%;margin:0}}
  </style></head><body><main class="receipt">
    <div class="center"><div class="title">${esc(shop?.name || 'RESTAURANT')}</div><div class="subtitle">CASHIER SHIFT SUMMARY</div></div>
    <div class="rule heavy"></div>
    ${row('Cashier', shift.cashier_name || shift.cashier_username || `User #${shift.user_id}`)}
    ${row('Date', dateOnly(shift.start_time))}
    ${row('Shift', `#${shift.id}`)}
    ${row('Started', dateTime(shift.start_time))}
    ${row('Closed', dateTime(shift.end_time))}
    ${row('Duration', duration)}
    ${shift.terminal_id ? row('Terminal', shift.terminal_id) : ''}
    ${row('Opening petty cash', `${currency} ${money(summary.opening_balance)}`, true)}
    <div class="rule"></div><div class="section">ORDERS &amp; SALES</div>
    ${row('Total orders', summary.total_orders)}
    ${row('Cash orders', summary.cash_orders)}
    ${row('Cash sales (excl. tax)', `${currency} ${money(summary.cash_sales_ex_tax)}`)}
    ${row('Cash tax', `${currency} ${money(summary.cash_tax)}`)}
    ${row('Card orders', summary.card_orders)}
    ${row('Card sales (excl. tax)', `${currency} ${money(summary.card_sales_ex_tax)}`)}
    ${row('Card tax', `${currency} ${money(summary.card_tax)}`)}
    ${row('Online orders', summary.online_orders)}
    ${row('Online sales (excl. tax)', `${currency} ${money(summary.online_sales_ex_tax)}`)}
    ${row('Online tax', `${currency} ${money(summary.online_tax)}`)}
    <div class="rule"></div><div class="section">UNPAID / PENDING BILLS</div>
    ${pendingBills.length
      ? pendingBills.map(sale => row(orderLabel(sale), `${currency} ${money(sale.outstanding || sale.total)}`)).join('')
      : '<div class="center">None</div>'}
    <div class="rule"></div>
    ${row('Total sales (excl. tax)', `${currency} ${money(summary.total_sales_ex_tax)}`, true)}
    ${row('Total tax', `${currency} ${money(summary.total_tax)}`, true)}
    ${row('Total collected (sales + tax)', `${currency} ${money(summary.total_sales_collected)}`, true)}
    <div class="rule"></div><div class="section">TIPS — SEPARATE FROM SALES</div>
    ${row('Cash tips', `${currency} ${money(summary.cash_tips)}`)}
    ${row('Card tips', `${currency} ${money(summary.card_tips)}`)}
    ${row('Online tips', `${currency} ${money(summary.online_tips)}`)}
    ${row('Total tips', `${currency} ${money(summary.total_tips)}`, true)}
    <div class="rule"></div><div class="section">CASH DRAWER</div>
    ${row('Opening petty cash', `${currency} ${money(summary.opening_balance)}`)}
    ${row('Cash collected (sales + tax)', `${currency} ${money(summary.net_cash_sales)}`)}
    ${row('Cash due collections', `${currency} ${money(summary.debt_collections)}`)}
    ${row('Cash refunds', `- ${currency} ${money(summary.total_cash_refunds)}`)}
    ${row('Cash tips', `${currency} ${money(summary.cash_tips)}`)}
    ${row('Cash before drop', `${currency} ${money(cashBeforeDrop)}`, true)}
    ${row('Cash drop', `- ${currency} ${money(summary.cash_drops)}`)}
    ${row('Cash drop reason', dropReasons.length ? dropReasons.join('; ') : '-')}
    ${row('Verified handovers', `- ${currency} ${money(summary.cash_handovers)}`)}
    ${Number(summary.pending_verification_total || 0) ? row('Pending verification', `- ${currency} ${money(summary.pending_verification_total)}`) : ''}
    <div class="rule heavy"></div>
    ${row('Expected closing cash', `${currency} ${money(expectedClosing)}`, true)}
    ${row('Actual closing cash', `${currency} ${money(shift.closing_balance)}`, true)}
    ${row('Difference (over/short)', `${currency} ${money(discrepancy)}`, true)}
    <div class="result">${esc(result)}</div>
    <div class="rule"></div><div class="section">ORDER RANGE</div>
    ${row('First order #', orderLabel(sales[0]))}
    ${row('Last order #', orderLabel(sales[sales.length - 1]))}
    <div class="rule"></div><div class="section">OTHER RECONCILIATION</div>
    ${row('Cash due collections', `${currency} ${money(summary.debt_collections)}`)}
    ${row('Card due collections', `${currency} ${money(summary.card_collections)}`)}
    ${row('Online due collections', `${currency} ${money(summary.online_collections)}`)}
    ${row('Cash refunds', `- ${currency} ${money(summary.total_cash_refunds)}`)}
    ${row('Card refunds', `- ${currency} ${money(summary.total_card_refunds)}`)}
    ${row('Online refunds', `- ${currency} ${money(summary.total_online_refunds)}`)}
    ${row('Refund transactions', Array.isArray(details.returns) ? details.returns.length : 0)}
    ${row('Business expenses', `- ${currency} ${money(summary.total_expenses)}`)}
    ${row('EXPECTED TOTAL', `${currency} ${money(summary.expected_total)}`, true)}
    ${row('EXPECTED CARD', `${currency} ${money(summary.expected_card)}`)}
    ${row('EXPECTED ONLINE', `${currency} ${money(summary.expected_online)}`)}
    ${shift.note ? `<div class="section">CLOSING NOTE</div><div class="note">${esc(shift.note)}</div>` : ''}
    ${shift.shortage_reason ? `<div class="section">DISCREPANCY REASON</div><div class="note">${esc(shift.shortage_reason)}</div>` : ''}
    <div class="rule"></div><div class="footer">Printed ${esc(dateTime(new Date()))}<br>End of shift report</div>
  </main><script>window.receiptReady=true;${autoPrint ? "setTimeout(function(){window.focus();window.print()},200);" : ''}</script></body></html>`;
}

module.exports = { renderShiftReceiptPage };
