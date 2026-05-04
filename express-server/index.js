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

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ message: "Bu işlem sadece yöneticiye açıktır." });
  }
  return next();
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

async function sendMailToRecipient(to, subject, text) {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.NOTIFY_EMAIL_FROM || user;
  if (!host || !user || !pass || !to) {
    throw new Error("SMTP veya alıcı bilgisi eksik.");
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
  const bmin = row.budget_min != null ? Number(row.budget_min) : null;
  const bmax = row.budget_max != null ? Number(row.budget_max) : null;
  return {
    id: row.id,
    name: row.name,
    budget: Number(row.budget),
    budgetMin: bmin != null && !Number.isNaN(bmin) ? bmin : Number(row.budget),
    budgetMax: bmax != null && !Number.isNaN(bmax) ? bmax : Number(row.budget),
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
    followUpDate: row.follow_up_date ? String(row.follow_up_date).split("T")[0] : "",
    documents: row.documents || [],
    investorType: row.investor_type || "Bireysel",
    contactPerson: row.contact_person || "",
    whatsappPhone: row.whatsapp_phone || "",
    targetCities: row.target_cities || "",
    targetLocationType: row.target_location_type || "",
    subSector: row.sub_sector || "",
    investmentTiming: row.investment_timing || "",
    financingStatus: row.financing_status || "",
    priority: row.priority || "Orta",
    leadSource: row.lead_source || "",
    assignedMemberId: row.assigned_member_id || null,
    lastMeetingDate: row.last_meeting_date ? String(row.last_meeting_date).split("T")[0] : "",
    nextAction: row.next_action || "",
    notes: row.notes || "",
    lastActivityAt: row.last_activity_at || row.created_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
    subSector: row.sub_sector || "",
    whatsappPhone: row.whatsapp_phone || "",
    email: row.email || "",
    website: row.website || "",
    brandType: row.brand_type || "",
    targetRegions: row.target_regions || "",
    locationType: row.location_type || "",
    storefrontNeed: row.storefront_need || "",
    chimneyNeed: row.chimney_need || "",
    techInfrastructure: row.tech_infrastructure || "",
    staffNeed: row.staff_need || "",
    adContributionPct: row.ad_contribution_pct != null ? Number(row.ad_contribution_pct) : null,
    avgMonthlyRevenue: row.avg_monthly_revenue != null ? Number(row.avg_monthly_revenue) : null,
    profitMarginPct: row.profit_margin_pct != null ? Number(row.profit_margin_pct) : null,
    paybackMonths: row.payback_months != null ? Number(row.payback_months) : null,
    presentationUrl: row.presentation_url || "",
    logoUrl: row.logo_url || "",
    contractDraftUrl: row.contract_draft_url || "",
    documents: row.documents || [],
    givesFranchise: row.gives_franchise !== false,
    hasRoyalty: row.has_royalty !== false,
    scoreOperation: row.score_operation != null ? Number(row.score_operation) : null,
    scoreFranchiseFit: row.score_franchise_fit != null ? Number(row.score_franchise_fit) : null,
    scoreLocationFlex: row.score_location_flex != null ? Number(row.score_location_flex) : null,
    scoreInvestorInterest: row.score_investor_interest != null ? Number(row.score_investor_interest) : null,
    scoreProfitability: row.score_profitability != null ? Number(row.score_profitability) : null,
    scoreGrowth: row.score_growth != null ? Number(row.score_growth) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    matchingEligible: row.active === true && String(row.agreement_status || "") === "Anlaşmalı",
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
    investorId: row.investor_id || null,
    brandId: row.brand_id || null,
  };
}

function mapTask(row) {
  return {
    id: row.id,
    note: row.note,
    status: row.status,
    assigneeId: row.assignee_id || null,
    assigneeName: row.assignee_name || "",
    priority: row.priority || "Orta",
    dueDate: row.due_date || null,
    investorId: row.investor_id || null,
    brandId: row.brand_id || null,
  };
}

function mapTeamMember(row) {
  return {
    id: row.id,
    userId: row.user_id || null,
    name: row.name,
    email: row.email || "",
    phone: row.phone || "",
    department: row.department || "",
    roleName: row.role_name || "Temsilci",
    permissions: row.permissions || [],
    active: row.active,
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
    investorId: row.investor_id || null,
    brandId: row.brand_id || null,
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
  await pool.query("ALTER TABLE brands ADD COLUMN IF NOT EXISTS sub_sector TEXT");
  await pool.query("ALTER TABLE brands ADD COLUMN IF NOT EXISTS whatsapp_phone TEXT");
  await pool.query("ALTER TABLE brands ADD COLUMN IF NOT EXISTS email TEXT");
  await pool.query("ALTER TABLE brands ADD COLUMN IF NOT EXISTS website TEXT");
  await pool.query("ALTER TABLE brands ADD COLUMN IF NOT EXISTS brand_type TEXT");
  await pool.query("ALTER TABLE brands ADD COLUMN IF NOT EXISTS target_regions TEXT");
  await pool.query("ALTER TABLE brands ADD COLUMN IF NOT EXISTS location_type TEXT");
  await pool.query("ALTER TABLE brands ADD COLUMN IF NOT EXISTS storefront_need TEXT");
  await pool.query("ALTER TABLE brands ADD COLUMN IF NOT EXISTS chimney_need TEXT");
  await pool.query("ALTER TABLE brands ADD COLUMN IF NOT EXISTS tech_infrastructure TEXT");
  await pool.query("ALTER TABLE brands ADD COLUMN IF NOT EXISTS staff_need TEXT");
  await pool.query("ALTER TABLE brands ADD COLUMN IF NOT EXISTS ad_contribution_pct NUMERIC(6,2)");
  await pool.query("ALTER TABLE brands ADD COLUMN IF NOT EXISTS avg_monthly_revenue BIGINT");
  await pool.query("ALTER TABLE brands ADD COLUMN IF NOT EXISTS profit_margin_pct NUMERIC(6,2)");
  await pool.query("ALTER TABLE brands ADD COLUMN IF NOT EXISTS payback_months INTEGER");
  await pool.query("ALTER TABLE brands ADD COLUMN IF NOT EXISTS presentation_url TEXT");
  await pool.query("ALTER TABLE brands ADD COLUMN IF NOT EXISTS logo_url TEXT");
  await pool.query("ALTER TABLE brands ADD COLUMN IF NOT EXISTS contract_draft_url TEXT");
  await pool.query("ALTER TABLE brands ADD COLUMN IF NOT EXISTS documents TEXT[] NOT NULL DEFAULT '{}'");
  await pool.query("ALTER TABLE brands ADD COLUMN IF NOT EXISTS gives_franchise BOOLEAN NOT NULL DEFAULT TRUE");
  await pool.query("ALTER TABLE brands ADD COLUMN IF NOT EXISTS has_royalty BOOLEAN NOT NULL DEFAULT TRUE");
  await pool.query("ALTER TABLE brands ADD COLUMN IF NOT EXISTS score_operation INTEGER");
  await pool.query("ALTER TABLE brands ADD COLUMN IF NOT EXISTS score_franchise_fit INTEGER");
  await pool.query("ALTER TABLE brands ADD COLUMN IF NOT EXISTS score_location_flex INTEGER");
  await pool.query("ALTER TABLE brands ADD COLUMN IF NOT EXISTS score_investor_interest INTEGER");
  await pool.query("ALTER TABLE brands ADD COLUMN IF NOT EXISTS score_profitability INTEGER");
  await pool.query("ALTER TABLE brands ADD COLUMN IF NOT EXISTS score_growth INTEGER");
  await pool.query("ALTER TABLE projects ADD COLUMN IF NOT EXISTS brand_id INTEGER REFERENCES brands(id) ON DELETE SET NULL");
  await pool.query("ALTER TABLE contracts ADD COLUMN IF NOT EXISTS brand_id INTEGER REFERENCES brands(id) ON DELETE SET NULL");
  await pool.query("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS brand_id INTEGER REFERENCES brands(id) ON DELETE SET NULL");
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
  await pool.query("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignee_id INTEGER");
  await pool.query("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignee_name TEXT");
  await pool.query("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'Orta'");
  await pool.query("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_date DATE");
  await pool.query("ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS image_url TEXT");
  await pool.query("ALTER TABLE team_members ADD COLUMN IF NOT EXISTS user_id INTEGER");
  await pool.query("CREATE TABLE IF NOT EXISTS team_members (id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT, phone TEXT, department TEXT, role_name TEXT NOT NULL DEFAULT 'Temsilci', permissions TEXT[] NOT NULL DEFAULT '{}', active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW())");
  await pool.query("CREATE TABLE IF NOT EXISTS app_settings (id SERIAL PRIMARY KEY, setting_key TEXT UNIQUE NOT NULL, setting_value JSONB NOT NULL DEFAULT '{}'::jsonb, updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL, updated_at TIMESTAMP NOT NULL DEFAULT NOW())");

  await pool.query("ALTER TABLE investors ADD COLUMN IF NOT EXISTS investor_type TEXT NOT NULL DEFAULT 'Bireysel'");
  await pool.query("ALTER TABLE investors ADD COLUMN IF NOT EXISTS contact_person TEXT");
  await pool.query("ALTER TABLE investors ADD COLUMN IF NOT EXISTS whatsapp_phone TEXT");
  await pool.query("ALTER TABLE investors ADD COLUMN IF NOT EXISTS target_cities TEXT");
  await pool.query("ALTER TABLE investors ADD COLUMN IF NOT EXISTS target_location_type TEXT");
  await pool.query("ALTER TABLE investors ADD COLUMN IF NOT EXISTS sub_sector TEXT");
  await pool.query("ALTER TABLE investors ADD COLUMN IF NOT EXISTS budget_min BIGINT");
  await pool.query("ALTER TABLE investors ADD COLUMN IF NOT EXISTS budget_max BIGINT");
  await pool.query("ALTER TABLE investors ADD COLUMN IF NOT EXISTS investment_timing TEXT");
  await pool.query("ALTER TABLE investors ADD COLUMN IF NOT EXISTS financing_status TEXT");
  await pool.query("ALTER TABLE investors ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'Orta'");
  await pool.query("ALTER TABLE investors ADD COLUMN IF NOT EXISTS lead_source TEXT");
  await pool.query("ALTER TABLE investors ADD COLUMN IF NOT EXISTS assigned_member_id INTEGER");
  await pool.query("ALTER TABLE investors ADD COLUMN IF NOT EXISTS last_meeting_date DATE");
  await pool.query("ALTER TABLE investors ADD COLUMN IF NOT EXISTS next_action TEXT");
  await pool.query("ALTER TABLE investors ADD COLUMN IF NOT EXISTS notes TEXT");
  await pool.query("ALTER TABLE investors ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP NOT NULL DEFAULT NOW()");
  await pool.query("UPDATE investors SET budget_min = budget, budget_max = budget WHERE budget_min IS NULL AND budget_max IS NULL");

  await pool.query("ALTER TABLE projects ADD COLUMN IF NOT EXISTS investor_id INTEGER REFERENCES investors(id) ON DELETE SET NULL");
  await pool.query("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS investor_id INTEGER REFERENCES investors(id) ON DELETE SET NULL");
  await pool.query("ALTER TABLE contracts ADD COLUMN IF NOT EXISTS investor_id INTEGER REFERENCES investors(id) ON DELETE SET NULL");

  await pool.query(`CREATE TABLE IF NOT EXISTS investor_meetings (
    id SERIAL PRIMARY KEY,
    investor_id INTEGER NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
    meeting_type TEXT NOT NULL,
    meeting_date DATE NOT NULL,
    met_by TEXT,
    met_by_member_id INTEGER,
    notes TEXT,
    next_action TEXT,
    reminder_date DATE,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS investor_brand_matches (
    id SERIAL PRIMARY KEY,
    investor_id INTEGER NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
    brand_id INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    score NUMERIC(10,2),
    notes TEXT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(investor_id, brand_id)
  )`);
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

  const teamCount = await pool.query("SELECT COUNT(*)::int AS count FROM team_members");
  if (teamCount.rows[0].count === 0) {
    await pool.query(
      `INSERT INTO team_members(name,email,phone,department,role_name,permissions,active)
       VALUES
       ('Selin Demir','selin@micore.com','+90 544 222 33 44','Franchise','Yönetici',ARRAY['investors','brands','locations','projects','contracts','tasks','reports'],true),
       ('Mert Kaya','mert@micore.com','+90 541 310 22 11','Operasyon','Uzman',ARRAY['tasks','projects','locations'],true),
       ('Ayşe Çetin','ayse@micore.com','+90 533 118 88 70','Satış','Temsilci',ARRAY['investors','tasks','reports'],true)`
    );
  }

  const investorCount = await pool.query("SELECT COUNT(*)::int AS count FROM investors");
  if (investorCount.rows[0].count === 0) {
    await pool.query(
      `INSERT INTO investors(name,budget,currency,city,sector,investment_type,pipeline_stage,phone,email,district,goal,contact_history,meeting_notes,follow_up_date,created_by)
       VALUES
       ('Selin Demir',2600000,'TRY','İstanbul','Coffee','Franchise','Marka Önerildi','+90 544 222 33 44','selin.demo@crm.com','Kadıköy','2 şube coffee yatırımı','24.04 arandı','AVM + cadde alternatifleri istiyor','2026-05-18',$1),
       ('Yaman Grup',4100000,'TRY','Ankara','Fast Casual','Ortaklık','Teklif Verildi','+90 530 444 55 66','yaman@demo.com','Çankaya','Bölgesel büyüme','26.04 toplantı','Sözleşme taslağı paylaşıldı','2026-05-20',$1)`,
      [existingUser.rows[0].id],
    );
  }

  const locationCount = await pool.query("SELECT COUNT(*)::int AS count FROM locations");
  if (locationCount.rows[0].count === 0) {
    await pool.query(
      `INSERT INTO locations(name,location_type,sqm,rent,currency,potential,recommended_brands,address,traffic,owner,owner_phone,notes)
       VALUES
       ('Bağdat Caddesi Premium','Cadde',130,380000,'TRY','Yüksek',ARRAY['Blak Coffee Co','Tavada Tavuk'],'Caddebostan / İstanbul','Yoğun','Yıldız Gayrimenkul','+90 555 330 11 22','Yüksek yaya trafiği'),
       ('Panora AVM - A Blok','AVM',95,240000,'TRY','Orta',ARRAY['The Coffee Factory'],'Oran / Ankara','Orta','Panora Yönetim','+90 312 455 00 11','Food court yakını')`
    );
  }

  const projectCount = await pool.query("SELECT COUNT(*)::int AS count FROM projects");
  if (projectCount.rows[0].count === 0) {
    await pool.query(
      `INSERT INTO projects(name,project_type,owner_team,assignees,priority,progress,stage,due_date,description,checklist)
       VALUES
       ('Blak Coffee Co - İstanbul Büyüme','Franchise','Franchise Ekibi',ARRAY['Selin Demir','Mert Kaya'],'Yüksek',45,'Sunum & Müzakere','2026-05-30','İstanbul için 2 yeni noktada genişleme',ARRAY['Lokasyon shortlist','Sunum dosyası','Kira pazarlığı'])`
    );
  }

  const taskCount = await pool.query("SELECT COUNT(*)::int AS count FROM tasks");
  if (taskCount.rows[0].count === 0) {
    await pool.query(
      `INSERT INTO tasks(note,status,assignee_id,assignee_name,priority,due_date)
       VALUES
       ('Personel ilanını yayınla','Açık',1,'Selin Demir','Yüksek','2026-05-16'),
       ('Ekipman siparişlerini ver','Devam Ediyor',2,'Mert Kaya','Orta','2026-05-17'),
       ('Kira sözleşmesini imzalat','Açık',1,'Selin Demir','Yüksek','2026-05-19')`
    );
  }

  const templateCount = await pool.query("SELECT COUNT(*)::int AS count FROM message_templates");
  if (templateCount.rows[0].count === 0) {
    await pool.query(
      `INSERT INTO message_templates(channel,event_name,title,body,active,image_url)
       VALUES
       ('whatsapp','Yeni Lead','Merhaba Hoşgeldiniz','Sayın {{name}}, başvurunuz alınmıştır. En kısa sürede dönüş sağlayacağız.',true,null),
       ('mail','Sözleşme Süreci','Sözleşme Süreci Hakkında','Merhaba {{name}}, sözleşmeniz onay beklemektedir.',true,null),
       ('sms','Toplantı Hatırlatma','Toplantı Hatırlatma','{{name}}, yarın 14:00 toplantımız bulunmaktadır.',true,null)`
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

// 12. Database Health Check API
app.get("/api/admin/db-status", async (req, res) => {
  try {
    const pg = pool;
    const tables = ['users', 'investors', 'brands', 'locations', 'projects', 'contracts', 'tasks', 'pnl', 'message_templates', 'activity_logs'];
    const status = {};

    for (const table of tables) {
      const columnsRes = await pg.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = $1
      `, [table]);
      status[table] = columnsRes.rows.map(r => r.column_name);
    }

    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 13. Database Auto-Fix API (Güçlendirilmiş)
app.post("/api/admin/db-fix", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const pg = pool;
    console.log("Database repair started...");

    // Önce tabloların var olduğundan emin olalım (schema.sql'den temel yapılar)
    const createTables = [
      "CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, name TEXT, email TEXT UNIQUE, password TEXT, role TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)",
      "CREATE TABLE IF NOT EXISTS investors (id SERIAL PRIMARY KEY, name TEXT, budget BIGINT, city TEXT, sector TEXT, investment_type TEXT, pipeline_stage TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)",
      "CREATE TABLE IF NOT EXISTS brands (id SERIAL PRIMARY KEY, name TEXT, sector TEXT, min_budget BIGINT, max_budget BIGINT, min_sqm INTEGER, max_sqm INTEGER, target_locations TEXT, active BOOLEAN, monthly_growth INTEGER, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)",
      "CREATE TABLE IF NOT EXISTS locations (id SERIAL PRIMARY KEY, name TEXT, location_type TEXT, sqm INTEGER, rent BIGINT, potential TEXT, recommended_brands TEXT[], created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)",
      "CREATE TABLE IF NOT EXISTS projects (id SERIAL PRIMARY KEY, name TEXT, type TEXT, owner_team TEXT, priority TEXT, progress INTEGER, stage TEXT, due_date DATE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)",
      "CREATE TABLE IF NOT EXISTS contracts (id SERIAL PRIMARY KEY, note TEXT, contract_type TEXT, status TEXT, counterparty TEXT, start_date DATE, end_date DATE, amount BIGINT, currency TEXT, file_url TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)",
      "CREATE TABLE IF NOT EXISTS tasks (id SERIAL PRIMARY KEY, note TEXT, status TEXT, assignee_name TEXT, assignee_id INTEGER, priority TEXT, due_date DATE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)",
      "CREATE TABLE IF NOT EXISTS team_members (id SERIAL PRIMARY KEY, name TEXT, email TEXT, phone TEXT, department TEXT, role_name TEXT, permissions TEXT[], active BOOLEAN, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)",
      "CREATE TABLE IF NOT EXISTS app_settings (id SERIAL PRIMARY KEY, setting_key TEXT UNIQUE, setting_value JSONB, updated_by INTEGER, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)",
      "CREATE TABLE IF NOT EXISTS pnl (id SERIAL PRIMARY KEY, month_name TEXT, year_value INTEGER, revenue BIGINT, expense BIGINT, profit BIGINT, note TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)",
      "CREATE TABLE IF NOT EXISTS message_templates (id SERIAL PRIMARY KEY, channel TEXT, event_name TEXT, title TEXT, body TEXT, active BOOLEAN, image_url TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)",
      "CREATE TABLE IF NOT EXISTS activity_logs (id SERIAL PRIMARY KEY, user_id INTEGER, user_name TEXT, module_name TEXT, action_type TEXT, summary TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)"
    ];

    for (const sql of createTables) {
      await pg.query(sql);
    }

    // Şimdi eksik sütunları ekleyelim
    const alters = [
      "ALTER TABLE investors ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP",
      "ALTER TABLE investors ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'TRY'",
      "ALTER TABLE investors ADD COLUMN IF NOT EXISTS phone TEXT",
      "ALTER TABLE investors ADD COLUMN IF NOT EXISTS email TEXT",
      "ALTER TABLE investors ADD COLUMN IF NOT EXISTS district TEXT",
      "ALTER TABLE investors ADD COLUMN IF NOT EXISTS goal TEXT",
      "ALTER TABLE investors ADD COLUMN IF NOT EXISTS contact_history TEXT",
      "ALTER TABLE investors ADD COLUMN IF NOT EXISTS meeting_notes TEXT",
      "ALTER TABLE investors ADD COLUMN IF NOT EXISTS follow_up_date DATE",
      "ALTER TABLE investors ADD COLUMN IF NOT EXISTS documents TEXT[] NOT NULL DEFAULT '{}'",
      "ALTER TABLE investors ADD COLUMN IF NOT EXISTS created_by INTEGER",
      
      "ALTER TABLE brands ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP",
      "ALTER TABLE brands ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'TRY'",
      
      "ALTER TABLE locations ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP",
      "ALTER TABLE locations ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'TRY'",
      
      "ALTER TABLE projects ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP",
      "ALTER TABLE projects ADD COLUMN IF NOT EXISTS assignees TEXT[] NOT NULL DEFAULT '{}'",
      "ALTER TABLE projects ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'Orta'",
      "ALTER TABLE projects ADD COLUMN IF NOT EXISTS progress INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE projects ADD COLUMN IF NOT EXISTS description TEXT",
      "ALTER TABLE projects ADD COLUMN IF NOT EXISTS checklist TEXT[] NOT NULL DEFAULT '{}'",
      
      "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP",
      "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS contract_type TEXT",
      "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS status TEXT",
      "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS counterparty TEXT",
      "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS start_date DATE",
      "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS end_date DATE",
      "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS amount BIGINT",
      "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'TRY'",

      "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP",
      
      "ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_type TEXT",
      "ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS user_name TEXT",
      "ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS image_url TEXT",
      "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS contract_type TEXT",
      "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS status TEXT",
      "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS counterparty TEXT",
      "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS start_date DATE",
      "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS end_date DATE",
      "ALTER TABLE contracts ADD COLUMN IF NOT EXISTS file_url TEXT",
      "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignee_name TEXT",
      "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignee_id INTEGER",
      "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority TEXT",
      "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_date DATE",
      "ALTER TABLE team_members ADD COLUMN IF NOT EXISTS user_id INTEGER",
      // New PnL tables
      `CREATE TABLE IF NOT EXISTS pnl_revenues (
        id SERIAL PRIMARY KEY,
        entry_date DATE NOT NULL,
        branch TEXT NOT NULL DEFAULT 'Genel',
        revenue_type TEXT NOT NULL DEFAULT 'Satış',
        description TEXT,
        amount NUMERIC(14,2) NOT NULL DEFAULT 0,
        source TEXT NOT NULL DEFAULT 'Manuel',
        month_name TEXT NOT NULL,
        year_value INTEGER NOT NULL,
        created_by INTEGER,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS pnl_expenses (
        id SERIAL PRIMARY KEY,
        entry_date DATE NOT NULL,
        branch TEXT NOT NULL DEFAULT 'Genel',
        category TEXT NOT NULL DEFAULT 'Diğer',
        sub_category TEXT,
        description TEXT,
        amount NUMERIC(14,2) NOT NULL DEFAULT 0,
        revenue_ratio NUMERIC(10,4),
        source TEXT NOT NULL DEFAULT 'Manuel',
        month_name TEXT NOT NULL,
        year_value INTEGER NOT NULL,
        created_by INTEGER,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS pnl_personnel (
        id SERIAL PRIMARY KEY,
        entry_date DATE NOT NULL,
        branch TEXT NOT NULL DEFAULT 'Genel',
        person_name TEXT NOT NULL,
        position TEXT,
        salary NUMERIC(14,2) NOT NULL DEFAULT 0,
        bonus NUMERIC(14,2) NOT NULL DEFAULT 0,
        deduction NUMERIC(14,2) NOT NULL DEFAULT 0,
        total_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
        source TEXT NOT NULL DEFAULT 'Manuel',
        month_name TEXT NOT NULL,
        year_value INTEGER NOT NULL,
        created_by INTEGER,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS pnl_field_mappings (
        id SERIAL PRIMARY KEY,
        source_header TEXT NOT NULL,
        mapped_category TEXT NOT NULL,
        mapped_type TEXT NOT NULL DEFAULT 'expense',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(source_header)
      )`
    ];

    for (const sql of alters) {
      await pg.query(sql).catch(e => console.log("Alter skip or error:", e.message));
    }

    res.json({ success: true, message: "Tablolar ve sütunlar başarıyla senkronize edildi." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/seed", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const pg = pool;
    console.log("Manual seeding started...");

    // 1. Get an admin user id
    const adminRes = await pg.query("SELECT id FROM users LIMIT 1");
    if (adminRes.rowCount === 0) {
      return res.status(400).json({ error: "Önce kayıt olmalısınız veya admin kullanıcısı oluşturulmalı." });
    }
    const adminId = adminRes.rows[0].id;

    // 2. Clear existing (Optional - let's just add new ones for safety)
    
    // 3. Seed Investors
    await pg.query(`
      INSERT INTO investors(name, budget, city, sector, investment_type, pipeline_stage, phone, email, created_by)
      VALUES 
      ('Mustafa Kemal', 7500000, 'İstanbul', 'Gıda', 'Franchise', 'Teklif Verildi', '+90 532 111 2233', 'mustafa@demo.com', $1),
      ('Ayşe Yılmaz', 3000000, 'Ankara', 'Perakende', 'Franchise', 'Yeni Lead', '+90 533 444 5566', 'ayse@demo.com', $1),
      ('Eren Holding', 25000000, 'İzmir', 'Teknoloji', 'Ortaklık', 'Sözleşme Süreci', '+90 212 777 8899', 'info@eren.com', $1),
      ('Selin Demir', 1500000, 'Bursa', 'Hizmet', 'Franchise', 'İletişim Kuruldu', '+90 544 222 3344', 'selin@demo.com', $1),
      ('Kaan Özkan', 10000000, 'Antalya', 'Turizm', 'Master Franchise', 'Analiz Yapıldı', '+90 505 111 0099', 'kaan@demo.com', $1)
    `, [adminId]);

    // 4. Seed Brands
    await pg.query(`
      INSERT INTO brands(name, sector, min_budget, max_budget, currency, min_sqm, max_sqm, target_locations, active, monthly_growth, agreement_status, location_type)
      VALUES 
      ('Burger Master', 'Gıda', 3000000, 6000000, 'TRY', 80, 200, 'İstanbul, Ankara', true, 12, 'Anlaşmalı', 'AVM'),
      ('Glow Beauty', 'Kozmetik', 1500000, 3000000, 'TRY', 40, 100, 'Ankara, İzmir', true, 8, 'Anlaşmalı', 'Cadde'),
      ('EduPlay', 'Eğitim', 5000000, 12000000, 'TRY', 300, 800, 'İstanbul', true, 15, 'Anlaşmalı', 'AVM'),
      ('AutoCheck', 'Otomotiv', 4000000, 8000000, 'TRY', 500, 1500, 'Bursa, Kocaeli', true, 5, 'Görüşülüyor', 'Sanayi'),
      ('Pizzasimo', 'Gıda', 2000000, 4500000, 'TRY', 60, 120, 'AVM, Cadde', true, 10, 'Beklemede', 'AVM')
    `);

    // 5. Seed Locations
    await pg.query(`
      INSERT INTO locations(name, location_type, sqm, rent, potential, recommended_brands)
      VALUES 
      ('İstinye Park AVM', 'AVM', 150, 18000, 'Çok Yüksek', ARRAY['Burger Master', 'Pizzasimo']),
      ('Kızılay Meydanı', 'Cadde', 80, 12000, 'Yüksek', ARRAY['Glow Beauty']),
      ('Terracity AVM', 'AVM', 450, 35000, 'Yüksek', ARRAY['EduPlay']),
      ('Nilüfer Sanayi', 'Sanayi', 1200, 45000, 'Orta', ARRAY['AutoCheck'])
    `);

    // 6. Seed Projects
    await pg.query(`
      INSERT INTO projects(name, project_type, owner_team, priority, progress, stage, due_date)
      VALUES 
      ('Burger Master AVM Projesi', 'Yeni Şube', 'Operasyon', 'Yüksek', 70, 'İnce İşler', NOW() + INTERVAL '15 days'),
      ('İzmir Bölge Bayiliği', 'Genişleme', 'İş Geliştirme', 'Orta', 30, 'Hukuk Onayı', NOW() + INTERVAL '45 days'),
      ('Glow Beauty Franchise', 'Yeni Şube', 'Satış', 'Orta', 90, 'Anahtar Teslim', NOW() + INTERVAL '5 days')
    `);

    // 7. Seed Tasks
    await pg.query(`
      INSERT INTO tasks(note, status)
      VALUES 
      ('Kira sözleşmesini imzalat', 'Açık'),
      ('Ekipman siparişlerini ver', 'Devam Ediyor'),
      ('Personel ilanını yayınla', 'Tamamlandı'),
      ('Marka tescil kontrolü yap', 'Açık')
    `);

    // 8. Seed PnL
    await pg.query(`
      INSERT INTO pnl(month_name, year_value, revenue, expense, profit, note)
      VALUES 
      ('OCAK', 2024, 1250000, 850000, 400000, 'Yılın ilk ayı performansı'),
      ('ŞUBAT', 2024, 1400000, 900000, 500000, 'Satışlarda artış'),
      ('MART', 2024, 1100000, 950000, 150000, 'Yüksek operasyonel giderler')
    `);

    // 9. Seed Contracts
    await pg.query(`
      INSERT INTO contracts(note, counterparty, amount, currency, status)
      VALUES 
      ('Ana Bayilik Sözleşmesi', 'Mustafa Kemal', 5000000, 'TRY', 'Onaylandı'),
      ('Kira Sözleşmesi - İstinye', 'Zorlu GYO', 150000, 'USD', 'İmzada')
    `);

    // 10. Seed Templates
    await pg.query(`
      INSERT INTO message_templates(channel, event_name, title, body, active)
      VALUES 
      ('whatsapp', 'Yeni Lead Karşılama', 'Merhaba Hoşgeldiniz', 'Sayın {{name}}, başvurunuz alınmıştır. En kısa sürede döneceğiz.', true),
      ('mail', 'Sözleşme Hatırlatma', 'Sözleşme Süreci Hakkında', 'Sözleşmeniz onay beklemektedir.', true)
    `);

    // 11. Seed Activity Logs
    await pg.query(`
      INSERT INTO activity_logs(user_id, user_name, module_name, action_type, summary)
      VALUES 
      ($1, 'Admin', 'Yatırımcılar', 'Ekleme', 'Yeni yatırımcı: Mustafa Kemal eklendi'),
      ($1, 'Admin', 'Markalar', 'Güncelleme', 'Burger Master franchise bedeli güncellendi'),
      ($1, 'Admin', 'Projeler', 'Aşama Değişikliği', 'Nişantaşı projesi İnşaat aşamasına geçti')
    `, [adminId]);

    console.log("Seeding successful!");
    res.json({ success: true, message: "Veritabanı başarıyla demo verilerle dolduruldu. Artık panelleri kontrol edebilirsiniz." });
  } catch (err) {
    console.error("Seeding error:", err);
    res.status(500).json({ error: err.message });
  }
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

function investorDateOrNull(v) {
  if (v === undefined || v === null || String(v).trim() === "") return null;
  return String(v).split("T")[0];
}

function investorRowFromBody(body) {
  const b = body || {};
  const type = b.type || b.investmentType || "Franchise";
  const pipeline = b.pipeline || b.pipelineStage || "Yeni Lead";
  const bMin = Number(b.budgetMin ?? b.budget_min ?? NaN);
  const bMax = Number(b.budgetMax ?? b.budget_max ?? NaN);
  const legacyBudget = Number(b.budget ?? NaN);
  const budgetMin = Number.isFinite(bMin) ? bMin : Number.isFinite(legacyBudget) ? legacyBudget : 0;
  const budgetMax = Number.isFinite(bMax) ? bMax : Number.isFinite(legacyBudget) ? legacyBudget : budgetMin;
  const budget = Math.max(budgetMin, budgetMax, legacyBudget || 0, 0);
  const rawAssign = b.assignedMemberId ?? b.assigned_member_id;
  const assignId =
    rawAssign === "" || rawAssign === undefined || rawAssign === null ? null : Number(rawAssign);
  return {
    name: b.name,
    budget,
    budgetMin,
    budgetMax,
    currency: b.currency || "TRY",
    city: b.city,
    sector: b.sector,
    investment_type: type,
    pipeline_stage: pipeline,
    phone: b.phone || null,
    email: b.email || null,
    district: b.district || null,
    goal: b.goal || null,
    contact_history: b.contactHistory || b.contact_history || null,
    meeting_notes: b.meetingNotes || b.meeting_notes || null,
    follow_up_date: investorDateOrNull(b.followUpDate || b.follow_up_date),
    documents: Array.isArray(b.documents) ? b.documents : [],
    investor_type: b.investorType || b.investor_type || "Bireysel",
    contact_person: b.contactPerson || b.contact_person || null,
    whatsapp_phone: b.whatsappPhone || b.whatsapp_phone || null,
    target_cities: b.targetCities || b.target_cities || null,
    target_location_type: b.targetLocationType || b.target_location_type || null,
    sub_sector: b.subSector || b.sub_sector || null,
    investment_timing: b.investmentTiming || b.investment_timing || null,
    financing_status: b.financingStatus || b.financing_status || null,
    priority: b.priority || "Orta",
    lead_source: b.leadSource || b.lead_source || null,
    assigned_member_id: Number.isFinite(assignId) ? assignId : null,
    last_meeting_date: investorDateOrNull(b.lastMeetingDate || b.last_meeting_date),
    next_action: b.nextAction || b.next_action || null,
    notes: b.notes || null,
  };
}

async function computeInvestorKpis() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const activeStages = ["Yeni Lead", "İlk Temas", "İhtiyaç Analizi", "Marka Eşleşmesi", "Sunum", "Lokasyon Çalışması", "Teklif", "Sözleşme"];
  const [total, newLeads, active, hot, closedMonth, avgBudget] = await Promise.all([
    pool.query("SELECT COUNT(*)::int AS c FROM investors"),
    pool.query("SELECT COUNT(*)::int AS c FROM investors WHERE pipeline_stage = $1", ["Yeni Lead"]),
    pool.query(`SELECT COUNT(*)::int AS c FROM investors WHERE pipeline_stage = ANY($1::text[])`, [activeStages]),
    pool.query(`SELECT COUNT(*)::int AS c FROM investors WHERE priority IN ('Yüksek','Çok sıcak')`),
    pool.query(
      `SELECT COUNT(*)::int AS c FROM investors WHERE pipeline_stage = 'Kapanış' AND updated_at >= $1::date`,
      [monthStart],
    ),
    pool.query(
      `SELECT COALESCE(AVG(
        CASE WHEN budget_max IS NOT NULL AND budget_min IS NOT NULL THEN (budget_min::numeric + budget_max::numeric)/2
        ELSE budget::numeric END
      )),0)::numeric AS a FROM investors`,
    ),
  ]);
  return {
    total: total.rows[0].c,
    newLeads: newLeads.rows[0].c,
    activePipeline: active.rows[0].c,
    hotInvestors: hot.rows[0].c,
    closedThisMonth: closedMonth.rows[0].c,
    avgBudget: Number(avgBudget.rows[0].a || 0),
  };
}

async function investorReminders() {
  const today = new Date().toISOString().split("T")[0];
  const staleDate = new Date(Date.now() - 7 * 86400000).toISOString();
  const follow = await pool.query(
    `SELECT id,name,follow_up_date,priority FROM investors
     WHERE follow_up_date IS NOT NULL AND follow_up_date <= $1::date
     ORDER BY follow_up_date ASC LIMIT 50`,
    [today],
  );
  const stale = await pool.query(
    `SELECT id,name,priority,last_activity_at,created_at FROM investors
     WHERE priority IN ('Yüksek','Çok sıcak')
     AND COALESCE(last_activity_at, created_at) < $1::timestamptz
     ORDER BY COALESCE(last_activity_at, created_at) ASC LIMIT 50`,
    [staleDate],
  );
  return { followUpDue: follow.rows, staleHot: stale.rows };
}

function brandOnboardingFromBody(b) {
  const raw = b.onboardingSteps ?? b.onboarding_steps;
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === "string") return raw.split("\n").map((s) => s.trim()).filter(Boolean);
  return [];
}

function brandWriteValues(body) {
  const b = body || {};
  const steps = brandOnboardingFromBody(b);
  const docs = Array.isArray(b.documents) ? b.documents.map(String) : [];
  const n = (v) => (v === "" || v === undefined || v === null ? null : Number(v));
  return [
    b.name,
    b.sector,
    Number(b.minBudget ?? 0),
    Number(b.maxBudget ?? 0),
    b.currency || "TRY",
    Number(b.minSqm ?? 0),
    Number(b.maxSqm ?? 0),
    b.targetLocations ?? b.target_locations ?? "",
    b.active !== false,
    Number(b.monthlyGrowth ?? 0),
    b.agreementStatus ?? b.agreement_status ?? null,
    n(b.franchiseFee),
    n(b.royaltyRate),
    n(b.contractTermMonths),
    n(b.initialInvestment),
    n(b.branchCount),
    b.contactPerson || null,
    b.contactPhone || null,
    b.businessPlan || null,
    b.operationPlan || null,
    steps,
    b.kpiTargets || null,
    b.brandNotes || null,
    b.subSector || null,
    b.whatsappPhone || null,
    b.email || null,
    b.website || null,
    b.brandType || null,
    b.targetRegions || null,
    b.locationType || null,
    b.storefrontNeed || null,
    b.chimneyNeed || null,
    b.techInfrastructure || null,
    b.staffNeed || null,
    n(b.adContributionPct),
    n(b.avgMonthlyRevenue),
    n(b.profitMarginPct),
    n(b.paybackMonths),
    b.presentationUrl || null,
    b.logoUrl || null,
    b.contractDraftUrl || null,
    docs,
    b.givesFranchise !== false,
    b.hasRoyalty !== false,
    n(b.scoreOperation),
    n(b.scoreFranchiseFit),
    n(b.scoreLocationFlex),
    n(b.scoreInvestorInterest),
    n(b.scoreProfitability),
    n(b.scoreGrowth),
  ];
}

async function computeBrandKpis() {
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
  const [total, activeAgreed, inDiscussion, passive, avgInv, newMonth] = await Promise.all([
    pool.query("SELECT COUNT(*)::int AS c FROM brands"),
    pool.query(
      "SELECT COUNT(*)::int AS c FROM brands WHERE active = true AND COALESCE(agreement_status,'') = 'Anlaşmalı'",
    ),
    pool.query(
      "SELECT COUNT(*)::int AS c FROM brands WHERE COALESCE(agreement_status,'') IN ('Görüşülüyor','Beklemede')",
    ),
    pool.query(
      "SELECT COUNT(*)::int AS c FROM brands WHERE active = false OR COALESCE(agreement_status,'') IN ('Pasif','Reddedildi')",
    ),
    pool.query(
      "SELECT COALESCE(AVG((min_budget::numeric + max_budget::numeric) / 2), 0)::numeric AS a FROM brands WHERE min_budget IS NOT NULL AND max_budget IS NOT NULL",
    ),
    pool.query("SELECT COUNT(*)::int AS c FROM brands WHERE created_at::date >= $1::date", [monthStart]),
  ]);
  return {
    total: total.rows[0].c,
    activeAgreed: activeAgreed.rows[0].c,
    inDiscussion: inDiscussion.rows[0].c,
    passive: passive.rows[0].c,
    avgInvestment: Number(avgInv.rows[0].a || 0),
    newThisMonth: newMonth.rows[0].c,
  };
}

app.get("/api/investors", authMiddleware, async (req, res) => {
  const q = req.query || {};
  const page = Math.max(1, Number(q.page) || 1);
  const pageSize = Math.min(100, Math.max(5, Number(q.pageSize) || 20));
  const offset = (page - 1) * pageSize;
  const sortMap = {
    name: "i.name",
    budget: "i.budget",
    city: "i.city",
    created_at: "i.created_at",
    follow_up_date: "i.follow_up_date",
    pipeline: "i.pipeline_stage",
    priority: "i.priority",
  };
  const sortCol = sortMap[q.sort] || "i.created_at";
  const order = String(q.order || "desc").toLowerCase() === "asc" ? "ASC" : "DESC";

  const conds = ["1=1"];
  const params = [];
  const add = (sql, val) => {
    params.push(val);
    conds.push(`${sql}$${params.length}`);
  };

  if (q.q) {
    params.push(`%${String(q.q)}%`);
    conds.push(`(i.name ILIKE $${params.length} OR i.email ILIKE $${params.length} OR i.phone ILIKE $${params.length} OR i.city ILIKE $${params.length})`);
  }
  if (q.name) add("i.name ILIKE ", `%${q.name}%`);
  if (q.phone) add("i.phone ILIKE ", `%${q.phone}%`);
  if (q.email) add("i.email ILIKE ", `%${q.email}%`);
  if (q.city) add("i.city ILIKE ", `%${q.city}%`);
  if (q.district) add("i.district ILIKE ", `%${q.district}%`);
  if (q.sector) add("i.sector ILIKE ", `%${q.sector}%`);
  if (q.currency) add("i.currency = ", q.currency);
  if (q.pipeline) add("i.pipeline_stage = ", q.pipeline);
  if (q.priority) add("i.priority = ", q.priority);
  if (q.investmentType) add("i.investment_type = ", q.investmentType);
  if (q.assignedMemberId) add("i.assigned_member_id = ", Number(q.assignedMemberId));
  if (q.budgetMin) add("COALESCE(i.budget_max, i.budget_min, i.budget) >= ", Number(q.budgetMin));
  if (q.budgetMax) add("COALESCE(i.budget_min, i.budget_max, i.budget) <= ", Number(q.budgetMax));
  if (q.followUpFrom) add("i.follow_up_date >= ", q.followUpFrom);
  if (q.followUpTo) add("i.follow_up_date <= ", q.followUpTo);
  if (q.createdFrom) add("i.created_at::date >= ", q.createdFrom);
  if (q.createdTo) add("i.created_at::date <= ", q.createdTo);

  const whereSql = conds.join(" AND ");
  const countR = await pool.query(`SELECT COUNT(*)::int AS c FROM investors i WHERE ${whereSql}`, params);
  const total = countR.rows[0].c;
  const listParams = [...params, pageSize, offset];
  const result = await pool.query(
    `SELECT i.*, tm.name AS assigned_member_name
     FROM investors i
     LEFT JOIN team_members tm ON tm.id = i.assigned_member_id
     WHERE ${whereSql}
     ORDER BY ${sortCol} ${order}
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    listParams,
  );
  const rows = result.rows.map((row) => {
    const m = mapInvestor(row);
    m.assignedMemberName = row.assigned_member_name || "";
    return m;
  });
  const kpis = await computeInvestorKpis();
  const reminders = await investorReminders();
  res.json({ items: rows, total, page, pageSize, kpis, reminders });
});

app.post("/api/investors/bulk", authMiddleware, async (req, res) => {
  const { ids = [], assignedMemberId, pipeline } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ message: "Seçim gerekli." });
  }
  if (assignedMemberId === undefined && !pipeline) {
    return res.status(400).json({ message: "Atanan danışman veya pipeline gerekli." });
  }
  let updated = 0;
  for (const id of ids) {
    const sets = [];
    const vals = [];
    if (assignedMemberId !== undefined) {
      vals.push(assignedMemberId === "" || assignedMemberId === null ? null : Number(assignedMemberId));
      sets.push(`assigned_member_id=$${vals.length}`);
    }
    if (pipeline) {
      vals.push(pipeline);
      sets.push(`pipeline_stage=$${vals.length}`);
    }
    if (!sets.length) continue;
    vals.push(id);
    await pool.query(
      `UPDATE investors SET ${sets.join(", ")}, last_activity_at=NOW(), updated_at=NOW() WHERE id=$${vals.length}`,
      vals,
    );
    updated++;
  }
  res.json({ updated });
});

app.get("/api/investors/:id/detail", authMiddleware, async (req, res) => {
  const inv = await pool.query(
    `SELECT i.*, tm.name AS assigned_member_name FROM investors i
     LEFT JOIN team_members tm ON tm.id = i.assigned_member_id WHERE i.id=$1`,
    [req.params.id],
  );
  if (inv.rowCount === 0) return res.status(404).json({ message: "Bulunamadı." });
  const investor = mapInvestor(inv.rows[0]);
  investor.assignedMemberName = inv.rows[0].assigned_member_name || "";
  const [meetings, matches, projects, tasks, contracts] = await Promise.all([
    pool.query(
      `SELECT m.*, u.name AS created_by_name FROM investor_meetings m
       LEFT JOIN users u ON u.id = m.created_by WHERE m.investor_id=$1 ORDER BY m.meeting_date DESC, m.id DESC`,
      [req.params.id],
    ),
    pool.query(
      `SELECT ibm.*, b.name AS brand_name FROM investor_brand_matches ibm
       JOIN brands b ON b.id = ibm.brand_id WHERE ibm.investor_id=$1 ORDER BY ibm.score DESC NULLS LAST`,
      [req.params.id],
    ),
    pool.query(`SELECT * FROM projects WHERE investor_id=$1 ORDER BY id DESC`, [req.params.id]),
    pool.query(`SELECT id,note,status,assignee_id,assignee_name,priority,due_date,investor_id FROM tasks WHERE investor_id=$1 ORDER BY id DESC`, [req.params.id]),
    pool.query(`SELECT * FROM contracts WHERE investor_id=$1 ORDER BY id DESC`, [req.params.id]),
  ]);
  res.json({
    investor,
    meetings: meetings.rows,
    brandMatches: matches.rows,
    projects: projects.rows.map(mapProject),
    tasks: tasks.rows.map(mapTask),
    contracts: contracts.rows.map(mapContract),
  });
});

app.post("/api/investors/:id/meetings", authMiddleware, async (req, res) => {
  const b = req.body || {};
  const inserted = await pool.query(
    `INSERT INTO investor_meetings(investor_id,meeting_type,meeting_date,met_by,met_by_member_id,notes,next_action,reminder_date,created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [
      req.params.id,
      b.meetingType || b.meeting_type || "Telefon",
      b.meetingDate || b.meeting_date,
      b.metBy || b.met_by || req.user.name || "",
      b.metByMemberId || b.met_by_member_id || null,
      b.notes || null,
      b.nextAction || b.next_action || null,
      b.reminderDate || b.reminder_date || null,
      req.user.id,
    ],
  );
  await pool.query(
    `UPDATE investors SET last_meeting_date=$1, next_action=$2, last_activity_at=NOW(), updated_at=NOW() WHERE id=$3`,
    [b.meetingDate || b.meeting_date, b.nextAction || b.next_action || null, req.params.id],
  );
  res.status(201).json(inserted.rows[0]);
});

app.post("/api/investors/:id/match-brands", authMiddleware, async (req, res) => {
  const { matches = [] } = req.body || {};
  if (!Array.isArray(matches) || matches.length === 0) {
    return res.status(400).json({ message: "Eşleşme listesi boş." });
  }
  for (const m of matches) {
    await pool.query(
      `INSERT INTO investor_brand_matches(investor_id,brand_id,score,notes,created_by)
       VALUES($1,$2,$3,$4,$5)
       ON CONFLICT(investor_id, brand_id) DO UPDATE SET score=EXCLUDED.score, notes=EXCLUDED.notes`,
      [req.params.id, m.brandId || m.brand_id, Number(m.score || 0), m.notes || null, req.user.id],
    );
  }
  await pool.query(
    `UPDATE investors SET pipeline_stage=CASE WHEN pipeline_stage IN ('Yeni Lead','İlk Temas') THEN 'Marka Eşleşmesi' ELSE pipeline_stage END,
     last_activity_at=NOW(), updated_at=NOW() WHERE id=$1`,
    [req.params.id],
  );
  await logActivity({
    userId: req.user.id,
    moduleName: "investors",
    actionType: "update",
    recordId: Number(req.params.id),
    summary: "Marka eşleştirmesi kaydedildi",
    afterData: { matches },
  });
  res.json({ saved: matches.length });
});

app.post("/api/investors", authMiddleware, async (req, res) => {
  const r = investorRowFromBody(req.body);
  const inserted = await pool.query(
    `INSERT INTO investors(
      name,budget,budget_min,budget_max,currency,city,sector,investment_type,pipeline_stage,
      phone,email,district,goal,contact_history,meeting_notes,follow_up_date,documents,created_by,
      investor_type,contact_person,whatsapp_phone,target_cities,target_location_type,sub_sector,
      investment_timing,financing_status,priority,lead_source,assigned_member_id,last_meeting_date,next_action,notes,last_activity_at
    ) VALUES(
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
      $19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,NOW()
    ) RETURNING *`,
    [
      r.name,
      r.budget,
      r.budgetMin,
      r.budgetMax,
      r.currency,
      r.city,
      r.sector,
      r.investment_type,
      r.pipeline_stage,
      r.phone,
      r.email,
      r.district,
      r.goal,
      r.contact_history,
      r.meeting_notes,
      r.follow_up_date,
      r.documents,
      req.user.id,
      r.investor_type,
      r.contact_person,
      r.whatsapp_phone,
      r.target_cities,
      r.target_location_type,
      r.sub_sector,
      r.investment_timing,
      r.financing_status,
      r.priority,
      r.lead_source,
      r.assigned_member_id,
      r.last_meeting_date,
      r.next_action,
      r.notes,
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
  await pool.query(
    `INSERT INTO tasks(note,status,priority,due_date,investor_id) VALUES($1,'Açık','Orta', CURRENT_DATE + INTERVAL '1 day', $2)`,
    [`İlk temas kur: ${investor.name}`, investor.id],
  );
  res.status(201).json(investor);
});

app.put("/api/investors/:id", authMiddleware, async (req, res) => {
  const r = investorRowFromBody(req.body);
  const before = await pool.query("SELECT * FROM investors WHERE id=$1", [req.params.id]);
  const updated = await pool.query(
    `UPDATE investors SET
      name=$1,budget=$2,budget_min=$3,budget_max=$4,currency=$5,city=$6,sector=$7,investment_type=$8,pipeline_stage=$9,
      phone=$10,email=$11,district=$12,goal=$13,contact_history=$14,meeting_notes=$15,follow_up_date=$16,documents=$17,
      investor_type=$18,contact_person=$19,whatsapp_phone=$20,target_cities=$21,target_location_type=$22,sub_sector=$23,
      investment_timing=$24,financing_status=$25,priority=$26,lead_source=$27,assigned_member_id=$28,last_meeting_date=$29,next_action=$30,notes=$31,
      last_activity_at=NOW(),updated_at=NOW()
     WHERE id=$32 RETURNING *`,
    [
      r.name,
      r.budget,
      r.budgetMin,
      r.budgetMax,
      r.currency,
      r.city,
      r.sector,
      r.investment_type,
      r.pipeline_stage,
      r.phone,
      r.email,
      r.district,
      r.goal,
      r.contact_history,
      r.meeting_notes,
      r.follow_up_date,
      r.documents,
      r.investor_type,
      r.contact_person,
      r.whatsapp_phone,
      r.target_cities,
      r.target_location_type,
      r.sub_sector,
      r.investment_timing,
      r.financing_status,
      r.priority,
      r.lead_source,
      r.assigned_member_id,
      r.last_meeting_date,
      r.next_action,
      r.notes,
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
  const q = req.query || {};
  const page = Math.max(1, Number(q.page) || 1);
  const pageSize = Math.min(100, Math.max(5, Number(q.pageSize) || 20));
  const offset = (page - 1) * pageSize;
  const sortMap = {
    name: "b.name",
    sector: "b.sector",
    min_budget: "b.min_budget",
    max_budget: "b.max_budget",
    created_at: "b.created_at",
    agreement_status: "b.agreement_status",
  };
  const sortCol = sortMap[q.sort] || "b.created_at";
  const order = String(q.order || "desc").toLowerCase() === "asc" ? "ASC" : "DESC";
  const conds = ["1=1"];
  const params = [];
  const add = (sql, val) => {
    params.push(val);
    conds.push(`${sql}$${params.length}`);
  };
  if (q.q) {
    params.push(`%${String(q.q)}%`);
    conds.push(`(b.name ILIKE $${params.length} OR b.sector ILIKE $${params.length} OR COALESCE(b.sub_sector,'') ILIKE $${params.length})`);
  }
  if (q.name) add("b.name ILIKE ", `%${q.name}%`);
  if (q.sector) add("b.sector ILIKE ", `%${q.sector}%`);
  if (q.subSector) add("b.sub_sector ILIKE ", `%${q.subSector}%`);
  if (q.targetCity) add("b.target_locations ILIKE ", `%${q.targetCity}%`);
  if (q.budgetMin) add("b.max_budget >= ", Number(q.budgetMin));
  if (q.budgetMax) add("b.min_budget <= ", Number(q.budgetMax));
  if (q.locationType) add("b.location_type = ", q.locationType);
  if (q.agreementStatus) add("b.agreement_status = ", q.agreementStatus);
  if (q.active === "true" || q.active === true) add("b.active = ", true);
  if (q.active === "false" || q.active === false) add("b.active = ", false);
  if (q.givesFranchise === "true" || q.givesFranchise === true) add("b.gives_franchise = ", true);
  if (q.givesFranchise === "false" || q.givesFranchise === false) add("b.gives_franchise = ", false);
  if (q.hasRoyalty === "true" || q.hasRoyalty === true) add("b.has_royalty = ", true);
  if (q.hasRoyalty === "false" || q.hasRoyalty === false) add("b.has_royalty = ", false);
  if (q.createdFrom) add("b.created_at::date >= ", q.createdFrom);
  if (q.createdTo) add("b.created_at::date <= ", q.createdTo);
  const whereSql = conds.join(" AND ");
  const countR = await pool.query(`SELECT COUNT(*)::int AS c FROM brands b WHERE ${whereSql}`, params);
  const total = countR.rows[0].c;
  const listParams = [...params, pageSize, offset];
  const result = await pool.query(
    `SELECT b.* FROM brands b WHERE ${whereSql} ORDER BY ${sortCol} ${order} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    listParams,
  );
  const rows = result.rows.map(mapBrand);
  const kpis = await computeBrandKpis();
  res.json({ items: rows, total, page, pageSize, kpis });
});

app.post("/api/brands/bulk", authMiddleware, async (req, res) => {
  const { ids = [], agreementStatus, active } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ message: "ids zorunlu." });
  }
  const idList = ids.map((x) => Number(x)).filter((n) => Number.isFinite(n));
  if (!idList.length) {
    return res.status(400).json({ message: "Geçersiz id listesi." });
  }
  if (agreementStatus !== undefined && agreementStatus !== null && agreementStatus !== "") {
    await pool.query(`UPDATE brands SET agreement_status=$1, updated_at=NOW() WHERE id = ANY($2::int[])`, [
      agreementStatus,
      idList,
    ]);
  }
  if (active === true || active === false) {
    await pool.query(`UPDATE brands SET active=$1, updated_at=NOW() WHERE id = ANY($2::int[])`, [active, idList]);
  }
  res.json({ ok: true, updated: idList.length });
});

app.get("/api/brands/:id/detail", authMiddleware, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ message: "Geçersiz id." });
  }
  const brandRow = await pool.query("SELECT * FROM brands WHERE id=$1", [id]);
  if (brandRow.rowCount === 0) {
    return res.status(404).json({ message: "Marka bulunamadı." });
  }
  const brand = mapBrand(brandRow.rows[0]);
  const [matches, projects, contracts, tasks, agreements, locRows] = await Promise.all([
    pool.query(
      `SELECT ibm.*, i.name AS investor_name, i.city AS investor_city, i.sector AS investor_sector
       FROM investor_brand_matches ibm JOIN investors i ON i.id = ibm.investor_id WHERE ibm.brand_id=$1 ORDER BY ibm.score DESC NULLS LAST`,
      [id],
    ),
    pool.query("SELECT * FROM projects WHERE brand_id=$1 AND deleted_at IS NULL ORDER BY id DESC", [id]),
    pool.query("SELECT * FROM contracts WHERE brand_id=$1 AND deleted_at IS NULL ORDER BY id DESC", [id]),
    pool.query("SELECT * FROM tasks WHERE brand_id=$1 ORDER BY id DESC LIMIT 100", [id]),
    pool.query("SELECT * FROM brand_agreements WHERE brand_id=$1 ORDER BY version_no DESC, created_at DESC", [id]),
    pool.query(
      `SELECT * FROM locations WHERE deleted_at IS NULL AND (
        CAST($1 AS text) = ANY(recommended_brands) OR array_to_string(recommended_brands, ',') ILIKE '%' || $2 || '%'
      ) ORDER BY id DESC LIMIT 50`,
      [String(id), brand.name || ""],
    ),
  ]);
  res.json({
    brand,
    investorMatches: matches.rows,
    projects: projects.rows.map(mapProject),
    contracts: contracts.rows.map(mapContract),
    tasks: tasks.rows.map(mapTask),
    agreements: agreements.rows,
    locations: locRows.rows.map(mapLocation),
  });
});

