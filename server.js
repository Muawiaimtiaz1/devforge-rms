require("dotenv").config();
require("express-async-errors");
const express = require("express");
const session = require("express-session");
const http = require("http");
const path = require("path");
const fs = require('fs');
const db = require("./db/knex");
const { formatErrorResponse } = require("./utils/error-response");
const { createCsrfProtection } = require('./src/modules/session-security/csrf');

const app = express();
const isProduction = process.env.NODE_ENV === 'production';
const sessionSecret = process.env.SESSION_SECRET || (!isProduction ? 'dev-only-session-secret-change-me' : null);
if (!sessionSecret) throw new Error('SESSION_SECRET is required in production.');
if (String(process.env.TRUST_PROXY || '').toLowerCase() === 'true') app.set('trust proxy', 1);
const secureSessionCookie = String(process.env.SESSION_COOKIE_SECURE || (isProduction ? 'true' : 'false')).toLowerCase() === 'true';
const SESSION_COOKIE_NAME = 'rms.sid';

class KnexSessionStore extends session.Store {
  constructor(knex, options = {}) {
    super();
    this.knex = knex;
    this.tableName = options.tableName || "sessions";
    this.ready = null;
  }

  ensureReady() {
    if (!this.ready) this.ready = this.ensureTable();
    return this.ready;
  }

  async ensureTable() {
    const exists = await this.knex.schema.hasTable(this.tableName);
    if (!exists) {
      await this.knex.schema.createTable(this.tableName, (table) => {
        table.string("sid").primary();
        table.text("sess").notNullable();
        table.dateTime("expires").index();
      });
    }
  }

  getExpiry(sess) {
    return sess?.cookie?.expires
      ? new Date(sess.cookie.expires)
      : new Date(Date.now() + Number(process.env.SESSION_MAX_AGE_MS || 24 * 60 * 60 * 1000));
  }

  async get(sid, callback) {
    callback = callback || (() => {});
    try {
      await this.ensureReady();
      const row = await this.knex(this.tableName).where({ sid }).first();
      if (!row) return callback(null, null);

      if (row.expires && new Date(row.expires) <= new Date()) {
        await this.destroy(sid, () => {});
        return callback(null, null);
      }

      return callback(null, JSON.parse(row.sess));
    } catch (err) {
      return callback(err);
    }
  }

  async set(sid, sess, callback) {
    callback = callback || (() => {});
    try {
      await this.ensureReady();
      const expires = this.getExpiry(sess).toISOString();
      await this.knex(this.tableName)
        .insert({ sid, sess: JSON.stringify(sess), expires })
        .onConflict("sid")
        .merge({ sess: JSON.stringify(sess), expires });
      return callback(null);
    } catch (err) {
      return callback(err);
    }
  }

  async touch(sid, sess, callback) {
    callback = callback || (() => {});
    try {
      await this.ensureReady();
      await this.knex(this.tableName)
        .where({ sid })
        .update({ sess: JSON.stringify(sess), expires: this.getExpiry(sess).toISOString() });
      return callback(null);
    } catch (err) {
      return callback(err);
    }
  }

  async destroy(sid, callback) {
    callback = callback || (() => {});
    try {
      await this.ensureReady();
      await this.knex(this.tableName).where({ sid }).del();
      return callback(null);
    } catch (err) {
      return callback(err);
    }
  }
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store, private');
  next();
});

const sessionMiddleware = session({
    name: SESSION_COOKIE_NAME,
    store: new KnexSessionStore(db),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: secureSessionCookie,
      sameSite: "lax",
      path: '/',
      maxAge: Number(process.env.SESSION_MAX_AGE_MS || 24 * 60 * 60 * 1000),
    },
  });
app.use(sessionMiddleware);

app.use(async (req, res, next) => {
  try {
    await require('./src/modules/session-security/session-security.service').trackSession(req);
    next();
  } catch (error) {
    next(error);
  }
});

app.use(createCsrfProtection({
  allowedOrigins: process.env.CSRF_ALLOWED_ORIGINS,
  isProduction,
}));

app.use((req, res, next) => {
  const passwordChangeAllowed = req.path === '/api/auth/me' || req.path === '/api/auth/change-password' || req.path === '/api/auth/logout';
  if (req.path.startsWith('/api/') && req.session?.user?.must_change_password && !passwordChangeAllowed) {
    return res.status(403).json({ error: 'You must change your temporary password before continuing.', code: 'PASSWORD_CHANGE_REQUIRED' });
  }
  return next();
});

const { enforceApiPermissions } = require('./authorization/api-policy');
app.use(enforceApiPermissions);

