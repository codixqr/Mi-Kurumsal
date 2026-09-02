const multer = require("multer");
const multerS3 = require("multer-s3");
const { S3Client } = require("@aws-sdk/client-s3");
const path = require("path");
const fs = require("fs");

const uploadsDir = process.env.VERCEL 
  ? path.join("/tmp", "uploads") 
  : path.join(__dirname, "../..", "uploads");

if (!fs.existsSync(uploadsDir)) {
  try {
    fs.mkdirSync(uploadsDir, { recursive: true });
  } catch (err) {
    console.error("Dizin oluşturulamadı:", err);
  }
}

let uploadStorage;
const isR2Enabled = process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME;

if (isR2Enabled) {
  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });

  uploadStorage = multerS3({
    s3: s3,
    bucket: process.env.R2_BUCKET_NAME,
    acl: "public-read",
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: function (req, file, cb) {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, "uploads/" + uniqueSuffix + "-" + file.originalname.replace(/[^\w.\-]/g, "_"));
    },
  });
} else {
  uploadStorage = multer.diskStorage({
    destination: uploadsDir,
    filename: (req, file, cb) => {
      const safeName = `${Date.now()}-${Math.round(Math.random() * 1e9)}-${file.originalname.replace(/[^\w.\-]/g, "_")}`;
      cb(null, safeName);
    },
  });
}

const upload = multer({ storage: uploadStorage, limits: { fileSize: 25 * 1024 * 1024 } });
const uploadLocal = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (req, file, cb) => {
      const safeName = `${Date.now()}-${Math.round(Math.random() * 1e9)}-${file.originalname.replace(/[^\w.\-]/g, "_")}`;
      cb(null, safeName);
    }
  }),
  limits: { fileSize: 25 * 1024 * 1024 }
});

module.exports = { upload, uploadLocal, uploadsDir };
