const { initPostgres } = require("../db/db-init");
const { close } = require("../db/postgres");

async function main() {
  if (process.env.DB_CLIENT !== "postgres") {
    throw new Error("Set DB_CLIENT=postgres before initializing PostgreSQL.");
  }

  await initPostgres();
  console.log("PostgreSQL initialization completed successfully.");
}

main()
  .catch((error) => {
    console.error("PostgreSQL initialization failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await close();
  });
