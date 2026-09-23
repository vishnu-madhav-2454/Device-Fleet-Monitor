const config = require("./config");
const persistence = require("./persistence");

const ONLINE_TIMEOUT_MS = config.ONLINE_TIMEOUT_MS;

// In-memory registry. Keyed by device id. Seeded from disk on startup so
// state survives a restart (see src/persistence.js).
const devices = new Map();
for (const record of persistence.load()) {
  devices.set(record.id, record);
}

function persist() {
  persistence.save(Array.from(devices.values()));
}

function computeStatus(device, now = Date.now()) {
  if (!device.lastHeartbeatAt) return "OFFLINE";
  return now - device.lastHeartbeatAt <= ONLINE_TIMEOUT_MS ? "ONLINE" : "OFFLINE";
}

function toPublicDevice(device, now = Date.now()) {
  return {
    id: device.id,
    name: device.name,
    status: computeStatus(device, now),
    last_heartbeat: device.lastHeartbeatAt
      ? new Date(device.lastHeartbeatAt).toISOString()
      : null,
    metrics: device.lastMetrics,
  };
}

function register(id, name) {
  if (devices.has(id)) {
    return { error: "DUPLICATE", device: null };
  }
  const device = { id, name, lastHeartbeatAt: null, lastMetrics: null };
  devices.set(id, device);
  persist();
  return { error: null, device: toPublicDevice(device) };
}

function recordHeartbeat(id, { timestamp, status, ...extra }) {
  const device = devices.get(id);
  if (!device) return { error: "NOT_FOUND", device: null };

  const heartbeatTime = timestamp ? Date.parse(timestamp) : Date.now();
  if (Number.isNaN(heartbeatTime)) {
    return { error: "INVALID_TIMESTAMP", device: null };
  }

  device.lastHeartbeatAt = heartbeatTime;
  // "reported_status" is the device's own self-reported health from the
  // heartbeat payload (e.g. "OK"); it's distinct from the ONLINE/OFFLINE
  // status this service computes from the timeout rule.
  device.lastMetrics = { reported_status: status ?? "OK", ...extra };
  persist();
  return { error: null, device: toPublicDevice(device) };
}

function list({ status } = {}) {
  const now = Date.now();
  const all = Array.from(devices.values()).map((d) => toPublicDevice(d, now));
  if (!status) return all;
  return all.filter((d) => d.status === status);
}

function get(id) {
  const device = devices.get(id);
  if (!device) return null;
  return toPublicDevice(device);
}

function summary() {
  const now = Date.now();
  const all = Array.from(devices.values()).map((d) => computeStatus(d, now));
  const online = all.filter((s) => s === "ONLINE").length;
  return { total: all.length, online, offline: all.length - online };
}

// Test-only helper to reset state between test cases.
function _reset() {
  devices.clear();
}

module.exports = {
  ONLINE_TIMEOUT_MS,
  register,
  recordHeartbeat,
  list,
  get,
  summary,
  _reset,
};
