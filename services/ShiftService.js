const db = require('../db/knex');
const activityLog = require('./ActivityLogService');

function toMoney(value) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
}

function firstTotal(rows) {
  if (!Array.isArray(rows) || !rows[0]) return 0;
  return toMoney(rows[0].total);
}

function shiftDateKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

class ShiftService {
  async syncLegacyOpenCashDrops(shopId = null) {
    const legacyShiftsQuery = db('shifts')
      .where('status', 'open')
      .whereRaw('COALESCE(cash_drops, 0) > 0');

    if (shopId) legacyShiftsQuery.andWhere('shop_id', shopId);

    const legacyShifts = await legacyShiftsQuery;

    for (const shift of legacyShifts) {
      const existingDrop = await db('cash_drops')
        .where({ shift_id: shift.id })
        .first();

      if (existingDrop) continue;

      await db.transaction(async (trx) => {
        await trx('cash_drops').insert({
          shop_id: shift.shop_id,
          shift_id: shift.id,
          requested_by_user_id: shift.user_id,
          amount: toMoney(shift.cash_drops),
          status: 'pending',
          note: 'Imported from previous cash drop total before verification was enabled.'
        });

        await trx('shifts')
          .where({ id: shift.id, shop_id: shift.shop_id })
          .update({
            cash_drops: 0,
            note: trx.raw("COALESCE(note, '') || ?", ['\n[Legacy cash drops moved to pending verification]'])
          });
      });
    }
  }

  /**
   * Get the currently active shift for a specific user in a shop.
   */
  async getActiveShift(shopId, userId) {
    return await db('shifts')
      .where({ shop_id: shopId, user_id: userId, status: 'open' })
      .first();
  }

  /**
   * Open a new shift for a user.
   */
  async openShift(shopId, userId, openingBalance, terminalId = null) {
    if (!Number.isFinite(Number(openingBalance)) || Number(openingBalance) < 0) {
      throw new Error('Opening balance cannot be negative.');
    }
    // 1. Check if user has permission
    const user = await db('users').where({ id: userId, shop_id: shopId }).first();
    if (!user || (!user.can_manage_register && !['admin', 'manager', 'receptionist'].includes(user.role))) {
      throw new Error('You do not have permission to manage the register.');
    }

    // 2. Check if a shift is already open for this user
    const existing = await this.getActiveShift(shopId, userId);
    if (existing) {
      throw new Error('You already have an active shift open.');
    }

    // 3. Create new shift
    const [idObj] = await db('shifts').insert({
      shop_id: shopId,
      user_id: userId,
      opening_balance: openingBalance,
      expected_balance: openingBalance,
      terminal_id: terminalId,
      status: 'open',
      start_time: db.fn.now()
    }).returning('id');

    const id = typeof idObj === 'object' ? idObj.id : idObj;

    await activityLog.log(shopId, userId, 'SHIFT_OPEN', {
      shift_id: id,
      opening_balance: openingBalance,
      terminal_id: terminalId
    }, id, 'shift');

    return id;
  }

