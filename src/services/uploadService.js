const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

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

const identificationFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp|pdf/;
  const ext = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mime = allowedTypes.test(file.mimetype.toLowerCase());
  if (ext && mime) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Only image or PDF files are allowed for identification (jpeg, jpg, png, gif, webp, pdf)",
      ),
    );
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
  const {
    maxFileSize = 5 * 1024 * 1024,
    maxFiles = 10,
    fileFilter = imageFilter,
  } = options;

  return multer({
    storage: createStorage(subdir),
    fileFilter,
    limits: { fileSize: maxFileSize },
  });
};

/** Relative URL stored in the database, e.g. /uploads/pods/<uuid>.jpg */
const getImageUrl = (subdir, filename) => {
  return subdir ? `/uploads/${subdir}/${filename}` : `/uploads/${filename}`;
};

const getAppBaseUrl = () =>
  (process.env.APP_BASE_URL || "").replace(/\/$/, "");

/** Fix URLs like https://domain.comfile.jpg → https://domain.com/file.jpg */
const repairImageUrl = (url) => {
  if (!url || typeof url !== "string") return url;
  return url.replace(
    /(https?:\/\/[^/]+\.(?:com|org|net|io|dev))([a-zA-Z0-9])/,
    "$1/$2",
  );
};

/**
 * Normalize any stored/public image reference to a relative /uploads/... path.
 * Returns null when the value cannot be mapped to on-disk storage.
 */
const normalizeToRelativePath = (imageUrl) => {
  if (!imageUrl || typeof imageUrl !== "string") return null;

  let url = repairImageUrl(imageUrl.trim());

  if (url.startsWith("/uploads/")) {
    return url;
  }

  const uploadsMatch = url.match(/\/uploads\/(.+)$/i);
  if (uploadsMatch) {
    return `/uploads/${uploadsMatch[1]}`;
  }

  if (url.startsWith("http")) {
    // Legacy bare filenames at domain root (not on disk) — cannot delete
    const bareName = url.split("/").pop();
    if (bareName && /\.(jpe?g|png|gif|webp)$/i.test(bareName)) {
      const candidate = path.join(UPLOADS_DIR, "pods", bareName);
      if (fs.existsSync(candidate)) {
        return `/uploads/pods/${bareName}`;
      }
    }
    return null;
  }

  if (url.startsWith("/")) {
    return url;
  }

  // Bare filename
  if (/\.(jpe?g|png|gif|webp)$/i.test(url)) {
    return `/uploads/pods/${url}`;
  }

  return null;
};

/** Build a public absolute URL from a stored relative path or legacy value. */
const toFullUrl = (imageUrl) => {
  if (!imageUrl) return null;

  const repaired = repairImageUrl(imageUrl);
  if (repaired.startsWith("http")) {
    return repaired;
  }

  const relative = normalizeToRelativePath(repaired) || repaired;
  const baseUrl = getAppBaseUrl();
  const normalizedPath = relative.startsWith("/") ? relative : `/${relative}`;

  if (!baseUrl) return normalizedPath;
  return `${baseUrl}${normalizedPath}`;
};

const getFilePath = (subdir, filename) => {
  return subdir
    ? path.join(UPLOADS_DIR, subdir, filename)
    : path.join(UPLOADS_DIR, filename);
};

const deleteFile = (imageUrl) => {
  try {
    const relativePath = normalizeToRelativePath(imageUrl);
    if (!relativePath) {
      return false;
    }

    const filePath = path.join(
      UPLOADS_DIR,
      relativePath.replace(/^\/uploads\/?/, ""),
    );

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

/**
 * Process a multer file — stores a relative path suitable for the database.
 * Use toFullUrl() when returning URLs to clients.
 */
const processUpload = (file, subdir = "") => {
  if (!file) return null;
  const relativeUrl = getImageUrl(subdir, file.filename);
  return {
    imageUrl: relativeUrl,
    publicUrl: toFullUrl(relativeUrl),
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

const formatImageRecord = (imageJson) => {
  if (!imageJson) return imageJson;
  return {
    ...imageJson,
    imageUrl: toFullUrl(imageJson.imageUrl),
  };
};

const uploadToCloudinary = async (filePath, options = {}) => {
  if (!filePath) {
    console.log(
      "[uploadService] No filePath provided to uploadToCloudinary, skipping upload",
    );
    return null;
  }
  const folder =
    options.folder ||
    process.env.CLOUDINARY_UPLOAD_FOLDER ||
    "lufasi/identifications";
  const resourceType = options.resource_type || "auto";

  console.log("[uploadService] Uploading file to Cloudinary", {
    filePath,
    folder,
    resourceType,
  });

  const result = await cloudinary.uploader.upload(filePath, {
    folder,
    resource_type: resourceType,
  });

  console.log("[uploadService] Cloudinary upload successful", {
    public_id: result.public_id,
    secure_url: result.secure_url,
    bytes: result.bytes,
    format: result.format,
  });

  return result;
};

// Pre-configured uploaders for common use cases
const uploaders = {
  pods: createUploader("pods"),
  extras: createUploader("extras"),
  meals: createUploader("meals"),
  branding: createUploader("branding"),
  general: createUploader(""),
  identification: createUploader("ids", {
    maxFileSize: 10 * 1024 * 1024,
    fileFilter: identificationFilter,
  }),
};

module.exports = {
  UPLOADS_DIR,
  createUploader,
  createStorage,
  ensureSubdir,
  getImageUrl,
  getAppBaseUrl,
  repairImageUrl,
  normalizeToRelativePath,
  toFullUrl,
  getFilePath,
  deleteFile,
  processUpload,
  processMultipleUploads,
  formatImageRecord,
  uploadToCloudinary,
  uploaders,
  imageFilter,
};
