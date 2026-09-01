import { integer, money } from '../dashboard.utils'
const ITEMS = (data) => [
  ['Total Revenue', `Rs. ${money(data.totalRevenue)}`, `${integer(data.totalSales)} transaction${Number(data.totalSales) === 1 ? '' : 's'}`, 'blue', 'Completed orders only. Revenue includes discounts, tax, and refunds.'],
  ['Payments Received', `Rs. ${money(data.totalPaymentsReceived)}`, `${(data.staffPerformance || []).length} receiver${(data.staffPerformance || []).length === 1 ? '' : 's'}`, 'emerald', 'Money marked received, attributed to the staff member who confirmed it.'],
  ['Pending Dues', `Rs. ${money(data.totalPendingDues)}`, `${integer(data.pendingDuesCount)} bill${Number(data.pendingDuesCount) === 1 ? '' : 's'} pending`, 'amber', 'Unpaid balance on completed bills.'],
  ['Cost of Goods Sold', `Rs. ${money(data.totalCOGS)}`, 'Sum of buying prices', 'purple', 'Buying cost of sold items, reduced by returned-item cost.'],
  ['Shop Profit', `Rs. ${money(data.shopProfit ?? data.partnerProfitPool ?? data.netProfit)}`, 'Sum of partner shares', 'emerald', 'Revenue minus COGS and damage/loss.'],
  ['Damage Value', `Rs. ${money(data.damageTotal)}`, 'Inventory & Returns', 'rose', 'Current product damage and loss value tracked in inventory.'],
  ['Products', integer(data.totalProducts), 'in catalog', 'amber', 'Active catalog products, excluding deleted products.'],
]
export default function DashboardMetrics({ data }) { return <section className="dashboard-metrics">{ITEMS(data).map(([label, value, detail, tone, explanation]) => <article className={`metric-card ${tone}`} key={label} title={explanation}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>)}</section> }
