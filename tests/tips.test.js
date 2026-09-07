const test = require('node:test');
const assert = require('node:assert/strict');
const knex = require('knex');
const db = knex({ client: 'better-sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true });
require.cache[require.resolve('../db/knex')] = { exports: db };
const tips = require('../src/modules/tips/tips.service');
const { ensureTipsSchema } = require('../src/modules/tips/tips.migration');
const shifts = require('../services/ShiftService');
const { renderSaleReceiptPage } = require('../services/ReceiptPrintService');
const { renderShiftReceiptPage } = require('../services/ShiftReceiptService');

test('tip collection, isolation, retries, receipts, and shift reconciliation', async t => {
  t.after(() => db.destroy());
  await db.raw('PRAGMA foreign_keys = ON');
  await db.schema.createTable('shops', t => t.increments('id'));
  await db.schema.createTable('users', t => { t.increments('id'); t.integer('shop_id'); });
  await db.schema.createTable('tables', t => { t.increments('id'); t.integer('shop_id'); t.string('table_number'); });
  await db.schema.createTable('shifts', t => { t.increments('id'); t.integer('shop_id'); t.integer('user_id'); t.string('status'); t.decimal('opening_balance').defaultTo(0); t.decimal('cash_drops').defaultTo(0); });
  await db.schema.createTable('sales', t => { t.increments('id'); t.integer('shop_id'); t.integer('user_id'); t.integer('waiter_id'); t.integer('shift_id'); t.integer('table_id'); t.integer('order_number'); t.integer('payment_receiver_id'); t.timestamp('payment_received_at'); t.timestamp('created_at'); t.timestamp('updated_at'); t.string('customer_name'); t.string('order_type'); t.string('order_status'); t.string('payment_method'); t.decimal('total'); t.decimal('amount_received'); });
  for (const name of ['customer_ledger', 'expenses', 'returns', 'cash_drops', 'cash_handovers']) {
    await db.schema.createTable(name, t => { t.increments('id'); t.integer('shop_id'); t.integer('shift_id'); t.integer('sale_id'); t.integer('created_by'); t.string('type'); t.string('status'); t.string('payment_method'); t.decimal('amount'); t.decimal('total_refund'); t.timestamp('created_at'); });
  }
  await ensureTipsSchema(db);
  await ensureTipsSchema(db);
  await db('shops').insert([{id:1},{id:2}]);
  await db('users').insert([{id:1,shop_id:1},{id:2,shop_id:2}]);
  await db('tables').insert([{id:1,shop_id:1,table_number:'A1'},{id:2,shop_id:2,table_number:'Other'}]);
  await db('shifts').insert([{id:1,shop_id:1,user_id:1,status:'open',opening_balance:1000},{id:2,shop_id:2,user_id:2,status:'open'}]);
  await db('sales').insert({id:1,shop_id:1,shift_id:1,total:4500,amount_received:5000,payment_method:'cash',order_status:'completed',order_type:'takeaway'});
  const input = {saleId:1,shopId:1,userId:1,amount:500,total:4500,received:5000,paymentMethod:'cash'};
  const collect = input => db.transaction(trx => tips.collect(trx,input));
  await t.test('validates money and overpayment explicitly', () => {
    assert.equal(tips.validateTip(500,4500,5000),50000);
    assert.equal(tips.validateTip(0,4500,5000),0);
    for(const amount of [-1,NaN,Infinity,'500',0.001]) assert.throws(()=>tips.validateTip(amount,4500,5000));
    assert.throws(()=>tips.validateTip(501,4500,5000), /cover/);
    assert.throws(()=>tips.validateTip(1,4500,100), /cover/);
  });
  await t.test('wrong shop, wrong collector, and rollback leave no tip', async () => {
    await assert.rejects(collect({...input,shopId:2,userId:2}), /Sale not found/);
    await assert.rejects(collect({...input,userId:2}), /open a register/);
    await assert.rejects(db.transaction(async trx => { await tips.collect(trx,input); throw Error('rollback'); }), /rollback/);
    assert.equal((await db('sale_tips')).length,0);
  });
  await t.test('collects once and rejects changing a collected tip', async () => {
    await collect(input); await collect(input);
    assert.equal((await db('sale_tips')).length,1);
    assert.equal(Number((await db('sales').first()).tip_amount),500);
    await assert.rejects(collect({...input,amount:400}), /cannot be edited/);
    assert.equal((await tips.summary({shopId:2})).total_tips,0);
  });
  await t.test('4500 sale plus 500 cash tip reconciles to 6000 with 1000 opening', async () => {
    const summary=await shifts.calculateShiftSummary(1,1);
    assert.equal(summary.net_cash_sales,4500); assert.equal(summary.total_tips,500);
    assert.equal(summary.expected_balance,6000); assert.equal(summary.expected_total,5000);
    const list=await shifts.listReceivedPayments(1,1,{shiftId:1});
    assert.equal(list.summary.total_amount,5000); assert.equal(list.items[0].tip_amount,500);
    const receipt=renderShiftReceiptPage({shift:{id:1,closing_balance:6000},summary,shop:{name:'Test'}},{autoPrint:false});
    assert.match(receipt,/Tips collected/); assert.match(receipt,/6000.00/);
  });
  await t.test('paid receipt separates tips from change; kitchen and unpaid omit tips', async () => {
    const details={sale:await db('sales').first(),items:[],shop:{name:'Test'}};
    const paid=renderSaleReceiptPage(details,{autoPrint:false});
    assert.match(paid,/Tip received \(Cash\):<\/strong> Rs. 500.00/);
    assert.match(paid,/Change:<\/strong> Rs. 0/);
    assert.doesNotMatch(renderSaleReceiptPage(details,{format:'kitchen',autoPrint:false}),/Tip received/);
    assert.doesNotMatch(renderSaleReceiptPage(details,{format:'unpaid',autoPrint:false}),/Tip received/);
    assert.match(renderSaleReceiptPage({...details,sale:{...details.sale,tip_amount:200}},{autoPrint:false}),/Change:<\/strong> Rs. 300/);
  });
  await t.test('card and online tips increase collected total without increasing drawer cash', async () => {
    for (const [id, method] of [[3,'card'],[4,'online']]) {
      await db('sales').insert({id,shop_id:1,shift_id:1,total:100,amount_received:125,payment_method:method,order_status:'completed'});
      await collect({...input,saleId:id,total:100,received:125,amount:25,paymentMethod:method});
    }
    const summary = await shifts.calculateShiftSummary(1,1);
    assert.equal(summary.total_tips,550); assert.equal(summary.cash_tips,500);
    assert.equal(summary.card_tips,25); assert.equal(summary.online_tips,25);
    assert.equal(summary.expected_balance,6000); assert.equal(summary.expected_total,5250);
    await db('sale_tips').whereIn('sale_id',[3,4]).update({collected_at:'2026-01-01 00:00:00'});
  });
  await t.test('tip-only request requires payment permission on the sales router', () => {
    const router = require('../routes/sales');
    const guard = router.stack[1].handle;
    let status, allowed = false;
    const res = {status(code){status=code;return this;},json(){return this;}};
    const req={method:'PATCH',body:{tip_amount:500},session:{user:{id:1,shop_id:1,role:'cashier'}},permissions:['orders.update']};
    guard(req,res,()=>{allowed=true;});
    assert.equal(status,403); assert.equal(allowed,false);
    req.permissions.push('orders.take_payment');
    guard(req,res,()=>{allowed=true;}); assert.equal(allowed,true);
  });
  await t.test('tips API maps every request to payment permission', () => {
    const { actionFor, RESOURCE_MODULE } = require('../authorization/api-policy');
    assert.equal(RESOURCE_MODULE.tips, 'orders');
    assert.equal(actionFor({ method: 'GET', path: '/options' }, 'tips'), 'take_payment');
    assert.equal(actionFor({ method: 'POST', path: '/5' }, 'tips'), 'take_payment');
  });
  await t.test('tip-only payment preserves original bill shift and payment method', async () => {
    await db('shifts').insert({id:3,shop_id:1,user_id:1,status:'open'});
    await db('shifts').where({id:1}).update({status:'closed'});
    await db('sales').insert({id:5,shop_id:1,shift_id:1,total:100,amount_received:100,payment_method:'cash',order_status:'completed'});
    const customers=require('../services/CustomerService');
    const original=customers.resolveOrCreateCustomer;
    customers.resolveOrCreateCustomer=async()=>null;
    try {
      await require('../services/SalesService').updateDetails(5,1,{amount_received:110,tip_amount:10,payment_method:'card'},1);
      const sale=await db('sales').where({id:5}).first();
      assert.equal(sale.shift_id,1); assert.equal(sale.payment_method,'cash');
      const tip=await db('sale_tips').where({sale_id:5}).first();
      assert.equal(tip.shift_id,3); assert.equal(tip.payment_method,'card');
      assert.equal((await shifts.calculateShiftSummary(3,1)).expected_balance,0);
      assert.equal((await shifts.listReceivedPayments(1,1,{shiftId:3})).summary.total_amount,10);
    } finally {
      customers.resolveOrCreateCustomer=original;
      await db('shifts').where({id:3}).update({status:'closed'});
      await db('sale_tips').where({sale_id:5}).update({collected_at:'2026-01-01 00:00:00'});
    }
  });
  await t.test('closing snapshot includes tips and rejects a second close', async () => {
    await db.schema.alterTable('shifts', t => {
      for (const field of ['closing_balance','expected_balance','net_cash_sales','net_card_sales','total_expenses']) t.decimal(field);
      t.timestamp('end_time'); t.string('note'); t.integer('closed_by_user_id'); t.string('shortage_reason');
    });
    await db('shifts').where({id:3}).update({status:'open'});
    const activity=require('../services/ActivityLogService');
    const original=activity.log; activity.log=async()=>{};
    try {
      const result=await shifts.closeShift(3,1,0,'Test close',1);
      assert.equal(result.total_tips,10); assert.equal(result.expected_total,10);
      assert.equal(result.expected_balance,0); assert.equal(result.discrepancy,0);
      assert.equal((await db('shifts').where({id:3}).first()).status,'closed');
      await assert.rejects(shifts.closeShift(3,1,0,'Repeat',1), /already closed/);
    } finally { activity.log=original; }
  });
  await t.test('selector returns only visible completed paid untipped orders and standalone collection keeps bill payment unchanged', async () => {
    await db('shifts').insert({id:4,shop_id:1,user_id:1,status:'open'});
    const now = new Date().toISOString().replace('T',' ').slice(0,19);
    await db('sales').insert([
      {id:6,order_number:106,shop_id:1,user_id:1,shift_id:1,table_id:1,total:4500,amount_received:4500,payment_method:'cash',order_status:'completed',order_type:'dine_in',created_at:now,updated_at:now,payment_received_at:now},
      {id:7,order_number:107,shop_id:1,user_id:1,total:100,amount_received:100,payment_method:'cash',order_status:'ready',order_type:'takeaway',created_at:now,updated_at:now},
      {id:8,order_number:108,shop_id:2,user_id:2,total:100,amount_received:100,payment_method:'cash',order_status:'completed',order_type:'takeaway',created_at:now,updated_at:now,payment_received_at:now}
    ]);
    const user={id:1,role:'cashier'};
    const options=await tips.listEligibleOrders(1,user,{search:'A1',tableId:1});
    assert.deepEqual(options.orders.map(row=>row.id),[6]);
    assert.deepEqual(options.tables.map(row=>row.id),[1]);
    const result=await tips.recordStandalone({saleId:6,shopId:1,user,amount:500,paymentMethod:'card'});
    assert.equal(result.shift_id,4);
    const sale=await db('sales').where({id:6}).first();
    assert.equal(Number(sale.amount_received),4500); assert.equal(sale.payment_method,'cash'); assert.equal(sale.shift_id,1);
    const record=await db('sale_tips').where({sale_id:6}).first();
    assert.equal(record.collection_mode,'standalone'); assert.equal(record.payment_method,'card');
    assert.equal((await tips.listEligibleOrders(1,user,{})).orders.some(row=>row.id===6),false);
    await assert.rejects(tips.recordStandalone({saleId:6,shopId:1,user,amount:500,paymentMethod:'card'}), /already/);
    await assert.rejects(tips.recordStandalone({saleId:8,shopId:1,user,amount:50,paymentMethod:'cash'}), /not found/);
    const receipt=renderSaleReceiptPage({sale:{...sale,tip_amount:500,tip_collection_mode:'standalone',tip_payment_method:'card'},items:[],shop:{}},{autoPrint:false});
    assert.match(receipt,/Tip received \(Card\)/); assert.match(receipt,/Total collected:<\/strong> Rs. 5000.00/); assert.doesNotMatch(receipt,/Due:/);
    await db('shifts').where({id:4}).update({status:'closed'});
  });
  await t.test('collection date follows Karachi midnight and original shift', async () => {
    await db('sale_tips').where({sale_id:1}).update({collected_at:'2026-09-05 19:00:00'});
    assert.equal((await tips.summary({shopId:1,bounds:{start:'2026-09-06 00:00:00',end:'2026-09-06 23:59:59'}})).total_tips,500);
    assert.equal((await tips.summary({shopId:1,bounds:{start:'2026-09-05 00:00:00',end:'2026-09-05 23:59:59'}})).total_tips,0);
    await db('shifts').where({id:1}).update({status:'closed'});
    await collect(input); // Exact retry does not move or duplicate a closed-shift tip.
    await db('sales').insert({id:2,shop_id:1,total:100,amount_received:110});
    await assert.rejects(collect({...input,saleId:2,total:100,received:110,amount:10}), /open a register/);
  });
});
