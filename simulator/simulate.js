/*
 * Simulates a fleet of devices sending heartbeats to the Device Fleet Monitor API.
 *
 * Usage:
 *   node simulator/simulate.js
 *   BASE_URL=http://localhost:3000 DEVICE_COUNT=5 INTERVAL_MS=5000 node simulator/simulate.js
 *
 * Press a device number key (1-9) then Enter to stop that device's heartbeats
 * and watch it go OFFLINE after the 30s timeout. Ctrl+C to exit.
 */

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const DEVICE_COUNT = Number(process.env.DEVICE_COUNT || 5);
const INTERVAL_MS = Number(process.env.INTERVAL_MS || 5000);

const devices = Array.from({ length: DEVICE_COUNT }, (_, i) => {
  const n = String(i + 1).padStart(2, "0");
  return { id: `device-${n}`, name: `Lab Device ${n}`, stopped: false };
});

async function registerDevice(device) {
  const res = await fetch(`${BASE_URL}/devices`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: device.id, name: device.name }),
  });
  if (res.status === 201) {
    console.log(`[registered] ${device.id}`);
  } else if (res.status === 409) {
    console.log(`[skip] ${device.id} already registered`);
  } else {
    console.error(`[error] failed to register ${device.id}: ${res.status}`);
  }
}

async function sendHeartbeat(device) {
  if (device.stopped) return;
  try {
    const res = await fetch(`${BASE_URL}/devices/${device.id}/heartbeat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        status: "OK",
        cpu_usage: Math.floor(Math.random() * 100),
        signal_strength: -(Math.floor(Math.random() * 40) + 40),
      }),
    });
    console.log(`[heartbeat] ${device.id} -> ${res.status}`);
  } catch (err) {
    console.error(`[error] heartbeat failed for ${device.id}: ${err.message}`);
  }
}

function promptForStop() {
  process.stdin.setEncoding("utf8");
  console.log(
    "\nType a device number (e.g. 1) and press Enter to stop that device and watch it go OFFLINE.\n"
  );
  process.stdin.on("data", (input) => {
    const n = parseInt(input.trim(), 10);
    const device = devices[n - 1];
    if (device) {
      device.stopped = true;
      console.log(`[stopped] ${device.id} will no longer send heartbeats`);
    }
  });
}

async function main() {
  console.log(`Simulating ${DEVICE_COUNT} device(s) against ${BASE_URL} every ${INTERVAL_MS}ms`);

  for (const device of devices) {
    await registerDevice(device);
  }

  const tick = () => devices.forEach(sendHeartbeat);
  tick();
  setInterval(tick, INTERVAL_MS);

  promptForStop();
}

main();
