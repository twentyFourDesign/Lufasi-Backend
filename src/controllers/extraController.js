const db = require("../models");
const { v4: uuidv4 } = require("uuid");

async function createExtra(req, res, next) {
  try {
    const { name, description, price, category, imageUrl } = req.body;
    const extra = await db.Extra.create({
      id: uuidv4(),
      name,
      description,
      price,
      category,
      imageUrl,
    });
    res.json({ extra });
  } catch (err) {
    next(err);
  }
}

async function listExtras(req, res, next) {
  try {
    const extras = await db.Extra.findAll();
    res.json({ extras });
  } catch (err) {
    next(err);
  }
}

async function updateExtra(req, res, next) {
  try {
    const ex = await db.Extra.findByPk(req.params.id);
    if (!ex) return res.status(404).json({ error: "Extra not found" });
    await ex.update(req.body);
    res.json({ extra: ex });
  } catch (err) {
    next(err);
  }
}

module.exports = { createExtra, listExtras, updateExtra };
