const db = require("../models");
const { v4: uuidv4 } = require("uuid");

async function createPod(req, res, next) {
  try {
    const body = req.body;
    const pod = await db.Pod.create({
      id: uuidv4(),
      propertyId: body.propertyId || null,
      podName: body.podName,
      description: body.description || "",
      rules: body.rules || "",
      baseAdultPrice: body.baseAdultPrice || 250000,
      maxAdults: body.maxAdults || 2,
      maxChildren: body.maxChildren || 0,
      maxToddlers: body.maxToddlers || 0,
      maxInfants: body.maxInfants || 2,
    });

    // price rules if provided
    if (body.priceRules && Array.isArray(body.priceRules)) {
      for (const r of body.priceRules) {
        await db.PodPriceRule.create({
          podId: pod.id,
          guestType: r.guestType,
          pricePercentage: r.pricePercentage,
        });
      }
    }

    res.json({ pod });
  } catch (err) {
    next(err);
  }
}

async function listPods(req, res, next) {
  try {
    const pods = await db.Pod.findAll({ include: ["images", "priceRules"] });
    res.json({ pods });
  } catch (err) {
    next(err);
  }
}

async function getPod(req, res, next) {
  try {
    const pod = await db.Pod.findByPk(req.params.id, {
      include: ["images", "priceRules"],
    });
    if (!pod) return res.status(404).json({ error: "Pod not found" });
    res.json({ pod });
  } catch (err) {
    next(err);
  }
}

async function updatePod(req, res, next) {
  try {
    const pod = await db.Pod.findByPk(req.params.id);
    if (!pod) return res.status(404).json({ error: "Pod not found" });
    await pod.update(req.body);

    // update price rules if present (simple replace: remove existing & add new)
    if (req.body.priceRules && Array.isArray(req.body.priceRules)) {
      await db.PodPriceRule.destroy({ where: { podId: pod.id } });
      for (const r of req.body.priceRules) {
        await db.PodPriceRule.create({
          podId: pod.id,
          guestType: r.guestType,
          pricePercentage: r.pricePercentage,
        });
      }
    }

    res.json({ pod });
  } catch (err) {
    next(err);
  }
}

module.exports = { createPod, listPods, getPod, updatePod };