  /**
   * Calculate the expected balance for a shift based on transactions.
   */
  async calculateShiftSummary(shiftId, shopId) {
    const shift = await db('shifts').where({ id: shiftId, shop_id: shopId }).first();
    if (!shift) throw new Error('Shift not found');

    // Total Cash Sales (from sales table - subtracting later debt payments to avoid double counting).
    // amount_received is also used to store the cash tendered so receipts can show change.
    // Only the amount retained for the sale belongs in the drawer (e.g. Rs. 500
    // tendered for a Rs. 230 sale adds Rs. 230, because Rs. 270 was returned).
    const retainedSaleAmount = `CASE
      WHEN COALESCE(s.amount_received, 0) > COALESCE(s.total, 0) THEN COALESCE(s.total, 0)
      ELSE COALESCE(s.amount_received, 0)
    END`;
    const salesTotal = await db('sales as s')
      .where({ 's.shift_id': shiftId, 's.shop_id': shopId, 's.payment_method': 'cash' })
      .whereNot('s.order_status', 'payment_pending')
      .select(db.raw(`
        COALESCE(SUM(
          (${retainedSaleAmount}) -
          COALESCE((
            SELECT SUM(amount) 
            FROM customer_ledger 
            WHERE sale_id = s.id AND type = 'payment'
          ), 0)
        ), 0) as total
      `))
      .first();
    
    const cashSales = toMoney(salesTotal?.total);

    // Total Card Sales (for reporting)
    const cardTotal = await db('sales as s')
      .where({ 's.shift_id': shiftId, 's.shop_id': shopId, 's.payment_method': 'card' })
      .whereNot('s.order_status', 'payment_pending')
      .select(db.raw(`
        COALESCE(SUM(
          (${retainedSaleAmount}) -
          COALESCE((
            SELECT SUM(amount) 
            FROM customer_ledger 
            WHERE sale_id = s.id AND type = 'payment'
          ), 0)
        ), 0) as total
      `))
      .first();
    
    const cardSales = toMoney(cardTotal?.total);

    const onlineTotal = await db('sales as s')
      .where({ 's.shift_id': shiftId, 's.shop_id': shopId, 's.payment_method': 'online' })
      .whereNot('s.order_status', 'payment_pending')
      .select(db.raw(`
        COALESCE(SUM(
          (${retainedSaleAmount}) -
          COALESCE((SELECT SUM(amount) FROM customer_ledger WHERE sale_id = s.id AND type = 'payment'), 0)
        ), 0) as total
      `))
      .first();
    const onlineSales = toMoney(onlineTotal?.total);

    // Total Debt Collections (Customer Ledger payments in cash)
    const debtCollectionsCount = await db('customer_ledger')
      .where({ shift_id: shiftId, shop_id: shopId, type: 'payment', payment_method: 'cash' })
      .sum('amount as total')
      .first();
    
    const cashCollections = toMoney(debtCollectionsCount?.total);

    const cardCollectionsRow = await db('customer_ledger')
      .where({ shift_id: shiftId, shop_id: shopId, type: 'payment', payment_method: 'card' })
      .sum('amount as total')
      .first();
    const onlineCollectionsRow = await db('customer_ledger')
      .where({ shift_id: shiftId, shop_id: shopId, type: 'payment', payment_method: 'online' })
      .sum('amount as total')
      .first();

    // Shop/business expenses are reported separately and do not reduce cashier drawer cash.
    const expensesTotal = await db('expenses')
      .where({ shift_id: shiftId, shop_id: shopId })
      .sum('amount as total');
    
    const cashExpenses = firstTotal(expensesTotal);

    // Cash refunds paid out during this shift.
    const refundsTotal = await db('returns')
      .where({ shift_id: shiftId, shop_id: shopId, payment_method: 'cash' })
      .sum('total_refund as total');

    const cashRefunds = firstTotal(refundsTotal);

    const pendingDrops = await db('cash_drops')
      .where({ shift_id: shiftId, shop_id: shopId, status: 'pending' })
      .sum('amount as total');

    const pendingDropCountRow = await db('cash_drops')
      .where({ shift_id: shiftId, shop_id: shopId, status: 'pending' })
      .count('id as count')
      .first();

    const pendingHandovers = await db('cash_handovers')
      .where({ shift_id: shiftId, shop_id: shopId, status: 'pending' })
      .sum('amount as total');

    const pendingHandoverCountRow = await db('cash_handovers')
      .where({ shift_id: shiftId, shop_id: shopId, status: 'pending' })
      .count('id as count')
      .first();

    // Verified cash drops are cached on the shift so legacy shifts keep working.
    const currentDrops = toMoney(shift.cash_drops);
    const verifiedHandovers = await db('cash_handovers')
      .where({ shift_id: shiftId, shop_id: shopId, status: 'verified' })
      .sum('amount as total');
    
    const confirmedHandovers = firstTotal(verifiedHandovers);

    const expectedBalance = (toMoney(shift.opening_balance) + cashSales + cashCollections) - (cashRefunds + currentDrops + confirmedHandovers);

    return {
      opening_balance: toMoney(shift.opening_balance),
      net_cash_sales: cashSales,
      net_card_sales: cardSales,
      net_online_sales: onlineSales,
      total_expenses: cashExpenses,
      total_cash_refunds: cashRefunds,
      cash_drops: currentDrops,
      pending_cash_drops: firstTotal(pendingDrops),
      pending_cash_drop_count: Number(pendingDropCountRow?.count || 0),
      pending_cash_handovers: firstTotal(pendingHandovers),
      pending_cash_handover_count: Number(pendingHandoverCountRow?.count || 0),
      cash_handovers: confirmedHandovers,
      debt_collections: cashCollections,
      card_collections: toMoney(cardCollectionsRow?.total),
      online_collections: toMoney(onlineCollectionsRow?.total),
      expected_balance: expectedBalance
    };
  }

