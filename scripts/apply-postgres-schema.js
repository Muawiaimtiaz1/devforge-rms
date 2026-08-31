const { initPostgres } = require('../db/db-init');
const { close } = require("../db/postgres");

async function main() {
  if (process.env.DB_CLIENT !== 'postgres') throw new Error('Set DB_CLIENT=postgres before applying the PostgreSQL schema.');
  await initPostgres();
  console.log("PostgreSQL base schema and all modular migrations applied successfully.");
}

main()
  .catch((err) => {
    console.error("Failed to apply PostgreSQL schema:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await close();
  });

