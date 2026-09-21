const db = require('../db/knex');
const brandService = require('./BrandService');
const tipsService = require('../src/modules/tips/tips.service');

class AnalyticsService {
  /**
   * Helper to get period bounds (start and end timestamps)
   */
  getPeriodBounds(period, fromDate, toDate) {
    const now = new Date();
    const format = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };
    const shiftMonths = (date, monthDelta) => {
      const shifted = new Date(date);
      const targetDay = shifted.getDate();
      shifted.setDate(1);
      shifted.setMonth(shifted.getMonth() + monthDelta);
      const lastDayOfTargetMonth = new Date(shifted.getFullYear(), shifted.getMonth() + 1, 0).getDate();
      shifted.setDate(Math.min(targetDay, lastDayOfTargetMonth));
      return shifted;
    };

    let startStr = "";
    let endStr = format(now);

    switch (period) {
      case 'today':
        startStr = endStr;
        break;
      case '7days':
        const d7 = new Date();
        d7.setDate(d7.getDate() - 6);
        startStr = format(d7);
        break;
      case '30days':
        const d30 = new Date();
        d30.setDate(d30.getDate() - 29);
        startStr = format(d30);
        break;
      case '12months':
        const d12 = new Date();
        d12.setMonth(d12.getMonth() - 11);
        d12.setDate(1);
        startStr = format(d12);
        break;
      case 'custom':
        if (fromDate && toDate) {
          startStr = fromDate;
          endStr = toDate;
        }
        break;
      case 'all':
        startStr = "2000-01-01"; // effectively all time
        break;
      case '1m':
        startStr = format(shiftMonths(now, -1));
        break;
      case '2m':
        startStr = format(shiftMonths(now, -2));
        break;
      case '6m':
        startStr = format(shiftMonths(now, -6));
        break;
      case '1y':
        startStr = format(shiftMonths(now, -12));
        break;
      default:
        // Default to all time if not specified, to match legacy behavior
        startStr = "2000-01-01";
    }

