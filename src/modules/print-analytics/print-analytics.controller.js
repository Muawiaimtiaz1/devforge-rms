const service = require('./print-analytics.service');
const { daysSchema, shopIdSchema } = require('./print-analytics.schema');
async function shops(req, res) { res.json(await service.shops(daysSchema.parse(req.query.days))); }
async function detail(req, res) {
  res.json(await service.detail(shopIdSchema.parse(req.params.shopId), daysSchema.parse(req.query.days)));
}
module.exports = { shops, detail };