  /**
   * Close a shift with a physical cash count.
   */
  async closeShift(shiftId, shopId, actualBalance, note = '', closedByUserId, shortage_reason = null) {
    if (!Number.isFinite(Number(actualBalance)) || Number(actualBalance) < 0) {
      throw new Error('Cash count cannot be negative.');
    }
    await this.syncLegacyOpenCashDrops(shopId);

    const shift = await db('shifts').where({ id: shiftId, shop_id: shopId }).first();
    if (!shift) throw new Error('Shift not found');
    if (shift.status !== 'open') throw new Error('Shift is already closed');

    const summary = await this.calculateShiftSummary(shiftId, shopId);
    const pendingVerificationTotal = toMoney(summary.pending_cash_drops) + toMoney(summary.pending_cash_handovers);
    const hasPendingVerifications = summary.pending_cash_drop_count > 0 || summary.pending_cash_handover_count > 0;
    const expectedAtClose = summary.expected_balance - pendingVerificationTotal;

    const discrepancy = toMoney(actualBalance) - expectedAtClose;
    
    await db('shifts')
      .where({ id: shiftId, shop_id: shopId })
      .update({
        closing_balance: toMoney(actualBalance),
        expected_balance: expectedAtClose,
        net_cash_sales: summary.net_cash_sales,
        net_card_sales: summary.net_card_sales,
        total_expenses: summary.total_expenses,
        status: 'closed',
        end_time: db.fn.now(),
        note: note,
        closed_by_user_id: closedByUserId,
        shortage_reason: shortage_reason
      });

    await activityLog.log(shopId, closedByUserId, 'SHIFT_CLOSE', {
      shift_id: shiftId,
      expected: expectedAtClose,
      expected_before_pending: summary.expected_balance,
      actual: actualBalance,
      discrepancy: discrepancy,
      pending_cash_drops: summary.pending_cash_drops,
      pending_cash_drop_count: summary.pending_cash_drop_count,
      pending_cash_handovers: summary.pending_cash_handovers,
      pending_cash_handover_count: summary.pending_cash_handover_count,
      pending_verification_total: pendingVerificationTotal,
      provisional_close: hasPendingVerifications,
      shortage_reason: shortage_reason,
      note: note
    }, shiftId, 'shift');

    return {
      ...summary,
      expected_before_pending: summary.expected_balance,
      expected_balance: expectedAtClose,
      pending_verification_total: pendingVerificationTotal,
      has_pending_verifications: hasPendingVerifications,
      closing_balance: toMoney(actualBalance),
      discrepancy
    };
  }

  async refreshClosedShiftSnapshot(shiftId, shopId) {
    const shift = await db('shifts').where({ id: shiftId, shop_id: shopId }).first();
    if (!shift || shift.status !== 'closed') return null;

    const summary = await this.calculateShiftSummary(shiftId, shopId);
    const pendingVerificationTotal = toMoney(summary.pending_cash_drops) + toMoney(summary.pending_cash_handovers);
    const expectedBalance = summary.expected_balance - pendingVerificationTotal;
    const discrepancy = toMoney(shift.closing_balance) - expectedBalance;

    await db('shifts')
      .where({ id: shiftId, shop_id: shopId })
      .update({
        expected_balance: expectedBalance,
        net_cash_sales: summary.net_cash_sales,
        net_card_sales: summary.net_card_sales,
        total_expenses: summary.total_expenses,
        cash_handovers: summary.cash_handovers
      });

    return {
      ...summary,
      expected_before_pending: summary.expected_balance,
      expected_balance: expectedBalance,
      pending_verification_total: pendingVerificationTotal,
      closing_balance: toMoney(shift.closing_balance),
      discrepancy
    };
  }

