# Device Fleet Monitor

A small service that tracks heartbeats from a fleet of devices and reports
each device's `ONLINE`/`OFFLINE` status based on how recently it was last
heard from.

## What it does

- Registers devices by id/name
- Accepts a heartbeat from a registered device (with optional metrics like
  `cpu_usage`, `signal_strength`)
- Lists all devices with their current computed status
- Returns details for a single device
- Returns a fleet-wide summary (`total` / `online` / `offline`)
- Applies a rolling 30-second timeout: a device is `ONLINE` if its last
  heartbeat was within the last 30 seconds, otherwise `OFFLINE`

## Design / Architecture

- **Express** app split into three layers:
  - `src/deviceStore.js` — pure in-memory state and business logic (status
    computation, the 30s timeout rule). No HTTP concerns here, which is what
    makes it easy to unit-test directly and via the API.
  - `src/routes/devices.js` — HTTP layer: request validation, status codes,
    error shapes. Thin — it delegates all state logic to the store.
  - `src/app.js` / `src/server.js` — app wiring and process entrypoint,
    separated so tests can create an app instance without binding a port.
- **Status is computed on read, not on a timer.** There's no background job
  flipping devices to OFFLINE; every `GET` recomputes `now - lastHeartbeatAt
  <= 30s` at request time. This avoids race conditions between a timer and
  concurrent reads/writes, and keeps the store free of scheduling concerns.
- **Storage is in-memory** (a `Map`), which is intentional for the scope of
  this exercise — see Known Limitations.

## Prerequisites

- Node.js 18+ (uses the built-in global `fetch`, used by the simulator)
- npm

## How to build

```bash
npm install
```

There is no separate build step — this is plain Node.js (CommonJS), no
bundler or transpiler required.

## How to run the application

```bash
npm start
```

Starts the API on `http://localhost:3000` (override with `PORT=<port>`).

## How to run the simulator

With the server already running in another terminal:

```bash
npm run simulate
```

This registers 5 devices (`device-01` .. `device-05`) and sends a heartbeat
from each every 5 seconds. Configurable via environment variables:

```bash
BASE_URL=http://localhost:3000 DEVICE_COUNT=5 INTERVAL_MS=5000 npm run simulate
```

To watch a device go `OFFLINE`, type its number (e.g. `1`) and press Enter
while the simulator is running — that device stops sending heartbeats, and
`GET /devices` will show it as `OFFLINE` once 30 seconds have passed since
its last heartbeat.

## How to run the tests

```bash
npm test
```

Runs the Jest + Supertest suite in `tests/devices.test.js` against the app
directly (no separate server process needed).

## Example API requests

Register a device:

```bash
curl -X POST http://localhost:3000/devices \
  -H "Content-Type: application/json" \
  -d '{"id":"device-01","name":"Lab Device 01"}'
```

Send a heartbeat:

```bash
curl -X POST http://localhost:3000/devices/device-01/heartbeat \
  -H "Content-Type: application/json" \
  -d '{"timestamp":"2026-09-21T10:30:00Z","status":"OK","cpu_usage":42,"signal_strength":-71}'
```

List devices:

```bash
curl http://localhost:3000/devices
```

Get a single device:

```bash
curl http://localhost:3000/devices/device-01
```

Fleet summary:

```bash
curl http://localhost:3000/summary
```

## Assumptions

- A device must be registered before it can send a heartbeat (`POST
  .../heartbeat` for an unknown device returns `404`).
- `id` is treated as the unique key for a device; re-registering an existing
  `id` returns `409 Conflict` rather than overwriting it.
- A device with no heartbeat yet is `OFFLINE` by definition.
- `timestamp` in a heartbeat is optional-ish in spirit but if provided must
  parse as a valid date; if omitted, the server's current time is used.
- The 30-second window is a fixed constant, not configurable via the API
  (per the spec, it's a fixed rule).

## Known limitations

- **In-memory storage only** — all state is lost on restart; not suitable
  for multiple server instances/horizontal scaling as-is.
- **No authentication/authorization** — any client can register devices or
  send heartbeats for any device id.
- **No persistence of heartbeat history** — only the latest heartbeat and
  metrics are kept per device, not a time series.
- **No rate limiting** on heartbeat/registration endpoints.

## What I'd improve with one more day

- Add persistent storage (e.g. SQLite) behind the same store interface so
  the rest of the app wouldn't need to change.
- Add structured logging (request id, latency) instead of `console.log`.
- Add graceful shutdown (drain in-flight requests on SIGTERM).
- Add a minimal read-only dashboard UI over `GET /devices` and `GET
  /summary`.
- Add configuration via environment variables for the timeout window and
  port instead of the hardcoded 30s constant.
- Add concurrency/load tests to validate behavior under many simultaneous
  heartbeats.

## AI Usage

- **Tool used:** Claude (Claude Code), for scaffolding and pairing on this
  implementation.
- **What it was used for:** setting up the Express project structure,
  writing the device store/route/test code from the spec, drafting this
  README, and running the test suite and a manual end-to-end smoke test
  (server + simulator, including the stop-a-device-and-watch-it-go-OFFLINE
  scenario) to verify behavior.
- **Something changed/verified:** the status-computation approach was
  deliberately kept as "compute on read" rather than a background interval
  timer, to avoid a class of race conditions between a timer thread and
  concurrent request handling — this was a design choice checked against
  the spec's requirement that "the status returned by the APIs should
  reflect this rule automatically," which only requires correctness at
  read time, not a live-updating background process.
- **Personally verified before submitting:** ran `npm test` (15/15 passing)
  and manually ran the server + simulator together, confirming a live
  heartbeat marks a device `ONLINE`, and that stopping a device's
  heartbeats causes it to show as `OFFLINE` in `GET /devices` after the
  30-second window, via real HTTP requests rather than trusting the code
  alone.
