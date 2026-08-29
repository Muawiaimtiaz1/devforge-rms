const express = require("express");
const salesService = require("../services/SalesService");
const { requireAuth } = require("../middleware/auth");
const publishOrderChange = require('../utils/publish-order-change');
const router = express.Router();

// POST /api/sales — create a sale (checkout)
router.post("/", requireAuth, async (req, res) => {
  const result = await salesService.createSale(req.body, req.session.user.shop_id, req.session.user.id);
  if (!result.duplicate) void publishOrderChange('order.created', result.saleId, req.session.user.shop_id);
  res.json({ ok: true, ...result });
});

// PUT /api/sales/:id/items — update an existing sale items/details
router.put("/:id/items", requireAuth, async (req, res) => {
  const canRemoveItems = (req.permissions || []).includes('orders.remove_items');
  const result = await salesService.updateSaleItems(req.params.id, req.body, req.session.user.shop_id, req.session.user.id, { canRemoveItems });
  void publishOrderChange('order.updated', req.params.id, req.session.user.shop_id);
  res.json({ ok: true, ...result });
});

// GET /api/sales — list sales for current shop
router.get("/", requireAuth, async (req, res) => {
  const sales = await salesService.getSales(req.session.user.shop_id, req.session.user);
  const isRestrictedSalesPanel = req.query.view === 'sales_panel'
    && ['waiter', 'order_taker'].includes(String(req.session.user.role || '').toLowerCase());
  if (isRestrictedSalesPanel) {
    return res.json(sales.map(sale => ({
      id: sale.id,
      order_number: sale.order_number,
      order_status: sale.order_status
    })));
  }
  res.json(sales);
});

// PATCH /api/sales/:id/pay — record payment / update received amount
router.patch("/:id/pay", requireAuth, async (req, res) => {
  const { amount, payment_method = 'cash', note } = req.body;
  const finalAmount = await salesService.payDue(req.params.id, req.session.user.shop_id, req.session.user.id, amount, payment_method, note);
  void publishOrderChange('order.payment_changed', req.params.id, req.session.user.shop_id);
  res.json({ ok: true, amount_received: finalAmount });
});

// PATCH /api/sales/:id/details — update sale details
router.patch("/:id/details", requireAuth, async (req, res) => {
  await salesService.updateDetails(req.params.id, req.session.user.shop_id, req.body, req.session.user.id);
  void publishOrderChange('order.updated', req.params.id, req.session.user.shop_id);
  res.json({ ok: true });
});

// Updates printable inquiry-bill details without collecting payment or closing the order.
router.patch("/:id/inquiry-bill", requireAuth, async (req, res) => {
  await salesService.updateInquiryBill(req.params.id, req.session.user.shop_id, req.body);
  void publishOrderChange('order.updated', req.params.id, req.session.user.shop_id);
  res.json({ ok: true });
});

// GET /api/sales/:id/bill — get full bill details
router.get("/:id/bill", requireAuth, async (req, res) => {
  const details = await salesService.getBill(req.params.id, req.session.user.shop_id);
  if (!details) return res.status(404).json({ error: "Sale not found" });
  const isRestrictedSalesPanel = req.query.view === 'sales_panel'
    && ['waiter', 'order_taker'].includes(String(req.session.user.role || '').toLowerCase());
  if (isRestrictedSalesPanel) {
    const saleIsVisible = (await salesService.getSales(req.session.user.shop_id, req.session.user))
      .some(sale => Number(sale.id) === Number(req.params.id));
    if (!saleIsVisible) return res.status(404).json({ error: "Sale not found" });
    return res.json({
      sale: {
        id: details.sale.id,
        order_number: details.sale.order_number
      },
      items: (details.items || []).map(item => ({
        product_name: item.product_name,
        quantity: item.quantity,
        variants_json: item.variants_json,
        addons_json: item.addons_json,
        special_instructions: item.special_instructions
      }))
    });
  }
  res.json(details);
});

// POST /api/sales/:id/return — process a return
router.post("/:id/return", requireAuth, async (req, res) => {
  const result = await salesService.processReturn(req.params.id, req.session.user.shop_id, req.session.user.id, req.body);
  void publishOrderChange('order.returned', req.params.id, req.session.user.shop_id);
  res.json({ ok: true, ...result });
});

// GET /api/sales/returns/:id/receipt — get return receipt data
router.get("/returns/:id/receipt", requireAuth, async (req, res) => {
  const data = await salesService.getReturnReceipt(req.params.id, req.session.user.shop_id);
  if (!data) return res.status(404).json({ error: "Return not found" });
  res.json(data);
});

module.exports = router;
