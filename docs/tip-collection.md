# Tip collection

The tips module owns sale_tips; SalesService calls its public service inside sale transactions. Existing sales APIs remain the entry points. No new frontend route or permission is introduced: collecting a nonzero tip requires orders.take_payment and an open shift belonging to the authenticated shop/user.

Enter Tip Received inside POS / View Orders / Payment & Complete. Amount Received includes the tip. Example: bill 4500, tender 5000, tip 500, change 0. Tip defaults to zero; ordinary overpayment is still change. The hidden legacy POS tender controls and unpaid inquiry form are not payment entry points.

Money is validated to two decimal places and tips are stored as integer minor units. sales.tip_amount is a receipt projection, written only by the tips module. The bill must be fully covered in addition to the tip. Tips use the selected payment method, belong to the collecting shift, and are immutable after collection. Unique (shop_id, sale_id) plus sale locks prevent duplicates. Shift close locks its shift before calculating the snapshot so concurrent tip collection cannot be missed.

Reporting uses the immutable collection timestamp, with Asia/Karachi date boundaries. Tips are shop-wide, even under a dashboard brand filter; they are not allocated to brands, sales revenue, tax, COGS, or partner profit. Dashboard Payments Received retains its existing bill-payment meaning; the separate Tips Collected card reports tips. Register Total Received includes tips. Only cash tips enter expected drawer cash; all methods enter expected collected total.

React owns the dashboard change. Vanilla owns checkout, analytics, register, order details, and sales history. Customer receipts/reprints and shift-close receipts show tips; kitchen and unpaid inquiry prints omit them.

Startup runs the additive Knex migration for PostgreSQL and SQLite before serving requests. Old orders default to zero tips; no historical excess payment is backfilled. Tests use an isolated in-memory database. A server restart is needed to apply the schema; this change does not deploy or modify a running production database.

This version records collection only. Saved tips cannot be edited or automatically refunded by returning merchandise. Tip corrections, distributions to staff, and tip refunds require a future explicit adjustment workflow; they must not rewrite the original collection or closed shift.