  /**
   * Record a Cash Drop (Internal removal to safe).
   */
  async recordCashDrop(shiftId, shopId, amount, note = '', requestedByUserId = null) {
    if (toMoney(amount) <= 0) throw new Error('Valid amount required.');
    await this.syncLegacyOpenCashDrops(shopId);

    const shift = await db('shifts').where({ id: shiftId, shop_id: shopId }).first();
    if (!shift) throw new Error('Shift not found');
    if (shift.status !== 'open') throw new Error('Cash drops can only be recorded on an open shift');

    const summary = await this.calculateShiftSummary(shiftId, shopId);
    const availableForDrop = summary.expected_balance - summary.pending_cash_drops - summary.pending_cash_handovers;
    if (toMoney(amount) > availableForDrop + 0.01) {
      throw new Error(`Cash drop cannot exceed available drawer cash. Available for drop: Rs. ${Math.max(0, availableForDrop).toFixed(2)}.`);
    }

    const [idObj] = await db('cash_drops').insert({
      shop_id: shopId,
      shift_id: shiftId,
      requested_by_user_id: requestedByUserId || shift.user_id,
      amount: toMoney(amount),
      status: 'pending',
      note: note || null
    }).returning('id');

    await db('shifts')
      .where({ id: shiftId, shop_id: shopId })
      .update({
        note: db.raw("COALESCE(note, '') || ?", [`\n[Cash Drop Requested: ${amount}${note ? ' - ' + note : ''}]`])
      });

    const dropId = typeof idObj === 'object' ? idObj.id : idObj;
    await activityLog.log(shopId, requestedByUserId || shift.user_id, 'CASH_DROP_REQUEST', {
      shift_id: shiftId,
      amount: amount,
      drop_id: dropId,
      note: note
    }, shiftId, 'shift');

    return dropId;
  }

  async listPendingCashDrops(shopId) {
    await this.syncLegacyOpenCashDrops(shopId);

    const query = db('cash_drops as cd')
      .select(
        'cd.*',
        'shops.name as shop_name',
        's.start_time',
        's.status as shift_status',
        db.raw('COALESCE(u.name, u.username, shift_user.name, shift_user.username) as cashier_name'),
        db.raw('COALESCE(u.username, shift_user.username) as cashier_username'),
        'v.name as verified_by_name'
      )
      .leftJoin('shifts as s', 'cd.shift_id', 's.id')
      .leftJoin('shops', 'cd.shop_id', 'shops.id')
      .leftJoin('users as u', 'cd.requested_by_user_id', 'u.id')
      .leftJoin('users as shift_user', 's.user_id', 'shift_user.id')
      .leftJoin('users as v', 'cd.verified_by_user_id', 'v.id')
      .where({ 'cd.status': 'pending' });

    if (shopId) query.andWhere('cd.shop_id', shopId);

    return query.orderBy('cd.created_at', 'asc');
  }

  async verifyCashDrop(cashDropId, shopId, verifierUserId, status = 'verified') {
    if (!['verified', 'rejected'].includes(status)) throw new Error('Invalid cash drop status');

    const result = await db.transaction(async (trx) => {
      const dropQuery = trx('cash_drops').where({ id: cashDropId });
      if (shopId) dropQuery.andWhere('shop_id', shopId);
      const drop = await dropQuery.first();

      if (!drop) throw new Error('Cash drop not found');
      if (drop.status !== 'pending') throw new Error('Cash drop already processed');

      const shift = await trx('shifts')
        .where({ id: drop.shift_id, shop_id: drop.shop_id })
        .first();
      if (!shift) throw new Error('Shift not found');

      await trx('cash_drops')
        .where({ id: cashDropId, shop_id: drop.shop_id })
        .update({
          status,
          verified_by_user_id: verifierUserId,
          verified_at: trx.fn.now()
        });

      const noteLine = status === 'verified'
        ? `\n[Cash Drop Verified: ${drop.amount} by user ${verifierUserId}]`
        : `\n[Cash Drop Rejected: ${drop.amount} by user ${verifierUserId}]`;

      const updateData = {
        note: trx.raw("COALESCE(note, '') || ?", [noteLine])
      };

      if (status === 'verified') {
        updateData.cash_drops = trx.raw('COALESCE(cash_drops, 0) + ?', [toMoney(drop.amount)]);
      }

      await trx('shifts')
        .where({ id: drop.shift_id, shop_id: drop.shop_id })
        .update(updateData);

      await activityLog.log(drop.shop_id, verifierUserId, `CASH_DROP_${status.toUpperCase()}`, {
        shift_id: drop.shift_id,
        drop_id: cashDropId,
        amount: drop.amount,
        requested_at: drop.created_at
      }, drop.shift_id, 'shift');

      return { ...drop, status };
    });

    await this.refreshClosedShiftSnapshot(result.shift_id, result.shop_id);

    return result;
  }

