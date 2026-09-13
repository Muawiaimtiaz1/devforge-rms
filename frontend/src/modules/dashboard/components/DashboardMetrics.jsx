import { integer, money } from '../dashboard.utils'
const ITEMS = (data) => [
  ['Tips Collected', `Rs. ${money(data.totalTipsCollected)}`, 'Collected in selected period', 'emerald', 'Shop-wide tips, separate from sales revenue and partner profit. Includes cash, card, and online tips.'],
  ['Gross Sales', `Rs. ${money(data.summary?.grossSales)}`, `${integer(data.totalSales)} completed order${Number(data.totalSales) === 1 ? '' : 's'}`, 'blue', 'Completed order totals before subtracting return refunds.'],
  ['Refunds', `Rs. ${money(data.summary?.totalRefunds)}`, 'Return invoices in selected period', 'rose', 'Refund value recognized on the return date.'],
  ['Net Revenue', `Rs. ${money(data.totalRevenue)}`, 'Gross sales minus refunds', 'blue', 'Completed-order sales less refunds recorded in the selected period.'],
  ['Payments Received', `Rs. ${money(data.totalPaymentsReceived)}`, `${(data.staffPerformance || []).length} receiver${(data.staffPerformance || []).length === 1 ? '' : 's'}`, 'emerald', 'Money marked received, attributed to the staff member who confirmed it.'],
  ['Pending Dues', `Rs. ${money(data.totalPendingDues)}`, `${integer(data.pendingDuesCount)} bill${Number(data.pendingDuesCount) === 1 ? '' : 's'} pending`, 'amber', 'Unpaid balance on completed bills.'],
  ['Cost of Goods Sold', `Rs. ${money(data.totalCOGS)}`, 'Sum of buying prices', 'purple', 'Buying cost of sold items, reduced by returned-item cost.'],
  ['Shop Profit', `Rs. ${money(data.shopProfit ?? data.partnerProfitPool ?? data.netProfit)}`, 'Sum of partner shares', 'emerald', 'Revenue minus COGS and damage/loss.'],
  ['Waste / Damage', `Rs. ${money(data.damageTotal)}`, 'Recorded in selected period', 'rose', 'Cost of dated waste events recorded in the selected period.'],
  ['Products', integer(data.totalProducts), 'in catalog', 'amber', 'Active catalog products, excluding deleted products.'],
]
export default function DashboardMetrics({ data }) { return <section className="dashboard-metrics">{ITEMS(data).map(([label, value, detail, tone, explanation]) => <article className={`metric-card ${tone}`} key={label} title={explanation}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>)}</section> }