app.post("/api/brands", authMiddleware, async (req, res) => {
  const body = req.body || {};
  const vals = brandWriteValues(body);
  const inserted = await pool.query(
    `INSERT INTO brands(
      name,sector,min_budget,max_budget,currency,min_sqm,max_sqm,target_locations,active,monthly_growth,
      agreement_status,franchise_fee,royalty_rate,contract_term_months,initial_investment,branch_count,
      contact_person,contact_phone,business_plan,operation_plan,onboarding_steps,kpi_targets,brand_notes,
      sub_sector,whatsapp_phone,email,website,brand_type,target_regions,location_type,
      storefront_need,chimney_need,tech_infrastructure,staff_need,ad_contribution_pct,avg_monthly_revenue,
      profit_margin_pct,payback_months,presentation_url,logo_url,contract_draft_url,documents,
      gives_franchise,has_royalty,score_operation,score_franchise_fit,score_location_flex,score_investor_interest,score_profitability,score_growth
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,$44,$45,$46,$47,$48,$49,$50)
    RETURNING *`,
    vals,
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
  await pool.query(
    `INSERT INTO tasks(note,status,priority,due_date,brand_id) VALUES($1,'Açık','Orta', CURRENT_DATE + INTERVAL '2 day', $2)`,
    [`Marka analizini tamamla: ${item.name}`, item.id],
  );
  res.status(201).json(item);
});

app.put("/api/brands/:id", authMiddleware, async (req, res) => {
  const body = req.body || {};
  const before = await pool.query("SELECT * FROM brands WHERE id=$1", [req.params.id]);
  const vals = brandWriteValues(body);
  const updated = await pool.query(
    `UPDATE brands SET
      name=$1,sector=$2,min_budget=$3,max_budget=$4,currency=$5,min_sqm=$6,max_sqm=$7,target_locations=$8,active=$9,monthly_growth=$10,
      agreement_status=$11,franchise_fee=$12,royalty_rate=$13,contract_term_months=$14,initial_investment=$15,branch_count=$16,
      contact_person=$17,contact_phone=$18,business_plan=$19,operation_plan=$20,onboarding_steps=$21,kpi_targets=$22,brand_notes=$23,
      sub_sector=$24,whatsapp_phone=$25,email=$26,website=$27,brand_type=$28,target_regions=$29,location_type=$30,
      storefront_need=$31,chimney_need=$32,tech_infrastructure=$33,staff_need=$34,ad_contribution_pct=$35,avg_monthly_revenue=$36,
      profit_margin_pct=$37,payback_months=$38,presentation_url=$39,logo_url=$40,contract_draft_url=$41,documents=$42,
      gives_franchise=$43,has_royalty=$44,score_operation=$45,score_franchise_fit=$46,score_location_flex=$47,score_investor_interest=$48,score_profitability=$49,score_growth=$50,
      updated_at=NOW()
     WHERE id=$51 RETURNING *`,
    [...vals, req.params.id],
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
    `INSERT INTO projects(name,project_type,owner_team,assignees,priority,progress,stage,due_date,description,checklist,investor_id,brand_id)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
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
      body.investorId || body.investor_id || null,
      body.brandId || body.brand_id || null,
    ],
  );
  const project = mapProject(inserted.rows[0]);
  if (project.investorId) {
    await pool.query(`UPDATE investors SET last_activity_at=NOW(), updated_at=NOW() WHERE id=$1`, [project.investorId]);
  }
  if (project.brandId) {
    await pool.query(`UPDATE brands SET updated_at=NOW() WHERE id=$1`, [project.brandId]);
  }
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
     SET name=$1,project_type=$2,owner_team=$3,assignees=$4,priority=$5,progress=$6,stage=$7,due_date=$8,description=$9,checklist=$10,investor_id=$11,brand_id=$12,updated_at=NOW()
     WHERE id=$13 RETURNING *`,
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
      body.investorId ?? body.investor_id ?? before.rows[0]?.investor_id ?? null,
      body.brandId ?? body.brand_id ?? before.rows[0]?.brand_id ?? null,
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
    investorId = null,
    brandId = null,
  } = req.body || {};
  const inserted = await pool.query(
    `INSERT INTO contracts(note,contract_type,status,counterparty,start_date,end_date,amount,currency,file_name,file_data,file_url,file_mime_type,investor_id,brand_id)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING *`,
    [
      note,
      type,
      status,
      counterparty,
      startDate,
      endDate,
      amount,
      currency,
      fileName,
      fileData,
      fileUrl,
      fileMimeType,
      investorId || null,
      brandId || null,
    ],
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
    investorId = null,
    brandId = null,
  } = req.body || {};
  const before = await pool.query("SELECT * FROM contracts WHERE id=$1", [req.params.id]);
  const updated = await pool.query(
    `UPDATE contracts
     SET note=$1,contract_type=$2,status=$3,counterparty=$4,start_date=$5,end_date=$6,amount=$7,currency=$8,file_name=$9,file_data=$10,file_url=$11,file_mime_type=$12,investor_id=$13,brand_id=$14,updated_at=NOW()
     WHERE id=$15 RETURNING *`,
    [
      note,
      type,
      status,
      counterparty,
      startDate,
      endDate,
      amount,
      currency,
      fileName,
      fileData,
      fileUrl,
      fileMimeType,
      investorId ?? before.rows[0]?.investor_id ?? null,
      brandId ?? before.rows[0]?.brand_id ?? null,
      req.params.id,
    ],
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

app.get("/api/team-members", authMiddleware, requireAdmin, async (req, res) => {
  const rows = await pool.query("SELECT * FROM team_members ORDER BY id DESC");
  res.json(rows.rows.map(mapTeamMember));
});

app.get("/api/team-members/options", authMiddleware, async (req, res) => {
  const rows = await pool.query("SELECT id,name,role_name FROM team_members WHERE active=true ORDER BY name ASC");
  res.json(rows.rows.map((x) => ({ id: x.id, name: x.name, roleName: x.role_name })));
});

app.post("/api/team-members", authMiddleware, requireAdmin, async (req, res) => {
  const { name, email, password, phone = null, department = null, roleName = "Temsilci", permissions = [], active = true } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ message: "İsim, e-posta ve parola zorunludur." });
  }
  const userExists = await pool.query("SELECT id FROM users WHERE email=$1", [email]);
  if (userExists.rowCount > 0) {
    return res.status(409).json({ message: "Bu e-posta için kullanıcı zaten mevcut." });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const userRole = roleName === "Yönetici" ? "admin" : "agent";
  const insertedUser = await pool.query(
    `INSERT INTO users(name,email,password_hash,role)
     VALUES($1,$2,$3,$4) RETURNING id`,
    [name, email, passwordHash, userRole],
  );
  const inserted = await pool.query(
    `INSERT INTO team_members(user_id,name,email,phone,department,role_name,permissions,active)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [insertedUser.rows[0].id, name, email, phone, department, roleName, permissions, active],
  );
  res.status(201).json(mapTeamMember(inserted.rows[0]));
});

app.put("/api/team-members/:id", authMiddleware, requireAdmin, async (req, res) => {
  const { name, email = null, phone = null, department = null, roleName = "Temsilci", permissions = [], active = true } = req.body || {};
  const updated = await pool.query(
    `UPDATE team_members
     SET name=$1,email=$2,phone=$3,department=$4,role_name=$5,permissions=$6,active=$7,updated_at=NOW()
     WHERE id=$8 RETURNING *`,
    [name, email, phone, department, roleName, permissions, active, req.params.id],
  );
  if (updated.rowCount === 0) {
    return res.status(404).json({ message: "Ekip üyesi bulunamadı." });
  }
  res.json(mapTeamMember(updated.rows[0]));
});

app.delete("/api/team-members/:id", authMiddleware, requireAdmin, async (req, res) => {
  await pool.query("DELETE FROM team_members WHERE id=$1", [req.params.id]);
  res.status(204).send();
});

app.get("/api/tasks", authMiddleware, async (req, res) => {
  let result;
  if (req.user.role === "admin") {
    result = await pool.query(
      "SELECT id,note,status,assignee_id,assignee_name,priority,due_date,investor_id,brand_id FROM tasks ORDER BY id DESC",
    );
  } else {
    const member = await pool.query("SELECT id FROM team_members WHERE user_id=$1 LIMIT 1", [req.user.id]);
    if (member.rowCount === 0) {
      return res.json([]);
    }
    result = await pool.query(
      "SELECT id,note,status,assignee_id,assignee_name,priority,due_date,investor_id,brand_id FROM tasks WHERE assignee_id=$1 ORDER BY id DESC",
      [member.rows[0].id],
    );
  }
  res.json(result.rows.map(mapTask));
});

app.post("/api/tasks", authMiddleware, requireAdmin, async (req, res) => {
  const {
    note,
    status = "Açık",
    assigneeId = null,
    assigneeName = null,
    priority = "Orta",
    dueDate = null,
    investorId = null,
    brandId = null,
  } = req.body || {};
  const inserted = await pool.query(
    "INSERT INTO tasks(note,status,assignee_id,assignee_name,priority,due_date,investor_id,brand_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,note,status,assignee_id,assignee_name,priority,due_date,investor_id,brand_id",
    [note, status, assigneeId, assigneeName, priority, dueDate, investorId || null, brandId || null],
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
  if (assigneeId) {
    const member = await pool.query("SELECT email,name FROM team_members WHERE id=$1", [assigneeId]);
    if (member.rowCount > 0 && member.rows[0].email) {
      try {
        await sendMailToRecipient(
          member.rows[0].email,
          `Yeni Görev Ataması: ${note}`,
          `Merhaba ${member.rows[0].name || assigneeName || ""},\n\nSize yeni bir görev atandı.\nGörev: ${note}\nÖncelik: ${priority}\nDurum: ${status}\nSon Tarih: ${dueDate || "-"}\n\nMi Core CRM`,
        );
      } catch (error) {
        console.log("Task reminder email failed:", error.message);
      }
    }
  }
  res.status(201).json(item);
});

app.put("/api/tasks/:id", authMiddleware, requireAdmin, async (req, res) => {
  const {
    note,
    status,
    assigneeId = null,
    assigneeName = null,
    priority = "Orta",
    dueDate = null,
    investorId = null,
    brandId = null,
  } = req.body || {};
  const before = await pool.query(
    "SELECT id,note,status,assignee_id,assignee_name,priority,due_date,investor_id,brand_id FROM tasks WHERE id=$1",
    [req.params.id],
  );
  const updated = await pool.query(
    "UPDATE tasks SET note=$1,status=$2,assignee_id=$3,assignee_name=$4,priority=$5,due_date=$6,investor_id=$7,brand_id=$8,updated_at=NOW() WHERE id=$9 RETURNING id,note,status,assignee_id,assignee_name,priority,due_date,investor_id,brand_id",
    [note, status, assigneeId, assigneeName, priority, dueDate, investorId || null, brandId || null, req.params.id],
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

app.delete("/api/tasks/:id", authMiddleware, requireAdmin, async (req, res) => {
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
  const brandsResult = await pool.query(
    `SELECT * FROM brands WHERE active = true AND COALESCE(agreement_status,'') = 'Anlaşmalı' AND deleted_at IS NULL`,
  );
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


app.get("/api/export/:module", authMiddleware, async (req, res) => {
  const moduleName = req.params.module;
  const config = {
    investors: {
      sql: `SELECT id,name,investor_type,contact_person,phone,whatsapp_phone,email,city,district,target_cities,target_location_type,
            sector,sub_sector,budget_min,budget_max,currency,investment_type,investment_timing,financing_status,priority,pipeline_stage,lead_source,
            assigned_member_id,follow_up_date,last_meeting_date,next_action,notes,created_at
            FROM investors ORDER BY id DESC`,
      file: "yatirimcilar.xlsx",
      sheet: "Yatirimcilar",
    },
    brands: {
      sql: `SELECT id,name,sector,sub_sector,min_budget,max_budget,currency,min_sqm,max_sqm,target_locations,target_regions,location_type,
            active,agreement_status,brand_type,gives_franchise,has_royalty,franchise_fee,royalty_rate,ad_contribution_pct,
            contact_person,contact_phone,email,website,created_at
            FROM brands ORDER BY id DESC`,
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
    investors: `SELECT id,name,city,sector,budget_min,budget_max,currency,investment_type,pipeline_stage,priority,phone,email,created_at FROM investors ORDER BY id DESC`,
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

// =====================================================
// PnL - Gelirler (Revenues) CRUD
// =====================================================
app.get("/api/pnl/revenues", authMiddleware, async (req, res) => {
  const { month, year, branch } = req.query;
  let query = "SELECT * FROM pnl_revenues WHERE 1=1";
  const params = [];
  if (month) { params.push(month); query += ` AND month_name=$${params.length}`; }
  if (year) { params.push(Number(year)); query += ` AND year_value=$${params.length}`; }
  if (branch && branch !== 'all') { params.push(branch); query += ` AND branch=$${params.length}`; }
  query += " ORDER BY entry_date DESC, id DESC";
  const rows = await pool.query(query, params);
  res.json(rows.rows);
});

app.post("/api/pnl/revenues", authMiddleware, async (req, res) => {
  const { entryDate, branch = 'Genel', revenueType = 'Satış', description = null, amount, source = 'Manuel', monthName, yearValue } = req.body || {};
  const inserted = await pool.query(
    `INSERT INTO pnl_revenues(entry_date,branch,revenue_type,description,amount,source,month_name,year_value,created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [entryDate, branch, revenueType, description, Number(amount || 0), source, monthName, Number(yearValue), req.user.id]
  );
  res.status(201).json(inserted.rows[0]);
});

app.put("/api/pnl/revenues/:id", authMiddleware, async (req, res) => {
  const { entryDate, branch, revenueType, description, amount, monthName, yearValue } = req.body || {};
  const sourceCheck = await pool.query("SELECT source FROM pnl_revenues WHERE id=$1", [req.params.id]);
  if (sourceCheck.rowCount === 0) return res.status(404).json({ message: "Kayıt bulunamadı." });
  if (sourceCheck.rows[0].source === "Excel") {
    return res.status(403).json({ message: "Excel kayıtları kilitlidir. 'Kopyala ve Düzenle' kullanın." });
  }
  const updated = await pool.query(
    `UPDATE pnl_revenues SET entry_date=$1,branch=$2,revenue_type=$3,description=$4,amount=$5,month_name=$6,year_value=$7
     WHERE id=$8 RETURNING *`,
    [entryDate, branch, revenueType, description, Number(amount || 0), monthName, Number(yearValue), req.params.id]
  );
  if (updated.rowCount === 0) return res.status(404).json({ message: "Kayıt bulunamadı." });
  res.json(updated.rows[0]);
});

app.delete("/api/pnl/revenues/:id", authMiddleware, async (req, res) => {
  const sourceCheck = await pool.query("SELECT source FROM pnl_revenues WHERE id=$1", [req.params.id]);
  if (sourceCheck.rowCount === 0) return res.status(404).json({ message: "Kayıt bulunamadı." });
  if (sourceCheck.rows[0].source === "Excel") {
    return res.status(403).json({ message: "Excel kayıtları kilitlidir. Önce kopyalayın." });
  }
  await pool.query("DELETE FROM pnl_revenues WHERE id=$1", [req.params.id]);
  res.status(204).send();
});

// =====================================================
// PnL - Giderler (Expenses) CRUD
// =====================================================
app.get("/api/pnl/expenses", authMiddleware, async (req, res) => {
  const { month, year, branch } = req.query;
  let query = "SELECT * FROM pnl_expenses WHERE 1=1";
  const params = [];
  if (month) { params.push(month); query += ` AND month_name=$${params.length}`; }
  if (year) { params.push(Number(year)); query += ` AND year_value=$${params.length}`; }
  if (branch && branch !== 'all') { params.push(branch); query += ` AND branch=$${params.length}`; }
  query += " ORDER BY entry_date DESC, id DESC";
  const rows = await pool.query(query, params);
  res.json(rows.rows);
});

app.post("/api/pnl/expenses", authMiddleware, async (req, res) => {
  const { entryDate, branch = 'Genel', category = 'Diğer', subCategory = null, description = null, amount, source = 'Manuel', monthName, yearValue } = req.body || {};
  const inserted = await pool.query(
    `INSERT INTO pnl_expenses(entry_date,branch,category,sub_category,description,amount,source,month_name,year_value,created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [entryDate, branch, category, subCategory, description, Number(amount || 0), source, monthName, Number(yearValue), req.user.id]
  );
  res.status(201).json(inserted.rows[0]);
});

app.put("/api/pnl/expenses/:id", authMiddleware, async (req, res) => {
  const { entryDate, branch, category, subCategory, description, amount, monthName, yearValue } = req.body || {};
  const sourceCheck = await pool.query("SELECT source FROM pnl_expenses WHERE id=$1", [req.params.id]);
  if (sourceCheck.rowCount === 0) return res.status(404).json({ message: "Kayıt bulunamadı." });
  if (sourceCheck.rows[0].source === "Excel") {
    return res.status(403).json({ message: "Excel kayıtları kilitlidir. 'Kopyala ve Düzenle' kullanın." });
  }
  const updated = await pool.query(
    `UPDATE pnl_expenses SET entry_date=$1,branch=$2,category=$3,sub_category=$4,description=$5,amount=$6,month_name=$7,year_value=$8
     WHERE id=$9 RETURNING *`,
    [entryDate, branch, category, subCategory, description, Number(amount || 0), monthName, Number(yearValue), req.params.id]
  );
  if (updated.rowCount === 0) return res.status(404).json({ message: "Kayıt bulunamadı." });
  res.json(updated.rows[0]);
});

app.delete("/api/pnl/expenses/:id", authMiddleware, async (req, res) => {
  const sourceCheck = await pool.query("SELECT source FROM pnl_expenses WHERE id=$1", [req.params.id]);
  if (sourceCheck.rowCount === 0) return res.status(404).json({ message: "Kayıt bulunamadı." });
  if (sourceCheck.rows[0].source === "Excel") {
    return res.status(403).json({ message: "Excel kayıtları kilitlidir. Önce kopyalayın." });
  }
  await pool.query("DELETE FROM pnl_expenses WHERE id=$1", [req.params.id]);
  res.status(204).send();
});

// =====================================================
// PnL - Personel Giderleri CRUD
// =====================================================
app.get("/api/pnl/personnel", authMiddleware, async (req, res) => {
  const { month, year, branch } = req.query;
  let query = "SELECT * FROM pnl_personnel WHERE 1=1";
  const params = [];
  if (month) { params.push(month); query += ` AND month_name=$${params.length}`; }
  if (year) { params.push(Number(year)); query += ` AND year_value=$${params.length}`; }
  if (branch && branch !== 'all') { params.push(branch); query += ` AND branch=$${params.length}`; }
  query += " ORDER BY entry_date DESC, id DESC";
  const rows = await pool.query(query, params);
  res.json(rows.rows);
});

app.post("/api/pnl/personnel", authMiddleware, async (req, res) => {
  const { entryDate, branch = 'Genel', personName, position = null, salary = 0, bonus = 0, deduction = 0, source = 'Manuel', monthName, yearValue } = req.body || {};
  const totalCost = Number(salary) + Number(bonus) - Number(deduction);
  const inserted = await pool.query(
    `INSERT INTO pnl_personnel(entry_date,branch,person_name,position,salary,bonus,deduction,total_cost,source,month_name,year_value,created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [entryDate, branch, personName, position, Number(salary), Number(bonus), Number(deduction), totalCost, source, monthName, Number(yearValue), req.user.id]
  );
  res.status(201).json(inserted.rows[0]);
});

app.put("/api/pnl/personnel/:id", authMiddleware, async (req, res) => {
  const { entryDate, branch, personName, position, salary = 0, bonus = 0, deduction = 0, monthName, yearValue } = req.body || {};
  const sourceCheck = await pool.query("SELECT source FROM pnl_personnel WHERE id=$1", [req.params.id]);
  if (sourceCheck.rowCount === 0) return res.status(404).json({ message: "Kayıt bulunamadı." });
  if (sourceCheck.rows[0].source === "Excel") {
    return res.status(403).json({ message: "Excel kayıtları kilitlidir. 'Kopyala ve Düzenle' kullanın." });
  }
  const totalCost = Number(salary) + Number(bonus) - Number(deduction);
  const updated = await pool.query(
    `UPDATE pnl_personnel SET entry_date=$1,branch=$2,person_name=$3,position=$4,salary=$5,bonus=$6,deduction=$7,total_cost=$8,month_name=$9,year_value=$10
     WHERE id=$11 RETURNING *`,
    [entryDate, branch, personName, position, Number(salary), Number(bonus), Number(deduction), totalCost, monthName, Number(yearValue), req.params.id]
  );
  if (updated.rowCount === 0) return res.status(404).json({ message: "Kayıt bulunamadı." });
  res.json(updated.rows[0]);
});

app.delete("/api/pnl/personnel/:id", authMiddleware, async (req, res) => {
  const sourceCheck = await pool.query("SELECT source FROM pnl_personnel WHERE id=$1", [req.params.id]);
  if (sourceCheck.rowCount === 0) return res.status(404).json({ message: "Kayıt bulunamadı." });
  if (sourceCheck.rows[0].source === "Excel") {
    return res.status(403).json({ message: "Excel kayıtları kilitlidir. Önce kopyalayın." });
  }
  await pool.query("DELETE FROM pnl_personnel WHERE id=$1", [req.params.id]);
  res.status(204).send();
});

// =====================================================
// PnL - Özet & Aylık Rapor
// =====================================================
app.get("/api/pnl/summary", authMiddleware, async (req, res) => {
  const { month, year, branch } = req.query;
  const buildWhere = (prefix) => {
    const conds = [];
    const params = [];
    if (month) { params.push(month); conds.push(`month_name=$${params.length}`); }
    if (year) { params.push(Number(year)); conds.push(`year_value=$${params.length}`); }
    if (branch && branch !== 'all') { params.push(branch); conds.push(`branch=$${params.length}`); }
    return { where: conds.length ? ' WHERE ' + conds.join(' AND ') : '', params };
  };
  const { where, params } = buildWhere();
  const [revRes, expRes, perRes, catRes] = await Promise.all([
    pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM pnl_revenues${where}`, params),
    pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM pnl_expenses${where}`, params),
    pool.query(`SELECT COALESCE(SUM(total_cost),0) AS total FROM pnl_personnel${where}`, params),
    pool.query(`SELECT category, COALESCE(SUM(amount),0) AS total FROM pnl_expenses${where} GROUP BY category ORDER BY total DESC`, params),
  ]);
  const totalRevenue = Number(revRes.rows[0].total);
  const totalExpensesOnly = Number(expRes.rows[0].total);
  const totalPersonnel = Number(perRes.rows[0].total);
  const totalExpense = totalExpensesOnly + totalPersonnel;
  const netProfit = totalRevenue - totalExpense;
  const profitMargin = totalRevenue > 0 ? netProfit / totalRevenue * 100 : 0;
  const expenseRatio = totalRevenue > 0 ? totalExpense / totalRevenue * 100 : 0;
  const personnelRatio = totalRevenue > 0 ? totalPersonnel / totalRevenue * 100 : 0;
  const foodExpense = catRes.rows.find(r => r.category === 'Gıda')?.total || 0;
  const foodRatio = totalRevenue > 0 ? Number(foodExpense) / totalRevenue * 100 : 0;
  res.json({
    totalRevenue,
    totalExpense,
    totalPersonnel,
    netProfit,
    profitMargin: +profitMargin.toFixed(2),
    expenseRatio: +expenseRatio.toFixed(2),
    personnelRatio: +personnelRatio.toFixed(2),
    foodRatio: +foodRatio.toFixed(2),
    expenseByCategory: catRes.rows.map(r => ({ category: r.category, total: Number(r.total) })),
  });
});

app.get("/api/pnl/monthly-summaries", authMiddleware, async (req, res) => {
  const monthOrder = `CASE month_name WHEN 'OCAK' THEN 1 WHEN 'ŞUBAT' THEN 2 WHEN 'MART' THEN 3 WHEN 'NİSAN' THEN 4 WHEN 'MAYIS' THEN 5 WHEN 'HAZİRAN' THEN 6 WHEN 'TEMMUZ' THEN 7 WHEN 'AĞUSTOS' THEN 8 WHEN 'EYLÜL' THEN 9 WHEN 'EKİM' THEN 10 WHEN 'KASIM' THEN 11 WHEN 'ARALIK' THEN 12 ELSE 99 END`;
  const months = await pool.query(`
    SELECT DISTINCT month_name, year_value FROM (
      SELECT month_name, year_value FROM pnl_revenues
      UNION SELECT month_name, year_value FROM pnl_expenses
      UNION SELECT month_name, year_value FROM pnl_personnel
    ) t ORDER BY year_value DESC, ${monthOrder} DESC
  `);
  const result = [];
  for (const m of months.rows) {
    const [r, e, p] = await Promise.all([
      pool.query('SELECT COALESCE(SUM(amount),0) AS t FROM pnl_revenues WHERE month_name=$1 AND year_value=$2', [m.month_name, m.year_value]),
      pool.query('SELECT COALESCE(SUM(amount),0) AS t FROM pnl_expenses WHERE month_name=$1 AND year_value=$2', [m.month_name, m.year_value]),
      pool.query('SELECT COALESCE(SUM(total_cost),0) AS t FROM pnl_personnel WHERE month_name=$1 AND year_value=$2', [m.month_name, m.year_value]),
    ]);
    const rev = Number(r.rows[0].t);
    const exp = Number(e.rows[0].t) + Number(p.rows[0].t);
    const net = rev - exp;
    result.push({
      monthName: m.month_name, yearValue: m.year_value,
      revenue: rev, expense: exp, netProfit: net,
      profitMargin: rev > 0 ? +(net / rev * 100).toFixed(2) : 0,
    });
  }
  res.json(result);
});

// =====================================================
// PnL - Başlık Eşleştirme (Field Mappings)
// =====================================================
app.get("/api/pnl/mappings", authMiddleware, async (req, res) => {
  const rows = await pool.query("SELECT * FROM pnl_field_mappings ORDER BY source_header ASC");
  res.json(rows.rows);
});

app.post("/api/pnl/mappings", authMiddleware, async (req, res) => {
  const { sourceHeader, mappedCategory, mappedType = 'expense' } = req.body || {};
  const upserted = await pool.query(
    `INSERT INTO pnl_field_mappings(source_header,mapped_category,mapped_type)
     VALUES($1,$2,$3)
     ON CONFLICT(source_header) DO UPDATE SET mapped_category=EXCLUDED.mapped_category, mapped_type=EXCLUDED.mapped_type
     RETURNING *`,
    [String(sourceHeader).trim(), mappedCategory, mappedType]
  );
  res.status(201).json(upserted.rows[0]);
});

// =====================================================
// PnL - Excel İçe Aktarma (Preview + Confirm)
// =====================================================
const PNL_BUILTIN_MAPPINGS = {
  "satışlar": { category: "Satış", type: "revenue" },
  "aylık toplam ciro": { category: "Satış", type: "revenue" },
  "ciro": { category: "Satış", type: "revenue" },
  "gelir": { category: "Satış", type: "revenue" },
  "gıda": { category: "Gıda", type: "expense" },
  "food cost": { category: "Gıda", type: "expense" },
  "malzeme": { category: "Gıda", type: "expense" },
  "personel": { category: "Personel", type: "expense" },
  "maaş": { category: "Personel", type: "expense" },
  "kira": { category: "Kira", type: "expense" },
  "aidat": { category: "Kira", type: "expense" },
  "elektrik": { category: "Elektrik", type: "expense" },
  "su": { category: "Su", type: "expense" },
  "doğalgaz": { category: "Doğalgaz", type: "expense" },
  "dogalgaz": { category: "Doğalgaz", type: "expense" },
  "pos komisyon": { category: "POS Komisyon", type: "expense" },
  "pos": { category: "POS Komisyon", type: "expense" },
  "paket servis": { category: "Paket Servis", type: "expense" },
  "vergi": { category: "Vergi", type: "expense" },
  "devir sayım": { category: "Devir Sayım / Stok Farkı", type: "expense" },
  "stok": { category: "Devir Sayım / Stok Farkı", type: "expense" },
  "diğer": { category: "Diğer", type: "expense" },
};

function resolveMapping(header, savedMappings) {
  const lc = String(header).toLowerCase("tr-TR").trim();
  if (PNL_BUILTIN_MAPPINGS[lc]) return PNL_BUILTIN_MAPPINGS[lc];
  for (const [key, val] of Object.entries(PNL_BUILTIN_MAPPINGS)) {
    if (lc.includes(key)) return val;
  }
  const saved = savedMappings.find(m => m.source_header.toLowerCase() === lc);
  if (saved) return { category: saved.mapped_category, type: saved.mapped_type };
  return null;
}

app.post("/api/pnl/import-preview", authMiddleware, upload.single("excelFile"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "Dosya yüklenmedi." });
  const workbook = xlsx.readFile(req.file.path);
  const savedMappings = (await pool.query("SELECT * FROM pnl_field_mappings")).rows;
  const sheetResults = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rawRows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    const monthName = normalizeMonthName(sheetName);
    const recognized = [];
    const unmapped = [];

    for (const row of rawRows) {
      if (!Array.isArray(row)) continue;
      const label = String(row[1] || row[0] || "").trim();
      if (!label) continue;
      const amount = pickNumeric(row[2] ?? row[1]);
      if (amount === null || amount === 0) continue;
      const mapping = resolveMapping(label, savedMappings);
      if (mapping) {
        recognized.push({ label, amount, category: mapping.category, type: mapping.type, monthName });
      } else {
        unmapped.push({ label, amount, monthName, suggestedCategory: "Diğer" });
      }
    }
    if (recognized.length > 0 || unmapped.length > 0) {
      sheetResults.push({ sheetName, monthName, recognized, unmapped });
    }
  }
  res.json({ sheetResults, fileName: req.file.originalname });
});

