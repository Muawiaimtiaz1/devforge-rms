const serverless = require("serverless-http");

const { app } = require("../server");
const { initPostgres } = require("../db/db-init");
const { usePostgres } = require("../db/runtime");

const handleRequest = serverless(app);
let databaseReady;

module.exports = async function handler(req, res) {
  if (!usePostgres()) {
    res.statusCode = 503;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(
      JSON.stringify({
        error: "Vercel deployments require DB_CLIENT=postgres and a hosted PostgreSQL database.",
      }),
    );
    return;
  }

  try {
    if (!databaseReady) {
      databaseReady = initPostgres().catch((error) => {
        databaseReady = undefined;
        throw error;
      });
    }

    await databaseReady;
    return await handleRequest(req, res);
  } catch (error) {
    console.error("[VERCEL FUNCTION STARTUP ERROR]", error);

    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(
        JSON.stringify({
          error: "Application startup failed",
          code: "DATABASE_INITIALIZATION_FAILED",
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }
};