  /**
   * Initiate a cash handover to another user.
   */
  async createHandover(shiftId, shopId, senderId, receiverId, amount, note = '') {
    if (toMoney(amount) <= 0) throw new Error('Valid amount required.');
    if (Number(senderId) === Number(receiverId)) throw new Error('Select another person to receive the handover.');
    await this.syncLegacyOpenCashDrops(shopId);

    const shift = await db('shifts').where({ id: shiftId, shop_id: shopId, user_id: senderId }).first();
    if (!shift) throw new Error('Shift not found');
    if (shift.status !== 'open') throw new Error('Cash handovers can only be created from an open shift');

    const receiver = await db('users')
      .where({ id: receiverId, shop_id: shopId })
      .whereNot('status', 'blocked')
      .first();
    if (!receiver) throw new Error('Handover recipient not found');

    const summary = await this.calculateShiftSummary(shiftId, shopId);
    const availableForHandover = summary.expected_balance - summary.pending_cash_drops - summary.pending_cash_handovers;
    if (toMoney(amount) > availableForHandover + 0.01) {
      throw new Error(`Cash handover cannot exceed available drawer cash. Available for handover: Rs. ${Math.max(0, availableForHandover).toFixed(2)}.`);
    }

    const [idObj] = await db('cash_handovers').insert({
      shop_id: shopId,
      shift_id: shiftId,
      sender_id: senderId,
      receiver_id: receiverId,
      amount: toMoney(amount),
      status: 'pending',
      note: note
    }).returning('id');

    const handoverId = typeof idObj === 'object' ? idObj.id : idObj;

    await activityLog.log(shopId, senderId, 'HANDOVER_REQUEST', {
      shift_id: shiftId,
      handover_id: handoverId,
      amount,
      receiver_id: receiverId,
      note
    }, shiftId, 'shift');

    return handoverId;
  }

  async listPendingHandovers(shopId, receiverId = null) {
    const query = db('cash_handovers as ch')
      .select(
        'ch.*',
        'shops.name as shop_name',
        'sender.name as sender_name',
        'sender.username as sender_username',
        'receiver.name as receiver_name',
        'receiver.username as receiver_username'
      )
      .leftJoin('shops', 'ch.shop_id', 'shops.id')
      .leftJoin('users as sender', 'ch.sender_id', 'sender.id')
      .leftJoin('users as receiver', 'ch.receiver_id', 'receiver.id')
      .where({ 'ch.status': 'pending' });

    if (shopId) query.andWhere('ch.shop_id', shopId);
    if (receiverId) query.andWhere('ch.receiver_id', receiverId);

    return query.orderBy('ch.created_at', 'asc');
  }

  /**
   * Verify a received cash handover.
   */
  async verifyHandover(handoverId, shopId, receiverId, status = 'verified', allowAdminOverride = false) {
    if (!['verified', 'rejected'].includes(status)) throw new Error('Invalid handover status');

    const query = db('cash_handovers').where({ id: handoverId });
    if (shopId) query.andWhere('shop_id', shopId);
    if (!allowAdminOverride) query.andWhere('receiver_id', receiverId);
    const handover = await query.first();

    if (!handover) throw new Error('Handover record not found or unauthorized.');
    if (handover.status !== 'pending') throw new Error('Handover already processed.');

    await db('cash_handovers')
      .where({ id: handoverId })
      .update({
        status: status,
        verified_at: db.fn.now()
      });

    await activityLog.log(handover.shop_id, receiverId, `HANDOVER_${status.toUpperCase()}`, {
      shift_id: handover.shift_id,
      handover_id: handoverId,
      amount: handover.amount,
      sender_id: handover.sender_id,
      requested_at: handover.created_at
    }, handover.shift_id, 'shift');

    await this.refreshClosedShiftSnapshot(handover.shift_id, handover.shop_id);

    return { ...handover, status };
  }

