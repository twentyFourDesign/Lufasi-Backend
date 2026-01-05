const db = require("../models");
const { v4: uuidv4 } = require("uuid");
const uploadService = require("../services/uploadService");

// Create pod with images in single request
async function createPod(req, res, next) {
  try {
    const body = req.body;

    // Create the pod first
    const pod = await db.Pod.create({
      id: uuidv4(),
      propertyId: body.propertyId || null,
      podName: body.podName,
      description: body.description || "",
      rules: body.rules || "",
      amenities: body.amenities || "",
      baseAdultPrice: body.baseAdultPrice || 250000,
      maxAdults: body.maxAdults || 2,
      maxChildren: body.maxChildren || 0,
      maxToddlers: body.maxToddlers || 0,
      maxInfants: body.maxInfants || 2,
      isActive: body.isActive !== undefined ? body.isActive : true,
    });

    // Handle price rules if provided
    if (body.priceRules && Array.isArray(body.priceRules)) {
      for (const r of body.priceRules) {
        await db.PodPriceRule.create({
          podId: pod.id,
          guestType: r.guestType,
          pricePercentage: r.pricePercentage,
        });
      }
    }

    // Handle uploaded images (from multer)
    const images = [];
    if (req.files && req.files.length > 0) {
      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        const imageData = uploadService.processUpload(file, "pods");

        const podImage = await db.PodImage.create({
          id: uuidv4(),
          podId: pod.id,
          imageUrl: imageData.imageUrl,
          sortOrder: i,
          isPrimary: i === 0,
        });
        images.push(podImage);
      }
    }

    // Return pod with images
    const result = await db.Pod.findByPk(pod.id, {
      include: [
        { model: db.PodImage, as: "images" },
        "priceRules",
      ],
    });

    res.json({ pod: result });
  } catch (err) {
    next(err);
  }
}

async function listPods(req, res, next) {
  try {
    const pods = await db.Pod.findAll({
      include: [
        { model: db.PodImage, as: "images" },
        "priceRules",
      ],
      order: [["podName", "ASC"]],
    });

    // Transform images to include full URLs
    const podsWithFullUrls = pods.map((pod) => {
      const podJson = pod.toJSON();
      if (podJson.images) {
        podJson.images = podJson.images.map((img) => ({
          ...img,
          imageUrl: uploadService.toFullUrl(img.imageUrl),
        }));
      }
      return podJson;
    });

    res.json({ pods: podsWithFullUrls });
  } catch (err) {
    next(err);
  }
}

async function getPod(req, res, next) {
  try {
    const pod = await db.Pod.findByPk(req.params.id, {
      include: [
        { model: db.PodImage, as: "images" },
        "priceRules",
      ],
    });
    if (!pod) return res.status(404).json({ error: "Pod not found" });

    // Transform images to include full URLs
    const podJson = pod.toJSON();
    if (podJson.images) {
      podJson.images = podJson.images.map((img) => ({
        ...img,
        imageUrl: uploadService.toFullUrl(img.imageUrl),
      }));
    }

    res.json({ pod: podJson });
  } catch (err) {
    next(err);
  }
}

// Update pod with optional new images
async function updatePod(req, res, next) {
  try {
    const pod = await db.Pod.findByPk(req.params.id);
    if (!pod) return res.status(404).json({ error: "Pod not found" });

    // Update pod fields
    await pod.update(req.body);

    // Update price rules if present
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

    // Handle new uploaded images
    if (req.files && req.files.length > 0) {
      const maxOrder = await db.PodImage.max("sortOrder", { where: { podId: pod.id } }) || 0;

      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        const imageData = uploadService.processUpload(file, "pods");

        await db.PodImage.create({
          id: uuidv4(),
          podId: pod.id,
          imageUrl: imageData.imageUrl,
          sortOrder: maxOrder + i + 1,
        });
      }
    }

    // Return updated pod with images
    const result = await db.Pod.findByPk(pod.id, {
      include: [
        { model: db.PodImage, as: "images" },
        "priceRules",
      ],
    });

    res.json({ pod: result });
  } catch (err) {
    next(err);
  }
}

// Add multiple images to existing pod
async function addPodImages(req, res, next) {
  try {
    const { podId } = req.params;

    const pod = await db.Pod.findByPk(podId);
    if (!pod) return res.status(404).json({ error: "Pod not found" });

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No images provided" });
    }

    const maxOrder = await db.PodImage.max("sortOrder", { where: { podId } }) || 0;
    const images = [];

    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const imageData = uploadService.processUpload(file, "pods");

      const podImage = await db.PodImage.create({
        id: uuidv4(),
        podId,
        imageUrl: imageData.imageUrl,
        sortOrder: maxOrder + i + 1,
      });
      images.push(podImage);
    }

    res.json({ success: true, images });
  } catch (err) {
    next(err);
  }
}

async function deletePodImage(req, res, next) {
  try {
    const { imageId } = req.params;

    const image = await db.PodImage.findByPk(imageId);
    if (!image) return res.status(404).json({ error: "Image not found" });

    // Delete the file from disk
    uploadService.deleteFile(image.imageUrl);

    await image.destroy();
    res.json({ message: "Image deleted successfully" });
  } catch (err) {
    next(err);
  }
}

async function setPrimaryImage(req, res, next) {
  try {
    const { imageId } = req.params;

    const image = await db.PodImage.findByPk(imageId);
    if (!image) return res.status(404).json({ error: "Image not found" });

    // Reset all images for this pod
    await db.PodImage.update(
      { isPrimary: false },
      { where: { podId: image.podId } }
    );

    // Set this one as primary
    await image.update({ isPrimary: true });

    res.json({ message: "Primary image set successfully", image });
  } catch (err) {
    next(err);
  }
}

async function reorderImages(req, res, next) {
  try {
    const { podId } = req.params;
    const { imageIds } = req.body;

    if (!Array.isArray(imageIds)) {
      return res.status(400).json({ error: "imageIds must be an array" });
    }

    for (let i = 0; i < imageIds.length; i++) {
      await db.PodImage.update(
        { sortOrder: i },
        { where: { id: imageIds[i], podId } }
      );
    }

    res.json({ message: "Images reordered successfully" });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createPod,
  listPods,
  getPod,
  updatePod,
  addPodImages,
  deletePodImage,
  setPrimaryImage,
  reorderImages,
};
