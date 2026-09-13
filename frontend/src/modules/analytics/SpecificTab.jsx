import { analyticsAssetUrl } from './analytics-assets';
import { AiTab } from "./AiTab";
import { analyticsLabelWithInfo, analyticsPanelTitle } from "./analytics-ui";
export function SpecificTab({
  tabId,
  data,
  analyticsPeriod
}) {
  const k = data.kpi;
  const s = data.summary;
  const formatCurrency = val => new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(val);
  const formatNum = val => new Intl.NumberFormat('en-IN').format(val);
  const renderMetricLabel = (label, info) => <div className={"text-[10px] font-black uppercase text-slate-400"}>
      {analyticsLabelWithInfo(label, info)}
    </div>;
  let tabHtml = "";
  if (tabId === "sales") {
    tabHtml = <div className={"space-y-6 animate-[fadeIn_0.2s_ease-out]"}>
        <div className={"grid grid-cols-1 md:grid-cols-3 gap-6"}>
          <div className={"bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-5 rounded-3xl shadow-sm"}>
            {renderMetricLabel("Total Net Revenue", "Completed sales only. Revenue = bill subtotal - discount + tax - refunds. Includes both received and pending money.")}
            <h4 className={"text-2xl font-black text-slate-800 dark:text-white mt-1"}>{formatCurrency(k.totalSales)}</h4>
            <span className={"text-[10px] font-bold text-emerald-500 block mt-1"}>Adjusted after returns & refunds</span>
          </div>
          <div className={"bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-5 rounded-3xl shadow-sm"}>
            {renderMetricLabel("Total Orders volume", "Count of completed orders in the selected period. Pending, preparing, and ready orders are excluded.")}
            <h4 className={"text-2xl font-black text-slate-800 dark:text-white mt-1"}>{formatNum(k.totalOrders)}</h4>
            <span className={"text-[10px] font-bold text-slate-500 block mt-1"}>Average: {formatNum(k.totalOrders > 0 ? k.totalOrders / 30 : 0)} orders/day</span>
          </div>
          <div className={"bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-5 rounded-3xl shadow-sm"}>
            {renderMetricLabel("Average Cart Total", "Average completed bill total before subtracting refunds. Bill total = bill subtotal - discount + tax.")}
            <h4 className={"text-2xl font-black text-slate-800 dark:text-white mt-1"}>{formatCurrency(k.avgOrderValue)}</h4>
            <span className={"text-[10px] font-bold text-slate-500 block mt-1"}>Per unique transaction</span>
          </div>
        </div>

        <div className={"bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-6 rounded-3xl shadow-sm"}>
          <div className={"mb-4"}>
            {analyticsPanelTitle("Payment Methods Allocation", "Net completed-order revenue grouped by payment method. Revenue = bill subtotal - discount + tax - refunds, grouped by the original sale payment method.")}
          </div>
          <div className={"grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"}>
            {data.paymentBreakdown.map((p, idx) => <div className={"p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800/60 flex items-center justify-between"} key={idx}>
                <div>
                  {renderMetricLabel(p.label || 'Other', "This payment bucket is net revenue for completed orders using this payment method, after refunds are subtracted.")}
                  <h6 className={"text-base font-black text-slate-800 dark:text-white mt-1"}>{formatCurrency(p.sales)}</h6>
                </div>
                <span className={"text-lg"}>{idx === 0 ? '💵' : idx === 1 ? '📱' : '💳'}</span>
              </div>)}
            {data.paymentBreakdown.length === 0 ? <p className={"text-slate-400 text-xs italic"}>No transactions recorded.</p> : ''}
          </div>
        </div>
      </div>;
  } else if (tabId === "products") {
    tabHtml = <div className={"space-y-6 animate-[fadeIn_0.2s_ease-out]"}>
        <div className={"bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-6 rounded-3xl shadow-sm"}>
          <div className={"mb-4"}>
            {analyticsPanelTitle("Top Volume Performers", "Products ranked by sold quantity after returned quantities are deducted. Product revenue is allocated from bill subtotal - discount + tax, then product refunds are subtracted.")}
          </div>
          <div className={"overflow-x-auto"}>
            <table className={"w-full text-xs text-left"}>
              <thead>
                <tr className={"border-b border-slate-100 dark:border-slate-800 text-slate-400 uppercase tracking-widest text-[9px] font-black"}>
                  <th className={"py-3 pl-2"}>Product Name</th>
                  <th className={"py-3 text-right"}>Units Sold</th>
                  <th className={"py-3 text-right"}>Revenue Contributed</th>
                  <th className={"py-3 text-right"}>Available Stock</th>
                </tr>
              </thead>
              <tbody className={"divide-y divide-slate-50 dark:divide-slate-800/40"}>
                {data.topProducts.map((p, rowIndex) => <tr className={"hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-all font-semibold"} key={rowIndex}>
                    <td className={"py-3 pl-2 flex items-center gap-3"}>
                      <div className={"w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 overflow-hidden flex items-center justify-center font-bold text-[10px] text-slate-500"}>
                        {p.image_path ? <img src={analyticsAssetUrl(p.image_path)} className={"w-full h-full object-cover"} /> : p.name.substring(0, 2).toUpperCase()}
                      </div>
                      <span className={"text-slate-800 dark:text-slate-200 font-bold"}>{p.name}</span>
                    </td>
                    <td className={"py-3 text-right text-slate-900 dark:text-white font-black"}>{formatNum(p.quantity_sold)} units</td>
                    <td className={"py-3 text-right text-blue-600 dark:text-blue-400 font-extrabold"}>{formatCurrency(p.sales)}</td>
                    <td className={"py-3 text-right"}>
                      <span className={"px-2 py-0.5 rounded-md text-[10px] font-bold " + (p.stock <= 5 ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/20 dark:text-rose-400' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400') + ""}>{p.stock || 0} left</span>
                    </td>
                  </tr>)}
                {data.topProducts.length === 0 ? <tr><td colSpan={"4"} className={"py-6 text-center text-slate-400 italic"}>No products recorded.</td></tr> : ''}
              </tbody>
            </table>
          </div>
        </div>
      </div>;
  } else if (tabId === "customers") {
    tabHtml = <div className={"space-y-6 animate-[fadeIn_0.2s_ease-out]"}>
        <div className={"grid grid-cols-1 md:grid-cols-3 gap-6"}>
          <div className={"bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-5 rounded-3xl shadow-sm flex items-center gap-4"}>
            <span className={"text-3xl"}>👥</span>
            <div>
              {renderMetricLabel("Total Registered Customers", "All customer records currently saved for the shop, regardless of whether they purchased in the selected period.")}
              <h4 className={"text-2xl font-black text-slate-800 dark:text-white mt-1"}>{formatNum(k.totalCustomers)}</h4>
            </div>
          </div>
          <div className={"bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-5 rounded-3xl shadow-sm flex items-center gap-4"}>
            <span className={"text-3xl"}>✨</span>
            <div>
              {renderMetricLabel("Active Shoppers (This Period)", "Distinct linked customer records plus completed walk-in/unlinked orders in the selected period.")}
              <h4 className={"text-2xl font-black text-slate-800 dark:text-white mt-1"}>{formatNum(k.activeCustomers)}</h4>
            </div>
          </div>
          <div className={"bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-5 rounded-3xl shadow-sm flex items-center gap-4"}>
            <span className={"text-3xl"}>🚶</span>
            <div>
              {renderMetricLabel("Walk-in Shoppers (This Period)", "Completed sales in the selected period that were not linked to a saved customer account. Each unlinked completed sale is counted as one walk-in shopper.")}
              <h4 className={"text-2xl font-black text-slate-800 dark:text-white mt-1"}>{formatNum(k.walkInCustomers || 0)}</h4>
            </div>
          </div>
        </div>
      </div>;
  } else if (tabId === "inventory") {
    tabHtml = <div className={"space-y-6 animate-[fadeIn_0.2s_ease-out]"}>
        <div className={"grid grid-cols-1 md:grid-cols-2 gap-6"}>
          <div className={"bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-5 rounded-3xl shadow-sm"}>
            {renderMetricLabel("Total Asset Stock Valuation", "Current product and raw-ingredient batch quantities valued at their recorded batch buying costs.")}
            <h4 className={"text-2xl font-black text-slate-800 dark:text-white mt-1"}>{formatCurrency(s.stockValue)}</h4>
            <span className={"text-[10px] font-bold text-slate-400 block mt-1"}>Based on standard buying costs</span>
          </div>
          <div className={"bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-5 rounded-3xl shadow-sm flex flex-col justify-between"}>
            <div>
              {renderMetricLabel("Active Inventory Valuation Category Count", "Number of categories currently represented in the selected period's category revenue breakdown.")}
              <h4 className={"text-2xl font-black text-slate-800 dark:text-white mt-1"}>{data.categoryBreakdown.length} active</h4>
            </div>
          </div>
        </div>
      </div>;
  } else if (tabId === "profit") {
    const brandRows = Array.isArray(data.brandPerformance) ? data.brandPerformance : [];
    const partnerShares = Array.isArray(data.partnerProfitShares) ? data.partnerProfitShares : [];
    const shopProfitValue = Number(data.shopProfit ?? data.partnerProfitPool ?? s.shopProfit ?? s.grossProfit ?? 0);
    const shopProfitMargin = Number(s.shopProfitMargin ?? (Number(data.totalRevenue || 0) > 0 ? shopProfitValue / Number(data.totalRevenue || 0) * 100 : 0));
    const selectedPartnerAudit = data.selectedPartnerAudit || null;
    const selectedPartnerType = selectedPartnerAudit?.partner_type === "product_based" ? "product_based" : "share_based";
    const selectedPartnerAuditHtml = selectedPartnerAudit ? <div className={"mb-4 p-4 rounded-2xl bg-teal-50/80 dark:bg-teal-950/20 border border-teal-100 dark:border-teal-900/50"}>
          <div className={"flex flex-wrap items-center justify-between gap-3"}>
            <div>
              <div className={"text-[10px] font-black uppercase tracking-widest text-teal-600 dark:text-teal-400"}>Selected Partner Audit</div>
              <div className={"text-sm font-black text-slate-900 dark:text-white mt-0.5"}>{selectedPartnerAudit.brand_name}</div>
            </div>
            <div className={"grid grid-cols-2 sm:grid-cols-4 gap-4 text-right"}>
              <div>
                <div className={"text-[9px] uppercase font-black tracking-widest text-slate-400"}>Type</div>
                <div className={"text-xs font-black text-slate-800 dark:text-slate-100"}>{selectedPartnerType === "product_based" ? "Product Based" : "Share Based"}</div>
              </div>
              <div>
                <div className={"text-[9px] uppercase font-black tracking-widest text-slate-400"}>{selectedPartnerType === "product_based" ? "Product Profit" : "Share Pool"}</div>
                <div className={"text-xs font-black text-slate-800 dark:text-slate-100"}>{formatCurrency(Number(selectedPartnerAudit.profit_pool || 0))}</div>
              </div>
              <div>
                <div className={"text-[9px] uppercase font-black tracking-widest text-slate-400"}>Partner Share</div>
                <div className={"text-xs font-black " + (Number(selectedPartnerAudit.profit_share || 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400") + ""}>{formatCurrency(Number(selectedPartnerAudit.profit_share || 0))}</div>
              </div>
              <div>
                <div className={"text-[9px] uppercase font-black tracking-widest text-slate-400"}>{selectedPartnerType === "product_based" ? "Product Orders" : "Business Orders"}</div>
                <div className={"text-xs font-black text-slate-800 dark:text-slate-100"}>{formatNum(Number(selectedPartnerType === "product_based" ? selectedPartnerAudit.product_brand_orders || 0 : selectedPartnerAudit.business_orders || 0))}</div>
              </div>
            </div>
          </div>
        </div> : "";
    tabHtml = <div className={"space-y-6 animate-[fadeIn_0.2s_ease-out]"}>
        <div className={"grid grid-cols-1 md:grid-cols-3 gap-6"}>
          <div className={"bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-5 rounded-3xl shadow-sm"}>
            {renderMetricLabel("Shop Profit", "Shop Profit = revenue - COGS - damage/loss. Partner shares add up to this amount.")}
            <h4 className={"text-2xl font-black text-slate-800 dark:text-white mt-1"}>{formatCurrency(shopProfitValue)}</h4>
            <span className={"text-[10px] font-bold text-emerald-500 block mt-1"}>Sum of configured partner shares</span>
          </div>
          <div className={"bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-5 rounded-3xl shadow-sm"}>
            {renderMetricLabel("Shop Profit Margin", "Shop profit divided by net revenue for the selected period.")}
            <h4 className={"text-2xl font-black text-slate-800 dark:text-white mt-1"}>{shopProfitMargin.toFixed(2)}%</h4>
            <span className={"text-[10px] font-bold text-slate-500 block mt-1"}>Percentage of retainable gross yield</span>
          </div>
          <div className={"bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-5 rounded-3xl shadow-sm"}>
            {renderMetricLabel("Refund Deficit Deducted", "Total refund amount from return invoices created in the selected period. This is deducted from revenue.")}
            <h4 className={"text-2xl font-black text-rose-600 dark:text-rose-400 mt-1"}>{formatCurrency(s.totalRefunds)}</h4>
            <span className={"text-[10px] font-bold text-rose-500 block mt-1"}>Over {s.totalReturns} total return invoices</span>
          </div>
        </div>

        <div className={"bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-6 rounded-3xl shadow-sm"}>
          <div className={"mb-4 flex items-center justify-between gap-3"}>
            {analyticsPanelTitle("Whole Business Partner Split", "Configured partner allocations are shown separately from profit retained by the owner or left unallocated.")}
            <span className={"text-[10px] font-black uppercase tracking-widest text-slate-400"}>{formatCurrency(Number(data.totalPartnerProfit || 0))} allocated · {formatCurrency(Number(data.retainedOwnerProfit || 0))} retained</span>
          </div>
          {selectedPartnerAuditHtml}
          <div className={"overflow-x-auto"}>
            <table className={"w-full text-xs text-left"}>
              <thead>
                <tr className={"border-b border-slate-100 dark:border-slate-800 text-slate-400 uppercase tracking-widest text-[9px] font-black"}>
                  <th className={"py-3 pl-2"}>Partner</th>
                  <th className={"py-3"}>Type</th>
                  <th className={"py-3 text-right"}>Ownership</th>
                  <th className={"py-3 text-right"}>Profit Basis</th>
                  <th className={"py-3 text-right"}>Partner Profit</th>
                </tr>
              </thead>
              <tbody className={"divide-y divide-slate-50 dark:divide-slate-800/40"}>
                {partnerShares.map((share, rowIndex) => {
                const amount = Number(share.profit_share || 0);
                const tone = amount >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";
                const type = share.partner_type === "product_based" ? "product_based" : "share_based";
                return <tr className={"" + (share.is_selected ? "bg-teal-50/70 dark:bg-teal-950/20" : "hover:bg-slate-50/50 dark:hover:bg-slate-800/20") + " transition-all font-semibold"} key={rowIndex}>
                      <td className={"py-3 pl-2 font-black text-slate-800 dark:text-white"}>
                        {share.brand_name}
                        {share.is_selected ? <span className={"ml-2 align-middle text-[9px] font-black uppercase tracking-widest text-teal-600 dark:text-teal-400"}>Selected</span> : ""}
                      </td>
                      <td className={"py-3 text-slate-700 dark:text-slate-300 font-bold"}>{type === "product_based" ? "Product Based" : "Share Based"}</td>
                      <td className={"py-3 text-right text-slate-700 dark:text-slate-300 font-bold"}>{type === "product_based" ? "Products" : `${Number(share.ownership_percent || 0).toFixed(2).replace(/\.00$/, "")}%`}</td>
                      <td className={"py-3 text-right text-slate-700 dark:text-slate-300 font-bold"}>{formatCurrency(Number(share.profit_pool || 0))}</td>
                      <td className={"py-3 text-right " + tone + " font-extrabold"}>{formatCurrency(amount)}</td>
                    </tr>;
              })}
                {partnerShares.length === 0 ? <tr><td colSpan={"5"} className={"py-6 text-center text-slate-400 italic"}>No partner split configured.</td></tr> : ''}
              </tbody>
            </table>
          </div>
        </div>

        <div className={"bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-6 rounded-3xl shadow-sm"}>
          <div className={"mb-4"}>
            {analyticsPanelTitle("Product Brand Sales & Cost", "Product-assignment breakdown by brand. Partner profit is calculated from shop profit in the partner split table.")}
          </div>
          <div className={"overflow-x-auto"}>
            <table className={"w-full text-xs text-left"}>
              <thead>
                <tr className={"border-b border-slate-100 dark:border-slate-800 text-slate-400 uppercase tracking-widest text-[9px] font-black"}>
                  <th className={"py-3 pl-2"}>Product Brand</th>
                  <th className={"py-3 text-right"}>Net Revenue</th>
                  <th className={"py-3 text-right"}>COGS</th>
                  <th className={"py-3 text-right"}>Gross Profit</th>
                  <th className={"py-3 text-right"}>Damage / Loss</th>
                  <th className={"py-3 text-right"}>After Loss</th>
                  <th className={"py-3 text-right"}>Margin</th>
                </tr>
              </thead>
              <tbody className={"divide-y divide-slate-50 dark:divide-slate-800/40"}>
                {brandRows.map((brand, rowIndex) => {
                const afterLoss = Number(brand.netAfterDamage || 0);
                const profit = Number(brand.grossProfit || 0);
                const profitTone = profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";
                const afterLossTone = afterLoss >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";
                return <tr className={"hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-all font-semibold"} key={rowIndex}>
                      <td className={"py-3 pl-2"}>
                        <div className={"font-black text-slate-800 dark:text-white"}>{brand.brand_name}</div>
                        <div className={"text-[10px] text-slate-400"}>{formatNum(Number(brand.orders || 0))} order{Number(brand.orders || 0) === 1 ? "" : "s"}</div>
                      </td>
                      <td className={"py-3 text-right text-blue-600 dark:text-blue-400 font-extrabold"}>{formatCurrency(Number(brand.netRevenue || 0))}</td>
                      <td className={"py-3 text-right text-slate-700 dark:text-slate-300 font-bold"}>{formatCurrency(Number(brand.netCogs || 0))}</td>
                      <td className={"py-3 text-right " + profitTone + " font-extrabold"}>{formatCurrency(profit)}</td>
                      <td className={"py-3 text-right text-rose-600 dark:text-rose-400 font-bold"}>{formatCurrency(Number(brand.damageLoss || 0))}</td>
                      <td className={"py-3 text-right " + afterLossTone + " font-extrabold"}>{formatCurrency(afterLoss)}</td>
                      <td className={"py-3 text-right font-black text-slate-900 dark:text-white"}>{Number(brand.profitMargin || 0).toFixed(1)}%</td>
                    </tr>;
              })}
                {brandRows.length === 0 ? <tr><td colSpan={"7"} className={"py-6 text-center text-slate-400 italic"}>No brand profit/loss data available.</td></tr> : ''}
              </tbody>
            </table>
          </div>
        </div>
      </div>;
  } else if (tabId === "staff") {
    tabHtml = <div className={"space-y-6 animate-[fadeIn_0.2s_ease-out]"}>
        <div className={"bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-6 rounded-3xl shadow-sm"}>
          <div className={"mb-4"}>
            {analyticsPanelTitle("Sales by Payment Receiver", "Money actually received, attributed to the staff member who collected or confirmed the payment.")}
          </div>
          <div className={"divide-y divide-slate-100 dark:divide-slate-800"}>
            {(data.staffPerformance || []).map((row, index) => <div className={"py-4 flex items-center justify-between gap-4"} key={index}>
                <div className={"flex items-center gap-3"}>
                  <span className={"w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xs font-black"}>{index + 1}</span>
                  <div><div className={"text-sm font-black text-slate-800 dark:text-white"}>{row.name || row.username || 'Unknown'}</div><div className={"text-[10px] font-bold text-slate-400"}>{formatNum(row.orders || 0)} payments</div></div>
                </div>
                <div className={"text-sm font-black text-emerald-600 dark:text-emerald-400"}>{formatCurrency(row.received_sales || 0)}</div>
              </div>)}
            {(data.staffPerformance || []).length === 0 ? <p className={"text-slate-400 text-xs italic text-center py-6"}>No received payments in this period.</p> : ''}
          </div>
        </div>
      </div>;
  } else if (tabId === "channels") {
    tabHtml = <div className={"space-y-6 animate-[fadeIn_0.2s_ease-out]"}>
        <div className={"bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-6 rounded-3xl shadow-sm"}>
          <div className={"mb-4"}>
            {analyticsPanelTitle("Revenue Stream Breakdown", "Net completed-order revenue by order type or channel. Revenue = bill subtotal - discount + tax - refunds.")}
          </div>
          <div className={"grid grid-cols-1 md:grid-cols-2 gap-6"}>
            {data.channelBreakdown.map((c, idx) => {
            let lbl = c.label || "dine_in";
            if (lbl === 'dine_in') lbl = "Dine In";else if (lbl === 'takeaway') lbl = "Takeaway";else if (lbl === 'delivery') lbl = "Delivery";else if (lbl === 'pos' || lbl === 'retail') lbl = "In-Store POS";
            return <div className={"p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800/60 flex items-center justify-between"} key={idx}>
                  <div>
                    {renderMetricLabel(lbl, "This channel bucket includes completed orders of this type. Revenue = bill subtotal - discount + tax - refunds.")}
                    <h6 className={"text-lg font-black text-slate-800 dark:text-white mt-1"}>{formatCurrency(c.sales)}</h6>
                  </div>
                  <span className={"text-2xl"}>{idx === 0 ? '🛍️' : idx === 1 ? '🍽️' : '🛵'}</span>
                </div>;
          })}
            {data.channelBreakdown.length === 0 ? <p className={"text-slate-400 text-xs italic"}>No channel summaries recorded.</p> : ''}
          </div>
        </div>
      </div>;
  } else if (tabId === "ai") {
    return <AiTab analyticsPeriod={analyticsPeriod} />;
  } else if (tabId === "reports" || tabId === "custom_reports") {
    tabHtml = <div className={"space-y-6 animate-[fadeIn_0.2s_ease-out]"}>
        <div className={"bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-6 rounded-3xl shadow-sm"}>
          <div className={"flex items-center justify-between mb-6"}>
            {analyticsPanelTitle("Transactional Ledger Statement", "Report/export area for transaction registers. Uses the selected analytics period when report generation is connected.")}
            <button onClick={() => window.print()} className={"px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl transition-all shadow-sm"}>
              Print Statement
            </button>
          </div>
          
          <div className={"p-8 text-center bg-slate-50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800/60 rounded-2xl flex flex-col items-center justify-center gap-2"}>
            <span className={"text-2xl"}>📄</span>
            <span className={"text-sm font-bold text-slate-700 dark:text-slate-300"}>Transaction ledger compiled.</span>
            <p className={"text-xs text-slate-400 max-w-sm"}>Detailed invoice registries can be printed dynamically. Use the Export Report button in the header toolbar to trigger a full report download.</p>
          </div>
        </div>
      </div>;
  }
  return tabHtml;
}
