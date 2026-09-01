export const PERIODS = [['today', 'Today'], ['all', 'All Time'], ['1m', 'Last 1 Month'], ['2m', 'Last 2 Months'], ['6m', 'Last 6 Months'], ['1y', 'Last Year'], ['custom', 'Custom Range']]
export const money = (value) => Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const integer = (value) => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })
export const dateInput = (date) => { const year = date.getFullYear(); const month = String(date.getMonth() + 1).padStart(2, '0'); const day = String(date.getDate()).padStart(2, '0'); return `${year}-${month}-${day}` }
export function defaultRange() { const to = new Date(); const from = new Date(); from.setDate(from.getDate() - 29); return { from: dateInput(from), to: dateInput(to) } }