// API Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/auth", require("./src/modules/session-security/session-security.routes"));
app.use("/api/lobby", require("./routes/lobby"));
app.use("/api/users", require("./routes/users"));
app.use("/api/staff", require("./src/modules/staff/staff.routes"));
app.use("/api/attendance", require("./src/modules/attendance/attendance.routes"));
app.use("/api/leave", require("./src/modules/leave/leave.routes"));
app.use("/api/payroll", require("./src/modules/payroll/payroll.routes"));
app.use("/api/documents", require("./src/modules/documents/documents.routes"));
app.use("/api/staff-activity", require("./src/modules/staff-activity/staff-activity.routes"));
app.use("/api/roles", require("./routes/roles"));
app.use("/api/brands", require("./routes/brands"));
app.use("/api/products", require("./routes/products"));
app.use("/api/sales", require("./routes/sales"));
app.use("/api/delivery", require("./routes/delivery"));
app.use("/api/expenses", require("./routes/expenses"));
app.use("/api/expense-categories", require("./routes/expense-categories"));
app.use("/api/product-categories", require("./routes/product-categories"));
app.use("/api/analytics", require("./routes/analytics"));
app.use("/api/ai", require("./routes/ai"));
app.use("/api/customers", require("./routes/customers"));
app.use("/api/shops", require("./routes/shops"));
app.use("/api/subscriptions", require("./routes/subscriptions"));
app.use('/api/raw-stock', require('./routes/raw-stock'));
app.use('/api/recipes', require('./routes/recipes'));
app.use("/api/waste", require("./routes/waste"));
app.use("/api/shop-settings", require("./routes/shop-settings"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/notifications", require("./routes/notifications"));
app.use("/api/tables", require("./routes/tables"));
app.use("/api/kds", require("./routes/kds"));
app.use("/api/print-jobs", require("./routes/print-jobs"));
app.use("/api/printers", require("./routes/printers"));
app.use("/api/shifts", require("./routes/shifts"));
app.use("/api/activity-logs", require("./routes/activity-logs"));
app.use("/print", require("./routes/print"));

// Named page routes — MUST be before express.static to avoid index.html conflict
function sendNoStorePage(res, fileName) {
  res.set({
    "Cache-Control": "no-store, no-cache, must-revalidate, private",
    Pragma: "no-cache",
    Expires: "0",
  });
  res.sendFile(path.join(__dirname, "public", fileName));
}

app.get("/", (req, res) => {
  sendNoStorePage(res, "login.html");
});

app.get("/dashboard", (req, res) => {
  sendNoStorePage(res, "dashboard.html");
});

app.get("/admin/store-monitoring", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "store-monitoring.html"));
});

app.get("/api/download-print-agent", async (req, res) => {
  const shopId = Number(req.session?.user?.shop_id);
  if (!Number.isInteger(shopId) || shopId <= 0) {
    return res.status(401).json({ error: "Sign in to a shop before downloading its print agent." });
  }

  const [shop, printers] = await Promise.all([
    db("shops").where({ id: shopId }).first("id", "name"),
    db("printers").where({ shop_id: shopId }).orderBy("display_name", "asc").select("system_name"),
  ]);
  if (!shop) return res.status(404).json({ error: "Shop not found." });

  const forwardedProto = String(req.get("x-forwarded-proto") || "").split(",")[0].trim();
  const protocol = forwardedProto || req.protocol;
  const serverUrl = `${protocol}://${req.get("host")}`;
  const profile = {
    websiteName: req.get("host"),
    shopName: shop.name,
    shopId: shop.id,
    serverUrl,
    printers: printers.map(printer => printer.system_name).filter(Boolean),
  };
  const source = await fs.promises.readFile(path.join(__dirname, "print-agent.js"), "utf8");
  const configuredSource = source.replace(
    /const AGENT_PROFILE = Object\.freeze\(\{[^\r\n]*\}\);/,
    `const AGENT_PROFILE = Object.freeze(${JSON.stringify(profile)});`,
  );
  const safeShopName = String(shop.name || `shop-${shop.id}`).replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || `shop-${shop.id}`;
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="print-agent-${safeShopName}.js"`);
  res.send(configuredSource);
});

// React modules are built separately and mounted under /app. The legacy
// frontend remains the owner of / and /dashboard during gradual migration.
const reactDist = path.join(__dirname, "frontend", "dist");
if (fs.existsSync(reactDist)) {
  app.use("/app", express.static(reactDist, { setHeaders: (res, filePath) => {
    if (/[/\\]assets[/\\].+\.[A-Za-z0-9_-]{8,}\.(?:js|css)$/.test(filePath)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    else res.setHeader('Cache-Control', 'no-cache');
  } }));
  app.get(/^\/app(?:\/.*)?$/, (req, res) => {
    res.sendFile(path.join(reactDist, "index.html"));
  });
}

// Static assets (js, css, etc.) served after named routes
app.use(express.static(path.join(__dirname, "public"), { setHeaders: (res, filePath) => {
  const name = path.basename(filePath);
  if (['service-worker.js', 'manifest.json', 'offline.html'].includes(name)) res.setHeader('Cache-Control', 'no-cache');
} }));

const { initPostgres } = require("./db/db-init");
const { usePostgres } = require("./db/runtime");

const PORT = process.env.PORT || 4000;

function startServer(port = PORT) {
  const server = http.createServer(app);
  require('./services/OrderRealtimeService').initialize(server, sessionMiddleware);
  const listener = server.listen(port, () => {
    console.log(`✅ POS System running at http://localhost:${port}`);
    console.log("   Login: admin / admin123");
  });
  const sessionSecurity = require('./src/modules/session-security/session-security.service');
  sessionSecurity.pruneExpiredSessions().catch((error) => console.error('[Session Cleanup]', error.message));
  const cleanupTimer = setInterval(() => {
    sessionSecurity.pruneExpiredSessions().catch((error) => console.error('[Session Cleanup]', error.message));
  }, 60 * 60 * 1000);
  cleanupTimer.unref?.();
  return listener;
}

// Global Error Handler - Ensures all errors are returned as JSON
app.use((err, req, res, next) => {
  const errorLog = `${new Date().toISOString()} - ${req.method} ${req.url} - ${err.stack}\n`;
  try {
    fs.appendFileSync(path.join(__dirname, 'error_debug.log'), errorLog);
  } catch (e) {
    console.error("Failed to write to error_debug.log", e);
  }
  console.error("[SERVER ERROR]", err);
  const { status, body } = formatErrorResponse(err, "Internal Server Error");
  res.status(status).json(body);
});

if (require.main === module) {
  (async () => {
    if (usePostgres()) {
      await initPostgres();
    } else {
      require("./db/db");
    }
    await require('./authorization/service').ensureAuthorizationSchema();
    await require('./services/PushNotificationService').ensureSchema();
    startServer();
  })();
}

module.exports = { app, startServer, sessionMiddleware, KnexSessionStore };
