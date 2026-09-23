# Device Fleet Monitor

A small service that tracks heartbeats from a fleet of devices and reports
each device's `ONLINE`/`OFFLINE` status based on how recently it was last
heard from.

## What it does

- Registers devices by id/name
- Accepts a heartbeat from a registered device (with optional metrics like
  `cpu_usage`, `signal_strength`, returned back on the device going forward)
- Lists all devices with their current computed status, optionally filtered
  by `?status=ONLINE|OFFLINE`
- Returns details for a single device
- Returns a fleet-wide summary (`total` / `online` / `offline`)
- Applies a rolling 30-second timeout: a device is `ONLINE` if its last
  heartbeat was within the last 30 seconds, otherwise `OFFLINE`
- Persists device state to disk so it survives a restart
- Serves a small read-only dashboard UI at `/`

## Design / Architecture

- **Express** app split into layers:
  - `src/deviceStore.js` — in-memory state and business logic (status
    computation, the 30s timeout rule, filtering). No HTTP concerns here,
    which is what makes it easy to unit-test directly and via the API.
  - `src/persistence.js` — loads/saves the store's state to a JSON file, so
    the store module doesn't need to know how or where state is durable.
  - `src/routes/devices.js` — HTTP layer: request validation, status codes,
    error shapes. Thin — it delegates all state logic to the store.
  - `src/app.js` / `src/server.js` — app wiring, request logging, static
    dashboard, and process entrypoint, separated so tests can create an app
    instance without binding a port.
  - `src/config.js` / `src/logger.js` — centralized env-based configuration
    and structured (JSON line) logging used throughout.
- **Status is computed on read, not on a timer.** There's no background job
  flipping devices to OFFLINE; every `GET` recomputes `now - lastHeartbeatAt
  <= 30s` at request time. This avoids race conditions between a timer and
  concurrent reads/writes, and keeps the store free of scheduling concerns.
- **Concurrency safety**: Node runs the store's synchronous get/set logic on
  a single thread, so two "simultaneous" requests can't interleave mid
  read-modify-write the way they could with real parallel threads. This is
  exercised directly in `tests/devices.test.js` (50 concurrent heartbeats,
  20 concurrent registrations).
- **Storage** is a JSON file on disk (`data/devices.json` by default, via
  `src/persistence.js`), written synchronously on every mutation — see
  Known Limitations for why this isn't a real database.

## Prerequisites

- Node.js 18+ (uses the built-in global `fetch`, used by the simulator)
- npm
- Docker + Docker Compose (optional — only needed if you want to run it
  containerized instead of with `npm start`)

## How to build

```bash
npm install
```

There is no separate build step — this is plain Node.js (CommonJS), no
bundler or transpiler required.

## Configuration

All optional, via environment variables:

| Variable            | Default                 | Purpose                                   |
|---------------------|--------------------------|--------------------------------------------|
| `PORT`               | `3000`                  | HTTP port                                  |
| `ONLINE_TIMEOUT_MS`  | `30000`                 | Heartbeat timeout window (spec default: 30s) |
| `DATA_FILE`          | `data/devices.json`     | Where device state is persisted            |
| `LOG_LEVEL`          | `info`                  | `error` \| `warn` \| `info` \| `debug`     |

## How to run the application

```bash
npm start
```

Starts the API on `http://localhost:3000` (configurable, see above). Visit
`http://localhost:3000` in a browser for a live dashboard of device status.
Stop it with `Ctrl+C` for a graceful shutdown (drains in-flight requests
before exiting — see Known Limitations for a Windows-specific caveat).

### Running with Docker

```bash
docker compose up --build
```

This builds the image and starts the API on `http://localhost:3000`, with
device state persisted to a named volume (`device-data`) so it survives
`docker compose restart`/recreation. Without Compose:

```bash
docker build -t device-fleet-monitor .
docker run -p 3000:3000 -v device-data:/app/data device-fleet-monitor
```

The simulator is not part of the image (it's a client-side test tool, not
part of the running service) — run it from the host against the
containerized API as usual: `npm run simulate`.

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

Filter devices by status:

```bash
curl "http://localhost:3000/devices?status=ONLINE"
```

## API documentation