app.post("/api/pnl/import-confirm", authMiddleware, async (req, res) => {
  const { rows, year = new Date().getFullYear(), branch = 'Genel', mappingsToSave = [] } = req.body || {};
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ message: "İçe aktarılacak satır bulunamadı." });
  }

  // Save new mappings
  for (const m of mappingsToSave) {
    if (!m?.label || !m?.category || m.category === "Atla") continue;
    await pool.query(
      `INSERT INTO pnl_field_mappings(source_header,mapped_category,mapped_type)
       VALUES($1,$2,$3)
       ON CONFLICT(source_header) DO UPDATE SET mapped_category=EXCLUDED.mapped_category, mapped_type=EXCLUDED.mapped_type`,
      [m.label, m.category, m.type || 'expense']
    ).catch(() => {});
  }

  let importedCount = 0;
  const today = new Date().toISOString().split('T')[0];
  for (const row of rows) {
    const entryDate = row.entryDate || today;
    const monthName = row.monthName || 'BİLİNMEYEN';
    const amount = Number(row.amount || 0);
    if (row.category === "Atla") continue;
    if (amount <= 0) continue;

    if (row.type === 'revenue') {
      await pool.query(
        `INSERT INTO pnl_revenues(entry_date,branch,revenue_type,description,amount,source,month_name,year_value,created_by)
         VALUES($1,$2,$3,$4,$5,'Excel',$6,$7,$8)`,
        [entryDate, branch, row.category || 'Satış', row.label, amount, monthName, Number(year), req.user.id]
      );
    } else {
      await pool.query(
        `INSERT INTO pnl_expenses(entry_date,branch,category,description,amount,source,month_name,year_value,created_by)
         VALUES($1,$2,$3,$4,$5,'Excel',$6,$7,$8)`,
        [entryDate, branch, row.category || 'Diğer', row.label, amount, monthName, Number(year), req.user.id]
      );
    }
    importedCount++;
  }
  res.json({ message: `${importedCount} kayıt başarıyla içe aktarıldı.`, importedCount });
});

