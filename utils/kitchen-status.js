function effectiveKitchenStatuses(orderStatus, statuses = []) {
  const kitchenWorkFinished = ['ready', 'served', 'completed'].includes(String(orderStatus || '').toLowerCase());
  if (!kitchenWorkFinished) return statuses;
  return statuses.map(status => ({ ...status, status: 'completed' }));
}

module.exports = { effectiveKitchenStatuses };
