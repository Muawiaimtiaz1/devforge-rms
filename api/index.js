const { app } = require("../server");
const { usePostgres } = require("../db/runtime");

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

  return app(req, res);
};