  /**
   * List shift history for a shop (Admin only).
   */
  async listHistory(shopId, filters = {}) {
    let query = db('shifts as s')
      .select(
        's.*',
        'u.name as cashier_name',
        'cb.name as closed_by_name',
        'shops.name as shop_name',
        db.raw(`(
          SELECT COUNT(*)
          FROM activity_logs al
          WHERE al.shop_id = s.shop_id
            AND al.reference_type = 'shift'
            AND al.reference_id = s.id
        ) as audit_log_count`),
        db.raw(`(
          SELECT COUNT(*)
          FROM activity_logs al
          WHERE al.shop_id = s.shop_id
            AND al.reference_type = 'shift'
            AND al.reference_id = s.id
            AND al.action = 'SHIFT_OPEN'
        ) as open_log_count`),
        db.raw(`(
          SELECT COUNT(*)
          FROM activity_logs al
          WHERE al.shop_id = s.shop_id
            AND al.reference_type = 'shift'
            AND al.reference_id = s.id
            AND al.action = 'SHIFT_CLOSE'
        ) as close_log_count`),
        db.raw(`(
          SELECT COUNT(*)
          FROM cash_drops cd
          WHERE cd.shop_id = s.shop_id
            AND cd.shift_id = s.id
            AND cd.status = 'pending'
        ) as pending_cash_drop_count`),
        db.raw(`(
          SELECT COUNT(*)
          FROM cash_handovers ch
          WHERE ch.shop_id = s.shop_id
            AND ch.shift_id = s.id
            AND ch.status = 'pending'
        ) as pending_cash_handover_count`),
        db.raw(`(
          SELECT COUNT(*)
          FROM cash_drops cd
          WHERE cd.shop_id = s.shop_id
            AND cd.shift_id = s.id
            AND cd.status = 'rejected'
        ) as rejected_cash_drop_count`),
        db.raw(`(
          SELECT COUNT(*)
          FROM cash_handovers ch
          WHERE ch.shop_id = s.shop_id
            AND ch.shift_id = s.id
            AND ch.status = 'rejected'
        ) as rejected_cash_handover_count`),
        db.raw(`(
          SELECT MIN(v.created_at)
          FROM (
            SELECT cd.created_at
            FROM cash_drops cd
            WHERE cd.shop_id = s.shop_id
              AND cd.shift_id = s.id
            UNION ALL
            SELECT ch.created_at
            FROM cash_handovers ch
            WHERE ch.shop_id = s.shop_id
              AND ch.shift_id = s.id
          ) v
        ) as verification_requested_at`),
        db.raw(`(
          SELECT MAX(v.verified_at)
          FROM (
            SELECT cd.verified_at
            FROM cash_drops cd
            WHERE cd.shop_id = s.shop_id
              AND cd.shift_id = s.id
              AND cd.verified_at IS NOT NULL
            UNION ALL
            SELECT ch.verified_at
            FROM cash_handovers ch
            WHERE ch.shop_id = s.shop_id
              AND ch.shift_id = s.id
              AND ch.verified_at IS NOT NULL
          ) v
        ) as verification_completed_at`)
      )
      .leftJoin('users as u', 's.user_id', 'u.id')
      .leftJoin('users as cb', 's.closed_by_user_id', 'cb.id')
      .leftJoin('shops', 's.shop_id', 'shops.id');

    if (shopId) query = query.where('s.shop_id', shopId);
    if (!shopId && filters.shopId) query = query.where('s.shop_id', filters.shopId);

    if (filters.userId) query = query.where('s.user_id', filters.userId);
    if (filters.from && filters.to) {
      query = query
        .where('s.start_time', '<=', filters.to)
        .andWhere(function () {
          this.where('s.end_time', '>=', filters.from).orWhereNull('s.end_time');
        });
    } else if (filters.from) {
      query = query.andWhere(function () {
        this.where('s.end_time', '>=', filters.from).orWhereNull('s.end_time');
      });
    } else if (filters.to) {
      query = query.where('s.start_time', '<=', filters.to);
    }
    if (filters.status) query = query.where('s.status', filters.status);

    return query.orderBy('s.start_time', 'desc');
  }

