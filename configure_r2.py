import sys

with open('express-server/index.js', 'r', encoding='utf-8') as f:
    content = f.read()

import_block = '''const path = require("path");
const { S3Client } = require("@aws-sdk/client-s3");
const multerS3 = require("multer-s3");'''
content = content.replace('const path = require("path");', import_block)

storage_block_old = '''const uploadStorage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + "-" + file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, ""));
  },
});
const upload = multer({ storage: uploadStorage, limits: { fileSize: 25 * 1024 * 1024 } });'''

storage_block_new = '''let uploadStorage;
const isR2Enabled = process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME;

if (isR2Enabled) {
  const s3 = new S3Client({
    region: "auto",
    endpoint: \https://\.r2.cloudflarestorage.com\,
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
      cb(null, "uploads/" + uniqueSuffix + "-" + file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, ""));
    },
  });
} else {
  uploadStorage = multer.diskStorage({
    destination: uploadsDir,
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, uniqueSuffix + "-" + file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, ""));
    },
  });
}
const upload = multer({ storage: uploadStorage, limits: { fileSize: 25 * 1024 * 1024 } });'''

content = content.replace(storage_block_old, storage_block_new)

file_url_old = '''const fileUrl = \/uploads/\\;'''
file_url_new = '''const fileUrl = isR2Enabled 
    ? \\/\\ 
    : \/uploads/\\;
  const storedName = req.file.key || req.file.filename;'''

content = content.replace(file_url_old, file_url_new)

# Update the INSERT query to use storedName
content = content.replace('req.file.filename,', 'storedName,', 1)

with open('express-server/index.js', 'w', encoding='utf-8') as f:
    f.write(content)
