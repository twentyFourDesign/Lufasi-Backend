const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const db = require("../models");
const { adminAuth } = require("../middleware/auth");
const uploadService = require("../services/uploadService");

const { uploaders, processUpload, processMultipleUploads, deleteFile } = uploadService;

router.post("/single", adminAuth, uploaders.general.single("image"), async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No image file provided" });
        }

        const imageData = processUpload(req.file, "");
        res.json({ success: true, ...imageData });
    } catch (err) {
        next(err);
    }
});

// Upload multiple images (general)
router.post("/multiple", adminAuth, uploaders.general.array("images", 10), async (req, res, next) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: "No image files provided" });
        }

        const images = processMultipleUploads(req.files, "");
        res.json({ success: true, images });
    } catch (err) {
        next(err);
    }
});

// Upload image for a specific pod
router.post("/pod/:podId", adminAuth, uploaders.pods.single("image"), async (req, res, next) => {
    try {
        const { podId } = req.params;

        if (!req.file) {
            return res.status(400).json({ error: "No image file provided" });
        }

        const pod = await db.Pod.findByPk(podId);
        if (!pod) {
            // Delete uploaded file if pod not found
            const imageData = processUpload(req.file, "pods");
            deleteFile(imageData.imageUrl);
            return res.status(404).json({ error: "Pod not found" });
        }

        const imageData = processUpload(req.file, "pods");

        // Create pod image record
        const podImage = await db.PodImage.create({
            id: uuidv4(),
            podId,
            imageUrl: imageData.imageUrl,
            sortOrder: 0,
        });

        res.json({ success: true, image: podImage });
    } catch (err) {
        next(err);
    }
});

// Upload image for extras
router.post("/extra/:extraId", adminAuth, uploaders.extras.single("image"), async (req, res, next) => {
    try {
        const { extraId } = req.params;

        if (!req.file) {
            return res.status(400).json({ error: "No image file provided" });
        }

        const extra = await db.Extra.findByPk(extraId);
        if (!extra) {
            const imageData = processUpload(req.file, "extras");
            deleteFile(imageData.imageUrl);
            return res.status(404).json({ error: "Extra not found" });
        }

        const imageData = processUpload(req.file, "extras");

        // Update extra with image URL
        await extra.update({ imageUrl: imageData.imageUrl });

        res.json({ success: true, ...imageData });
    } catch (err) {
        next(err);
    }
});

// Delete an image by URL path
router.delete("/", adminAuth, async (req, res, next) => {
    try {
        const { imageUrl } = req.body;

        if (!imageUrl) {
            return res.status(400).json({ error: "imageUrl is required" });
        }

        const deleted = deleteFile(imageUrl);

        // Also delete from PodImage if exists
        await db.PodImage.destroy({ where: { imageUrl } });

        res.json({ success: true, deleted });
    } catch (err) {
        next(err);
    }
});

// Upload/replace default pod image
router.post("/default-pod", adminAuth, uploaders.pods.single("image"), async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No image file provided" });
        }

        const fs = require("fs");
        const path = require("path");

        // Paths
        const uploadsPodsDir = path.join(__dirname, "../../uploads/pods");
        const defaultPodPath = path.join(uploadsPodsDir, "default-pod.png");
        const backupDir = path.join(uploadsPodsDir, "backup");

        // Create backup directory if it doesn't exist
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }

        // Backup existing default-pod.png if it exists
        if (fs.existsSync(defaultPodPath)) {
            const timestamp = Date.now();
            const backupPath = path.join(backupDir, `default-pod-${timestamp}.png`);
            fs.copyFileSync(defaultPodPath, backupPath);
        }

        // Move uploaded file to default-pod.png
        const uploadedFilePath = path.join(uploadsPodsDir, req.file.filename);

        // Delete old default-pod.png and rename uploaded file
        if (fs.existsSync(defaultPodPath)) {
            fs.unlinkSync(defaultPodPath);
        }
        fs.renameSync(uploadedFilePath, defaultPodPath);

        const baseUrl = process.env.APP_BASE_URL || "";
        res.json({
            success: true,
            message: "Default pod image updated successfully",
            imageUrl: `${baseUrl}/uploads/pods/default-pod.png`
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