  async listReceivedPayments(shopId, userId, filters = {}) {
    const shiftId = Number(filters.shiftId);
    const shift = await db('shifts')
      .where({ id: shiftId, shop_id: shopId, user_id: userId })
      .first();
    if (!shift) { const error = new Error('Shift not found'); error.status = 404; throw error; }

    const directSales = await db('sales as s')
      .select('s.id', 's.order_type', 's.order_status', 's.payment_method', 's.total', 's.amount_received', 's.created_at', 's.payment_received_at', 's.customer_name', 't.table_number')
      .leftJoin('tables as t', 's.table_id', 't.id')
      .where({ 's.shop_id': shopId, 's.shift_id': shiftId })
      .where('s.amount_received', '>', 0)
      .where(function () {
        this.where('s.payment_receiver_id', userId).orWhereNull('s.payment_receiver_id');
      });

    const saleIds = directSales.map(sale => sale.id);
    const allLedgerForDirectSales = saleIds.length
      ? await db('customer_ledger')
        .whereIn('sale_id', saleIds)
        .where({ shop_id: shopId, type: 'payment' })
        .select('sale_id', 'amount')
      : [];
    const ledgerPaidBySale = new Map();
    for (const entry of allLedgerForDirectSales) {
      ledgerPaidBySale.set(Number(entry.sale_id), toMoney(ledgerPaidBySale.get(Number(entry.sale_id))) + toMoney(entry.amount));
    }

    const receivedLedger = await db('customer_ledger as cl')
      .select('cl.sale_id', 'cl.amount', 'cl.payment_method', 'cl.created_at', 's.order_type', 's.order_status', 's.customer_name', 't.table_number')
      .leftJoin('sales as s', 'cl.sale_id', 's.id')
      .leftJoin('tables as t', 's.table_id', 't.id')
      .where({ 'cl.shop_id': shopId, 'cl.shift_id': shiftId, 'cl.created_by': userId, 'cl.type': 'payment' });

    const orders = new Map();
    const addPayment = (payment) => {
      const id = Number(payment.sale_id || payment.id);
      if (!id || toMoney(payment.amount) <= 0) return;
      const existing = orders.get(id) || {
        order_id: id,
        order_type: payment.order_type || 'dine_in',
        order_status: payment.order_status || '',
        customer_name: payment.customer_name || '',
        table_number: payment.table_number || null,
        payment_amount: 0,
        payment_methods: new Set(),
        payment_time: null
      };
      existing.payment_amount += toMoney(payment.amount);
      if (payment.payment_method) existing.payment_methods.add(payment.payment_method);
      const timestamp = payment.payment_time || payment.created_at;
      if (timestamp && (!existing.payment_time || new Date(timestamp) > new Date(existing.payment_time))) existing.payment_time = timestamp;
      orders.set(id, existing);
    };

    for (const sale of directSales) {
      const retained = Math.min(toMoney(sale.total), toMoney(sale.amount_received));
      addPayment({
        ...sale,
        sale_id: sale.id,
        amount: Math.max(0, retained - toMoney(ledgerPaidBySale.get(Number(sale.id)))),
        payment_time: sale.payment_received_at || sale.created_at
      });
    }
    receivedLedger.forEach(addPayment);

    let rows = [...orders.values()].map(row => ({
      ...row,
      payment_method: row.payment_methods.size > 1 ? 'mixed' : ([...row.payment_methods][0] || 'cash'),
      payment_methods: undefined,
      payment_amount: Number(row.payment_amount.toFixed(2))
    }));
    const shiftTotalOrders = rows.length;
    const shiftTotalAmount = Number(rows.reduce((sum, row) => sum + row.payment_amount, 0).toFixed(2));
    const search = String(filters.search || '').trim().toLowerCase();
    if (search) rows = rows.filter(row => String(row.order_id).includes(search) || String(row.customer_name).toLowerCase().includes(search));
    if (filters.paymentMethod) rows = rows.filter(row => row.payment_method === filters.paymentMethod);
    if (filters.orderType) rows = rows.filter(row => row.order_type === filters.orderType);
    rows.sort((a, b) => new Date(b.payment_time || 0) - new Date(a.payment_time || 0));

    const totalOrders = rows.length;
    const pageSize = Math.min(Math.max(Number(filters.pageSize) || 10, 5), 50);
    const totalPages = Math.max(1, Math.ceil(totalOrders / pageSize));
    const page = Math.min(Math.max(Number(filters.page) || 1, 1), totalPages);
    return {
      shift,
      summary: { total_orders: shiftTotalOrders, total_amount: shiftTotalAmount },
      items: rows.slice((page - 1) * pageSize, page * pageSize),
      pagination: { page, page_size: pageSize, total: totalOrders, total_pages: totalPages }
    };
  }

