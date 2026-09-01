const ALERTS = [
  { key: 'inventory.expiry_near', label: 'Inventory near expiry', description: 'Batches expiring within four days.' },
  { key: 'inventory.expired', label: 'Inventory expired', description: 'Batches that have passed their expiry date.' },
  { key: 'inventory.low_stock', label: 'Low inventory', description: 'Ingredients or stock products at or below minimum stock.' },
  { key: 'inventory.out_of_stock', label: 'Out of stock', description: 'Ingredients or stock products with no stock remaining.' },
  { key: 'register.cash_drop_requested', label: 'Cash-drop requests', description: 'Cash drops waiting for verification.' },
]
const ALERT_KEYS = new Set(ALERTS.map((alert) => alert.key))
module.exports = { ALERTS, ALERT_KEYS }
