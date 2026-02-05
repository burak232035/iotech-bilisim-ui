const express = require("express");
const AreaModel = require("../models/area.model");

const router = express.Router();

// GET all areas
router.get("/", async (req, res) => {
  try {
    const areas = await AreaModel.getAll();
    res.json(areas);
  } catch (err) {
    console.error("Error fetching areas:", err);
    res.status(500).json({ error: "Failed to fetch areas" });
  }
});

// GET area by ID
router.get("/:id", async (req, res) => {
  try {
    const area = await AreaModel.getById(req.params.id);
    if (!area) {
      return res.status(404).json({ error: "Area not found" });
    }
    res.json(area);
  } catch (err) {
    console.error("Error fetching area:", err);
    res.status(500).json({ error: "Failed to fetch area" });
  }
});

// POST create new area
router.post("/", async (req, res) => {
  try {
    const { name, coordinates } = req.body;

    if (!name || !coordinates) {
      return res.status(400).json({ error: "Name and coordinates required" });
    }

    if (!coordinates.type || !coordinates.points || !Array.isArray(coordinates.points)) {
      return res.status(400).json({ error: "Invalid coordinates format" });
    }

    const area = await AreaModel.create(name, coordinates);
    console.log(`✅ Area created: ${name} (ID: ${area.id})`);
    res.status(201).json(area);
  } catch (err) {
    console.error("Error creating area:", err);
    res.status(500).json({ error: "Failed to create area" });
  }
});

// PUT update area
router.put("/:id", async (req, res) => {
  try {
    const { name, coordinates } = req.body;

    if (!name || !coordinates) {
      return res.status(400).json({ error: "Name and coordinates required" });
    }

    const area = await AreaModel.update(req.params.id, name, coordinates);
    if (!area) {
      return res.status(404).json({ error: "Area not found" });
    }

    console.log(`✅ Area updated: ${name} (ID: ${area.id})`);
    res.json(area);
  } catch (err) {
    console.error("Error updating area:", err);
    res.status(500).json({ error: "Failed to update area" });
  }
});

// DELETE area
router.delete("/:id", async (req, res) => {
  try {
    const area = await AreaModel.delete(req.params.id);
    if (!area) {
      return res.status(404).json({ error: "Area not found" });
    }

    console.log(`✅ Area deleted: ID ${req.params.id}`);
    res.json({ message: "Area deleted successfully", area });
  } catch (err) {
    console.error("Error deleting area:", err);
    res.status(500).json({ error: "Failed to delete area" });
  }
});

module.exports = router;
