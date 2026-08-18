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

function row(label, value, strong = false) {
  return `<div class="row${strong ? ' strong' : ''}"><span>${esc(label)}</span><span>${esc(value)}</span></div>`;
}

function renderShiftReceiptPage(details, options = {}) {
  const { shift, summary, shop } = details;
  const durationMs = Math.max(0, new Date(shift.end_time).getTime() - new Date(shift.start_time).getTime());
  const durationMinutes = Math.round(durationMs / 60000);
  const duration = `${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60}m`;
  const discrepancy = Number(shift.closing_balance || 0) - Number(summary.expected_balance || 0);
  const result = Math.abs(discrepancy) <= 0.01 ? 'BALANCED' : discrepancy > 0 ? `OVER +Rs. ${money(discrepancy)}` : `SHORT -Rs. ${money(Math.abs(discrepancy))}`;
  const autoPrint = options.autoPrint !== false;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Shift ${shift.id} Z Report</title><style>
    @page{size:74mm auto;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;width:74mm;background:#fff;color:#000}body{font-family:'Courier New',Courier,monospace}.receipt{width:74mm;padding:3mm;font-size:12px;font-weight:600;line-height:1.3;color:#000;background:#fff;text-rendering:optimizeLegibility;-webkit-print-color-adjust:exact;print-color-adjust:exact}.center{text-align:center}.title{font-size:18px;font-weight:900}.subtitle{font-size:14px;font-weight:900;margin-top:2px}.rule{border-top:1px dashed #000;margin:7px 0}.heavy{border-top:2px solid #000}.row{display:flex;justify-content:space-between;gap:8px;padding:2px 0}.row span:first-child{flex:1}.row span:last-child{text-align:right;font-weight:800}.strong{font-size:14px;font-weight:900}.section{font-weight:900;text-align:center;margin:7px 0 3px}.result{border:2px solid #000;padding:7px;text-align:center;font-size:15px;font-weight:900;margin:8px 0}.note{white-space:pre-wrap;overflow-wrap:anywhere;font-weight:600}.footer{text-align:center;font-size:10px;font-weight:600;margin-top:10px}@media print{html,body{width:74mm}.receipt{width:100%;margin:0}}
  </style></head><body><main class="receipt">
    <div class="center"><div class="title">${esc(shop?.name || 'RESTAURANT')}</div><div class="subtitle">REGISTER SHIFT CLOSE</div><div>Z REPORT #${esc(shift.id)}</div></div>
    <div class="rule heavy"></div>
    ${row('Shift started by', shift.cashier_name || shift.cashier_username || `User #${shift.user_id}`)}
    ${row('Started', dateTime(shift.start_time))}
    ${row('Closed by', shift.closed_by_name || `User #${shift.closed_by_user_id}`)}
    ${row('Closed', dateTime(shift.end_time))}
    ${row('Duration', duration)}
    ${shift.terminal_id ? row('Terminal', shift.terminal_id) : ''}
    <div class="rule"></div><div class="section">PAYMENT SUMMARY</div>
    ${row('Orders in shift', Array.isArray(details.sales) ? details.sales.length : 0)}
    ${row('Cash sales', `Rs. ${money(summary.net_cash_sales)}`)}
    ${row('Card sales', `Rs. ${money(summary.net_card_sales)}`)}
    ${row('Online sales', `Rs. ${money(summary.net_online_sales)}`)}
    ${row('Cash due collections', `Rs. ${money(summary.debt_collections)}`)}
    ${row('Card due collections', `Rs. ${money(summary.card_collections)}`)}
    ${row('Online due collections', `Rs. ${money(summary.online_collections)}`)}
    ${row('Cash refunds', `- Rs. ${money(summary.total_cash_refunds)}`)}
    ${row('Refund transactions', Array.isArray(details.returns) ? details.returns.length : 0)}
    ${row('Business expenses', `Rs. ${money(summary.total_expenses)}`)}
    <div class="rule"></div><div class="section">CASH MOVEMENT</div>
    ${row('Opening cash', `Rs. ${money(summary.opening_balance)}`)}
    ${row('Verified cash drops', `- Rs. ${money(summary.cash_drops)}`)}
    ${row('Verified handovers', `- Rs. ${money(summary.cash_handovers)}`)}
    ${Number(summary.pending_verification_total || 0) ? row('Pending verification', `- Rs. ${money(summary.pending_verification_total)}`) : ''}
    <div class="rule heavy"></div>
    ${row('EXPECTED CASH', `Rs. ${money(summary.expected_balance)}`, true)}
    ${row('ACTUAL CASH', `Rs. ${money(shift.closing_balance)}`, true)}
    <div class="result">${esc(result)}</div>
    ${shift.note ? `<div class="section">CLOSING NOTE</div><div class="note">${esc(shift.note)}</div>` : ''}
    ${shift.shortage_reason ? `<div class="section">DISCREPANCY REASON</div><div class="note">${esc(shift.shortage_reason)}</div>` : ''}
    <div class="rule"></div><div class="footer">Printed ${esc(dateTime(new Date()))}<br>End of shift report</div>
  </main><script>window.receiptReady=true;${autoPrint ? "setTimeout(function(){window.focus();window.print()},200);" : ''}</script></body></html>`;
}

module.exports = { renderShiftReceiptPage };
