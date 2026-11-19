require("dotenv").config();

const app = require("./app");
const { ensureSchema } = require("./config/database");
const { initGroup } = require("./services/groupManager");
const { assertProductionConfig } = require("./config/runtime");

const PORT = Number(process.env.PORT || 4000);

async function start() {
  assertProductionConfig();
  await ensureSchema();
  await initGroup();

  if (process.env.SEED_DEMO_DATA === "true") {
    const { pool } = require("./config/database");
    const { seedDemo } = require("../scripts/seedDemo");
    await seedDemo(pool);
  }

  app.listen(PORT, () => {
    console.log(`Backend listening on port ${PORT} (${process.env.NODE_ENV || "development"})`);
  });
}

start().catch((error) => {
  console.error("Fatal startup error:", error);
  process.exit(1);
});
