// Read-only selector bounds. Tip collection timestamps, amounts and shifts are unchanged.
const invalid = message => Object.assign(new Error(message), { status: 400 });
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function shiftDate(value, days) {
  const date = new Date(value + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function getTipOrderDateRange(filters = {}, now = new Date()) {
  const period = filters.period || 'today';
  if (!['today', 'yesterday', '2days', 'all', 'custom'].includes(period)) throw invalid('Invalid order date filter.');
  if (period === 'all') return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now).map(part => [part.type, part.value]));
  const today = parts.year + '-' + parts.month + '-' + parts.day;
  let from = today;
  let to = today;
  if (period === 'yesterday' || period === '2days') from = shiftDate(today, -1);
  if (period === 'yesterday') to = from;
  if (period === 'custom') {
    if (!validDate(filters.from) || !validDate(filters.to)) throw invalid('Choose valid start and end dates.');
    if (filters.from > filters.to) throw invalid('Start date must be on or before end date.');
    from = filters.from;
    to = filters.to;
  }
  // Inclusive local calendar dates, exclusive next-midnight endpoint.
  return {
    start: new Date(from + 'T00:00:00+05:00').toISOString(),
    end: new Date(shiftDate(to, 1) + 'T00:00:00+05:00').toISOString()
  };
}
module.exports = { getTipOrderDateRange };

