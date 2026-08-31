const crypto = require('crypto');
const db = require('../../../db/knex');

function requestMeta(req) {
  return {
    ip_address: String(req.ip || req.socket?.remoteAddress || '').slice(0, 120) || null,
    user_agent: String(req.get?.('user-agent') || '').slice(0, 500) || null,
  };
}

async function recordEvent(event, trx = db) {
  await trx('security_events').insert({
    shop_id: event.shop_id || null,
    user_id: event.user_id || null,
    actor_user_id: event.actor_user_id || null,
    event_type: event.event_type,
    session_sid: event.session_sid || null,
    ip_address: event.ip_address || null,
    user_agent: event.user_agent || null,
    details_json: event.details || null,
    created_at: trx.fn.now(),
  });
}

async function registerLogin(req, user) {
  const meta = requestMeta(req);
  await db.transaction(async (trx) => {
    await trx('session_devices').insert({
      sid: req.sessionID,
      device_id: crypto.randomUUID(),
      user_id: user.id,
      shop_id: user.shop_id || null,
      ...meta,
      created_at: trx.fn.now(),
      last_seen_at: trx.fn.now(),
      revoked_at: null,
      revoked_reason: null,
    }).onConflict('sid').merge({ ...meta, last_seen_at: trx.fn.now(), revoked_at: null, revoked_reason: null });
    await recordEvent({ shop_id: user.shop_id, user_id: user.id, actor_user_id: user.id, event_type: 'LOGIN_SUCCESS', session_sid: req.sessionID, ...meta }, trx);
  });
}

async function recordLoginFailure(req, username) {
  const user = username ? await db('users').select('id', 'shop_id').where({ username }).first() : null;
  await recordEvent({
    shop_id: user?.shop_id, user_id: user?.id, event_type: 'LOGIN_FAILED',
    details: { username: String(username || '').slice(0, 80) }, ...requestMeta(req),
  });
}

async function trackSession(req) {
  if (!req.session?.user || !req.sessionID) return;
  const lastTracked = Number(req.session.security_tracked_at || 0);
  if (Date.now() - lastTracked < 5 * 60 * 1000) return;
  req.session.security_tracked_at = Date.now();
  const updated = await db('session_devices').where({ sid: req.sessionID, user_id: req.session.user.id, revoked_at: null })
    .update({ last_seen_at: db.fn.now(), ...requestMeta(req) });
  if (!updated) {
    await db('session_devices').insert({
      sid: req.sessionID,
      device_id: crypto.randomUUID(),
      user_id: req.session.user.id,
      shop_id: req.session.user.shop_id || null,
      ...requestMeta(req),
      created_at: db.fn.now(),
      last_seen_at: db.fn.now(),
    }).onConflict('sid').ignore();
  }
}

async function listSessions(userId, currentSid) {
  const rows = await db('session_devices as sd')
    .join('sessions as s', 's.sid', 'sd.sid')
    .where({ 'sd.user_id': userId }).whereNull('sd.revoked_at').where('s.expires', '>', db.fn.now())
    .select('sd.device_id', 'sd.user_agent', 'sd.ip_address', 'sd.created_at', 'sd.last_seen_at', 's.expires', 'sd.sid')
    .orderBy('sd.last_seen_at', 'desc');
  return rows.map(({ sid, ...row }) => ({ ...row, is_current: sid === currentSid }));
}

async function listSecurityEvents(userId, limit = 100) {
  return db('security_events').where({ user_id: userId })
    .select('id', 'event_type', 'ip_address', 'user_agent', 'details_json', 'created_at')
    .orderBy('created_at', 'desc').limit(Math.min(200, Math.max(1, Number(limit) || 100)));
}

async function revokeDevice(userId, deviceId, currentSid, reason = 'USER_REVOKED') {
  return db.transaction(async (trx) => {
    const device = await trx('session_devices').where({ user_id: userId, device_id: deviceId }).forUpdate().first();
    if (!device) {
      const error = new Error('Session not found.');
      error.status = 404;
      throw error;
    }
    await trx('sessions').where({ sid: device.sid }).del();
    await trx('session_devices').where({ sid: device.sid }).update({ revoked_at: trx.fn.now(), revoked_reason: reason });
    await recordEvent({ user_id: userId, actor_user_id: userId, event_type: 'SESSION_REVOKED', session_sid: device.sid, details: { reason } }, trx);
    return { revokedCurrent: device.sid === currentSid };
  });
}

async function revokeUserSessions(trx, userId, actorUserId, reason, exceptSid = null) {
  let query = trx('session_devices').where({ user_id: userId }).whereNull('revoked_at');
  if (exceptSid) query = query.whereNot({ sid: exceptSid });
  const devices = await query.select('sid');
  const sids = devices.map((device) => device.sid);
  if (!sids.length) return 0;
  await trx('sessions').whereIn('sid', sids).del();
  await trx('session_devices').whereIn('sid', sids).update({ revoked_at: trx.fn.now(), revoked_reason: reason });
  await recordEvent({ user_id: userId, actor_user_id: actorUserId, event_type: 'SESSIONS_REVOKED', details: { reason, count: sids.length } }, trx);
  return sids.length;
}

async function revokeOtherSessions(userId, currentSid) {
  return db.transaction((trx) => revokeUserSessions(trx, userId, userId, 'USER_REVOKED_OTHERS', currentSid));
}

async function recordLogout(req) {
  if (!req.session?.user) return;
  const user = req.session.user;
  await db.transaction(async (trx) => {
    await trx('session_devices').where({ sid: req.sessionID }).update({ revoked_at: trx.fn.now(), revoked_reason: 'LOGOUT' });
    await recordEvent({ shop_id: user.shop_id, user_id: user.id, actor_user_id: user.id, event_type: 'LOGOUT', session_sid: req.sessionID, ...requestMeta(req) }, trx);
  });
}

async function pruneExpiredSessions() {
  const expired = await db('sessions').where('expires', '<=', db.fn.now()).select('sid');
  const expiredSids = expired.map((row) => row.sid);
  if (expiredSids.length) await db('sessions').whereIn('sid', expiredSids).del();
  await db('session_devices').whereNull('revoked_at').whereNotExists(function missingSession() {
    this.select(db.raw('1')).from('sessions as s').whereRaw('s.sid = session_devices.sid');
  }).update({ revoked_at: db.fn.now(), revoked_reason: 'EXPIRED' });
  return expiredSids.length;
}

module.exports = {
  registerLogin, recordLoginFailure, trackSession, listSessions, listSecurityEvents,
  revokeDevice, revokeUserSessions, revokeOtherSessions, recordLogout, pruneExpiredSessions,
};
