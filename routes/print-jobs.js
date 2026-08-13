const express = require('express');
const router = express.Router();
const db = require('../db/knex');
const salesService = require('../services/SalesService');
const { requireAuth } = require('../middleware/auth');

const POLL_BATCH_SIZE = 10;
const STALE_PRINTING_JOB_MINUTES = Math.max(1, Number(process.env.PRINT_JOB_STALE_MINUTES || 10));

function isPostgresClient() {
  return db.client.config.client === 'pg';
}

function rowsFromRaw(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.rows)) return result.rows;
  if (Array.isArray(result?.[0])) return result[0];
  return [];
}

function sortPrintJobs(jobs) {
  return [...jobs].sort((a, b) => {
    const aDate = new Date(a.created_at || 0).getTime();
    const bDate = new Date(b.created_at || 0).getTime();
    if (aDate !== bDate) return aDate - bDate;
    return Number(a.id || 0) - Number(b.id || 0);
  });
}

function currentTimestamp() {
  return db.raw(isPostgresClient() ? 'NOW()' : "datetime('now')");
}

async function releaseStalePrintingJobs(shopId) {
  if (isPostgresClient()) {
    await db.raw(`
      UPDATE print_queue
      SET
        status = 'pending',
        claimed_at = NULL,
        last_error = COALESCE(last_error, 'Print agent timed out before confirmation; retrying.'),
        updated_at = NOW()
      WHERE shop_id = ?
        AND status = 'printing'
        AND (
          (claimed_at IS NOT NULL AND claimed_at < NOW() - (? * INTERVAL '1 minute'))
          OR (claimed_at IS NULL AND created_at < NOW() - (? * INTERVAL '1 minute'))
        )
    `, [shopId, STALE_PRINTING_JOB_MINUTES, STALE_PRINTING_JOB_MINUTES]);
    return;
  }

  await db.raw(`
    UPDATE print_queue
    SET
      status = 'pending',
      claimed_at = NULL,
      last_error = COALESCE(last_error, 'Print agent timed out before confirmation; retrying.'),
      updated_at = datetime('now')
    WHERE shop_id = ?
      AND status = 'printing'
      AND (
        (claimed_at IS NOT NULL AND claimed_at < datetime('now', '-' || ? || ' minutes'))
        OR (claimed_at IS NULL AND created_at < datetime('now', '-' || ? || ' minutes'))
      )
  `, [shopId, STALE_PRINTING_JOB_MINUTES, STALE_PRINTING_JOB_MINUTES]);
}

async function claimPendingPrintJobs(shopId, printerNames, limit = POLL_BATCH_SIZE) {
  const printers = [...new Set((printerNames || []).map(name => String(name).trim()).filter(Boolean))];
  if (!printers.length) return [];
  const result = isPostgresClient()
    ? await db.raw(`
        WITH next_jobs AS (
          SELECT id
          FROM print_queue
          WHERE shop_id = ? AND status = 'pending' AND station_name = ANY(?::text[])
          ORDER BY created_at ASC, id ASC
          LIMIT ?
          FOR UPDATE SKIP LOCKED
        )
        UPDATE print_queue AS pq
        SET
          status = 'printing',
          claimed_at = NOW(),
          updated_at = NOW(),
          last_error = NULL,
          attempts = COALESCE(pq.attempts, 0) + 1
        FROM next_jobs
        WHERE pq.id = next_jobs.id
        RETURNING pq.*
      `, [shopId, printers, limit])
    : await db.raw(`
        UPDATE print_queue
        SET
          status = 'printing',
          claimed_at = datetime('now'),
          updated_at = datetime('now'),
          last_error = NULL,
          attempts = COALESCE(attempts, 0) + 1
        WHERE id IN (
          SELECT id
          FROM print_queue
          WHERE shop_id = ? AND status = 'pending'
            AND station_name IN (${printers.map(() => '?').join(', ')})
          ORDER BY created_at ASC, id ASC
          LIMIT ?
        )
        RETURNING *
      `, [shopId, ...printers, limit]);

  return sortPrintJobs(rowsFromRaw(result));
}

