const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");

// Base uploads directory
const UPLOADS_DIR = path.join(__dirname, "../../uploads");

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const ensureSubdir = (subdir) => {
    const dir = path.join(UPLOADS_DIR, subdir);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
};


const imageFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const ext = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mime = allowedTypes.test(file.mimetype);
    if (ext && mime) {
        cb(null, true);
    } else {
        cb(new Error("Only image files are allowed (jpeg, jpg, png, gif, webp)"));
    }
};


const createStorage = (subdir = "") => {
    return multer.diskStorage({
        destination: (req, file, cb) => {
            const dir = subdir ? ensureSubdir(subdir) : UPLOADS_DIR;
            cb(null, dir);
        },
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname);
            const filename = `${uuidv4()}${ext}`;
            cb(null, filename);
        },
    });
};


const createUploader = (subdir = "", options = {}) => {
    const { maxFileSize = 5 * 1024 * 1024, maxFiles = 10 } = options;

    return multer({
        storage: createStorage(subdir),
        fileFilter: imageFilter,
        limits: { fileSize: maxFileSize },
    });
};


const getImageUrl = (subdir, filename) => {
    return subdir ? `/uploads/${subdir}/${filename}` : `/uploads/${filename}`;
};


const getFullImageUrl = (subdir, filename) => {
    const baseUrl = process.env.APP_BASE_URL || "";
    const relativePath = subdir ? `/uploads/${subdir}/${filename}` : `/uploads/${filename}`;
    return `${baseUrl}${relativePath}`;
};


const toFullUrl = (relativePath) => {
    if (!relativePath) return null;
    const baseUrl = process.env.APP_BASE_URL || "";
    // If already a full URL, return as is
    if (relativePath.startsWith("http")) return relativePath;
    return `${baseUrl}${relativePath}`;
};


const getFilePath = (subdir, filename) => {
    return subdir
        ? path.join(UPLOADS_DIR, subdir, filename)
        : path.join(UPLOADS_DIR, filename);
};


const deleteFile = (imageUrl) => {
    try {
        // Remove leading /uploads/ to get relative path
        const relativePath = imageUrl.replace(/^\/uploads\/?/, "");
        const filePath = path.join(UPLOADS_DIR, relativePath);

        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            return true;
        }
        return false;
    } catch (err) {
        console.error("Error deleting file:", err);
        return false;
    }
};


const processUpload = (file, subdir = "") => {
    if (!file) return null;
    return {
        imageUrl: getFullImageUrl(subdir, file.filename),
        filename: file.filename,
        originalName: file.originalname,
        size: file.size,
        mimetype: file.mimetype,
    };
};

const processMultipleUploads = (files, subdir = "") => {
    if (!files || !files.length) return [];
    return files.map((file) => processUpload(file, subdir));
};

// Pre-configured uploaders for common use cases
const uploaders = {
    pods: createUploader("pods"),
    extras: createUploader("extras"),
    meals: createUploader("meals"),
    general: createUploader(""),
};

module.exports = {
    // Directory constants
    UPLOADS_DIR,

    // Factory functions
    createUploader,
    createStorage,

    // Utility functions
    ensureSubdir,
    getImageUrl,
    getFullImageUrl,
    toFullUrl,
    getFilePath,
    deleteFile,
    processUpload,
    processMultipleUploads,

    uploaders,

    imageFilter,
};
