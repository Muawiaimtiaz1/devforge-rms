import { getShopCurrency } from '../../../currency'
import { integer, money } from '../dashboard.utils'
const ITEMS = (data) => [
  ['Gross Sales', `${getShopCurrency()} ${money(data.summary?.grossSales)}`, `${integer(data.totalSales)} completed order${Number(data.totalSales) === 1 ? '' : 's'}`, 'blue', 'Completed-order revenue before refunds, excluding sales tax.'],
  ['Refunds', `${getShopCurrency()} ${money(data.summary?.totalRefunds)}`, 'Return invoices in selected period', 'rose', 'Refund value recognized on the return date.'],
  ['Tax Collected', `${getShopCurrency()} ${money(data.totalTax ?? data.summary?.totalTax)}`, 'Net of refunded tax', 'amber', 'Sales tax collected less refunded tax. Excluded from revenue and profit.'],
  ['Net Revenue', `${getShopCurrency()} ${money(data.totalRevenue)}`, 'Gross sales minus refunds', 'blue', 'Completed-order revenue excluding sales tax and return refunds.'],
  ['Payments Received', `${getShopCurrency()} ${money(data.totalPaymentsReceived)}`, `${(data.staffPerformance || []).length} receiver${(data.staffPerformance || []).length === 1 ? '' : 's'}`, 'emerald', 'Money marked received, attributed to the staff member who confirmed it.'],
  ['Pending Dues', `${getShopCurrency()} ${money(data.totalPendingDues)}`, `${integer(data.pendingDuesCount)} bill${Number(data.pendingDuesCount) === 1 ? '' : 's'} pending`, 'amber', 'Unpaid balance on completed bills.'],
  ['Cost of Goods Sold', `${getShopCurrency()} ${money(data.totalCOGS)}`, 'Sum of buying prices', 'purple', 'Buying cost of sold items, reduced by returned-item cost.'],
  ['Shop Profit', `${getShopCurrency()} ${money(data.shopProfit ?? data.partnerProfitPool ?? data.netProfit)}`, 'Sum of partner shares', 'emerald', 'Revenue minus COGS and damage/loss.'],
  ['Waste / Damage', `${getShopCurrency()} ${money(data.damageTotal)}`, 'Recorded in selected period', 'rose', 'Cost of dated waste events recorded in the selected period.'],
  ['Products', integer(data.totalProducts), 'in catalog', 'amber', 'Active catalog products, excluding deleted products.'],
]
export default function DashboardMetrics({ data }) {
  return <section className="dashboard-metrics">
    <article className="metric-card emerald"><span>Tips Collected</span><strong>{getShopCurrency()} {money(data.totalTipsCollected)}</strong><small>Selected date period · all shop shifts</small></article>
    {ITEMS(data).map(([label, value, detail, tone, explanation]) => <article className={`metric-card ${tone}`} key={label} title={explanation}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>)}
  </section>
}
