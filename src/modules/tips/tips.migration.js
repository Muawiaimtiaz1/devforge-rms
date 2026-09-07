async function ensureTipsSchema(db) {
  if (!await db.schema.hasColumn('sales', 'tip_amount')) {
    await db.schema.alterTable('sales', table => table.decimal('tip_amount', 12, 2).notNullable().defaultTo(0));
  }
  if (!await db.schema.hasTable('sale_tips')) {
    await db.schema.createTable('sale_tips', table => {
      table.increments('id');
      table.integer('shop_id').notNullable().references('id').inTable('shops');
      table.integer('sale_id').notNullable().references('id').inTable('sales');
      table.integer('shift_id').notNullable().references('id').inTable('shifts');
      table.integer('collected_by').notNullable().references('id').inTable('users');
      table.bigInteger('amount_cents').notNullable();
      table.string('payment_method', 10).notNullable();
      table.string('collection_mode', 20).notNullable().defaultTo('checkout');
      table.timestamp('collected_at', { useTz: true }).notNullable().defaultTo(db.fn.now());
      table.unique(['shop_id', 'sale_id']);
      table.index(['shop_id', 'collected_at']);
      table.index(['shop_id', 'shift_id']);
      table.check('amount_cents > 0');
      table.check("payment_method IN ('cash', 'card', 'online')");
    });
  }
  if (!await db.schema.hasColumn('sale_tips', 'collection_mode')) {
    await db.schema.alterTable('sale_tips', table => table.string('collection_mode', 20).notNullable().defaultTo('checkout'));
  }
}
module.exports = { ensureTipsSchema };
