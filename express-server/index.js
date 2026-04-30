require("dotenv").config();

const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const xlsx = require("xlsx");
const nodemailer = require("nodemailer");
const twilio = require("twilio");
const multer = require("multer");
const PDFDocument = require("pdfkit");

const app = express();
const port = Number(process.env.PORT || 3000);
const jwtSecret = process.env.JWT_SECRET || "crm_dev_secret_change_me";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes("db.prisma.io") 
    ? { rejectUnauthorized: false } 
    : false,
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..")));

const uploadsDir = process.env.VERCEL 
  ? path.join("/tmp", "uploads") 
  : path.join(__dirname, "..", "uploads");

if (!fs.existsSync(uploadsDir)) {
  try {
    fs.mkdirSync(uploadsDir, { recursive: true });
  } catch (err) {
    console.error("Dizin oluşturulamadı:", err);
  }
}
app.use("/uploads", express.static(uploadsDir));

const uploadStorage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const safeName = `${Date.now()}-${Math.round(Math.random() * 1e9)}-${file.originalname.replace(/[^\w.\-]/g, "_")}`;
    cb(null, safeName);
  },
});
const upload = multer({ storage: uploadStorage, limits: { fileSize: 25 * 1024 * 1024 } });

const pipelineStages = [
  "Yeni Lead",
  "İletişim Kuruldu",
  "Analiz Yapıldı",
  "Marka Önerildi",
  "Sunum Yapıldı",
  "Teklif Verildi",
  "Kapandı (Kazanıldı/Kaybedildi)",
];

const scoreWeights = {
  budget: 30,
  city: 25,
  sector: 25,
  sqm: 20,
};

const cityFitMap = {
  İstanbul: ["Cadde + AVM", "AVM", "Cadde", "Sahil + Premium Cadde", "Cadde + Mahalle"],
  Ankara: ["Cadde + AVM", "AVM", "Cadde"],
  İzmir: ["Cadde + AVM", "Cadde", "Sahil + Premium Cadde"],
  Bursa: ["Cadde", "AVM", "Cadde + Mahalle"],
  Antalya: ["Sahil + Premium Cadde", "Cadde", "AVM"],
};

const ENTITY_CONFIG = {
  investors: {
    table: "investors",
    labelField: "name",
    where: "deleted_at IS NULL",
  },
  brands: {
    table: "brands",
    labelField: "name",
    where: "deleted_at IS NULL",
  },
  locations: {
    table: "locations",
    labelField: "name",
    where: "deleted_at IS NULL",
  },
  projects: {
    table: "projects",
    labelField: "name",
    where: "deleted_at IS NULL",
  },
  contracts: {
    table: "contracts",
    labelField: "note",
    where: "deleted_at IS NULL",
  },
  tasks: {
    table: "tasks",
    labelField: "note",
    where: "deleted_at IS NULL",
  },
};

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ message: "Yetkisiz erişim." });
  }
  try {
    req.user = jwt.verify(token, jwtSecret);
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Geçersiz oturum." });
  }
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    jwtSecret,
    { expiresIn: "12h" },
  );
}

function fillTemplate(rawTemplate, payload) {
  return rawTemplate.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = payload[key];
    return value === undefined || value === null ? "" : String(value);
  });
}

async function logAutomation(channel, eventName, payload, status, errorMessage = null) {
  await pool.query(
    `INSERT INTO automation_logs(channel, event_name, payload, status, error_message)
     VALUES($1, $2, $3, $4, $5)`,
    [channel, eventName, payload, status, errorMessage],
  );
}

async function logActivity({ userId, moduleName, actionType, recordId = null, summary, beforeData = null, afterData = null }) {
  await pool.query(
    `INSERT INTO activity_logs(user_id,module_name,action_type,record_id,summary,before_data,after_data)
     VALUES($1,$2,$3,$4,$5,$6,$7)`,
    [userId, moduleName, actionType, recordId, summary, beforeData, afterData],
  );
}

async function sendMailNotification(subject, text) {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const to = process.env.NOTIFY_EMAIL_TO;
  const from = process.env.NOTIFY_EMAIL_FROM || user;
  if (!host || !user || !pass || !to) {
    throw new Error("SMTP bilgileri eksik.");
  }

  const transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user, pass },
  });

  await transporter.sendMail({ from, to, subject, text });
}

async function sendWhatsAppNotification(message) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  const to = process.env.TWILIO_WHATSAPP_TO;
  if (!sid || !token || !from || !to) {
    throw new Error("Twilio WhatsApp bilgileri eksik.");
  }

  const client = twilio(sid, token);
  await client.messages.create({ from, to, body: message });
}

async function triggerAutomation(eventName, payload) {
  if (process.env.AUTOMATION_ENABLED === "false") {
    return;
  }

  const templateResult = await pool.query(
    "SELECT * FROM message_templates WHERE event_name=$1 AND active=true",
    [eventName],
  );
  const templates = templateResult.rows;
  const mailTemplate = templates.find((x) => x.channel === "mail");
  const whatsTemplate = templates.find((x) => x.channel === "whatsapp");

  const emailSubject = mailTemplate
    ? fillTemplate(mailTemplate.title, payload)
    : `Mi CRM Otomasyon: ${eventName}`;
  const emailMessage = mailTemplate
    ? fillTemplate(mailTemplate.body, payload)
    : `[${eventName}] ${JSON.stringify(payload, null, 2)}`;

  try {
    await sendMailNotification(emailSubject, emailMessage);
    await logAutomation("mail", eventName, payload, "success");
  } catch (error) {
    await logAutomation("mail", eventName, payload, "failed", error.message);
  }

  const whatsappMessage = whatsTemplate
    ? fillTemplate(whatsTemplate.body, payload)
    : `Mi CRM ${eventName}\n${payload.summary || ""}`;

  try {
    await sendWhatsAppNotification(whatsappMessage);
    await logAutomation("whatsapp", eventName, payload, "success");
  } catch (error) {
    await logAutomation("whatsapp", eventName, payload, "failed", error.message);
  }
}

function mapInvestor(row) {
  return {
    id: row.id,
    name: row.name,
    budget: Number(row.budget),
    currency: row.currency || "TRY",
    city: row.city,
    sector: row.sector,
    type: row.investment_type,
    pipeline: row.pipeline_stage,
    phone: row.phone || "",
    email: row.email || "",
    district: row.district || "",
    goal: row.goal || "",
    contactHistory: row.contact_history || "",
    meetingNotes: row.meeting_notes || "",
    followUpDate: row.follow_up_date || "",
    documents: row.documents || [],
  };
}

function mapBrand(row) {
  return {
    id: row.id,
    name: row.name,
    sector: row.sector,
    minBudget: Number(row.min_budget),
    maxBudget: Number(row.max_budget),
    currency: row.currency || "TRY",
    minSqm: Number(row.min_sqm),
    maxSqm: Number(row.max_sqm),
    targetLocations: row.target_locations,
    active: row.active,
    monthlyGrowth: Number(row.monthly_growth),
    agreementStatus: row.agreement_status || "",
    franchiseFee: Number(row.franchise_fee || 0),
    royaltyRate: Number(row.royalty_rate || 0),
    contractTermMonths: Number(row.contract_term_months || 0),
    initialInvestment: Number(row.initial_investment || 0),
    branchCount: Number(row.branch_count || 0),
    contactPerson: row.contact_person || "",
    contactPhone: row.contact_phone || "",
    businessPlan: row.business_plan || "",
    operationPlan: row.operation_plan || "",
    onboardingSteps: row.onboarding_steps || [],
    kpiTargets: row.kpi_targets || "",
    brandNotes: row.brand_notes || "",
  };
}

