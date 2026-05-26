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

const getImageUrl = (subdir, filename) => {
  return subdir ? `/uploads/${subdir}/${filename}` : `/uploads/${filename}`;
};

const getFullImageUrl = (subdir, filename) => {
  const baseUrl = process.env.APP_BASE_URL || "";
  const relativePath = subdir
    ? `/uploads/${subdir}/${filename}`
    : `/uploads/${filename}`;
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
  getFullImageUrl,
  toFullUrl,
  getFilePath,
  deleteFile,
  processUpload,
  processMultipleUploads,
  uploadToCloudinary,
  uploaders,
  imageFilter,
};
