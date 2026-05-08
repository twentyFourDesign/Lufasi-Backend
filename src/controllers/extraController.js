const db = require("../models");
const { v4: uuidv4 } = require("uuid");
const uploadService = require("../services/uploadService");

async function createExtra(req, res, next) {
  try {
    const { name, description, price, category, imageUrl, isActive } = req.body;
    const extra = await db.Extra.create({
      id: uuidv4(),
      name,
      description,
      price,
      category,
      imageUrl,
      isActive: isActive !== undefined ? isActive : true,
    });
    res.json({ extra });
  } catch (err) {
    next(err);
  }
}

async function listExtras(req, res, next) {
  try {
    const extras = await db.Extra.findAll({
      order: [["name", "ASC"]],
    });
    res.json({ extras });
  } catch (err) {
    next(err);
  }
}

async function getExtrasByCategory(req, res, next) {
  try {
    const extras = await db.Extra.findAll({
      where: { isActive: true },
      order: [
        ["category", "ASC"],
        ["name", "ASC"],
      ],
    });

    // Group extras by category
    const groupedExtras = extras.reduce((acc, extra) => {
      const category = extra.category || "uncategorized";

      if (!acc[category]) {
        acc[category] = {
          id: category.toLowerCase().replace(/\s+/g, "-"),
          title: category.charAt(0).toUpperCase() + category.slice(1),
          subtitle: `Premium ${category} options for your stay`,
          category: category,
          options: [],
        };
      }

      acc[category].options.push({
        id: extra.id,
        name: extra.name,
        description: extra.description,
        price: parseFloat(extra.price),
        imageUrl: extra.imageUrl,
        category: extra.category,
      });

      return acc;
    }, {});

    // Convert to array format expected by frontend
    const formattedExtras = Object.values(groupedExtras);

    res.json(formattedExtras);
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

async function deleteExtra(req, res, next) {
  try {
    const ex = await db.Extra.findByPk(req.params.id);
    if (!ex) return res.status(404).json({ error: "Extra not found" });
    await ex.destroy();
    res.json({ message: "Extra deleted successfully" });
  } catch (err) {
    next(err);
  }
}

async function updateExtraImage(req, res, next) {
  try {
    const ex = await db.Extra.findByPk(req.params.id);
    if (!ex) return res.status(404).json({ error: "Extra not found" });

    if (!req.file) {
      return res.status(400).json({ error: "No image file uploaded" });
    }

    let imageUrl = null;
    try {
      const uploadResult = await uploadService.uploadToCloudinary(req.file.path, {
        folder: "lufasi/extras",
        resource_type: "image",
      });
      imageUrl = uploadResult?.secure_url || uploadResult?.url || null;
    } catch (uploadErr) {
      console.error("Failed to upload extra image to Cloudinary:", uploadErr);
      return res
        .status(500)
        .json({ error: "Failed to upload image. Please try again." });
    }

    if (!imageUrl) {
      return res
        .status(500)
        .json({ error: "Image upload did not return a valid URL." });
    }

    ex.imageUrl = imageUrl;
    await ex.save();

    res.json({ extra: ex });
  } catch (err) {
    next(err);
  }
}

async function updateCategoryImage(req, res, next) {
  try {
    const { category } = req.params;
    if (!category) {
      return res.status(400).json({ error: "Category is required" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No image file uploaded" });
    }

    let imageUrl = null;
    try {
      const uploadResult = await uploadService.uploadToCloudinary(req.file.path, {
        folder: "lufasi/extras",
        resource_type: "image",
      });
      imageUrl = uploadResult?.secure_url || uploadResult?.url || null;
    } catch (uploadErr) {
      console.error("Failed to upload category image to Cloudinary:", uploadErr);
      return res
        .status(500)
        .json({ error: "Failed to upload image. Please try again." });
    }

    if (!imageUrl) {
      return res
        .status(500)
        .json({ error: "Image upload did not return a valid URL." });
    }

    const [updatedCount] = await db.Extra.update(
      { imageUrl },
      { where: { category } },
    );

    if (updatedCount === 0) {
      return res
        .status(404)
        .json({ error: "No extras found for this category" });
    }

    const updatedExtras = await db.Extra.findAll({
      where: { category },
      order: [["name", "ASC"]],
    });

    res.json({ category, imageUrl, extras: updatedExtras });
  } catch (err) {
    next(err);
  }
}

async function clearCategoryImage(req, res, next) {
  try {
    const { category } = req.params;
    if (!category) {
      return res.status(400).json({ error: "Category is required" });
    }

    const [updatedCount] = await db.Extra.update(
      { imageUrl: null },
      { where: { category } },
    );

    if (updatedCount === 0) {
      return res
        .status(404)
        .json({ error: "No extras found for this category" });
    }

    const updatedExtras = await db.Extra.findAll({
      where: { category },
      order: [["name", "ASC"]],
    });

    res.json({ category, imageUrl: null, extras: updatedExtras });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createExtra,
  listExtras,
  updateExtra,
  deleteExtra,
  getExtrasByCategory,
  updateExtraImage,
  updateCategoryImage,
  clearCategoryImage,
};