function mapLocation(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.location_type,
    sqm: Number(row.sqm),
    rent: Number(row.rent),
    currency: row.currency || "TRY",
    potential: row.potential,
    recommendedBrands: row.recommended_brands || [],
    address: row.address || "",
    traffic: row.traffic || "",
    owner: row.owner || "",
    ownerPhone: row.owner_phone || "",
    notes: row.notes || "",
    attachmentName: row.attachment_name || "",
    attachmentData: row.attachment_data || "",
    attachmentUrl: row.attachment_url || "",
  };
}

function mapProject(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.project_type,
    owner: row.owner_team,
    assignees: row.assignees || [],
    priority: row.priority || "Orta",
    progress: Number(row.progress || 0),
    stage: row.stage,
    dueDate: row.due_date,
    description: row.description || "",
    checklist: row.checklist || [],
  };
}

function mapTask(row) {
  return {
    id: row.id,
    note: row.note,
    status: row.status,
  };
}

function mapContract(row) {
  return {
    id: row.id,
    note: row.note,
    type: row.contract_type || "",
    status: row.status || "",
    counterparty: row.counterparty || "",
    startDate: row.start_date || null,
    endDate: row.end_date || null,
    amount: row.amount ? Number(row.amount) : 0,
    currency: row.currency || "TRY",
    fileName: row.file_name || "",
    fileData: row.file_data || "",
    fileUrl: row.file_url || "",
    fileMimeType: row.file_mime_type || "",
  };
}

function scoreBudget(budget, brand) {
  if (budget >= brand.minBudget && budget <= brand.maxBudget) {
    return scoreWeights.budget;
  }
  const safeDiff = Math.min(Math.abs(budget - brand.minBudget), Math.abs(budget - brand.maxBudget));
  const ratioPenalty = Math.min(1, safeDiff / brand.maxBudget);
  return Math.max(0, Math.round(scoreWeights.budget * (1 - ratioPenalty)));
}

function scoreCity(city, brand) {
  const suitable = cityFitMap[city] || [];
  return suitable.includes(brand.targetLocations) ? scoreWeights.city : 10;
}

function scoreSector(sector, brand) {
  return sector === brand.sector ? scoreWeights.sector : 0;
}

function scoreSqm(sqm, brand) {
  if (sqm >= brand.minSqm && sqm <= brand.maxSqm) {
    return scoreWeights.sqm;
  }
  const safeDiff = Math.min(Math.abs(sqm - brand.minSqm), Math.abs(sqm - brand.maxSqm));
  const ratioPenalty = Math.min(1, safeDiff / brand.maxSqm);
  return Math.max(0, Math.round(scoreWeights.sqm * (1 - ratioPenalty)));
}

async function initDb() {
  const schemaPath = path.join(__dirname, "..", "schema.sql");
  if (!fs.existsSync(schemaPath)) {
    console.log("schema.sql bulunamadı, initDb atlanıyor.");
    return;
  }
  const schema = fs.readFileSync(schemaPath, "utf8");
  await pool.query(schema);
  await pool.query("ALTER TABLE investors ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP");
  await pool.query("ALTER TABLE brands ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP");
  await pool.query("ALTER TABLE locations ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP");
  await pool.query("ALTER TABLE projects ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP");
  await pool.query("ALTER TABLE contracts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP");
  await pool.query("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP");
  await pool.query("ALTER TABLE investors ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'TRY'");
  await pool.query("ALTER TABLE brands ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'TRY'");
  await pool.query("ALTER TABLE brands ADD COLUMN IF NOT EXISTS agreement_status TEXT");
  await pool.query("ALTER TABLE brands ADD COLUMN IF NOT EXISTS franchise_fee BIGINT");
  await pool.query("ALTER TABLE brands ADD COLUMN IF NOT EXISTS royalty_rate NUMERIC(5,2)");
  await pool.query("ALTER TABLE brands ADD COLUMN IF NOT EXISTS contract_term_months INTEGER");
  await pool.query("ALTER TABLE brands ADD COLUMN IF NOT EXISTS initial_investment BIGINT");
  await pool.query("ALTER TABLE brands ADD COLUMN IF NOT EXISTS branch_count INTEGER");
  await pool.query("ALTER TABLE brands ADD COLUMN IF NOT EXISTS contact_person TEXT");
  await pool.query("ALTER TABLE brands ADD COLUMN IF NOT EXISTS contact_phone TEXT");
  await pool.query("ALTER TABLE brands ADD COLUMN IF NOT EXISTS business_plan TEXT");
  await pool.query("ALTER TABLE brands ADD COLUMN IF NOT EXISTS operation_plan TEXT");
  await pool.query("ALTER TABLE brands ADD COLUMN IF NOT EXISTS onboarding_steps TEXT[] NOT NULL DEFAULT '{}'");
  await pool.query("ALTER TABLE brands ADD COLUMN IF NOT EXISTS kpi_targets TEXT");
  await pool.query("ALTER TABLE brands ADD COLUMN IF NOT EXISTS brand_notes TEXT");
  await pool.query("ALTER TABLE locations ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'TRY'");
  await pool.query("ALTER TABLE investors ADD COLUMN IF NOT EXISTS phone TEXT");
  await pool.query("ALTER TABLE investors ADD COLUMN IF NOT EXISTS email TEXT");
  await pool.query("ALTER TABLE investors ADD COLUMN IF NOT EXISTS district TEXT");
  await pool.query("ALTER TABLE investors ADD COLUMN IF NOT EXISTS goal TEXT");
  await pool.query("ALTER TABLE investors ADD COLUMN IF NOT EXISTS contact_history TEXT");
  await pool.query("ALTER TABLE investors ADD COLUMN IF NOT EXISTS meeting_notes TEXT");
  await pool.query("ALTER TABLE investors ADD COLUMN IF NOT EXISTS follow_up_date DATE");
  await pool.query("ALTER TABLE investors ADD COLUMN IF NOT EXISTS documents TEXT[] NOT NULL DEFAULT '{}'");
  await pool.query("ALTER TABLE projects ADD COLUMN IF NOT EXISTS assignees TEXT[] NOT NULL DEFAULT '{}'");
  await pool.query("ALTER TABLE projects ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'Orta'");
  await pool.query("ALTER TABLE projects ADD COLUMN IF NOT EXISTS progress INTEGER NOT NULL DEFAULT 0");
  await pool.query("ALTER TABLE projects ADD COLUMN IF NOT EXISTS description TEXT");
  await pool.query("ALTER TABLE projects ADD COLUMN IF NOT EXISTS checklist TEXT[] NOT NULL DEFAULT '{}'");
  await pool.query("ALTER TABLE contracts ADD COLUMN IF NOT EXISTS contract_type TEXT");
  await pool.query("ALTER TABLE contracts ADD COLUMN IF NOT EXISTS status TEXT");
  await pool.query("ALTER TABLE contracts ADD COLUMN IF NOT EXISTS counterparty TEXT");
  await pool.query("ALTER TABLE contracts ADD COLUMN IF NOT EXISTS start_date DATE");
  await pool.query("ALTER TABLE contracts ADD COLUMN IF NOT EXISTS end_date DATE");
  await pool.query("ALTER TABLE contracts ADD COLUMN IF NOT EXISTS amount BIGINT");
  await pool.query("ALTER TABLE contracts ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'TRY'");
  await pool.query("ALTER TABLE contracts ADD COLUMN IF NOT EXISTS file_name TEXT");
  await pool.query("ALTER TABLE contracts ADD COLUMN IF NOT EXISTS file_data TEXT");
  await pool.query("ALTER TABLE contracts ADD COLUMN IF NOT EXISTS file_url TEXT");
  await pool.query("ALTER TABLE contracts ADD COLUMN IF NOT EXISTS file_mime_type TEXT");
  await pool.query("ALTER TABLE locations ADD COLUMN IF NOT EXISTS address TEXT");
  await pool.query("ALTER TABLE locations ADD COLUMN IF NOT EXISTS traffic TEXT");
  await pool.query("ALTER TABLE locations ADD COLUMN IF NOT EXISTS owner TEXT");
  await pool.query("ALTER TABLE locations ADD COLUMN IF NOT EXISTS owner_phone TEXT");
  await pool.query("ALTER TABLE locations ADD COLUMN IF NOT EXISTS notes TEXT");
  await pool.query("ALTER TABLE locations ADD COLUMN IF NOT EXISTS attachment_name TEXT");
  await pool.query("ALTER TABLE locations ADD COLUMN IF NOT EXISTS attachment_data TEXT");
  await pool.query("ALTER TABLE locations ADD COLUMN IF NOT EXISTS attachment_url TEXT");
}

