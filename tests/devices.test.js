const request = require("supertest");
const createApp = require("../src/app");
const store = require("../src/deviceStore");

describe("Device Fleet Monitor API", () => {
  let app;

  beforeEach(() => {
    store._reset();
    app = createApp();
  });

  describe("POST /devices", () => {
    it("registers a new device", async () => {
      const res = await request(app)
        .post("/devices")
        .send({ id: "device-01", name: "Lab Device 01" });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        id: "device-01",
        name: "Lab Device 01",
        status: "OFFLINE",
        last_heartbeat: null,
      });
    });

    it("rejects registration missing an id", async () => {
      const res = await request(app).post("/devices").send({ name: "No Id" });
      expect(res.status).toBe(400);
    });

    it("rejects registration missing a name", async () => {
      const res = await request(app).post("/devices").send({ id: "device-01" });
      expect(res.status).toBe(400);
    });

    it("rejects duplicate device ids", async () => {
      await request(app).post("/devices").send({ id: "device-01", name: "First" });
      const res = await request(app)
        .post("/devices")
        .send({ id: "device-01", name: "Second" });
      expect(res.status).toBe(409);
    });
  });

  describe("POST /devices/:id/heartbeat", () => {
    it("records a heartbeat for a registered device", async () => {
      await request(app).post("/devices").send({ id: "device-01", name: "Lab Device 01" });

      const res = await request(app)
        .post("/devices/device-01/heartbeat")
        .send({ timestamp: new Date().toISOString(), status: "OK" });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ONLINE");
      expect(res.body.last_heartbeat).not.toBeNull();
    });

    it("accepts optional extra metric fields without failing", async () => {
      await request(app).post("/devices").send({ id: "device-01", name: "Lab Device 01" });

      const res = await request(app).post("/devices/device-01/heartbeat").send({
        timestamp: new Date().toISOString(),
        status: "OK",
        cpu_usage: 42,
        signal_strength: -71,
      });

      expect(res.status).toBe(200);
    });

    it("returns 404 for an unregistered device", async () => {
      const res = await request(app)
        .post("/devices/unknown-device/heartbeat")
        .send({ timestamp: new Date().toISOString(), status: "OK" });
      expect(res.status).toBe(404);
    });

    it("returns 400 for an invalid timestamp", async () => {
      await request(app).post("/devices").send({ id: "device-01", name: "Lab Device 01" });
      const res = await request(app)
        .post("/devices/device-01/heartbeat")
        .send({ timestamp: "not-a-date", status: "OK" });
      expect(res.status).toBe(400);
    });
  });

  describe("GET /devices and GET /devices/:id", () => {
    it("lists all registered devices with current status", async () => {
      await request(app).post("/devices").send({ id: "device-01", name: "Lab Device 01" });
      await request(app).post("/devices").send({ id: "device-02", name: "Lab Device 02" });

      const res = await request(app).get("/devices");
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });

    it("returns details for a single device", async () => {
      await request(app).post("/devices").send({ id: "device-01", name: "Lab Device 01" });
      const res = await request(app).get("/devices/device-01");
      expect(res.status).toBe(200);
      expect(res.body.id).toBe("device-01");
    });

    it("returns 404 for a device that does not exist", async () => {
      const res = await request(app).get("/devices/does-not-exist");
      expect(res.status).toBe(404);
    });

    it("filters devices by status=ONLINE", async () => {
      await request(app).post("/devices").send({ id: "device-01", name: "Online One" });
      await request(app).post("/devices").send({ id: "device-02", name: "Offline One" });
      await request(app)
        .post("/devices/device-01/heartbeat")
        .send({ timestamp: new Date().toISOString(), status: "OK" });

      const res = await request(app).get("/devices?status=ONLINE");
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe("device-01");
    });

    it("filters devices by status=OFFLINE", async () => {
      await request(app).post("/devices").send({ id: "device-01", name: "Never Beat" });
      const res = await request(app).get("/devices?status=OFFLINE");
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });

    it("rejects an invalid status filter value", async () => {
      const res = await request(app).get("/devices?status=SLEEPING");
      expect(res.status).toBe(400);
    });

    it("exposes heartbeat metrics on the device", async () => {
      await request(app).post("/devices").send({ id: "device-01", name: "Metric Device" });
      await request(app).post("/devices/device-01/heartbeat").send({
        timestamp: new Date().toISOString(),
        status: "OK",
        cpu_usage: 42,
        signal_strength: -71,
      });

      const res = await request(app).get("/devices/device-01");
      expect(res.body.metrics).toMatchObject({
        reported_status: "OK",
        cpu_usage: 42,
        signal_strength: -71,
      });
    });
  });

  describe("GET /summary", () => {
    it("summarizes total/online/offline counts", async () => {
      await request(app).post("/devices").send({ id: "device-01", name: "Lab Device 01" });
      await request(app).post("/devices").send({ id: "device-02", name: "Lab Device 02" });
      await request(app)
        .post("/devices/device-01/heartbeat")
        .send({ timestamp: new Date().toISOString(), status: "OK" });

      const res = await request(app).get("/summary");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ total: 2, online: 1, offline: 1 });
    });
  });

  describe("ONLINE/OFFLINE timeout behaviour", () => {
    it("marks a device ONLINE within 30s of its last heartbeat", async () => {
      await request(app).post("/devices").send({ id: "device-01", name: "Lab Device 01" });
      const twentySecondsAgo = new Date(Date.now() - 20_000).toISOString();
      await request(app)
        .post("/devices/device-01/heartbeat")
        .send({ timestamp: twentySecondsAgo, status: "OK" });

      const res = await request(app).get("/devices/device-01");
      expect(res.body.status).toBe("ONLINE");
    });

    it("marks a device OFFLINE more than 30s after its last heartbeat", async () => {
      await request(app).post("/devices").send({ id: "device-01", name: "Lab Device 01" });
      const fortySecondsAgo = new Date(Date.now() - 40_000).toISOString();
      await request(app)
        .post("/devices/device-01/heartbeat")
        .send({ timestamp: fortySecondsAgo, status: "OK" });

      const res = await request(app).get("/devices/device-01");
      expect(res.body.status).toBe("OFFLINE");
    });

    it("treats a device with no heartbeat yet as OFFLINE", async () => {
      await request(app).post("/devices").send({ id: "device-01", name: "Lab Device 01" });
      const res = await request(app).get("/devices/device-01");
      expect(res.body.status).toBe("OFFLINE");
    });
  });

  describe("concurrency", () => {
    it("handles many simultaneous heartbeats for the same device without corrupting state", async () => {
      await request(app).post("/devices").send({ id: "device-01", name: "Busy Device" });

      const requests = Array.from({ length: 50 }, (_, i) =>
        request(app)
          .post("/devices/device-01/heartbeat")
          .send({ timestamp: new Date().toISOString(), status: "OK", cpu_usage: i })
      );
      const results = await Promise.all(requests);

      expect(results.every((r) => r.status === 200)).toBe(true);

      const res = await request(app).get("/devices/device-01");
      expect(res.body.status).toBe("ONLINE");
      expect(res.body.last_heartbeat).not.toBeNull();

      const summaryRes = await request(app).get("/summary");
      expect(summaryRes.body).toEqual({ total: 1, online: 1, offline: 0 });
    });

    it("handles many simultaneous registrations without dropping or duplicating devices", async () => {
      const requests = Array.from({ length: 20 }, (_, i) =>
        request(app).post("/devices").send({ id: `device-${i}`, name: `Device ${i}` })
      );
      const results = await Promise.all(requests);

      expect(results.every((r) => r.status === 201)).toBe(true);

      const res = await request(app).get("/devices");
      expect(res.body).toHaveLength(20);
      const ids = new Set(res.body.map((d) => d.id));
      expect(ids.size).toBe(20);
    });
  });
});
