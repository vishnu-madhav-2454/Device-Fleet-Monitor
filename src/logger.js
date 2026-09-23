const config = require("./config");

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = LEVELS[config.LOG_LEVEL] ?? LEVELS.info;

function log(level, message, meta = {}) {
  if (LEVELS[level] > currentLevel) return;
  const entry = { timestamp: new Date().toISOString(), level, message, ...meta };
  const line = JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
}

module.exports = {
  error: (message, meta) => log("error", message, meta),
  warn: (message, meta) => log("warn", message, meta),
  info: (message, meta) => log("info", message, meta),
  debug: (message, meta) => log("debug", message, meta),
};