async function seedDefaultDataIfNeeded() {
  const adminEmail = process.env.ADMIN_EMAIL || "admin@mikurumsal.com";
  const adminPassword = process.env.ADMIN_PASSWORD || "Admin123*";
  const adminName = process.env.ADMIN_NAME || "CRM Admin";

  const existingUser = await pool.query("SELECT id FROM users WHERE email = $1", [adminEmail]);
  if (existingUser.rowCount === 0) {
    const hash = await bcrypt.hash(adminPassword, 10);
    await pool.query(
      "INSERT INTO users(name, email, password_hash, role) VALUES($1, $2, $3, $4)",
      [adminName, adminEmail, hash, "admin"],
    );
  }

  const seedBrands = [
    ["Tavada Tavuk", "Fast Casual", 1500000, 3500000, 90, 220, "AVM + Cadde", true, 11],
    ["Bigye", "Fast Casual", 1300000, 2900000, 70, 180, "AVM", true, 9],
    ["Kasap Döner", "Doner", 1200000, 2600000, 65, 150, "Cadde", true, 8],
    ["Cajun Corner", "Fast Casual", 1400000, 3100000, 80, 170, "AVM + Cadde", true, 10],
    ["Springfield ( Yeni Nesil Dürüm)", "Doner", 1250000, 2500000, 60, 130, "Cadde", true, 7],
    ["Yelken Balıkçısı", "Seafood", 2000000, 5000000, 140, 350, "Sahil + Premium Cadde", true, 6],
    ["Mogaf Döner", "Doner", 1100000, 2100000, 50, 120, "Cadde + Mahalle", true, 8],
    ["Blak Coffee Co", "Coffee", 1700000, 3600000, 90, 180, "Cadde + AVM", true, 13],
    ["The Coffee Factory", "Coffee", 1400000, 3300000, 80, 170, "AVM", true, 12],
    ["Coffee in Munchies", "Coffee", 1300000, 2900000, 75, 160, "Cadde + AVM", true, 9],
  ];

  for (const brand of seedBrands) {
    const exists = await pool.query("SELECT id FROM brands WHERE LOWER(name)=LOWER($1)", [brand[0]]);
    if (exists.rowCount > 0) continue;
    await pool.query(
      `INSERT INTO brands(name, sector, min_budget, max_budget, min_sqm, max_sqm, target_locations, active, monthly_growth)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      brand,
    );
  }
}

function normalizeMonthName(sheetName) {
  return String(sheetName || "").trim().toUpperCase("tr-TR");
}

function pickNumeric(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function extractMonthlyPnL(sheet, monthName) {
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  let revenue = 0;
  let expense = 0;
  let profit = 0;

  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 3) continue;
    const label = String(row[1] || "").toLowerCase("tr-TR");
    if (label.includes("satışlar") || label.includes("aylık toplam ciro")) {
      const val = pickNumeric(row[2]);
      if (val !== null) revenue = val;
    }
    if (label.includes("kar / zarar")) {
      const val = pickNumeric(row[7] ?? row[2]);
      if (val !== null) profit = val;
    }
    const label2 = String(row[5] || "").toLowerCase("tr-TR");
    if (label2.includes("genel gider toplamları")) {
      const val = pickNumeric(row[7]);
      if (val !== null) expense = val;
    }
  }

  if (!expense && revenue && profit) {
    expense = revenue - profit;
  }
  return { monthName, revenue, expense, profit };
}

function extractPnLDetailLines(sheet) {
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const details = [];
  let currentCategory = "Diğer";
  const categoryHints = [
    "maliyetler",
    "personel giderleri",
    "satış komisyon gideri",
    "kira ve aidat gideri",
    "enerji giderleri",
    "değişken  giderler",
    "değişken giderler",
  ];
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const label = String(row[1] || "").trim();
    if (!label) continue;
    const labelLc = label.toLowerCase("tr-TR");
    if (categoryHints.includes(labelLc)) {
      currentCategory = label;
      continue;
    }
    if (labelLc.includes("toplam") || labelLc.includes("satışlar") || labelLc.includes("kar / zarar")) {
      continue;
    }
    const amount = pickNumeric(row[2]);
    if (amount === null) continue;
    const ratio = pickNumeric(row[3]);
    details.push({
      category: currentCategory,
      itemName: label,
      amount,
      ratio,
    });
  }
  return details;
}

app.post("/api/auth/register", async (req, res) => {
  const { name, email, password, role = "agent" } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ message: "Ad, e-posta ve şifre zorunludur." });
  }

  const exists = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
  if (exists.rowCount > 0) {
    return res.status(409).json({ message: "Bu e-posta zaten kayıtlı." });
  }

  const hash = await bcrypt.hash(password, 10);
  const inserted = await pool.query(
    `INSERT INTO users(name, email, password_hash, role)
     VALUES($1,$2,$3,$4) RETURNING id,name,email,role`,
    [name, email, hash, role],
  );

  const token = signToken(inserted.rows[0]);
  return res.status(201).json({ token, user: inserted.rows[0] });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ message: "E-posta ve şifre zorunludur." });
  }

  const result = await pool.query(
    "SELECT id,name,email,role,password_hash FROM users WHERE email = $1",
    [email],
  );
  if (result.rowCount === 0) {
    return res.status(401).json({ message: "Kullanıcı bulunamadı." });
  }

  const user = result.rows[0];
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ message: "Şifre hatalı." });
  }

  const token = signToken(user);
  await logActivity({
    userId: user.id,
    moduleName: "auth",
    actionType: "login",
    summary: `${user.email} giriş yaptı`,
  });
  return res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});

app.get("/api/auth/me", authMiddleware, async (req, res) => {
  const result = await pool.query("SELECT id,name,email,role FROM users WHERE id = $1", [req.user.id]);
  if (result.rowCount === 0) {
    return res.status(404).json({ message: "Kullanıcı bulunamadı." });
  }
  return res.json(result.rows[0]);
});

app.post("/api/uploads", authMiddleware, upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "Dosya yüklenemedi." });
  }
  const moduleName = String(req.body.moduleName || "general");
  const fileUrl = `/uploads/${req.file.filename}`;
  const inserted = await pool.query(
    `INSERT INTO uploaded_files(module_name,original_name,stored_name,file_url,mime_type,size_bytes,created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [
      moduleName,
      req.file.originalname,
      req.file.filename,
      fileUrl,
      req.file.mimetype,
      req.file.size,
      req.user.id,
    ],
  );
  res.status(201).json(inserted.rows[0]);
});

app.get("/api/uploads/:module", authMiddleware, async (req, res) => {
  const rows = await pool.query(
    "SELECT * FROM uploaded_files WHERE module_name=$1 ORDER BY created_at DESC LIMIT 50",
    [req.params.module],
  );
  res.json(rows.rows);
});

app.get("/api/config", authMiddleware, (req, res) => {
  res.json({ pipelineStages, scoreWeights });
});

app.get("/api/dashboard", authMiddleware, async (req, res) => {
  const investors = await pool.query("SELECT COUNT(*)::int AS count FROM investors");
  const projects = await pool.query("SELECT COUNT(*)::int AS count FROM projects");
  const contracts = await pool.query("SELECT COUNT(*)::int AS count FROM contracts");
  const strong = await pool.query("SELECT COUNT(*)::int AS count FROM brands WHERE monthly_growth >= 10");

  res.json({
    activeInvestors: investors.rows[0].count,
    activeProjects: projects.rows[0].count,
    expectedRevenue: contracts.rows[0].count * 275000,
    strongMatches: strong.rows[0].count,
  });
});

app.get("/api/investors", authMiddleware, async (req, res) => {
  const result = await pool.query("SELECT * FROM investors ORDER BY id DESC");
  res.json(result.rows.map(mapInvestor));
});

app.post("/api/investors", authMiddleware, async (req, res) => {
  const {
    name,
    budget,
    currency = "TRY",
    city,
    sector,
    type,
    pipeline,
    phone = null,
    email = null,
    district = null,
    goal = null,
    contactHistory = null,
    meetingNotes = null,
    followUpDate = null,
    documents = [],
  } = req.body || {};
  const inserted = await pool.query(
    `INSERT INTO investors(name,budget,currency,city,sector,investment_type,pipeline_stage,phone,email,district,goal,contact_history,meeting_notes,follow_up_date,documents,created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
    [
      name,
      budget,
      currency,
      city,
      sector,
      type,
      pipeline,
      phone,
      email,
      district,
      goal,
      contactHistory,
      meetingNotes,
      followUpDate || null,
      documents,
      req.user.id,
    ],
  );
  const investor = mapInvestor(inserted.rows[0]);
  await logActivity({
    userId: req.user.id,
    moduleName: "investors",
    actionType: "create",
    recordId: investor.id,
    summary: `${investor.name} eklendi`,
    afterData: investor,
  });
  await triggerAutomation("Yeni Lead", { summary: `${investor.name} lead olarak eklendi`, investor });
  res.status(201).json(investor);
});

app.put("/api/investors/:id", authMiddleware, async (req, res) => {
  const {
    name,
    budget,
    currency = "TRY",
    city,
    sector,
    type,
    pipeline,
    phone = null,
    email = null,
    district = null,
    goal = null,
    contactHistory = null,
    meetingNotes = null,
    followUpDate = null,
    documents = [],
  } = req.body || {};
  const before = await pool.query("SELECT * FROM investors WHERE id=$1", [req.params.id]);
  const updated = await pool.query(
    `UPDATE investors
     SET name=$1,budget=$2,currency=$3,city=$4,sector=$5,investment_type=$6,pipeline_stage=$7,phone=$8,email=$9,district=$10,goal=$11,contact_history=$12,meeting_notes=$13,follow_up_date=$14,documents=$15,updated_at=NOW()
     WHERE id=$16 RETURNING *`,
    [
      name,
      budget,
      currency,
      city,
      sector,
      type,
      pipeline,
      phone,
      email,
      district,
      goal,
      contactHistory,
      meetingNotes,
      followUpDate || null,
      documents,
      req.params.id,
    ],
  );
  if (updated.rowCount === 0) {
    return res.status(404).json({ message: "Kayıt bulunamadı." });
  }
  const item = mapInvestor(updated.rows[0]);
  await logActivity({
    userId: req.user.id,
    moduleName: "investors",
    actionType: "update",
    recordId: item.id,
    summary: `${item.name} güncellendi`,
    beforeData: before.rows[0] || null,
    afterData: item,
  });
  return res.json(item);
});

app.delete("/api/investors/:id", authMiddleware, async (req, res) => {
  const row = await pool.query("SELECT * FROM investors WHERE id=$1", [req.params.id]);
  await pool.query("DELETE FROM investors WHERE id=$1", [req.params.id]);
  if (row.rowCount > 0) {
    await logActivity({
      userId: req.user.id,
      moduleName: "investors",
      actionType: "delete",
      recordId: Number(req.params.id),
      summary: `${row.rows[0].name} silindi`,
      beforeData: row.rows[0],
    });
  }
  res.status(204).send();
});

app.get("/api/brands", authMiddleware, async (req, res) => {
  const result = await pool.query("SELECT * FROM brands ORDER BY id DESC");
  res.json(result.rows.map(mapBrand));
});

app.post("/api/brands", authMiddleware, async (req, res) => {
  const body = req.body || {};
  const inserted = await pool.query(
    `INSERT INTO brands(name,sector,min_budget,max_budget,currency,min_sqm,max_sqm,target_locations,active,monthly_growth,agreement_status,franchise_fee,royalty_rate,contract_term_months,initial_investment,branch_count,contact_person,contact_phone,business_plan,operation_plan,onboarding_steps,kpi_targets,brand_notes)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) RETURNING *`,
    [
      body.name,
      body.sector,
      body.minBudget,
      body.maxBudget,
      body.currency || "TRY",
      body.minSqm,
      body.maxSqm,
      body.targetLocations,
      body.active,
      body.monthlyGrowth,
      body.agreementStatus || null,
      body.franchiseFee || null,
      body.royaltyRate || null,
      body.contractTermMonths || null,
      body.initialInvestment || null,
      body.branchCount || null,
      body.contactPerson || null,
      body.contactPhone || null,
      body.businessPlan || null,
      body.operationPlan || null,
      body.onboardingSteps || [],
      body.kpiTargets || null,
      body.brandNotes || null,
    ],
  );
  const item = mapBrand(inserted.rows[0]);
  await logActivity({
    userId: req.user.id,
    moduleName: "brands",
    actionType: "create",
    recordId: item.id,
    summary: `${item.name} eklendi`,
    afterData: item,
  });
  res.status(201).json(item);
});

app.put("/api/brands/:id", authMiddleware, async (req, res) => {
  const body = req.body || {};
  const before = await pool.query("SELECT * FROM brands WHERE id=$1", [req.params.id]);
  const updated = await pool.query(
    `UPDATE brands
     SET name=$1,sector=$2,min_budget=$3,max_budget=$4,currency=$5,min_sqm=$6,max_sqm=$7,target_locations=$8,active=$9,monthly_growth=$10,agreement_status=$11,franchise_fee=$12,royalty_rate=$13,contract_term_months=$14,initial_investment=$15,branch_count=$16,contact_person=$17,contact_phone=$18,business_plan=$19,operation_plan=$20,onboarding_steps=$21,kpi_targets=$22,brand_notes=$23,updated_at=NOW()
     WHERE id=$24 RETURNING *`,
    [
      body.name,
      body.sector,
      body.minBudget,
      body.maxBudget,
      body.currency || "TRY",
      body.minSqm,
      body.maxSqm,
      body.targetLocations,
      body.active,
      body.monthlyGrowth,
      body.agreementStatus || null,
      body.franchiseFee || null,
      body.royaltyRate || null,
      body.contractTermMonths || null,
      body.initialInvestment || null,
      body.branchCount || null,
      body.contactPerson || null,
      body.contactPhone || null,
      body.businessPlan || null,
      body.operationPlan || null,
      body.onboardingSteps || [],
      body.kpiTargets || null,
      body.brandNotes || null,
      req.params.id,
    ],
  );
  if (updated.rowCount === 0) {
    return res.status(404).json({ message: "Kayıt bulunamadı." });
  }
  const item = mapBrand(updated.rows[0]);
  await logActivity({
    userId: req.user.id,
    moduleName: "brands",
    actionType: "update",
    recordId: item.id,
    summary: `${item.name} güncellendi`,
    beforeData: before.rows[0] || null,
    afterData: item,
  });
  res.json(item);
});

app.delete("/api/brands/:id", authMiddleware, async (req, res) => {
  const row = await pool.query("SELECT * FROM brands WHERE id=$1", [req.params.id]);
  await pool.query("DELETE FROM brands WHERE id=$1", [req.params.id]);
  if (row.rowCount > 0) {
    await logActivity({
      userId: req.user.id,
      moduleName: "brands",
      actionType: "delete",
      recordId: Number(req.params.id),
      summary: `${row.rows[0].name} silindi`,
      beforeData: row.rows[0],
    });
  }
  res.status(204).send();
});

app.get("/api/brands/:id/agreements", authMiddleware, async (req, res) => {
  const rows = await pool.query(
    "SELECT * FROM brand_agreements WHERE brand_id=$1 ORDER BY version_no DESC, created_at DESC",
    [req.params.id],
  );
  res.json(rows.rows);
});

app.post("/api/brands/:id/agreements", authMiddleware, async (req, res) => {
  const brandId = Number(req.params.id);
  const { title, revisionNote = null, effectiveDate = null, fileName = null, fileUrl = null, mimeType = null } = req.body || {};
  if (!title) {
    return res.status(400).json({ message: "Doküman başlığı zorunlu." });
  }
  const nextVersion = await pool.query(
    "SELECT COALESCE(MAX(version_no), 0) + 1 AS version_no FROM brand_agreements WHERE brand_id=$1",
    [brandId],
  );
  const inserted = await pool.query(
    `INSERT INTO brand_agreements(brand_id,version_no,title,revision_note,effective_date,file_name,file_url,mime_type,uploaded_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [
      brandId,
      Number(nextVersion.rows[0].version_no),
      title,
      revisionNote,
      effectiveDate,
      fileName,
      fileUrl,
      mimeType,
      req.user.id,
    ],
  );
  res.status(201).json(inserted.rows[0]);
});

app.get("/api/locations", authMiddleware, async (req, res) => {
  const result = await pool.query("SELECT * FROM locations ORDER BY id DESC");
  res.json(result.rows.map(mapLocation));
});

app.post("/api/locations", authMiddleware, async (req, res) => {
  const body = req.body || {};
  const inserted = await pool.query(
    `INSERT INTO locations(name,location_type,sqm,rent,currency,potential,recommended_brands,address,traffic,owner,owner_phone,notes,attachment_name,attachment_data,attachment_url)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
    [
      body.name,
      body.type,
      body.sqm,
      body.rent,
      body.currency || "TRY",
      body.potential,
      body.recommendedBrands,
      body.address || null,
      body.traffic || null,
      body.owner || null,
      body.ownerPhone || null,
      body.notes || null,
      body.attachmentName || null,
      body.attachmentData || null,
      body.attachmentUrl || null,
    ],
  );
  const item = mapLocation(inserted.rows[0]);
  await logActivity({
    userId: req.user.id,
    moduleName: "locations",
    actionType: "create",
    recordId: item.id,
    summary: `${item.name} eklendi`,
    afterData: item,
  });
  res.status(201).json(item);
});

app.put("/api/locations/:id", authMiddleware, async (req, res) => {
  const body = req.body || {};
  const before = await pool.query("SELECT * FROM locations WHERE id=$1", [req.params.id]);
  const updated = await pool.query(
    `UPDATE locations
     SET name=$1,location_type=$2,sqm=$3,rent=$4,currency=$5,potential=$6,recommended_brands=$7,address=$8,traffic=$9,owner=$10,owner_phone=$11,notes=$12,attachment_name=$13,attachment_data=$14,attachment_url=$15,updated_at=NOW()
     WHERE id=$16 RETURNING *`,
    [
      body.name,
      body.type,
      body.sqm,
      body.rent,
      body.currency || "TRY",
      body.potential,
      body.recommendedBrands,
      body.address || null,
      body.traffic || null,
      body.owner || null,
      body.ownerPhone || null,
      body.notes || null,
      body.attachmentName || null,
      body.attachmentData || null,
      body.attachmentUrl || null,
      req.params.id,
    ],
  );
  if (updated.rowCount === 0) {
    return res.status(404).json({ message: "Kayıt bulunamadı." });
  }
  const item = mapLocation(updated.rows[0]);
  await logActivity({
    userId: req.user.id,
    moduleName: "locations",
    actionType: "update",
    recordId: item.id,
    summary: `${item.name} güncellendi`,
    beforeData: before.rows[0] || null,
    afterData: item,
  });
  res.json(item);
});

app.delete("/api/locations/:id", authMiddleware, async (req, res) => {
  const row = await pool.query("SELECT * FROM locations WHERE id=$1", [req.params.id]);
  await pool.query("DELETE FROM locations WHERE id=$1", [req.params.id]);
  if (row.rowCount > 0) {
    await logActivity({
      userId: req.user.id,
      moduleName: "locations",
      actionType: "delete",
      recordId: Number(req.params.id),
      summary: `${row.rows[0].name} silindi`,
      beforeData: row.rows[0],
    });
  }
  res.status(204).send();
});

app.get("/api/projects", authMiddleware, async (req, res) => {
  const result = await pool.query("SELECT * FROM projects ORDER BY id DESC");
  res.json(result.rows.map(mapProject));
});

app.post("/api/projects", authMiddleware, async (req, res) => {
  const body = req.body || {};
  const inserted = await pool.query(
    `INSERT INTO projects(name,project_type,owner_team,assignees,priority,progress,stage,due_date,description,checklist)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [
      body.name,
      body.type,
      body.owner,
      body.assignees || [],
      body.priority || "Orta",
      Number(body.progress || 0),
      body.stage,
      body.dueDate,
      body.description || null,
      body.checklist || [],
    ],
  );
  const project = mapProject(inserted.rows[0]);
  await logActivity({
    userId: req.user.id,
    moduleName: "projects",
    actionType: "create",
    recordId: project.id,
    summary: `${project.name} eklendi`,
    afterData: project,
  });
  await triggerAutomation("Proje Açıldı", { summary: `${project.name} projesi açıldı`, project });
  res.status(201).json(project);
});

app.put("/api/projects/:id", authMiddleware, async (req, res) => {
  const body = req.body || {};
  const before = await pool.query("SELECT * FROM projects WHERE id=$1", [req.params.id]);
  const updated = await pool.query(
    `UPDATE projects
     SET name=$1,project_type=$2,owner_team=$3,assignees=$4,priority=$5,progress=$6,stage=$7,due_date=$8,description=$9,checklist=$10,updated_at=NOW()
     WHERE id=$11 RETURNING *`,
    [
      body.name,
      body.type,
      body.owner,
      body.assignees || [],
      body.priority || "Orta",
      Number(body.progress || 0),
      body.stage,
      body.dueDate,
      body.description || null,
      body.checklist || [],
      req.params.id,
    ],
  );
  if (updated.rowCount === 0) {
    return res.status(404).json({ message: "Kayıt bulunamadı." });
  }
  const item = mapProject(updated.rows[0]);
  await logActivity({
    userId: req.user.id,
    moduleName: "projects",
    actionType: "update",
    recordId: item.id,
    summary: `${item.name} güncellendi`,
    beforeData: before.rows[0] || null,
    afterData: item,
  });
  res.json(item);
});

app.delete("/api/projects/:id", authMiddleware, async (req, res) => {
  const row = await pool.query("SELECT * FROM projects WHERE id=$1", [req.params.id]);
  await pool.query("DELETE FROM projects WHERE id=$1", [req.params.id]);
  if (row.rowCount > 0) {
    await logActivity({
      userId: req.user.id,
      moduleName: "projects",
      actionType: "delete",
      recordId: Number(req.params.id),
      summary: `${row.rows[0].name} silindi`,
      beforeData: row.rows[0],
    });
  }
  res.status(204).send();
});

app.get("/api/contracts", authMiddleware, async (req, res) => {
  const result = await pool.query("SELECT * FROM contracts ORDER BY id DESC");
  res.json(result.rows.map(mapContract));
});

app.post("/api/contracts", authMiddleware, async (req, res) => {
  const {
    note,
    type = null,
    status = null,
    counterparty = null,
    startDate = null,
    endDate = null,
    amount = null,
    currency = "TRY",
    fileName = null,
    fileData = null,
    fileUrl = null,
    fileMimeType = null,
  } = req.body || {};
  const inserted = await pool.query(
    `INSERT INTO contracts(note,contract_type,status,counterparty,start_date,end_date,amount,currency,file_name,file_data,file_url,file_mime_type)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [note, type, status, counterparty, startDate, endDate, amount, currency, fileName, fileData, fileUrl, fileMimeType],
  );
  const item = mapContract(inserted.rows[0]);
  await logActivity({
    userId: req.user.id,
    moduleName: "contracts",
    actionType: "create",
    recordId: item.id,
    summary: "Sözleşme notu eklendi",
    afterData: item,
  });
  await triggerAutomation("Sözleşme Kaydı", { summary: note, contract: item });
  res.status(201).json(item);
});

app.put("/api/contracts/:id", authMiddleware, async (req, res) => {
  const {
    note,
    type = null,
    status = null,
    counterparty = null,
    startDate = null,
    endDate = null,
    amount = null,
    currency = "TRY",
    fileName = null,
    fileData = null,
    fileUrl = null,
    fileMimeType = null,
  } = req.body || {};
  const before = await pool.query("SELECT * FROM contracts WHERE id=$1", [req.params.id]);
  const updated = await pool.query(
    `UPDATE contracts
     SET note=$1,contract_type=$2,status=$3,counterparty=$4,start_date=$5,end_date=$6,amount=$7,currency=$8,file_name=$9,file_data=$10,file_url=$11,file_mime_type=$12,updated_at=NOW()
     WHERE id=$13 RETURNING *`,
    [note, type, status, counterparty, startDate, endDate, amount, currency, fileName, fileData, fileUrl, fileMimeType, req.params.id],
  );
  if (updated.rowCount === 0) {
    return res.status(404).json({ message: "Kayıt bulunamadı." });
  }
  const item = mapContract(updated.rows[0]);
  await logActivity({
    userId: req.user.id,
    moduleName: "contracts",
    actionType: "update",
    recordId: item.id,
    summary: "Sözleşme notu güncellendi",
    beforeData: before.rows[0] || null,
    afterData: item,
  });
  res.json(item);
});

app.delete("/api/contracts/:id", authMiddleware, async (req, res) => {
  const row = await pool.query("SELECT id,note FROM contracts WHERE id=$1", [req.params.id]);
  await pool.query("DELETE FROM contracts WHERE id=$1", [req.params.id]);
  if (row.rowCount > 0) {
    await logActivity({
      userId: req.user.id,
      moduleName: "contracts",
      actionType: "delete",
      recordId: Number(req.params.id),
      summary: "Sözleşme notu silindi",
      beforeData: row.rows[0],
    });
  }
  res.status(204).send();
});

app.get("/api/tasks", authMiddleware, async (req, res) => {
  const result = await pool.query("SELECT id,note,status FROM tasks ORDER BY id DESC");
  res.json(result.rows.map(mapTask));
});

app.post("/api/tasks", authMiddleware, async (req, res) => {
  const { note, status = "Açık" } = req.body || {};
  const inserted = await pool.query(
    "INSERT INTO tasks(note,status) VALUES($1,$2) RETURNING id,note,status",
    [note, status],
  );
  const item = mapTask(inserted.rows[0]);
  await logActivity({
    userId: req.user.id,
    moduleName: "tasks",
    actionType: "create",
    recordId: item.id,
    summary: "Görev eklendi",
    afterData: item,
  });
  res.status(201).json(item);
});

app.put("/api/tasks/:id", authMiddleware, async (req, res) => {
  const { note, status } = req.body || {};
  const before = await pool.query("SELECT id,note,status FROM tasks WHERE id=$1", [req.params.id]);
  const updated = await pool.query(
    "UPDATE tasks SET note=$1,status=$2,updated_at=NOW() WHERE id=$3 RETURNING id,note,status",
    [note, status, req.params.id],
  );
  if (updated.rowCount === 0) {
    return res.status(404).json({ message: "Kayıt bulunamadı." });
  }
  const item = mapTask(updated.rows[0]);
  await logActivity({
    userId: req.user.id,
    moduleName: "tasks",
    actionType: "update",
    recordId: item.id,
    summary: "Görev güncellendi",
    beforeData: before.rows[0] || null,
    afterData: item,
  });
  res.json(item);
});

app.delete("/api/tasks/:id", authMiddleware, async (req, res) => {
  const row = await pool.query("SELECT id,note,status FROM tasks WHERE id=$1", [req.params.id]);
  await pool.query("DELETE FROM tasks WHERE id=$1", [req.params.id]);
  if (row.rowCount > 0) {
    await logActivity({
      userId: req.user.id,
      moduleName: "tasks",
      actionType: "delete",
      recordId: Number(req.params.id),
      summary: "Görev silindi",
      beforeData: row.rows[0],
    });
  }
  res.status(204).send();
});

app.post("/api/matching", authMiddleware, async (req, res) => {
  // Existing matching code...
});

app.post("/api/matching/suggest", authMiddleware, async (req, res) => {
  // Alias for matching
  const { investorName, budget, city, sector, sqm } = req.body || {};
  const brandsResult = await pool.query("SELECT * FROM brands WHERE active = true");
  const brandList = brandsResult.rows.map(mapBrand);
  const results = brandList
    .map((brand) => {
      const score =
        scoreBudget(Number(budget), brand) +
        scoreCity(city, brand) +
        scoreSector(sector, brand) +
        scoreSqm(Number(sqm), brand);
      return { brand, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  if (investorName) {
    await pool.query(
      `INSERT INTO investors(name,budget,city,sector,investment_type,pipeline_stage,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [investorName, budget, city, sector, "Franchise", "Yeni Lead", req.user.id],
    );
  }
  res.json(results);
});

  const { investorName, budget, city, sector, sqm } = req.body || {};
  const brandsResult = await pool.query("SELECT * FROM brands WHERE active = true");
  const brandList = brandsResult.rows.map(mapBrand);
  const results = brandList
    .map((brand) => {
      const score =
        scoreBudget(Number(budget), brand) +
        scoreCity(city, brand) +
        scoreSector(sector, brand) +
        scoreSqm(Number(sqm), brand);
      return { brand, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  if (investorName) {
    await pool.query(
      `INSERT INTO investors(name,budget,city,sector,investment_type,pipeline_stage,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [investorName, budget, city, sector, "Franchise", "Yeni Lead", req.user.id],
    );
    await triggerAutomation("Eşleştirme Lead", {
      summary: `${investorName} için otomatik eşleşme çalıştırıldı`,
      investorName,
      city,
      sector,
    });
  }

  res.json(results);
});

app.get("/api/export/:module", authMiddleware, async (req, res) => {
  const moduleName = req.params.module;
  const config = {
    investors: {
      sql: "SELECT id,name,budget,city,sector,investment_type AS type,pipeline_stage AS pipeline,created_at FROM investors ORDER BY id DESC",
      file: "yatirimcilar.xlsx",
      sheet: "Yatirimcilar",
    },
    brands: {
      sql: "SELECT id,name,sector,min_budget,max_budget,min_sqm,max_sqm,target_locations,active,monthly_growth,created_at FROM brands ORDER BY id DESC",
      file: "markalar.xlsx",
      sheet: "Markalar",
    },
    locations: {
      sql: "SELECT id,name,location_type,sqm,rent,potential,recommended_brands,created_at FROM locations ORDER BY id DESC",
      file: "lokasyonlar.xlsx",
      sheet: "Lokasyonlar",
    },
    projects: {
      sql: "SELECT id,name,project_type,owner_team,stage,due_date,created_at FROM projects ORDER BY id DESC",
      file: "projeler.xlsx",
      sheet: "Projeler",
    },
    contracts: {
      sql: "SELECT id,note,created_at FROM contracts ORDER BY id DESC",
      file: "sozlesmeler.xlsx",
      sheet: "Sozlesmeler",
    },
    tasks: {
      sql: "SELECT id,note,status,created_at FROM tasks ORDER BY id DESC",
      file: "gorevler.xlsx",
      sheet: "Gorevler",
    },
    pnl: {
      sql: "SELECT id,month_name,year_value,revenue,expense,profit,note,source_file,created_at FROM pnl_reports ORDER BY id DESC",
      file: "kar-zarar.xlsx",
      sheet: "KarZarar",
    },
    all: null,
  };

  if (moduleName === "all") {
    const workbook = xlsx.utils.book_new();
    for (const [key, value] of Object.entries(config)) {
      if (!value || key === "all") {
        continue;
      }
      const rows = await pool.query(value.sql);
      const sheet = xlsx.utils.json_to_sheet(rows.rows);
      xlsx.utils.book_append_sheet(workbook, sheet, value.sheet);
    }
    const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Disposition", "attachment; filename=mikurumsal-crm-all.xlsx");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    return res.send(buffer);
  }

  const exportConfig = config[moduleName];
  if (!exportConfig) {
    return res.status(404).json({ message: "Geçersiz export modülü." });
  }

  const rows = await pool.query(exportConfig.sql);
  const worksheet = xlsx.utils.json_to_sheet(rows.rows);
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, exportConfig.sheet);
  const fileBuffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });

  res.setHeader("Content-Disposition", `attachment; filename=${exportConfig.file}`);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  return res.send(fileBuffer);
});

app.get("/api/export-pdf/:module", authMiddleware, async (req, res) => {
  const moduleName = req.params.module;
  const config = {
    investors: "SELECT id,name,budget,city,sector,investment_type AS type,pipeline_stage AS pipeline,created_at FROM investors ORDER BY id DESC",
    brands: "SELECT id,name,sector,min_budget,max_budget,target_locations,agreement_status,created_at FROM brands ORDER BY id DESC",
    locations: "SELECT id,name,location_type,sqm,rent,potential,created_at FROM locations ORDER BY id DESC",
    projects: "SELECT id,name,project_type,owner_team,stage,due_date,created_at FROM projects ORDER BY id DESC",
    contracts: "SELECT id,note,contract_type,status,counterparty,amount,currency,created_at FROM contracts ORDER BY id DESC",
    tasks: "SELECT id,note,status,created_at FROM tasks ORDER BY id DESC",
    pnl: "SELECT id,month_name,year_value,revenue,expense,profit,note,created_at FROM pnl_reports ORDER BY id DESC",
  };
  const sql = config[moduleName];
  if (!sql) {
    return res.status(404).json({ message: "Geçersiz PDF export modülü." });
  }
  const rows = (await pool.query(sql)).rows;
  const doc = new PDFDocument({ margin: 36, size: "A4" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename=mi-crm-${moduleName}.pdf`);
  doc.pipe(res);
  doc.fontSize(14).text(`Mi Core CRM - ${moduleName.toUpperCase()} Raporu`, { underline: true });
  doc.moveDown(0.6);
  if (!rows.length) {
    doc.fontSize(11).text("Bu modül için kayıt bulunamadı.");
  } else {
    for (const row of rows) {
      const line = Object.entries(row)
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v ?? "-")}`)
        .join(" | ");
      doc.fontSize(9).text(line, { width: 520 });
      doc.moveDown(0.25);
    }
  }
  doc.end();
});

app.get("/api/activity", authMiddleware, async (req, res) => {
  const limit = Math.min(200, Number(req.query.limit || 50));
  const rows = await pool.query(
    `SELECT a.id, a.module_name, a.action_type, a.record_id, a.summary, a.created_at, u.name AS user_name
     FROM activity_logs a
     LEFT JOIN users u ON u.id = a.user_id
     ORDER BY a.created_at DESC
     LIMIT $1`,
    [limit],
  );
  res.json(rows.rows);
});

app.get("/api/recycle-bin", authMiddleware, async (req, res) => {
  res.json([]);
});

app.get("/api/pnl", authMiddleware, async (req, res) => {
  const rows = await pool.query("SELECT * FROM pnl_reports ORDER BY year_value DESC, id DESC");
  res.json(rows.rows);
});

app.get("/api/pnl/:id/details", authMiddleware, async (req, res) => {
  const rows = await pool.query(
    "SELECT * FROM pnl_detail_lines WHERE pnl_report_id=$1 ORDER BY id ASC",
    [req.params.id],
  );
  res.json(rows.rows);
});

app.post("/api/pnl", authMiddleware, async (req, res) => {
  const { monthName, yearValue, revenue, expense, profit, note = null, sourceFile = null } = req.body || {};
  const inserted = await pool.query(
    `INSERT INTO pnl_reports(month_name,year_value,revenue,expense,profit,note,source_file,created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [monthName, Number(yearValue), Number(revenue || 0), Number(expense || 0), Number(profit || 0), note, sourceFile, req.user.id],
  );
  res.status(201).json(inserted.rows[0]);
});

app.put("/api/pnl/:id", authMiddleware, async (req, res) => {
  const { monthName, yearValue, revenue, expense, profit, note = null } = req.body || {};
  const updated = await pool.query(
    `UPDATE pnl_reports
     SET month_name=$1,year_value=$2,revenue=$3,expense=$4,profit=$5,note=$6,updated_at=NOW()
     WHERE id=$7 RETURNING *`,
    [monthName, Number(yearValue), Number(revenue || 0), Number(expense || 0), Number(profit || 0), note, req.params.id],
  );
  if (updated.rowCount === 0) {
    return res.status(404).json({ message: "Kayıt bulunamadı." });
  }
  res.json(updated.rows[0]);
});

app.delete("/api/pnl/:id", authMiddleware, async (req, res) => {
  await pool.query("DELETE FROM pnl_reports WHERE id=$1", [req.params.id]);
  res.status(204).send();
});

app.post("/api/pnl/import", authMiddleware, upload.single("excelFile"), async (req, res) => {
  const fallbackPath = "c:/Users/Xezal/Desktop/Kar Zarar Raporu mi kurumsal.xlsx";
  const filePath = req.file ? req.file.path : fallbackPath;
  const workbook = xlsx.readFile(filePath);
  const targetSheets = ["AĞUSTOS", "EYLÜL", "EKİM", "KASIM", "ARALIK"];
  const imported = [];

  for (const month of targetSheets) {
    const sheetName = workbook.SheetNames.find((n) => normalizeMonthName(n) === normalizeMonthName(month));
    if (!sheetName) continue;
    const row = extractMonthlyPnL(workbook.Sheets[sheetName], month);
    const upsert = await pool.query(
      `INSERT INTO pnl_reports(month_name,year_value,revenue,expense,profit,note,source_file,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [month, 2023, row.revenue, row.expense, row.profit, "Excel içe aktarım", req.file?.originalname || "Yerel dosya", req.user.id],
    );
    const insertedReport = upsert.rows[0];
    const detailLines = extractPnLDetailLines(workbook.Sheets[sheetName]);
    for (const d of detailLines) {
      await pool.query(
        `INSERT INTO pnl_detail_lines(pnl_report_id,category,item_name,amount,ratio,source_file)
         VALUES($1,$2,$3,$4,$5,$6)`,
        [insertedReport.id, d.category, d.itemName, d.amount, d.ratio, req.file?.originalname || "Yerel dosya"],
      );
    }
    imported.push({ ...insertedReport, detailCount: detailLines.length });
  }

  if (req.file) {
    await pool.query(
      `INSERT INTO uploaded_files(module_name,original_name,stored_name,file_url,mime_type,size_bytes,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7)`,
      ["pnl", req.file.originalname, req.file.filename, `/uploads/${req.file.filename}`, req.file.mimetype, req.file.size, req.user.id],
    );
  }

  res.json({ importedCount: imported.length, imported });
});

app.get("/api/reports/summary", authMiddleware, async (req, res) => {
  // Existing code...
});

app.get("/api/dashboard/stats", authMiddleware, async (req, res) => {
  const { from, to } = req.query;
  const fromClause = from ? new Date(from) : new Date("1970-01-01");
  const toClause = to ? new Date(to) : new Date();
  const params = [fromClause, toClause];

  const leadCount = await pool.query(
    `SELECT COUNT(*)::int AS value FROM investors
     WHERE deleted_at IS NULL AND created_at BETWEEN $1 AND $2`,
    params,
  );
  const winCount = await pool.query(
    `SELECT COUNT(*)::int AS value FROM investors
     WHERE deleted_at IS NULL AND pipeline_stage ILIKE '%Kapandı%' AND created_at BETWEEN $1 AND $2`,
    params,
  );
  const projectCount = await pool.query(
    `SELECT COUNT(*)::int AS value FROM projects
     WHERE deleted_at IS NULL AND created_at BETWEEN $1 AND $2`,
    params,
  );
  const financeCount = await pool.query(
    `SELECT COUNT(*)::int AS value FROM contracts
     WHERE deleted_at IS NULL AND created_at BETWEEN $1 AND $2`,
    params,
  );
  const taskCount = await pool.query(
    `SELECT COUNT(*)::int AS value FROM tasks
     WHERE status != 'Tamamlandı'`,
  );

  res.json({
    activeInvestors: leadCount.rows[0].value,
    activeProjects: projectCount.rows[0].value,
    openTasks: taskCount.rows[0].value,
    strongMatches: 12, // Bu hesaplama logic'ine göre dinamikleşebilir, şimdilik placeholder
    conversionRate: leadCount.rows[0].value
      ? Math.round((winCount.rows[0].value / leadCount.rows[0].value) * 100)
      : 0,
  });
});

  const { from, to } = req.query;
  const fromClause = from ? new Date(from) : new Date("1970-01-01");
  const toClause = to ? new Date(to) : new Date();
  const params = [fromClause, toClause];

  const leadCount = await pool.query(
    `SELECT COUNT(*)::int AS value FROM investors
     WHERE deleted_at IS NULL AND created_at BETWEEN $1 AND $2`,
    params,
  );
  const winCount = await pool.query(
    `SELECT COUNT(*)::int AS value FROM investors
     WHERE deleted_at IS NULL AND pipeline_stage ILIKE '%Kapandı%' AND created_at BETWEEN $1 AND $2`,
    params,
  );
  const projectCount = await pool.query(
    `SELECT COUNT(*)::int AS value FROM projects
     WHERE deleted_at IS NULL AND created_at BETWEEN $1 AND $2`,
    params,
  );
  const financeCount = await pool.query(
    `SELECT COUNT(*)::int AS value FROM contracts
     WHERE deleted_at IS NULL AND created_at BETWEEN $1 AND $2`,
    params,
  );
  const topSector = await pool.query(
    `SELECT sector, COUNT(*)::int AS count FROM investors
     WHERE deleted_at IS NULL AND created_at BETWEEN $1 AND $2
     GROUP BY sector ORDER BY count DESC LIMIT 1`,
    params,
  );
  const teamPerf = await pool.query(
    `SELECT owner_team, COUNT(*)::int AS count FROM projects
     WHERE deleted_at IS NULL AND created_at BETWEEN $1 AND $2
     GROUP BY owner_team ORDER BY count DESC LIMIT 1`,
    params,
  );

  res.json({
    period: { from: fromClause, to: toClause },
    leads: leadCount.rows[0].value,
    wins: winCount.rows[0].value,
    conversionRate: leadCount.rows[0].value
      ? Math.round((winCount.rows[0].value / leadCount.rows[0].value) * 100)
      : 0,
    activeProjects: projectCount.rows[0].value,
    financeRecords: financeCount.rows[0].value,
    topSector: topSector.rowCount ? topSector.rows[0].sector : "-",
    topTeam: teamPerf.rowCount ? teamPerf.rows[0].owner_team : "-",
  });
});

app.get("/api/templates", authMiddleware, async (req, res) => {
  const rows = await pool.query("SELECT * FROM message_templates ORDER BY id DESC");
  res.json(rows.rows);
});

app.post("/api/templates", authMiddleware, async (req, res) => {
  const { channel, eventName, title, body, active } = req.body || {};
  const inserted = await pool.query(
    `INSERT INTO message_templates(channel,event_name,title,body,active)
     VALUES($1,$2,$3,$4,$5) RETURNING *`,
    [channel, eventName, title, body, active],
  );
  await logActivity({
    userId: req.user.id,
    moduleName: "templates",
    actionType: "create",
    recordId: inserted.rows[0].id,
    summary: `${channel} şablonu eklendi`,
    afterData: inserted.rows[0],
  });
  res.status(201).json(inserted.rows[0]);
});

app.put("/api/templates/:id", authMiddleware, async (req, res) => {
  const { channel, eventName, title, body, active } = req.body || {};
  const before = await pool.query("SELECT * FROM message_templates WHERE id=$1", [req.params.id]);
  const updated = await pool.query(
    `UPDATE message_templates
     SET channel=$1,event_name=$2,title=$3,body=$4,active=$5,updated_at=NOW()
     WHERE id=$6 RETURNING *`,
    [channel, eventName, title, body, active, req.params.id],
  );
  if (updated.rowCount === 0) {
    return res.status(404).json({ message: "Şablon bulunamadı." });
  }
  await logActivity({
    userId: req.user.id,
    moduleName: "templates",
    actionType: "update",
    recordId: Number(req.params.id),
    summary: "Şablon güncellendi",
    beforeData: before.rows[0] || null,
    afterData: updated.rows[0],
  });
  res.json(updated.rows[0]);
});

app.delete("/api/templates/:id", authMiddleware, async (req, res) => {
  const before = await pool.query("SELECT * FROM message_templates WHERE id=$1", [req.params.id]);
  await pool.query("DELETE FROM message_templates WHERE id=$1", [req.params.id]);
  if (before.rowCount > 0) {
    await logActivity({
      userId: req.user.id,
      moduleName: "templates",
      actionType: "delete",
      recordId: Number(req.params.id),
      summary: "Şablon silindi",
      beforeData: before.rows[0],
    });
  }
  res.status(204).send();
});

app.post("/api/templates/:id/test", authMiddleware, async (req, res) => {
  const row = await pool.query("SELECT * FROM message_templates WHERE id=$1", [req.params.id]);
  if (row.rowCount === 0) {
    return res.status(404).json({ message: "Şablon bulunamadı." });
  }
  const template = row.rows[0];
  const payload = { summary: "Bu bir test mesajıdır", user: req.user.name };
  const title = fillTemplate(template.title, payload);
  const body = fillTemplate(template.body, payload);

  if (template.channel === "mail") {
    await sendMailNotification(title, body);
  } else if (template.channel === "whatsapp") {
    await sendWhatsAppNotification(body);
  }
  res.json({ success: true });
});

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    return res.json({ status: "ok", db: "connected" });
  } catch (error) {
    return res.status(503).json({ status: "error", db: "disconnected", message: error.message });
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: "Sunucu hatası oluştu.", detail: err.message });
});

async function start() {
  try {
    console.log("Veritabanı başlatılıyor...");
    await initDb();
    await seedDefaultDataIfNeeded();
    console.log("Veritabanı hazır.");
  } catch (error) {
    console.error("Veritabanı başlatılırken hata oluştu:", error);
  }

  if (process.env.NODE_ENV !== "production" || !process.env.VERCEL) {
    app.listen(port, () => {
      console.log(`Mi Kurumsal CRM API çalışıyor: http://localhost:${port}`);
    });
  } else {
    console.log("Vercel ortamı algılandı, serverless mod aktif.");
  }
}

// Uygulamayı başlat
start();

// Vercel için app nesnesini dışa aktar
module.exports = app;
