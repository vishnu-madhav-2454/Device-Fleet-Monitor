const express = require("express");
const store = require("../deviceStore");

const router = express.Router();

router.post("/devices", (req, res) => {
  const { id, name } = req.body ?? {};
  if (typeof id !== "string" || id.trim() === "") {
    return res.status(400).json({ error: "id is required" });
  }
  if (typeof name !== "string" || name.trim() === "") {
    return res.status(400).json({ error: "name is required" });
  }

  const { error, device } = store.register(id, name);
  if (error === "DUPLICATE") {
    return res.status(409).json({ error: `device '${id}' already registered` });
  }
  return res.status(201).json(device);
});

router.post("/devices/:id/heartbeat", (req, res) => {
  const { id } = req.params;
  const body = req.body ?? {};

  const { error, device } = store.recordHeartbeat(id, body);
  if (error === "NOT_FOUND") {
    return res.status(404).json({ error: `device '${id}' not found` });
  }
  if (error === "INVALID_TIMESTAMP") {
    return res.status(400).json({ error: "timestamp is not a valid date" });
  }
  return res.status(200).json(device);
});

router.get("/devices", (req, res) => {
  const { status } = req.query;
  if (status !== undefined) {
    const normalized = String(status).toUpperCase();
    if (normalized !== "ONLINE" && normalized !== "OFFLINE") {
      return res.status(400).json({ error: "status must be ONLINE or OFFLINE" });
    }
    return res.status(200).json(store.list({ status: normalized }));
  }
  return res.status(200).json(store.list());
});

router.get("/devices/:id", (req, res) => {
  const device = store.get(req.params.id);
  if (!device) {
    return res.status(404).json({ error: `device '${req.params.id}' not found` });
  }
  return res.status(200).json(device);
});

router.get("/summary", (_req, res) => {
  res.status(200).json(store.summary());
});

module.exports = router;
