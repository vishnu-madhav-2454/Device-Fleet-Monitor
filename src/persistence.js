const fs = require("fs");
const path = require("path");
const config = require("./config");
const logger = require("./logger");

function ensureDir() {
  fs.mkdirSync(path.dirname(config.DATA_FILE), { recursive: true });
}

// Loads the raw array of persisted device records, or [] if there is
// nothing on disk yet (first run) or the file can't be parsed.
function load() {
  if (!config.PERSIST_ENABLED) return [];
  try {
    ensureDir();
    if (!fs.existsSync(config.DATA_FILE)) return [];
    const raw = fs.readFileSync(config.DATA_FILE, "utf8");
    return raw.trim() ? JSON.parse(raw) : [];
  } catch (err) {
    logger.warn("failed to load persisted devices, starting empty", { error: err.message });
    return [];
  }
}

// Uses a synchronous write: Node's single-threaded event loop means this
// can never interleave with another save(), so concurrent heartbeats can't
// corrupt the file the way overlapping async writes could.
function save(devicesArray) {
  if (!config.PERSIST_ENABLED) return;
  try {
    ensureDir();
    fs.writeFileSync(config.DATA_FILE, JSON.stringify(devicesArray, null, 2));
  } catch (err) {
    logger.error("failed to persist devices", { error: err.message });
  }
}

module.exports = { load, save };
