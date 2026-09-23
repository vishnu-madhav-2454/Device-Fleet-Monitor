const path = require("path");

const NODE_ENV = process.env.NODE_ENV || "development";

module.exports = {
  NODE_ENV,
  PORT: Number(process.env.PORT) || 3000,
  ONLINE_TIMEOUT_MS: Number(process.env.ONLINE_TIMEOUT_MS) || 30 * 1000,
  DATA_FILE: process.env.DATA_FILE || path.join(__dirname, "..", "data", "devices.json"),
  // Disabled under test so the suite stays hermetic and doesn't touch disk.
  PERSIST_ENABLED: NODE_ENV !== "test",
  LOG_LEVEL: process.env.LOG_LEVEL || "info",
};