/**
 * Poll for pending print jobs (Used by Local Print Agent)
 */
router.get('/poll', async (req, res) => {
  const { shop_id } = req.query;
  const shopId = Number(shop_id);
  const printerNames = String(req.query.printers || '').split(',').map(name => name.trim()).filter(Boolean);
  
  if (!Number.isInteger(shopId) || shopId <= 0) {
    return res.status(400).json({ error: "valid shop_id required" });
  }
  if (!printerNames.length) return res.status(400).json({ error: "at least one assigned printer is required" });

  // Simple authentication: Check if shop exists
  // In a real world, we'd use a dedicated API KEY for the printer agent
  const shop = await db('shops').where({ id: shopId }).first();
  if (!shop) return res.status(404).json({ error: "Shop not found" });

  try {
    await releaseStalePrintingJobs(shopId);
    const jobs = await claimPendingPrintJobs(shopId, printerNames);
    res.json(jobs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Queue a receipt print from the browser UI.
 * If no matching printer is configured, the browser should fall back to its own print dialog.
 */
router.post('/queue', requireAuth, async (req, res) => {
  const shopId = req.session.user.shop_id || req.body.shop_id;
  const { sale_id, format } = req.body;

  if (!shopId) return res.status(400).json({ error: "shop_id required" });
  if (!sale_id) return res.status(400).json({ error: "sale_id required" });

  const result = await salesService.queueReceiptPrint(sale_id, shopId, format);
  res.json({
    ok: true,
    queued: result.queued,
    printer_configured: result.printer_configured
  });
});

router.post('/queue-shift', requireAuth, async (req, res) => {
  const shopId = req.session.user.shop_id;
  const shiftId = Number(req.body.shift_id);
  if (!shopId || !Number.isInteger(shiftId) || shiftId <= 0) return res.status(400).json({ error: 'Valid shift_id required' });

  const shift = await db('shifts').where({ id: shiftId, shop_id: shopId, status: 'closed' }).first();
  if (!shift) return res.status(404).json({ error: 'Closed shift not found' });
  const shop = await db('shops').where({ id: shopId }).select('customer_bill_printer').first();
  const route = String(shop?.customer_bill_printer || '').trim();
  if (!route) return res.json({ ok: true, queued: 0, printer_configured: false });

  const printer = route.startsWith('PRINTER:')
    ? await db('printers').where({ shop_id: shopId, id: Number(route.slice(8)) }).first()
    : await db('printers').where({ shop_id: shopId, system_name: route }).first();
  if (!printer) return res.json({ ok: true, queued: 0, printer_configured: false });

  await db('print_queue').insert({
    shop_id: shopId,
    station_name: printer.system_name,
    content_json: JSON.stringify({
      type: 'PRINT_URL',
      format: 'shift_close',
      shift_id: shiftId,
      station_name: printer.system_name,
      route_label: 'Register Shift Close',
      printer_label: printer.display_name,
      print_url: `/print/shifts/${shiftId}?shop_id=${shopId}&autoprint=0`
    }),
    status: 'pending'
  });
  res.json({ ok: true, queued: 1, printer_configured: true });
});

/**
 * Mark job as printed
 */
router.post('/:id/confirm', async (req, res) => {
  const { id } = req.params;
  try {
    await db('print_queue')
      .where({ id })
      .whereIn('status', ['pending', 'printing'])
      .update({
        status: 'printed',
        printed_at: currentTimestamp(),
        updated_at: currentTimestamp(),
        last_error: null
      });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Release a claimed job for retry when the local agent fails before the print
 * command is accepted by the OS/printer.
 */
router.post('/:id/fail', async (req, res) => {
  const { id } = req.params;
  const reason = typeof req.body?.reason === 'string'
    ? req.body.reason.slice(0, 1000)
    : 'Print agent reported failure before confirmation.';
  try {
    await db('print_queue')
      .where({ id })
      .where({ status: 'printing' })
      .update({
        status: 'pending',
        claimed_at: null,
        updated_at: currentTimestamp(),
        last_error: reason
      });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