// =====================================================
// PnL - Legacy (eski özet listesi, geriye dönük uyum)
// =====================================================
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

app.post("/api/investors/import", authMiddleware, upload.single("excelFile"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "Dosya yüklenmedi." });
  const workbook = xlsx.readFile(req.file.path);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = xlsx.utils.sheet_to_json(sheet);
  
  const imported = [];
  for (const row of data) {
    const inserted = await pool.query(
      `INSERT INTO investors(name,budget,city,sector,investment_type,pipeline_stage,phone,email,district,goal,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        row.Ad || row.Name || row.name || "İsimsiz",
        Number(row.Bütçe || row.Budget || 0),
        row.Şehir || row.City || "Belirtilmemiş",
        row.Sektör || row.Sector || "Genel",
        row.Tip || row.Type || "Franchise",
        row.Pipeline || "Yeni Lead",
        row.Telefon || row.Phone || "",
        row.Email || "",
        row.İlçe || row.District || "",
        row.Hedef || row.Goal || "",
        req.user.id
      ]
    );
    imported.push(inserted.rows[0]);
  }
  res.json({ message: `${imported.length} yatırımcı başarıyla aktarıldı.`, imported });
});

app.post("/api/brands/import", authMiddleware, upload.single("excelFile"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "Dosya yüklenmedi." });
  const workbook = xlsx.readFile(req.file.path);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = xlsx.utils.sheet_to_json(sheet);
  
  const imported = [];
  for (const row of data) {
    const inserted = await pool.query(
      `INSERT INTO brands(name,sector,min_budget,max_budget,currency,min_sqm,max_sqm,target_locations,active,created_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW()) RETURNING *`,
      [
        row.Marka || row.Name || "İsimsiz Marka",
        row.Sektör || row.Sector || "Genel",
        Number(row.MinButce || 0),
        Number(row.MaxButce || 0),
        row.ParaBirimi || "TRY",
        Number(row.MinSqm || 0),
        Number(row.MaxSqm || 0),
        row.Lokasyonlar || "",
        true
      ]
    );
    imported.push(inserted.rows[0]);
  }
  res.json({ message: `${imported.length} marka başarıyla aktarıldı.`, imported });
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

  const invRem = await investorReminders();
  res.json({
    activeInvestors: leadCount.rows[0].value,
    activeProjects: projectCount.rows[0].value,
    openTasks: taskCount.rows[0].value,
    strongMatches: winCount.rows[0].value,
    financeCount: financeCount.rows[0].value,
    investorFollowUps: invRem.followUpDue,
    investorStaleHot: invRem.staleHot,
  });
});


app.get("/api/templates", authMiddleware, async (req, res) => {
  const rows = await pool.query("SELECT * FROM message_templates ORDER BY id DESC");
  res.json(rows.rows);
});

app.post("/api/templates", authMiddleware, async (req, res) => {
  const { channel, eventName, title, body, active, imageUrl = null } = req.body || {};
  const inserted = await pool.query(
    `INSERT INTO message_templates(channel,event_name,title,body,active,image_url)
     VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
    [channel, eventName, title, body, active, imageUrl],
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
  const { channel, eventName, title, body, active, imageUrl = null } = req.body || {};
  const before = await pool.query("SELECT * FROM message_templates WHERE id=$1", [req.params.id]);
  const updated = await pool.query(
    `UPDATE message_templates
     SET channel=$1,event_name=$2,title=$3,body=$4,active=$5,image_url=$6,updated_at=NOW()
     WHERE id=$7 RETURNING *`,
    [channel, eventName, title, body, active, imageUrl, req.params.id],
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

app.get("/api/settings", authMiddleware, requireAdmin, async (req, res) => {
  const rows = await pool.query("SELECT setting_key, setting_value FROM app_settings ORDER BY setting_key ASC");
  const payload = {};
  for (const row of rows.rows) payload[row.setting_key] = row.setting_value;
  res.json(payload);
});

app.put("/api/settings", authMiddleware, requireAdmin, async (req, res) => {
  const settings = req.body || {};
  const keys = Object.keys(settings);
  for (const key of keys) {
    await pool.query(
      `INSERT INTO app_settings(setting_key,setting_value,updated_by,updated_at)
       VALUES($1,$2::jsonb,$3,NOW())
       ON CONFLICT (setting_key)
       DO UPDATE SET setting_value=EXCLUDED.setting_value, updated_by=EXCLUDED.updated_by, updated_at=NOW()`,
      [key, JSON.stringify(settings[key] || {}), req.user.id],
    );
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
