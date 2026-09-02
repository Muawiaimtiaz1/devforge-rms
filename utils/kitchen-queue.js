const QUEUE_KINDS = new Set(['new', 'updated']);

function normalizeKitchenIds(values = []) {
  return [...new Set(values.map(Number).filter(value => Number.isInteger(value) && value > 0))];
}

function classifyAffectedKitchenQueues(oldKitchenIds = [], affectedKitchenIds = []) {
  const previous = new Set(normalizeKitchenIds(oldKitchenIds));
  return normalizeKitchenIds(affectedKitchenIds).map(kitchenId => ({
    kitchenId,
    queueKind: previous.has(kitchenId) ? 'updated' : 'new',
  }));
}

function normalizeQueueKind(value) {
  return QUEUE_KINDS.has(value) ? value : 'new';
}

module.exports = { classifyAffectedKitchenQueues, normalizeQueueKind };