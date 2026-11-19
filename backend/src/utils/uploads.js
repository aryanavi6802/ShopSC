const multer = require("multer");

/**
 * Image uploads are served back from the same origin as the app (/uploads/...), so only real image
 * types are accepted and the stored extension comes from the MIME type, never from the client's
 * filename. Otherwise someone could upload "photo.html" and get script running on our origin.
 */
const IMAGE_EXTENSIONS = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp"
};

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB

const multerImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (IMAGE_EXTENSIONS[file.mimetype]) return cb(null, true);
    const err = new Error("UNSUPPORTED_IMAGE_TYPE");
    err.code = "UNSUPPORTED_IMAGE_TYPE";
    return cb(err);
  }
});

/** Express middleware: parse an optional single image field, answering 400 instead of 500 on bad input. */
function uploadImage(field = "image") {
  const handler = multerImage.single(field);
  return (req, res, next) =>
    handler(req, res, (err) => {
      if (!err) return next();
      const code = err.code === "LIMIT_FILE_SIZE" ? "IMAGE_TOO_LARGE" : err.code || "INVALID_UPLOAD";
      return res.status(400).json({ error: code });
    });
}

function imageExtension(file) {
  return IMAGE_EXTENSIONS[file && file.mimetype] || ".jpg";
}

module.exports = { uploadImage, imageExtension, IMAGE_EXTENSIONS };