  async listUserPaymentShifts(shopId, userId, filters = {}) {
    const pageSize = Math.min(Math.max(Number(filters.pageSize) || 8, 5), 20);
    const baseFilters = { shop_id: shopId, user_id: userId };
    let total;
    let shifts;
    if (filters.date) {
      const datedShifts = (await db('shifts').where(baseFilters).orderBy('start_time', 'desc'))
        .filter(shift => shiftDateKey(shift.start_time) === filters.date);
      total = datedShifts.length;
      const requestedPage = Math.max(Number(filters.page) || 1, 1);
      shifts = datedShifts.slice((requestedPage - 1) * pageSize, requestedPage * pageSize);
    } else {
      total = Number((await db('shifts').where(baseFilters).count('id as count').first())?.count || 0);
    }
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(Math.max(Number(filters.page) || 1, 1), totalPages);
    if (!filters.date) {
      shifts = await db('shifts').where(baseFilters).orderBy('start_time', 'desc').limit(pageSize).offset((page - 1) * pageSize);
    } else if (page !== Math.max(Number(filters.page) || 1, 1)) {
      const datedShifts = (await db('shifts').where(baseFilters).orderBy('start_time', 'desc'))
        .filter(shift => shiftDateKey(shift.start_time) === filters.date);
      shifts = datedShifts.slice((page - 1) * pageSize, page * pageSize);
    }
    const items = await Promise.all(shifts.map(async (shift) => {
      const payments = await this.listReceivedPayments(shopId, userId, { shiftId: shift.id, page: 1, pageSize: 5 });
      return { ...shift, payment_order_count: payments.summary.total_orders, payment_total: payments.summary.total_amount };
    }));
    return { items, pagination: { page, page_size: pageSize, total, total_pages: totalPages } };
  }

  async listUserPaymentShiftDates(shopId, userId) {
    const rows = await db('shifts')
      .where({ shop_id: shopId, user_id: userId })
      .select('start_time')
      .orderBy('start_time', 'desc');
    return [...new Set(rows.map(row => shiftDateKey(row.start_time)).filter(Boolean))];
  }

  /**
   * Full Z-report/audit details for a shift.
   */
  async getShiftDetails(shopId, shiftId) {
    const shift = await db('shifts as s')
      .select('s.*', 'u.name as cashier_name', 'u.username as cashier_username', 'cb.name as closed_by_name')
      .leftJoin('users as u', 's.user_id', 'u.id')
      .leftJoin('users as cb', 's.closed_by_user_id', 'cb.id')
      .where({ 's.id': shiftId, 's.shop_id': shopId })
      .first();

    if (!shift) throw new Error('Shift not found');

    const [summary, sales, expenses, returns, ledgerEntries, handovers, cashDrops] = await Promise.all([
      this.calculateShiftSummary(shiftId, shopId),
      db('sales as s')
        .select('s.id', 's.created_at', 's.customer_name', 's.customer_phone', 's.total', 's.amount_received', 's.payment_method', 's.order_type', 's.order_status')
        .where({ 's.shift_id': shiftId, 's.shop_id': shopId })
        .orderBy('s.created_at', 'asc'),
      db('expenses as e')
        .select('e.id', 'e.date', 'e.title', 'e.category', 'e.amount', 'e.note', 'e.created_at')
        .where({ 'e.shift_id': shiftId, 'e.shop_id': shopId })
        .orderBy('e.created_at', 'asc'),
      db('returns as r')
        .select('r.id', 'r.sale_id', 'r.created_at', 'r.total_refund', 'r.payment_method', 'r.reason')
        .where({ 'r.shift_id': shiftId, 'r.shop_id': shopId })
        .orderBy('r.created_at', 'asc'),
      db('customer_ledger as cl')
        .select('cl.id', 'cl.sale_id', 'cl.type', 'cl.amount', 'cl.payment_method', 'cl.balance_after', 'cl.note', 'cl.created_at')
        .where({ 'cl.shift_id': shiftId, 'cl.shop_id': shopId })
        .orderBy('cl.created_at', 'asc'),
      db('cash_handovers as ch')
        .select('ch.*', 'sender.name as sender_name', 'receiver.name as receiver_name')
        .leftJoin('users as sender', 'ch.sender_id', 'sender.id')
        .leftJoin('users as receiver', 'ch.receiver_id', 'receiver.id')
        .where({ 'ch.shift_id': shiftId, 'ch.shop_id': shopId })
        .orderBy('ch.created_at', 'asc'),
      db('cash_drops as cd')
        .select('cd.*', 'requested.name as requested_by_name', 'verified.name as verified_by_name')
        .leftJoin('users as requested', 'cd.requested_by_user_id', 'requested.id')
        .leftJoin('users as verified', 'cd.verified_by_user_id', 'verified.id')
        .where({ 'cd.shift_id': shiftId, 'cd.shop_id': shopId })
        .orderBy('cd.created_at', 'asc')
    ]);

    return {
      shift,
      summary,
      sales,
      expenses,
      returns,
      ledgerEntries,
      handovers,
      cashDrops
    };
  }
}

module.exports = new ShiftService();