    return {
      start: `${startStr} 00:00:00`,
      end: `${endStr} 23:59:59`
    };
  }

  getPreviousPeriodBounds(period, bounds) {
    const currentStart = new Date(bounds.start.split(' ')[0]);
    const currentEnd = new Date(bounds.end.split(' ')[0]);
    
    const diffTime = Math.abs(currentEnd - currentStart);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
    
    const format = (d) => d.toISOString().split('T')[0];

    if (period === '12months' || period === '1y') {
      const prevStart = new Date(currentStart);
      prevStart.setFullYear(prevStart.getFullYear() - 1);
      const prevEnd = new Date(currentEnd);
      prevEnd.setFullYear(prevEnd.getFullYear() - 1);
      return { start: `${format(prevStart)} 00:00:00`, end: `${format(prevEnd)} 23:59:59` };
    }

    const prevStart = new Date(currentStart);
    prevStart.setDate(prevStart.getDate() - diffDays);
    const prevEnd = new Date(currentEnd);
    prevEnd.setDate(prevEnd.getDate() - diffDays);
    
    return { start: `${format(prevStart)} 00:00:00`, end: `${format(prevEnd)} 23:59:59` };
  }

  async getDashboardData(shopId, period = 'all', from = null, to = null, brandId = null) {
    try {
      const bounds = this.getPeriodBounds(period, from, to);
      const prevBounds = this.getPreviousPeriodBounds(period, bounds);
      const isSqlite = db.client.config.client !== 'pg';
      // Bucket PostgreSQL analytics in the restaurant's reporting clock so
      // late-night sales stay in their correct date and shift.
      const timezoneSetting = !isSqlite && shopId
        ? await db('attendance_settings').where({ shop_id: shopId }).select('timezone').first().catch(() => null)
        : null;
      const reportingTimezone = String(timezoneSetting?.timezone || 'Asia/Karachi');
      const brands = shopId ? await brandService.listBrands(shopId) : [];
      const requestedBrandId = parseInt(brandId, 10);
      const selectedBrand = Number.isFinite(requestedBrandId)
        ? brands.find(b => Number(b.id) === requestedBrandId)
        : null;
      const selectedBrandId = selectedBrand ? Number(selectedBrand.id) : null;
      // Partner selection highlights ownership share; shop profit stays shop-wide.
      const hasBrandFilter = false;

      const applyShopScope = (qb, column) => {
        if (shopId) qb.where(column, shopId);
        return qb;
      };
      const applyBrandScope = (qb, alias = 'p') => {
        if (hasBrandFilter) qb.where(`${alias}.brand_id`, selectedBrandId);
        return qb;
      };
      const makeItemTotals = () => db('sale_items')
        .select('sale_id')
        .select(db.raw('SUM(quantity * price_at_sale) as item_subtotal'))
        .groupBy('sale_id')
        .as('item_totals');
      const itemCogsExpr = `si.quantity * si.buying_price_at_sale`;
      const returnCogsExpr = `ri.quantity * ri.buying_price_at_sale`;
// Bill totals include tax. Revenue and profit exclude it; tax is reported separately.
      const saleRevenueExpr = `(COALESCE(s.total, 0) - COALESCE(s.tax_amount, 0))`;
      const saleTaxExpr = `COALESCE(s.tax_amount, 0)`;
      const receivedSaleAmountExpr = `(CASE WHEN COALESCE(s.amount_received, 0) > COALESCE(s.total, 0) THEN COALESCE(s.total, 0) ELSE COALESCE(s.amount_received, 0) END)`;
      const collectedTaxExpr = `(CASE WHEN COALESCE(s.total, 0) > 0 THEN COALESCE(s.tax_amount, 0) * ${receivedSaleAmountExpr} / COALESCE(s.total, 0) ELSE 0 END)`;
      const refundRevenueExpr = `(COALESCE(r.total_refund, 0) / (1 + COALESCE(s.tax_percentage, 0) / 100.0))`;
      const allocatedSalesExpr = `CASE WHEN COALESCE(item_totals.item_subtotal, 0) > 0 THEN (si.quantity * si.price_at_sale) * ${saleRevenueExpr} / COALESCE(item_totals.item_subtotal, 0) ELSE 0 END`;
      const allocatedDiscountExpr = `CASE WHEN COALESCE(item_totals.item_subtotal, 0) > 0 THEN (si.quantity * si.price_at_sale) * COALESCE(s.discount, 0) / COALESCE(item_totals.item_subtotal, 0) ELSE 0 END`;
      const allocatedDueExpr = `CASE WHEN (COALESCE(s.total, 0) - COALESCE(s.amount_received, 0)) > 0.01 AND COALESCE(item_totals.item_subtotal, 0) > 0 THEN (si.quantity * si.price_at_sale) * (COALESCE(s.total, 0) - COALESCE(s.amount_received, 0)) / COALESCE(item_totals.item_subtotal, 0) ELSE 0 END`;
      const pendingDueCondition = '(COALESCE(s.total, 0) - COALESCE(s.amount_received, 0)) > 0.01';
      const brandSalesQuery = (rangeBounds) => db('sale_items as si')
        .join('sales as s', 'si.sale_id', 's.id')
        .join('products as p', 'si.product_id', 'p.id')
        .leftJoin(makeItemTotals(), 'si.sale_id', 'item_totals.sale_id')
        .modify(qb => applyShopScope(qb, 's.shop_id'))
        .modify(qb => applyBrandScope(qb))
        .where('s.order_status', 'completed')
        .whereBetween('s.created_at', [rangeBounds.start, rangeBounds.end]);
      const brandReturnsQuery = (rangeBounds, includeSale = false) => {
        const q = db('return_items as ri')
          .join('returns as r', 'ri.return_id', 'r.id')
          .leftJoin('products as p', 'ri.product_id', 'p.id')
          .modify(qb => applyShopScope(qb, 'r.shop_id'))
          .modify(qb => applyBrandScope(qb))
          .whereBetween('r.created_at', [rangeBounds.start, rangeBounds.end]);
        if (includeSale) q.join('sales as s', 'r.sale_id', 's.id');
        return q;
      };

      // 1. KPI Aggregates
      const kpi = hasBrandFilter
        ? await brandSalesQuery(bounds)
          .select(
            db.raw(`COALESCE(SUM(${allocatedSalesExpr}), 0) as total_sales`),
            db.raw('COUNT(DISTINCT s.id) as total_orders'),
            db.raw(`COALESCE(SUM(${allocatedDueExpr}), 0) as total_pending_dues`),
            db.raw(`COUNT(DISTINCT CASE WHEN ${pendingDueCondition} THEN s.id END) as pending_dues_count`)
          ).first()
        : await db('sales as s')
          .modify(qb => applyShopScope(qb, 's.shop_id'))
          .where({ 's.order_status': 'completed' })
          .whereBetween('s.created_at', [bounds.start, bounds.end])
          .select(
            db.raw('COALESCE(SUM(s.total), 0) as total_sales'),
            db.raw('COUNT(s.id) as total_orders'),
            db.raw('COALESCE(AVG(s.total), 0) as avg_order_value'),
            db.raw('COALESCE(SUM(CASE WHEN (COALESCE(s.total, 0) - COALESCE(s.amount_received, 0)) > 0.01 THEN (COALESCE(s.total, 0) - COALESCE(s.amount_received, 0)) ELSE 0 END), 0) as total_pending_dues'),
            db.raw('COALESCE(SUM(CASE WHEN (COALESCE(s.total, 0) - COALESCE(s.amount_received, 0)) > 0.01 THEN 1 ELSE 0 END), 0) as pending_dues_count')
          ).first();

const taxStats = await db('sales as s')
        .modify(qb => applyShopScope(qb, 's.shop_id'))
        .where({ 's.order_status': 'completed' })
        .whereBetween('s.created_at', [bounds.start, bounds.end])
        .select(db.raw(`COALESCE(SUM(${saleTaxExpr}), 0) as total_tax`), db.raw(`COALESCE(SUM(${collectedTaxExpr}), 0) as collected_tax`))
        .first();

      const receivables = await db('sales as s')
        .modify(qb => applyShopScope(qb, 's.shop_id'))
        .whereIn('s.order_status', ['completed', 'payment_pending'])
        .whereBetween('s.created_at', [bounds.start, bounds.end])
        .select(
          db.raw('COALESCE(SUM(CASE WHEN (COALESCE(s.total, 0) - COALESCE(s.amount_received, 0)) > 0.01 THEN (COALESCE(s.total, 0) - COALESCE(s.amount_received, 0)) ELSE 0 END), 0) as total_pending_dues'),
          db.raw('COALESCE(SUM(CASE WHEN (COALESCE(s.total, 0) - COALESCE(s.amount_received, 0)) > 0.01 THEN 1 ELSE 0 END), 0) as pending_dues_count')
        ).first();

      const linkedCustomersCount = hasBrandFilter
        ? await brandSalesQuery(bounds)
          .whereNotNull('s.customer_id')
          .countDistinct('s.customer_id as val').first()
        : await db('sales as s')
          .modify(qb => applyShopScope(qb, 's.shop_id'))
          .where({ 's.order_status': 'completed' })
          .whereBetween('s.created_at', [bounds.start, bounds.end])
          .whereNotNull('s.customer_id')
          .countDistinct('s.customer_id as val').first();

      const walkInCustomersCount = hasBrandFilter
        ? await brandSalesQuery(bounds)
          .whereNull('s.customer_id')
          .countDistinct('s.id as val').first()
        : await db('sales as s')
          .modify(qb => applyShopScope(qb, 's.shop_id'))
          .where({ 's.order_status': 'completed' })
          .whereBetween('s.created_at', [bounds.start, bounds.end])
          .whereNull('s.customer_id')
          .count('s.id as val').first();

      const totalCustomersInDb = await db('customers')
        .modify(qb => shopId ? qb.where({ shop_id: shopId }) : qb)
        .count('* as val').first();

      // 2. Summary (Returns, COGS, Discounts)
      const discounts = hasBrandFilter
        ? await brandSalesQuery(bounds)
          .select(db.raw(`COALESCE(SUM(${allocatedDiscountExpr}), 0) as val`)).first()
        : await db('sales as s')
          .modify(qb => applyShopScope(qb, 's.shop_id'))
          .where({ 's.order_status': 'completed' })
          .whereBetween('s.created_at', [bounds.start, bounds.end])
          .sum('s.discount as val').first();

      const returnsStats = hasBrandFilter
        ? await brandReturnsQuery(bounds)
          .select(
            db.raw('COALESCE(SUM(ri.quantity * ri.refund_price), 0) as total_refunds'),
            db.raw('COUNT(DISTINCT r.id) as return_count')
          ).first()
        : await db('returns as r')
          .modify(qb => applyShopScope(qb, 'r.shop_id'))
          .whereBetween('r.created_at', [bounds.start, bounds.end])
          .select(
            db.raw('COALESCE(SUM(r.total_refund), 0) as total_refunds'),
            db.raw('COUNT(r.id) as return_count')
          ).first();

const refundTaxStats = await db('returns as r')
        .join('sales as s', 'r.sale_id', 's.id')
        .modify(qb => applyShopScope(qb, 'r.shop_id'))
        .whereBetween('r.created_at', [bounds.start, bounds.end])
        .select(db.raw(`COALESCE(SUM(COALESCE(r.total_refund, 0) - ${refundRevenueExpr}), 0) as refunded_tax`))
        .first();

      const cogsStats = await db('sale_items as si')
        .join('sales as s', 'si.sale_id', 's.id')
        .leftJoin('products as p', 'si.product_id', 'p.id')
        .modify(qb => applyShopScope(qb, 's.shop_id'))
        .modify(qb => applyBrandScope(qb))
        .where('s.order_status', 'completed')
        .whereBetween('s.created_at', [bounds.start, bounds.end])
        .select(db.raw(`SUM(${itemCogsExpr}) as val`)).first();

      const returnedCogs = await db('return_items as ri')
        .join('returns as r', 'ri.return_id', 'r.id')
        .leftJoin('sale_items as si', 'ri.sale_item_id', 'si.id')
        .leftJoin('products as p', 'ri.product_id', 'p.id')
        .modify(qb => applyShopScope(qb, 'r.shop_id'))
        .modify(qb => applyBrandScope(qb))
        .whereBetween('r.created_at', [bounds.start, bounds.end])
        .select(db.raw(`SUM(${returnCogsExpr}) as val`)).first();

      const commissionIncomeStats = { val: 0 };
      const returnedCommissionStats = { val: 0 };

      const [productStockValueResult, rawStockValueResult] = await Promise.all([
        db('product_batches as pb')
          .join('products as p', 'p.id', 'pb.product_id')
          .modify(qb => applyShopScope(qb, 'pb.shop_id'))
          .where({ 'p.is_deleted': 0 })
          .select(db.raw('COALESCE(SUM(pb.quantity * pb.buying_price), 0) as val')).first(),
        db('raw_stock_batches as rb')
          .join('raw_stocks as rs', 'rs.id', 'rb.raw_stock_id')
          .modify(qb => applyShopScope(qb, 'rb.shop_id'))
          .where({ 'rs.is_deleted': 0 })
          .select(db.raw('COALESCE(SUM(rb.quantity * rb.buying_price), 0) as val')).first()
      ]);
      const productStockValue = Number(productStockValueResult?.val || 0);
      const rawStockValue = Number(rawStockValueResult?.val || 0);

      // Calculations
      const totalSalesVal = Number(kpi.total_sales || 0);
      const totalRefundsVal = Number(returnsStats.total_refunds || 0);
      const totalTaxVal = Number(taxStats?.total_tax || 0);
      const collectedTaxVal = Number(taxStats?.collected_tax || 0);
      const refundedTaxVal = Number(refundTaxStats?.refunded_tax || 0);
      const netTaxCollected = collectedTaxVal - refundedTaxVal;
      const netBilledTax = totalTaxVal - refundedTaxVal;
      const adjustedRevenue = totalSalesVal - totalRefundsVal - netBilledTax;
      
      const cogsVal = Number(cogsStats ? cogsStats.val : 0);
      const retCogsVal = Number(returnedCogs ? returnedCogs.val : 0);
      const adjustedCOGS = cogsVal - retCogsVal;
      
      const grossProfit = adjustedRevenue - adjustedCOGS;
      const profitMargin = adjustedRevenue > 0 ? (grossProfit / adjustedRevenue) * 100 : 0;
      const totalOrderCount = parseInt(kpi.total_orders || 0, 10) || 0;
      const avgOrderValue = hasBrandFilter
        ? (totalOrderCount > 0 ? adjustedRevenue / totalOrderCount : 0)
        : parseFloat(kpi.avg_order_value || 0);

      // 3. Growth
      const prevKpi = hasBrandFilter
        ? await brandSalesQuery(prevBounds)
          .select(
            db.raw(`COALESCE(SUM(${allocatedSalesExpr}), 0) as total_sales`),
            db.raw('COUNT(DISTINCT s.id) as total_orders')
          ).first()
        : await db('sales as s')
          .modify(qb => applyShopScope(qb, 's.shop_id'))
          .where({ 's.order_status': 'completed' })
          .whereBetween('s.created_at', [prevBounds.start, prevBounds.end])
          .select(db.raw('COALESCE(SUM(s.total), 0) as total_sales'), db.raw('COUNT(s.id) as total_orders')).first();

      const prevLinkedCustomersCount = hasBrandFilter
        ? await brandSalesQuery(prevBounds)
          .whereNotNull('s.customer_id')
          .countDistinct('s.customer_id as val').first()
        : await db('sales as s')
          .modify(qb => applyShopScope(qb, 's.shop_id'))
          .where({ 's.order_status': 'completed' })
          .whereBetween('s.created_at', [prevBounds.start, prevBounds.end])
          .whereNotNull('s.customer_id')
          .countDistinct('s.customer_id as val').first();

      const prevWalkInCustomersCount = hasBrandFilter
        ? await brandSalesQuery(prevBounds)
          .whereNull('s.customer_id')
          .countDistinct('s.id as val').first()
        : await db('sales as s')
          .modify(qb => applyShopScope(qb, 's.shop_id'))
          .where({ 's.order_status': 'completed' })
          .whereBetween('s.created_at', [prevBounds.start, prevBounds.end])
          .whereNull('s.customer_id')
          .count('s.id as val').first();

      const prevReturns = hasBrandFilter
        ? await brandReturnsQuery(prevBounds)
          .select(db.raw('COALESCE(SUM(ri.quantity * ri.refund_price), 0) as val')).first()
        : await db('returns as r')
          .modify(qb => applyShopScope(qb, 'r.shop_id'))
          .whereBetween('r.created_at', [prevBounds.start, prevBounds.end])
          .sum('r.total_refund as val').first();

      const adjustedPrevRevenue = Number(prevKpi.total_sales || 0) - Number(prevReturns.val || 0);
      const getChange = (curr, prev) => {
        if (prev <= 0) return curr > 0 ? 100.0 : 0.0;
        return parseFloat((((curr - prev) / prev) * 100).toFixed(1));
      };

      const salesGrowth = getChange(adjustedRevenue, adjustedPrevRevenue);
      const ordersGrowth = getChange(parseInt(kpi.total_orders || 0), parseInt(prevKpi.total_orders || 0));
      const linkedCustomerCountVal = parseInt(linkedCustomersCount ? linkedCustomersCount.val : 0, 10) || 0;
      const walkInCustomerCountVal = parseInt(walkInCustomersCount ? walkInCustomersCount.val : 0, 10) || 0;
      const activeCustomerCountVal = linkedCustomerCountVal + walkInCustomerCountVal;
      const prevLinkedCustomerCountVal = parseInt(prevLinkedCustomersCount ? prevLinkedCustomersCount.val : 0, 10) || 0;
      const prevWalkInCustomerCountVal = parseInt(prevWalkInCustomersCount ? prevWalkInCustomersCount.val : 0, 10) || 0;
      const customersGrowth = getChange(activeCustomerCountVal, prevLinkedCustomerCountVal + prevWalkInCustomerCountVal);

      // 4. Trends & Breakdowns
      const getTrendData = async (lblExpr) => {
        const labelSelection = typeof lblExpr === 'string'
          ? db.raw(`${lblExpr} as label`)
          : lblExpr;
        const raw = hasBrandFilter
          ? await brandSalesQuery(bounds)
            .select(labelSelection)
            .select(db.raw(`COALESCE(SUM(${allocatedSalesExpr}), 0) as sales`), db.raw('COUNT(DISTINCT s.id) as orders'))
            .groupBy('label').orderBy('label', 'asc')
          : await db('sales as s')
            .modify(qb => applyShopScope(qb, 's.shop_id'))
            .where({ 's.order_status': 'completed' })
            .whereBetween('s.created_at', [bounds.start, bounds.end])
            .select(labelSelection)
            .select(db.raw('SUM(s.total) as sales'), db.raw('COUNT(s.id) as orders'))
            .groupBy('label').orderBy('label', 'asc');
        return raw.map(r => ({ ...r, sales: Number(r.sales || 0), orders: Number(r.orders || 0) }));
      };
      
      let trendSeries = [];
      if (period === 'today') {
        trendSeries = await getTrendData(isSqlite
          ? "strftime('%H', s.created_at)"
          : db.raw("TO_CHAR(s.created_at AT TIME ZONE ?, 'HH24') as label", [reportingTimezone]));
      } else if (period === '12months') {
        trendSeries = await getTrendData(isSqlite
          ? "strftime('%Y-%m', s.created_at)"
          : db.raw("TO_CHAR(s.created_at AT TIME ZONE ?, 'YYYY-MM') as label", [reportingTimezone]));
      } else {
        trendSeries = await getTrendData(isSqlite
          ? "date(s.created_at)"
          : db.raw("TO_CHAR(s.created_at AT TIME ZONE ?, 'YYYY-MM-DD') as label", [reportingTimezone]));
      }

      const mergeNetBreakdown = (grossRows, refundRows) => {
        const rowsByLabel = new Map();
        const getRow = (label) => {
          const key = label || 'Other';
          if (!rowsByLabel.has(key)) rowsByLabel.set(key, { label: key, sales: 0, orders: 0 });
          return rowsByLabel.get(key);
        };

        grossRows.forEach((row) => {
          const target = getRow(row.label);
          target.sales += Number(row.sales || 0);
          target.orders += Number(row.orders || 0);
        });

        refundRows.forEach((row) => {
          const target = getRow(row.label);
          target.sales -= Number(row.refunds || 0);
        });

        return Array.from(rowsByLabel.values())
          .filter((row) => Math.abs(row.sales) > 0.005 || row.orders > 0)
          .map((row) => ({ ...row, sales: Number(row.sales.toFixed(2)) }))
          .sort((a, b) => b.sales - a.sales);
      };

      const grossBreakdown = async (labelExpr) => {
        if (hasBrandFilter) {
          return brandSalesQuery(bounds)
            .select(db.raw(`${labelExpr} as label`))
            .select(db.raw(`COALESCE(SUM(${allocatedSalesExpr}), 0) as sales`))
            .select(db.raw('COUNT(DISTINCT s.id) as orders'))
            .groupBy('label');
        }

        return db('sales as s')
          .modify(qb => applyShopScope(qb, 's.shop_id'))
          .where({ 's.order_status': 'completed' })
          .whereBetween('s.created_at', [bounds.start, bounds.end])
          .select(db.raw(`${labelExpr} as label`))
          .sum('s.total as sales')
          .count('s.id as orders')
          .groupBy('label');
      };
      const refundBreakdown = async (labelExpr) => {
        if (hasBrandFilter) {
          return brandReturnsQuery(bounds, true)
            .select(db.raw(`${labelExpr} as label`))
            .select(db.raw('COALESCE(SUM(ri.quantity * ri.refund_price), 0) as refunds'))
            .groupBy('label');
        }

        return db('returns as r')
          .join('sales as s', 'r.sale_id', 's.id')
          .modify(qb => applyShopScope(qb, 'r.shop_id'))
          .whereBetween('r.created_at', [bounds.start, bounds.end])
          .select(db.raw(`${labelExpr} as label`))
          .sum('r.total_refund as refunds')
          .groupBy('label');
      };

      const paymentBreakdownGross = await grossBreakdown('s.payment_method');
      const paymentRefunds = await refundBreakdown('s.payment_method');
      const paymentBreakdown = mergeNetBreakdown(paymentBreakdownGross, paymentRefunds);

      const channelBreakdownGross = await grossBreakdown('s.order_type');
      const channelRefunds = await refundBreakdown('s.order_type');
      const channelBreakdown = mergeNetBreakdown(channelBreakdownGross, channelRefunds);

      const categoryBreakdownGross = await db('sale_items as si')
        .join('sales as s', 'si.sale_id', 's.id')
        .leftJoin('products as p', 'si.product_id', 'p.id')
        .leftJoin(makeItemTotals(), 'si.sale_id', 'item_totals.sale_id')
        .modify(qb => applyShopScope(qb, 's.shop_id'))
        .modify(qb => applyBrandScope(qb))
        .where('s.order_status', 'completed')
        .whereBetween('s.created_at', [bounds.start, bounds.end])
        .select(db.raw("COALESCE(p.category, 'General') as label"))
        .select(db.raw(`SUM(${allocatedSalesExpr}) as sales`))
        .groupBy('label');
      const categoryRefunds = await db('return_items as ri')
        .join('returns as r', 'ri.return_id', 'r.id')
        .leftJoin('products as p', 'ri.product_id', 'p.id')
        .modify(qb => applyShopScope(qb, 'r.shop_id'))
        .modify(qb => applyBrandScope(qb))
        .whereBetween('r.created_at', [bounds.start, bounds.end])
        .select(db.raw("COALESCE(p.category, 'General') as label"))
        .select(db.raw('SUM(ri.quantity * ri.refund_price) as refunds'))
        .groupBy('label');
      const categoryBreakdown = mergeNetBreakdown(categoryBreakdownGross, categoryRefunds);

      const hourQ = await getTrendData(isSqlite
        ? "strftime('%H', s.created_at)"
        : db.raw("TO_CHAR(s.created_at AT TIME ZONE ?, 'HH24') as label", [reportingTimezone]));
      const bestSellingHours = hourQ.sort((a, b) => b.sales - a.sales).slice(0, 5);

      const topProductsRaw = await db('sale_items as si')
        .join('sales as s', 'si.sale_id', 's.id')
        .join('products as p', 'si.product_id', 'p.id')
        .leftJoin('brands as b', 'p.brand_id', 'b.id')
        .leftJoin(makeItemTotals(), 'si.sale_id', 'item_totals.sale_id')
        .modify(qb => applyShopScope(qb, 's.shop_id'))
        .modify(qb => applyBrandScope(qb))
        .where('s.order_status', 'completed')
        .whereBetween('s.created_at', [bounds.start, bounds.end])
        .select('p.id', 'p.name', 'p.image_path', 'p.stock', 'p.product_type', 'b.name as brand_name')
        .sum('si.quantity as quantity_sold')
        .select(db.raw(`SUM(${allocatedSalesExpr}) as sales`))
        .groupBy('p.id', 'p.name', 'p.image_path', 'p.stock', 'p.product_type', 'b.name')
        .orderBy('quantity_sold', 'desc');
      const topProductIds = topProductsRaw.map(row => Number(row.id)).filter(Boolean);
      const topProductReturns = topProductIds.length ? await db('return_items as ri')
        .join('returns as r', 'r.id', 'ri.return_id')
        .whereIn('ri.product_id', topProductIds)
        .modify(qb => applyShopScope(qb, 'r.shop_id'))
        .whereBetween('r.created_at', [bounds.start, bounds.end])
        .select('ri.product_id')
        .select(db.raw('COALESCE(SUM(ri.quantity), 0) as returned_quantity'))
        .select(db.raw('COALESCE(SUM(ri.quantity * ri.refund_price), 0) as refunded_revenue'))
        .groupBy('ri.product_id') : [];
      const returnsByProduct = new Map(topProductReturns.map(row => [Number(row.product_id), row]));
      const topProducts = topProductsRaw.map(r => {
        const returned = returnsByProduct.get(Number(r.id)) || {};
        return ({
        ...r, 
        sales: Number(r.sales || 0) - Number(returned.refunded_revenue || 0),
        quantity_sold: Math.max(0, Number(r.quantity_sold || 0) - Number(returned.returned_quantity || 0)),
        // Legacy aliases for dashboard
        qty_sold: Number(r.quantity_sold || 0),
        revenue: Number(r.sales || 0) - Number(returned.refunded_revenue || 0)
      }); }).sort((a, b) => b.quantity_sold - a.quantity_sold).slice(0, 5);

      // 5. Heatmap
      let heatmapStartBound = bounds.start;
      if (period === '12months') {
        const hmd = new Date(); hmd.setDate(hmd.getDate() - 29);
        heatmapStartBound = `${hmd.toISOString().split('T')[0]} 00:00:00`;
      }
      const heatmapBounds = { start: heatmapStartBound, end: bounds.end };
      const heatmapRawData = hasBrandFilter
        ? await brandSalesQuery(heatmapBounds)
          .select(
            isSqlite
              ? db.raw("date(s.created_at) as dt")
              : db.raw("TO_CHAR(s.created_at AT TIME ZONE ?, 'YYYY-MM-DD') as dt", [reportingTimezone]),
            isSqlite
              ? db.raw("(CAST(strftime('%H', s.created_at) as INTEGER) / 4) as block_idx")
              : db.raw("FLOOR(EXTRACT(HOUR FROM s.created_at AT TIME ZONE ?) / 4) as block_idx", [reportingTimezone])
          )
          .select(db.raw(`COALESCE(SUM(${allocatedSalesExpr}), 0) as sales`), db.raw('COUNT(DISTINCT s.id) as orders'))
          .groupBy('dt', 'block_idx')
        : await db('sales as s')
          .modify(qb => applyShopScope(qb, 's.shop_id'))
          .where({ 's.order_status': 'completed' })
          .whereBetween('s.created_at', [heatmapStartBound, bounds.end])
          .select(
            isSqlite
              ? db.raw("date(s.created_at) as dt")
              : db.raw("TO_CHAR(s.created_at AT TIME ZONE ?, 'YYYY-MM-DD') as dt", [reportingTimezone]),
            isSqlite
              ? db.raw("(CAST(strftime('%H', s.created_at) as INTEGER) / 4) as block_idx")
              : db.raw("FLOOR(EXTRACT(HOUR FROM s.created_at AT TIME ZONE ?) / 4) as block_idx", [reportingTimezone])
          )
          .count('s.id as orders').sum('s.total as sales')
          .groupBy('dt', 'block_idx');
      const heatmapRaw = heatmapRawData.map(r => ({ ...r, sales: Number(r.sales || 0), orders: Number(r.orders || 0), block_idx: Number(r.block_idx) }));

      const recentSales = await db('sales as s')
        .select('s.*')
        .modify(qb => applyShopScope(qb, 's.shop_id'))
        .modify(qb => {
          if (hasBrandFilter) {
            qb.whereIn('s.id', db('sale_items as si')
              .join('products as p', 'si.product_id', 'p.id')
              .select('si.sale_id')
              .where('p.brand_id', selectedBrandId));
          }
        })
        .where('s.order_status', 'completed')
        .whereBetween('s.created_at', [bounds.start, bounds.end])
        .orderBy('created_at', 'desc')
        .limit(10);

      const totalProductsCount = await db('products as p')
        .modify(qb => applyShopScope(qb, 'p.shop_id'))
        .modify(qb => applyBrandScope(qb))
        .where({ 'p.is_deleted': 0 })
        .count('* as val').first();

      const damageTotalResult = await db('waste_events as we')
        .modify(qb => applyShopScope(qb, 'we.shop_id'))
        .where({ 'we.status': 'recorded' })
        .whereBetween('we.created_at', [bounds.start, bounds.end])
        .sum('we.cost_amount as val').first();
      const totalDamageLoss = Number(damageTotalResult ? (damageTotalResult.val || 0) : 0);

      let businessAdjustedRevenue = adjustedRevenue;
      let businessAdjustedCOGS = adjustedCOGS;
      let businessGrossProfit = grossProfit;
      let businessDamageLoss = totalDamageLoss;
      let businessOrderCount = totalOrderCount;

      if (hasBrandFilter) {
        const businessSalesStats = await db('sales as s')
          .modify(qb => applyShopScope(qb, 's.shop_id'))
          .where({ 's.order_status': 'completed' })
          .whereBetween('s.created_at', [bounds.start, bounds.end])
          .select(
            db.raw('COALESCE(SUM(s.total), 0) as total_sales'),
            db.raw('COUNT(s.id) as total_orders')
          ).first();

        const businessReturnsStats = await db('returns as r')
          .modify(qb => applyShopScope(qb, 'r.shop_id'))
          .whereBetween('r.created_at', [bounds.start, bounds.end])
          .select(db.raw('COALESCE(SUM(r.total_refund), 0) as total_refunds'))
          .first();

        const businessCogsStats = await db('sale_items as si')
          .join('sales as s', 'si.sale_id', 's.id')
          .leftJoin('products as p', 'si.product_id', 'p.id')
          .modify(qb => applyShopScope(qb, 's.shop_id'))
          .where('s.order_status', 'completed')
          .whereBetween('s.created_at', [bounds.start, bounds.end])
          .select(db.raw(`SUM(${itemCogsExpr}) as val`))
          .first();

        const businessReturnedCogs = await db('return_items as ri')
          .join('returns as r', 'ri.return_id', 'r.id')
          .leftJoin('sale_items as si', 'ri.sale_item_id', 'si.id')
          .leftJoin('products as p', 'ri.product_id', 'p.id')
          .modify(qb => applyShopScope(qb, 'r.shop_id'))
          .whereBetween('r.created_at', [bounds.start, bounds.end])
          .select(db.raw(`SUM(${returnCogsExpr}) as val`))
          .first();

        const businessDamageResult = await db('products as p')
          .modify(qb => applyShopScope(qb, 'p.shop_id'))
          .where({ 'p.is_deleted': 0 })
          .sum('p.manual_damage_loss as val')
          .first();

        businessAdjustedRevenue = Number(businessSalesStats.total_sales || 0) - Number(businessReturnsStats.total_refunds || 0);
        businessAdjustedCOGS = Number(businessCogsStats ? businessCogsStats.val : 0) - Number(businessReturnedCogs ? businessReturnedCogs.val : 0);
        businessGrossProfit = businessAdjustedRevenue - businessAdjustedCOGS;
        businessDamageLoss = Number(businessDamageResult ? (businessDamageResult.val || 0) : 0);
        businessOrderCount = parseInt(businessSalesStats.total_orders || 0, 10) || 0;
      }

      const shopProfit = businessGrossProfit - businessDamageLoss;
      const shopProfitMargin = businessAdjustedRevenue > 0 ? (shopProfit / businessAdjustedRevenue) * 100 : 0;

      const brandRevenueRows = await db('sale_items as si')
        .join('sales as s', 'si.sale_id', 's.id')
        .join('products as p', 'si.product_id', 'p.id')
        .leftJoin('brands as b', 'p.brand_id', 'b.id')
        .leftJoin(makeItemTotals(), 'si.sale_id', 'item_totals.sale_id')
        .modify(qb => applyShopScope(qb, 's.shop_id'))
        .where('s.order_status', 'completed')
        .whereBetween('s.created_at', [bounds.start, bounds.end])
        .select('p.brand_id', 'b.name as brand_name')
        .select(db.raw(`COALESCE(SUM(${allocatedSalesExpr}), 0) as revenue`))
        .select(db.raw(`COALESCE(SUM(${itemCogsExpr}), 0) as cogs`))
        .select(db.raw('COUNT(DISTINCT s.id) as orders'))
        .groupBy('p.brand_id', 'b.name');
      const brandRefundRows = await db('return_items as ri')
        .join('returns as r', 'ri.return_id', 'r.id')
        .leftJoin('sale_items as si', 'ri.sale_item_id', 'si.id')
        .leftJoin('products as p', 'ri.product_id', 'p.id')
        .leftJoin('brands as b', 'p.brand_id', 'b.id')
        .modify(qb => applyShopScope(qb, 'r.shop_id'))
        .whereBetween('r.created_at', [bounds.start, bounds.end])
        .select('p.brand_id', 'b.name as brand_name')
        .select(db.raw('COALESCE(SUM(ri.quantity * ri.refund_price), 0) as refunds'))
        .select(db.raw(`COALESCE(SUM(${returnCogsExpr}), 0) as returned_cogs`))
        .groupBy('p.brand_id', 'b.name');
      const brandDamageRows = await db('waste_events as we')
        .leftJoin('products as p', 'we.product_id', 'p.id')
        .leftJoin('brands as b', 'p.brand_id', 'b.id')
        .modify(qb => applyShopScope(qb, 'we.shop_id'))
        .where({ 'we.status': 'recorded' })
        .whereBetween('we.created_at', [bounds.start, bounds.end])
        .select('p.brand_id', 'b.name as brand_name')
        .select(db.raw('COALESCE(SUM(we.cost_amount), 0) as damage_loss'))
        .groupBy('p.brand_id', 'b.name');
      const brandMap = new Map();
      brands.forEach((brand) => {
        brandMap.set(Number(brand.id), {
          brand_id: Number(brand.id),
          brand_name: brand.name,
          partner_type: brand.partner_type === 'product_based' ? 'product_based' : 'share_based',
          ownership_percent: Number(brand.ownership_percent || 0),
          revenue: 0,
          refunds: 0,
          cogs: 0,
          returnedCogs: 0,
          orders: 0,
          damageLoss: 0
        });
      });
      const ensureBrandRow = (row) => {
        const id = Number(row.brand_id || 0);
        if (!brandMap.has(id)) {
          brandMap.set(id, {
            brand_id: id,
            brand_name: row.brand_name || 'Unassigned',
            partner_type: 'product_based',
            ownership_percent: 0,
            revenue: 0,
            refunds: 0,
            cogs: 0,
            returnedCogs: 0,
            orders: 0,
            damageLoss: 0
          });
        }
        return brandMap.get(id);
      };
      brandRevenueRows.forEach((row) => {
        const target = ensureBrandRow(row);
        target.revenue = Number(row.revenue || 0);
        target.cogs = Number(row.cogs || 0);
        target.orders = parseInt(row.orders || 0, 10) || 0;
      });
      brandRefundRows.forEach((row) => {
        const target = ensureBrandRow(row);
        target.refunds = Number(row.refunds || 0);
        target.returnedCogs = Number(row.returned_cogs || 0);
      });
      brandDamageRows.forEach((row) => {
        const target = ensureBrandRow(row);
        target.damageLoss = Number(row.damage_loss || 0);
      });
      const brandPerformance = Array.from(brandMap.values()).map((row) => {
        const netRevenue = row.revenue - row.refunds;
        const netCogs = row.cogs - row.returnedCogs;
        const grossProfitValue = netRevenue - netCogs;
        return {
          ...row,
          netRevenue,
          netCogs,
          grossProfit: grossProfitValue,
          netAfterDamage: grossProfitValue - row.damageLoss,
          businessProfitShare: 0,
          profitMargin: netRevenue > 0 ? (grossProfitValue / netRevenue) * 100 : 0
        };
      }).sort((a, b) => b.netRevenue - a.netRevenue);

      const performanceByBrandId = new Map(brandPerformance.map((row) => [Number(row.brand_id), row]));
      const productBasedProfitTotal = brands
        .filter((brand) => brand.partner_type === 'product_based')
        .reduce((sum, brand) => {
          const performance = performanceByBrandId.get(Number(brand.id));
          return sum + Number(performance ? performance.netAfterDamage : 0);
        }, 0);
      const shareBasedProfitPool = shopProfit - productBasedProfitTotal;
      const shareBasedPartners = brands.filter((brand) => brand.partner_type !== 'product_based');
      const totalOwnershipPercent = shareBasedPartners.reduce((sum, brand) => sum + Number(brand.ownership_percent || 0), 0);
      const partnerProfitShares = brands.map((brand) => {
        const partnerType = brand.partner_type === 'product_based' ? 'product_based' : 'share_based';
        const ownershipPercent = partnerType === 'share_based' ? Number(brand.ownership_percent || 0) : 0;
        const performance = performanceByBrandId.get(Number(brand.id));
        const productProfit = Number(performance ? performance.netAfterDamage : 0);
        const profitPool = partnerType === 'product_based' ? productProfit : shareBasedProfitPool;
        const profitShare = partnerType === 'product_based'
          ? productProfit
          : shareBasedProfitPool * (ownershipPercent / 100);
        return {
          brand_id: Number(brand.id),
          brand_name: brand.name,
          partner_type: partnerType,
          allocation_method: partnerType,
          is_selected: selectedBrandId ? Number(brand.id) === selectedBrandId : false,
          ownership_percent: ownershipPercent,
          profit_pool: profitPool,
          profit_share: profitShare,
          product_profit: productProfit
        };
      });
      const partnerShareMap = new Map(partnerProfitShares.map((share) => [Number(share.brand_id), share]));
      brandPerformance.forEach((row) => {
        const share = partnerShareMap.get(Number(row.brand_id));
        row.businessProfitShare = share ? Number(share.profit_share || 0) : 0;
      });
      const selectedPartnerShare = selectedBrand
        ? partnerProfitShares.find((share) => Number(share.brand_id) === selectedBrandId)
        : null;
      const selectedBrandPerformance = selectedBrandId ? performanceByBrandId.get(selectedBrandId) : null;
      const selectedPartnerAudit = selectedPartnerShare
        ? {
          ...selectedPartnerShare,
          business_revenue: businessAdjustedRevenue,
          business_cogs: businessAdjustedCOGS,
          business_gross_profit: businessGrossProfit,
          business_damage_loss: businessDamageLoss,
          business_orders: businessOrderCount,
          shop_profit: shopProfit,
          share_based_profit_pool: shareBasedProfitPool,
          product_based_profit_total: productBasedProfitTotal,
          product_brand_revenue: Number(selectedBrandPerformance ? selectedBrandPerformance.netRevenue : 0),
          product_brand_cogs: Number(selectedBrandPerformance ? selectedBrandPerformance.netCogs : 0),
          product_brand_gross_profit: Number(selectedBrandPerformance ? selectedBrandPerformance.grossProfit : 0),
          product_brand_damage_loss: Number(selectedBrandPerformance ? selectedBrandPerformance.damageLoss : 0),
          product_brand_orders: Number(selectedBrandPerformance ? selectedBrandPerformance.orders : 0)
        }
        : null;
      const totalPartnerProfit = partnerProfitShares.reduce((sum, share) => sum + Number(share.profit_share || 0), 0);
      const retainedOwnerProfit = shopProfit - totalPartnerProfit;

      const receivedAmountExpr = `CASE WHEN COALESCE(s.amount_received, 0) > COALESCE(s.total, 0) THEN COALESCE(s.total, 0) ELSE COALESCE(s.amount_received, 0) END`;
      const staffPerformanceRaw = await db('sales as s')
        .leftJoin('users as u', db.raw('COALESCE(s.payment_receiver_id, s.user_id)'), 'u.id')
        .modify(qb => applyShopScope(qb, 's.shop_id'))
        .where('s.amount_received', '>', 0.01)
        .whereBetween(db.raw('COALESCE(s.payment_received_at, s.created_at)'), [bounds.start, bounds.end])
        .select('u.id as user_id', 'u.name', 'u.username')
        .select(db.raw(`COALESCE(SUM(${receivedAmountExpr}), 0) as received_sales`))
        .count('s.id as orders')
        .groupBy('u.id', 'u.name', 'u.username')
        .orderBy('received_sales', 'desc');
      const staffPerformance = staffPerformanceRaw.map(row => ({
        ...row,
        received_sales: Number(row.received_sales || 0),
        orders: Number(row.orders || 0)
      }));
      const tips = await tipsService.summary({ shopId, bounds });
      const totalPaymentsReceived = staffPerformance.reduce((sum, row) => sum + row.received_sales, 0);

      return {
        bounds,
        activePeriod: period,
        brands,
        selectedBrandId,
        selectedBrandName: selectedBrand ? selectedBrand.name : '',
        brandPerformance,
        partnerProfitShares,
        selectedPartnerAudit,
        totalOwnershipPercent,
        partnerProfitPool: shopProfit,
        shopProfit,
        shareBasedProfitPool,
        productBasedProfitTotal,
        totalPartnerProfit,
        retainedOwnerProfit,
        kpi: { 
          totalSales: adjustedRevenue, 
          totalOrders: totalOrderCount,
          avgOrderValue,
          activeCustomers: activeCustomerCountVal,
          linkedCustomers: linkedCustomerCountVal,
          walkInCustomers: walkInCustomerCountVal,
          totalCustomers: parseInt(totalCustomersInDb ? totalCustomersInDb.val : 0),
          totalInvoices: parseInt(kpi.total_orders || 0),
          conversionRate: null
        },
        growth: {
          sales: salesGrowth,
          orders: ordersGrowth,
          customers: customersGrowth,
          invoices: ordersGrowth
        },
        summary: {
          totalDiscounts: Number(discounts ? (discounts.val || 0) : 0),
          totalReturns: Number(returnsStats ? (returnsStats.return_count || 0) : 0),
          totalRefunds: Number(returnsStats ? (returnsStats.total_refunds || 0) : 0),
          grossProfit: grossProfit,
          shopProfit,
          shopProfitMargin,
          profitMargin: profitMargin,
          grossSales: totalSalesVal - totalTaxVal,
          totalTax: netTaxCollected,
          grossTax: totalTaxVal,
          refundedTax: refundedTaxVal,
          netRevenue: adjustedRevenue,
          stockValue: productStockValue + rawStockValue,
          productStockValue,
          rawStockValue
        },
        trendSeries,
        paymentBreakdown,
        channelBreakdown,
        categoryBreakdown,
        bestSellingHours,
        topProducts,
        heatmapRaw,
        recentSales,
        staffPerformance,
        totalPaymentsReceived,
        totalTipsCollected: tips.total_tips,
        tipsBreakdown: tips,
        totalProducts: parseInt(totalProductsCount ? totalProductsCount.val : 0),
        totalRevenue: adjustedRevenue,
        totalTax: netTaxCollected,
        totalPendingDues: Number(receivables?.total_pending_dues || 0),
        pendingDuesCount: parseInt(receivables?.pending_dues_count || 0),
        totalCOGS: adjustedCOGS,
        netProfit: shopProfit,
        totalSales: totalOrderCount,
        damageTotal: totalDamageLoss
        ,generatedAt: new Date().toISOString()
        ,dataAsOf: new Date().toISOString()
        ,metricVersion: 'analytics-v2'
        ,reportingTimezone
        ,reconciliation: {
          revenue: Number((totalSalesVal - totalRefundsVal - netBilledTax - adjustedRevenue).toFixed(2)),
          profit: Number((adjustedRevenue - adjustedCOGS - totalDamageLoss - shopProfit).toFixed(2)),
          partners: Number((totalPartnerProfit + retainedOwnerProfit - shopProfit).toFixed(2))
        }
      };
    } catch (e) {
      console.error("Critical Analytics Service Error:", e);
      throw e;
    }
  }

  async getGlobalStats() {
    const stats = {};
    const isSqlite = db.client.config.client !== 'pg';
    const totalShops = await db('shops').count('* as c').first();
    stats.totalShops = totalShops.c;
    
    const activeShops = await db('shops').where({ status: 'active' }).count('* as c').first();
    stats.activeShops = activeShops.c;
    
    const totalUsers = await db('users').count('* as c').first();
    stats.totalUsers = totalUsers.c;
    
    const totalRevenueResult = await db('sales').sum('total as v').first();
    stats.totalRevenue = Number(totalRevenueResult.v || 0);
    
    const revDayRaw = await db('sales')
      .where('created_at', '>=', db.raw(isSqlite ? "date('now', '-7 days')" : "CURRENT_DATE - INTERVAL '7 days'"))
      .select(db.raw(isSqlite ? "date(created_at) as day" : "TO_CHAR(created_at, 'YYYY-MM-DD') as day"))
      .sum('total as revenue').groupBy('day').orderBy('day', 'asc');
    stats.revenueByDay = revDayRaw.map(r => ({ ...r, revenue: Number(r.revenue || 0) }));

    stats.recentSales = await db('sales as s')
      .join('shops as sh', 's.shop_id', 'sh.id')
      .select('s.*', 'sh.name as shop_name')
      .orderBy('s.created_at', 'desc').limit(10);

    return stats;
  }
}

module.exports = new AnalyticsService();