A full OpenAPI 3.0 spec is at [`docs/openapi.yaml`](docs/openapi.yaml).
Paste its contents into https://editor.swagger.io (or open it with any
OpenAPI-aware editor plugin) for an interactive, browsable view.

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

- **JSON-file storage, not a real database** — fine for a single instance
  and this exercise's scale, but not for multiple server
  instances/horizontal scaling (they'd stomp on the same file), and every
  write blocks the event loop briefly (synchronous by design, to keep
  writes from interleaving — see Design/Architecture).
- **No authentication/authorization** — any client can register devices or
  send heartbeats for any device id.
- **No persistence of heartbeat history** — only the latest heartbeat and
  metrics are kept per device, not a time series.
- **No rate limiting** on heartbeat/registration endpoints.
- **Graceful shutdown is Windows-limited** — Node doesn't support `SIGTERM`
  on Windows at all, and `SIGINT` only reaches the handler via a real
  interactive `Ctrl+C` in a console window (not when delivered
  programmatically, e.g. from a script). Both signals work as coded on
  Linux/macOS, which is the more common deployment target (Docker,
  systemd, PM2, etc.).
- **The simulator's "stop a device" control is interactive** (type a
  number, press Enter in its own terminal) — it wasn't practical to
  automate that keystroke against a backgrounded process while testing in
  this environment, so the OFFLINE transition was instead verified
  directly against the live API (register → heartbeat → wait 30s+ → status
  flips to OFFLINE), which exercises the same underlying logic.

## What I'd improve with one more day

- Swap the JSON-file store for a real embedded database (e.g. SQLite)
  behind the same store interface, so the rest of the app wouldn't need to
  change.
- Add authentication (e.g. a per-device API key issued at registration).
- Add rate limiting on heartbeat/registration endpoints.
- Add request tracing (correlation ids threaded through the structured
  logs) and basic metrics (request counts/latency histograms).
- Publish a versioned image to a registry as part of a CI pipeline, rather
  than only building it locally.

## AI Usage

- **Tool used:** Claude (Claude Code), for scaffolding and pairing on this
  implementation end-to-end, including the core API, the optional
  enhancements, and this documentation.
- **What it was used for:** setting up the Express project structure;
  writing the device store/route/test code from the spec; adding the
  optional enhancements (file-backed persistence, structured logging,
  graceful shutdown, env-based config, status filtering, exposing
  heartbeat metrics, a small dashboard UI, an OpenAPI spec); and running
  the test suite plus manual end-to-end checks against a live server.
- **Something changed/rejected:** an initial attempt to verify graceful
  shutdown by piping OS signals to a backgrounded process from a shell
  script didn't reflect real behavior — on Windows, `SIGTERM` isn't
  supported by Node at all, and a programmatically-delivered `SIGINT`
  bypasses the handler entirely (only a real interactive `Ctrl+C` in a
  console window triggers it). Rather than report the shutdown code as
  "tested" based on a misleading test, that limitation is called out
  explicitly in Known Limitations instead.
- **A real bug found and fixed via testing, not just trusting the
  generated code:** the first version of the Dockerfile declared
  `/app/data` as a volume after switching to the non-root `node` user.
  Testing it (registering a device, then checking the container's logs)
  surfaced `EACCES: permission denied` on every write — Docker seeds a
  fresh named volume with root ownership by default, which the non-root
  process couldn't write to. Fixed by creating the directory and
  `chown`-ing it to `node` *before* the `USER node` instruction, then
  re-verified by destroying and recreating the container against the same
  named volume and confirming the registered device was still there.
- **Personally verified before submitting:** ran `npm test` (21/21
  passing); ran the server standalone and confirmed registration,
  heartbeats, filtering, and the 30-second ONLINE→OFFLINE transition over
  real wall-clock time via `curl` (not just mocked timestamps in unit
  tests); killed and restarted the server to confirm persisted state
  actually reloads from disk; opened the dashboard UI in a browser with
  live seeded data to confirm the table, summary counts, and the status
  filter dropdown all update correctly; and built + ran the Docker image
  (both directly and via `docker compose up`), including destroying and
  recreating the container to confirm the persisted volume actually
  survives, before cleaning up every test container/image/volume created
  along the way.
