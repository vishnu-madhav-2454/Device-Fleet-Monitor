const ONLINE_TIMEOUT_MS = 30 * 1000;

// In-memory registry. Keyed by device id.
const devices = new Map();

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
  };
}

function register(id, name) {
  if (devices.has(id)) {
    return { error: "DUPLICATE", device: null };
  }
  const device = { id, name, lastHeartbeatAt: null, lastMetrics: null };
  devices.set(id, device);
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
  device.lastMetrics = { status: status ?? "OK", ...extra };
  return { error: null, device: toPublicDevice(device) };
}

function list() {
  const now = Date.now();
  return Array.from(devices.values()).map((d) => toPublicDevice(d, now));
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
