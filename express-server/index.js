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
    city: row.city || "",
    district: row.district || "",
    region: row.region || "",
    avenueName: row.avenue_name || "",
    mapsLink: row.maps_link || "",
    segment: row.segment || "",
    storefrontLength: row.storefront_length != null ? Number(row.storefront_length) : null,
    floorInfo: row.floor_info || "",
    chimneyStatus: row.chimney_status || "",
    infrastructureStatus: row.infrastructure_status || "",
    revenueRentPct: row.revenue_rent_pct != null ? Number(row.revenue_rent_pct) : null,
    dues: row.dues != null ? Number(row.dues) : null,
    deposit: row.deposit != null ? Number(row.deposit) : null,
    footfallScore: row.footfall_score != null ? Number(row.footfall_score) : null,
    competitorBrands: row.competitor_brands || "",
    targetCustomerProfile: row.target_customer_profile || "",
    suitableSectors: row.suitable_sectors || "",
    status: row.status || "Boş",
    brandFitScore: row.brand_fit_score != null ? Number(row.brand_fit_score) : null,
    streetClass: row.street_class || "",
    avmSegment: row.avm_segment || "",
    files: row.files || [],
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
    locationId: row.location_id || null,
    estimatedInvestment: row.estimated_investment != null ? Number(row.estimated_investment) : null,
    estimatedRevenue: row.estimated_revenue != null ? Number(row.estimated_revenue) : null,
    ownerPerson: row.owner_person || "",
    startDate: row.start_date || null,
    closeDate: row.close_date || null,
    riskLevel: row.risk_level || "",
    pipelineStage: row.pipeline_stage || row.stage || "",
    files: row.files || [],
  };
}

function mapTask(row) {
  return {
    id: row.id,
    title: row.title || row.note || "",
    note: row.note || row.title || "",
    description: row.description || "",
    status: row.status || "Açık",
    assigneeId: row.assignee_id || null,
    assigneeName: row.assignee_name || "",
    priority: row.priority || "Orta",
    dueDate: row.due_date ? String(row.due_date).split("T")[0] : null,
    investorId: row.investor_id || null,
    brandId: row.brand_id || null,
    projectId: row.project_id || null,
    locationId: row.location_id || null,
    contractId: row.contract_id || null,
    moduleType: row.module_type || "Genel",
    tags: row.tags || [],
    completedAt: row.completed_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    // joined fields
    investorName: row.investor_name || null,
    brandName: row.brand_name || null,
    projectName: row.project_name || null,
    locationName: row.location_name || null,
    contractName: row.contract_name || null,
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
    name: row.name || row.note || `Sözleşme #${row.id}`,
    note: row.note || "",
    type: row.contract_type || "",
    status: row.status || "Taslak",
    counterparty: row.counterparty || "",
    startDate: row.start_date ? String(row.start_date).split("T")[0] : null,
    endDate: row.end_date ? String(row.end_date).split("T")[0] : null,
    signDate: row.sign_date ? String(row.sign_date).split("T")[0] : null,
    renewalDate: row.renewal_date ? String(row.renewal_date).split("T")[0] : null,
    amount: row.amount ? Number(row.amount) : 0,
    consultingFee: row.consulting_fee ? Number(row.consulting_fee) : 0,
    franchiseCommission: row.franchise_commission ? Number(row.franchise_commission) : 0,
    franchiseCommissionPct: row.franchise_commission_pct ? Number(row.franchise_commission_pct) : 0,
    locationCommission: row.location_commission ? Number(row.location_commission) : 0,
    extraIncome: row.extra_income || "",
    currency: row.currency || "TRY",
    fileName: row.file_name || "",
    fileData: row.file_data || "",
    fileUrl: row.file_url || "",
    fileMimeType: row.file_mime_type || "",
    docsUrls: row.docs_urls || [],
    investorId: row.investor_id || null,
    brandId: row.brand_id || null,
    projectId: row.project_id || null,
    locationId: row.location_id || null,
    consultantName: row.consultant_name || "",
    legalPerson: row.legal_person || "",
    financePerson: row.finance_person || "",
    riskLevel: row.risk_level || "",
    riskNote: row.risk_note || "",
    notes: row.notes || "",
    createdBy: row.created_by || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // joined fields
    investorName: row.investor_name || "",
    brandName: row.brand_name || "",
    projectName: row.project_name || "",
    locationName: row.location_name || "",
  };
}

function mapFinanceRecord(row) {
  return {
    id: row.id,
    contractId: row.contract_id || null,
    projectId: row.project_id || null,
    investorId: row.investor_id || null,
    brandId: row.brand_id || null,
    incomeType: row.income_type || "Danışmanlık",
    amount: Number(row.amount || 0),
    vatPct: Number(row.vat_pct || 0),
    vatAmount: Number(row.vat_amount || 0),
    netAmount: Number(row.net_amount || 0),
    currency: row.currency || "TRY",
    description: row.description || "",
    paymentType: row.payment_type || "Peşin",
    status: row.status || "Açık",
    consultantCommissionPct: row.consultant_commission_pct != null ? Number(row.consultant_commission_pct) : null,
    companySharePct: row.company_share_pct != null ? Number(row.company_share_pct) : null,
    dueDate: row.due_date ? String(row.due_date).split("T")[0] : null,
    paidDate: row.paid_date ? String(row.paid_date).split("T")[0] : null,
    paymentMethod: row.payment_method || "",
    createdAt: row.created_at,
    // joined
    contractName: row.contract_name || "",
    investorName: row.investor_name || "",
    brandName: row.brand_name || "",
  };
}

function mapPaymentPlan(row) {
  return {
    id: row.id,
    financeRecordId: row.finance_record_id,
    taksitNo: Number(row.taksit_no || 1),
    amount: Number(row.amount || 0),
    dueDate: row.due_date ? String(row.due_date).split("T")[0] : null,
    paidDate: row.paid_date ? String(row.paid_date).split("T")[0] : null,
    status: row.status || "Bekliyor",
    paymentMethod: row.payment_method || "",
    note: row.note || "",
  };
}

function mapExpense(row) {
  return {
    id: row.id,
    contractId: row.contract_id || null,
    projectId: row.project_id || null,
    expenseType: row.expense_type || "Operasyon",
    amount: Number(row.amount || 0),
    currency: row.currency || "TRY",
    expenseDate: row.expense_date ? String(row.expense_date).split("T")[0] : null,
    description: row.description || "",
    createdAt: row.created_at,
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
  await pool.query("ALTER TABLE projects ADD COLUMN IF NOT EXISTS location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL");
  await pool.query("ALTER TABLE projects ADD COLUMN IF NOT EXISTS estimated_investment BIGINT");
  await pool.query("ALTER TABLE projects ADD COLUMN IF NOT EXISTS estimated_revenue BIGINT");
  await pool.query("ALTER TABLE projects ADD COLUMN IF NOT EXISTS owner_person TEXT");
  await pool.query("ALTER TABLE projects ADD COLUMN IF NOT EXISTS start_date DATE");
  await pool.query("ALTER TABLE projects ADD COLUMN IF NOT EXISTS close_date DATE");
  await pool.query("ALTER TABLE projects ADD COLUMN IF NOT EXISTS risk_level TEXT");
  await pool.query("ALTER TABLE projects ADD COLUMN IF NOT EXISTS pipeline_stage TEXT");
  await pool.query("ALTER TABLE projects ADD COLUMN IF NOT EXISTS files TEXT[] NOT NULL DEFAULT '{}'");
  await pool.query("ALTER TABLE contracts ADD COLUMN IF NOT EXISTS contract_type TEXT");
  await pool.query("ALTER TABLE contracts ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Taslak'");
  await pool.query("ALTER TABLE contracts ADD COLUMN IF NOT EXISTS counterparty TEXT");
  await pool.query("ALTER TABLE contracts ADD COLUMN IF NOT EXISTS start_date DATE");
  await pool.query("ALTER TABLE contracts ADD COLUMN IF NOT EXISTS end_date DATE");
  await pool.query("ALTER TABLE contracts ADD COLUMN IF NOT EXISTS sign_date DATE");
  await pool.query("ALTER TABLE contracts ADD COLUMN IF NOT EXISTS renewal_date DATE");
  await pool.query("ALTER TABLE contracts ADD COLUMN IF NOT EXISTS amount BIGINT");
  await pool.query("ALTER TABLE contracts ADD COLUMN IF NOT EXISTS consulting_fee BIGINT");
  await pool.query("ALTER TABLE contracts ADD COLUMN IF NOT EXISTS franchise_commission BIGINT");
  await pool.query("ALTER TABLE contracts ADD COLUMN IF NOT EXISTS franchise_commission_pct NUMERIC(6,2)");
  await pool.query("ALTER TABLE contracts ADD COLUMN IF NOT EXISTS location_commission BIGINT");
  await pool.query("ALTER TABLE contracts ADD COLUMN IF NOT EXISTS extra_income TEXT");
  await pool.query("ALTER TABLE contracts ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'TRY'");
  await pool.query("ALTER TABLE contracts ADD COLUMN IF NOT EXISTS file_name TEXT");
  await pool.query("ALTER TABLE contracts ADD COLUMN IF NOT EXISTS file_data TEXT");
  await pool.query("ALTER TABLE contracts ADD COLUMN IF NOT EXISTS file_url TEXT");
  await pool.query("ALTER TABLE contracts ADD COLUMN IF NOT EXISTS file_mime_type TEXT");
  await pool.query("ALTER TABLE contracts ADD COLUMN IF NOT EXISTS docs_urls TEXT[] NOT NULL DEFAULT '{}'");
  await pool.query("ALTER TABLE contracts ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL");
  await pool.query("ALTER TABLE contracts ADD COLUMN IF NOT EXISTS location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL");
  await pool.query("ALTER TABLE contracts ADD COLUMN IF NOT EXISTS consultant_name TEXT");
  await pool.query("ALTER TABLE contracts ADD COLUMN IF NOT EXISTS legal_person TEXT");
  await pool.query("ALTER TABLE contracts ADD COLUMN IF NOT EXISTS finance_person TEXT");
  await pool.query("ALTER TABLE contracts ADD COLUMN IF NOT EXISTS risk_level TEXT");
  await pool.query("ALTER TABLE contracts ADD COLUMN IF NOT EXISTS risk_note TEXT");
  await pool.query("ALTER TABLE contracts ADD COLUMN IF NOT EXISTS notes TEXT");
  await pool.query("ALTER TABLE contracts ADD COLUMN IF NOT EXISTS name TEXT");
  await pool.query("UPDATE contracts SET name=COALESCE(note,'Sözleşme '||id::text) WHERE name IS NULL");
  await pool.query("ALTER TABLE contracts ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL");
  await pool.query(`CREATE TABLE IF NOT EXISTS finance_records (
    id SERIAL PRIMARY KEY,
    contract_id INTEGER REFERENCES contracts(id) ON DELETE SET NULL,
    project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    investor_id INTEGER REFERENCES investors(id) ON DELETE SET NULL,
    brand_id INTEGER REFERENCES brands(id) ON DELETE SET NULL,
    income_type TEXT NOT NULL DEFAULT 'Danışmanlık',
    amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    vat_pct NUMERIC(6,2) NOT NULL DEFAULT 0,
    vat_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    net_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'TRY',
    description TEXT,
    payment_type TEXT NOT NULL DEFAULT 'Peşin',
    status TEXT NOT NULL DEFAULT 'Açık',
    consultant_commission_pct NUMERIC(6,2),
    company_share_pct NUMERIC(6,2),
    due_date DATE,
    paid_date DATE,
    payment_method TEXT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS payment_plans (
    id SERIAL PRIMARY KEY,
    finance_record_id INTEGER NOT NULL REFERENCES finance_records(id) ON DELETE CASCADE,
    taksit_no INTEGER NOT NULL DEFAULT 1,
    amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    due_date DATE NOT NULL,
    paid_date DATE,
    status TEXT NOT NULL DEFAULT 'Bekliyor',
    payment_method TEXT,
    note TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS finance_expenses (
    id SERIAL PRIMARY KEY,
    contract_id INTEGER REFERENCES contracts(id) ON DELETE SET NULL,
    project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    expense_type TEXT NOT NULL DEFAULT 'Operasyon',
    amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'TRY',
    expense_date DATE NOT NULL,
    description TEXT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);
  await pool.query("ALTER TABLE locations ADD COLUMN IF NOT EXISTS address TEXT");
  await pool.query("ALTER TABLE locations ADD COLUMN IF NOT EXISTS traffic TEXT");
  await pool.query("ALTER TABLE locations ADD COLUMN IF NOT EXISTS owner TEXT");
  await pool.query("ALTER TABLE locations ADD COLUMN IF NOT EXISTS owner_phone TEXT");
  await pool.query("ALTER TABLE locations ADD COLUMN IF NOT EXISTS city TEXT");
  await pool.query("ALTER TABLE locations ADD COLUMN IF NOT EXISTS district TEXT");
  await pool.query("ALTER TABLE locations ADD COLUMN IF NOT EXISTS region TEXT");
  await pool.query("ALTER TABLE locations ADD COLUMN IF NOT EXISTS avenue_name TEXT");
  await pool.query("ALTER TABLE locations ADD COLUMN IF NOT EXISTS maps_link TEXT");
  await pool.query("ALTER TABLE locations ADD COLUMN IF NOT EXISTS segment TEXT");
  await pool.query("ALTER TABLE locations ADD COLUMN IF NOT EXISTS storefront_length NUMERIC(10,2)");
  await pool.query("ALTER TABLE locations ADD COLUMN IF NOT EXISTS floor_info TEXT");
  await pool.query("ALTER TABLE locations ADD COLUMN IF NOT EXISTS chimney_status TEXT");
  await pool.query("ALTER TABLE locations ADD COLUMN IF NOT EXISTS infrastructure_status TEXT");
  await pool.query("ALTER TABLE locations ADD COLUMN IF NOT EXISTS revenue_rent_pct NUMERIC(6,2)");
  await pool.query("ALTER TABLE locations ADD COLUMN IF NOT EXISTS dues BIGINT");
  await pool.query("ALTER TABLE locations ADD COLUMN IF NOT EXISTS deposit BIGINT");
  await pool.query("ALTER TABLE locations ADD COLUMN IF NOT EXISTS footfall_score INTEGER");
  await pool.query("ALTER TABLE locations ADD COLUMN IF NOT EXISTS competitor_brands TEXT");
  await pool.query("ALTER TABLE locations ADD COLUMN IF NOT EXISTS target_customer_profile TEXT");
  await pool.query("ALTER TABLE locations ADD COLUMN IF NOT EXISTS suitable_sectors TEXT");
  await pool.query("ALTER TABLE locations ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Boş'");
  await pool.query("ALTER TABLE locations ADD COLUMN IF NOT EXISTS brand_fit_score INTEGER");
  await pool.query("ALTER TABLE locations ADD COLUMN IF NOT EXISTS street_class TEXT");
  await pool.query("ALTER TABLE locations ADD COLUMN IF NOT EXISTS avm_segment TEXT");
  await pool.query("ALTER TABLE locations ADD COLUMN IF NOT EXISTS files TEXT[] NOT NULL DEFAULT '{}'");
  await pool.query("ALTER TABLE locations ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL");
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

  // Extended task columns for full task management
  await pool.query("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS title TEXT");
  await pool.query("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS description TEXT");
  await pool.query("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS module_type TEXT NOT NULL DEFAULT 'Genel'");
  await pool.query("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL");
  await pool.query("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL");
  await pool.query("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS contract_id INTEGER REFERENCES contracts(id) ON DELETE SET NULL");
  await pool.query("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}'");
  await pool.query("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP");
  await pool.query("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()");

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

  let adminId;
  const existingUser = await pool.query("SELECT id FROM users WHERE email = $1", [adminEmail]);
  if (existingUser.rowCount === 0) {
    const hash = await bcrypt.hash(adminPassword, 10);
    const inserted = await pool.query(
      "INSERT INTO users(name, email, password_hash, role) VALUES($1, $2, $3, $4) RETURNING id",
      [adminName, adminEmail, hash, "admin"],
    );
    adminId = inserted.rows[0].id;
  } else {
    adminId = existingUser.rows[0].id;
  }

  // ── TEAM MEMBERS ──────────────────────────────────────────────
  const teamCount = await pool.query("SELECT COUNT(*)::int AS count FROM team_members");
  if (teamCount.rows[0].count === 0) {
    await pool.query(`
      INSERT INTO team_members(name,email,phone,department,role_name,permissions,active) VALUES
      ('Selin Demir','selin@micore.com','+90 544 222 33 44','Franchise','Yönetici',ARRAY['investors','brands','locations','projects','contracts','tasks','reports'],true),
      ('Mert Kaya','mert@micore.com','+90 541 310 22 11','Operasyon','Uzman',ARRAY['tasks','projects','locations'],true),
      ('Ayşe Çetin','ayse@micore.com','+90 533 118 88 70','Satış','Temsilci',ARRAY['investors','tasks','reports'],true),
      ('Burak Yılmaz','burak@micore.com','+90 532 999 88 77','Hukuk','Avukat',ARRAY['contracts','reports'],true),
      ('Esra Koç','esra@micore.com','+90 505 444 33 22','Finans','Muhasebeci',ARRAY['contracts','reports'],true),
      ('Kemal Erdoğan','kemal@micore.com','+90 530 888 77 66','Pazarlama','Uzman',ARRAY['investors','brands','reports'],true)
    `);
  }

  // ── BRANDS ──────────────────────────────────────────────────────
  const brandIds = {};
  const brandRows = [
    { name:"Blak Coffee Co", sector:"Coffee", minB:1700000, maxB:3600000, minS:90, maxS:180, target:"Cadde + AVM", agr:"Anlaşmalı", fee:250000, royalty:6.5, months:36, contact:"Hasan Bey", phone:"+90 212 100 20 30", email:"hasan@blakcoffee.com", scoreOp:85, scoreFit:90, scoreLoc:80, scoreInv:88 },
    { name:"Tavada Tavuk", sector:"Fast Casual", minB:1500000, maxB:3500000, minS:90, maxS:220, target:"AVM + Cadde", agr:"Anlaşmalı", fee:200000, royalty:5.0, months:48, contact:"Ali Kaya", phone:"+90 212 200 30 40", email:"ali@tavadatavuk.com", scoreOp:80, scoreFit:85, scoreLoc:75, scoreInv:82 },
    { name:"SushiMore", sector:"Japon", minB:1800000, maxB:4200000, minS:100, maxS:250, target:"AVM + Premium Cadde", agr:"Görüşülüyor", fee:300000, royalty:7.0, months:36, contact:"Selin Hanım", phone:"+90 212 300 40 50", email:"selin@sushimore.com", scoreOp:75, scoreFit:80, scoreLoc:90, scoreInv:78 },
    { name:"Kasap Döner", sector:"Doner", minB:1200000, maxB:2600000, minS:65, maxS:150, target:"Cadde", agr:"Anlaşmalı", fee:150000, royalty:4.5, months:24, contact:"Mehmet Usta", phone:"+90 532 400 50 60", email:"info@kasapdoner.com", scoreOp:82, scoreFit:78, scoreLoc:70, scoreInv:80 },
    { name:"The Coffee Factory", sector:"Coffee", minB:1400000, maxB:3300000, minS:80, maxS:170, target:"AVM", agr:"Anlaşmalı", fee:220000, royalty:6.0, months:36, contact:"Zeynep Hanım", phone:"+90 212 500 60 70", email:"zeynep@coffeefactory.com", scoreOp:78, scoreFit:82, scoreLoc:85, scoreInv:79 },
    { name:"Yelken Balıkçısı", sector:"Seafood", minB:2000000, maxB:5000000, minS:140, maxS:350, target:"Sahil + Premium Cadde", agr:"Anlaşmalı", fee:400000, royalty:8.0, months:60, contact:"Yılmaz Bey", phone:"+90 242 600 70 80", email:"yilmaz@yelken.com", scoreOp:72, scoreFit:75, scoreLoc:88, scoreInv:74 },
    { name:"Bigye", sector:"Fast Casual", minB:1300000, maxB:2900000, minS:70, maxS:180, target:"AVM", agr:"Görüşülüyor", fee:180000, royalty:5.5, months:36, contact:"Can Bey", phone:"+90 212 700 80 90", email:"can@bigye.com", scoreOp:70, scoreFit:72, scoreLoc:68, scoreInv:73 },
    { name:"Mogaf Döner", sector:"Doner", minB:1100000, maxB:2100000, minS:50, maxS:120, target:"Cadde + Mahalle", agr:"Görüşülüyor", fee:130000, royalty:4.0, months:24, contact:"Cengiz Bey", phone:"+90 544 800 90 00", email:"cengiz@mogaf.com", scoreOp:68, scoreFit:70, scoreLoc:65, scoreInv:70 },
    { name:"Cajun Corner", sector:"Fast Casual", minB:1400000, maxB:3100000, minS:80, maxS:170, target:"AVM + Cadde", agr:"Görüşülüyor", fee:190000, royalty:5.5, months:36, contact:"Leyla Hanım", phone:"+90 532 900 10 20", email:"leyla@cajun.com", scoreOp:73, scoreFit:75, scoreLoc:72, scoreInv:76 },
    { name:"Pasta Punto", sector:"Pastane", minB:1100000, maxB:2400000, minS:70, maxS:160, target:"Cadde + AVM", agr:"Anlaşmalı", fee:160000, royalty:5.0, months:36, contact:"Fatma Hanım", phone:"+90 212 010 20 30", email:"fatma@pastapunto.com", scoreOp:76, scoreFit:74, scoreLoc:78, scoreInv:77 },
    { name:"Pizza Pino", sector:"Fast Food", minB:900000, maxB:2200000, minS:60, maxS:140, target:"AVM + Cadde", agr:"Görüşülüyor", fee:120000, royalty:4.5, months:24, contact:"Orhan Bey", phone:"+90 212 020 30 40", email:"orhan@pizzapino.com", scoreOp:65, scoreFit:68, scoreLoc:62, scoreInv:66 },
    { name:"Fit Salad Bar", sector:"Sağlıklı Yaşam", minB:750000, maxB:1800000, minS:40, maxS:90, target:"AVM + Ofis Bölgesi", agr:"Beklemede", fee:90000, royalty:4.0, months:24, contact:"Ezgi Hanım", phone:"+90 533 030 40 50", email:"ezgi@fitsalad.com", scoreOp:72, scoreFit:70, scoreLoc:75, scoreInv:71 },
    { name:"Coffee in Munchies", sector:"Coffee", minB:1300000, maxB:2900000, minS:75, maxS:160, target:"Cadde + AVM", agr:"Beklemede", fee:200000, royalty:6.0, months:36, contact:"Berk Bey", phone:"+90 541 040 50 60", email:"berk@munchies.com", scoreOp:74, scoreFit:76, scoreLoc:80, scoreInv:75 },
    { name:"Türk Kahvesi Evi", sector:"Kahve", minB:600000, maxB:1400000, minS:30, maxS:70, target:"Her bölge", agr:"Görüşülüyor", fee:70000, royalty:3.5, months:24, contact:"Nesrin Hanım", phone:"+90 505 050 60 70", email:"nesrin@turkkahvesi.com", scoreOp:80, scoreFit:82, scoreLoc:85, scoreInv:83 },
    { name:"Springfield Yeni Nesil Dürüm", sector:"Doner", minB:1250000, maxB:2500000, minS:60, maxS:130, target:"Cadde", agr:"Beklemede", fee:140000, royalty:4.5, months:36, contact:"Tarık Bey", phone:"+90 532 060 70 80", email:"tarik@springfield.com", scoreOp:69, scoreFit:71, scoreLoc:67, scoreInv:70 },
  ];
  for (const b of brandRows) {
    const ex = await pool.query("SELECT id FROM brands WHERE name=$1", [b.name]);
    if (ex.rowCount > 0) { brandIds[b.name] = ex.rows[0].id; continue; }
    const r = await pool.query(`
      INSERT INTO brands(name,sector,min_budget,max_budget,min_sqm,max_sqm,target_locations,active,monthly_growth,
        agreement_status,franchise_fee,royalty_rate,contract_term_months,contact_person,contact_phone,email,
        gives_franchise,has_royalty,score_operation,score_franchise_fit,score_location_flex,score_investor_interest)
      VALUES($1,$2,$3,$4,$5,$6,$7,true,10,$8,$9,$10,$11,$12,$13,$14,true,true,$15,$16,$17,$18) RETURNING id`,
      [b.name,b.sector,b.minB,b.maxB,b.minS,b.maxS,b.target,b.agr,b.fee,b.royalty,b.months,b.contact,b.phone,b.email,b.scoreOp,b.scoreFit,b.scoreLoc,b.scoreInv]
    );
    brandIds[b.name] = r.rows[0].id;
  }

  // ── INVESTORS ──────────────────────────────────────────────────
  const investorIds = {};
  const invRows = [
    { name:"Ahmet Kılıç", budget:2600000, city:"İstanbul", sector:"Coffee", type:"Franchise", stage:"Marka Önerildi", phone:"+90 544 222 33 44", email:"ahmet@crm.com", district:"Kadıköy", goal:"2 şube coffee yatırımı", hist:"24.04 arandı, bilgi paketi gönderildi", notes:"AVM + cadde alternatifleri istiyor, mobilya konusunda tedarikçi arıyor", followup:"2026-05-20", prio:"Yüksek", targetType:"Cadde", inv_type:"Bireysel" },
    { name:"Yaman Holding", budget:4100000, city:"Ankara", sector:"Fast Casual", type:"Ortaklık", stage:"Teklif Verildi", phone:"+90 530 444 55 66", email:"yaman@demo.com", district:"Çankaya", goal:"Bölgesel büyüme, 5+ şube", hist:"26.04 toplantı, 02.05 teklif sunuldu", notes:"Sözleşme taslağı paylaşıldı. Hukuk departmanları inceliyor.", followup:"2026-05-20", prio:"Yüksek", targetType:"AVM", inv_type:"Kurumsal" },
    { name:"Melek Arslan", budget:1800000, city:"İzmir", sector:"Doner", type:"Franchise", stage:"İletişim Kuruldu", phone:"+90 533 111 22 33", email:"melek@demo.com", district:"Bornova", goal:"Tek mağaza başlangıcı", hist:"22.04 mesaj, 27.04 arama", notes:"Lokasyon arayışında, Forum Bornova ilgileniyor", followup:"2026-05-25", prio:"Orta", targetType:"AVM", inv_type:"Bireysel" },
    { name:"Can Teknoloji A.Ş.", budget:6500000, city:"İstanbul", sector:"Kahve", type:"Master Franchise", stage:"Sunum Yapıldı", phone:"+90 212 333 44 55", email:"can@demo.com", district:"Maslak", goal:"Çoklu şube planı, 10+ nokta", hist:"20.04 toplantı, 28.04 sunum yapıldı", notes:"Finansman sürecinde. Banka kredi onayı bekleniyor.", followup:"2026-05-22", prio:"Çok Yüksek", targetType:"Cadde + AVM", inv_type:"Kurumsal" },
    { name:"Fatma Şahin", budget:950000, city:"Bursa", sector:"Fast Food", type:"Franchise", stage:"Yeni Lead", phone:"+90 544 777 88 99", email:"fatma@demo.com", district:"Nilüfer", goal:"İlk yatırım deneyimi", hist:"25.04 web formu doldurdu", notes:"Ürün araştırıyor, kıyaslama yapıyor. Takip edilmeli.", followup:"2026-06-01", prio:"Düşük", targetType:"AVM", inv_type:"Bireysel" },
    { name:"Ömer Yıldız", budget:3200000, city:"Antalya", sector:"Sağlıklı Yaşam", type:"Franchise", stage:"Görüşme Yapıldı", phone:"+90 532 555 66 77", email:"omer@demo.com", district:"Lara", goal:"2-3 şube hedefi, turistik bölge", hist:"23.04 arama, 29.04 ofis ziyareti", notes:"AVM odaklı bakıyor, turistik bölge tercihi var", followup:"2026-05-28", prio:"Orta", targetType:"AVM", inv_type:"Bireysel" },
    { name:"Grup Doruk Yatırım", budget:8200000, city:"İstanbul", sector:"Fast Casual", type:"Master Franchise", stage:"Sözleşme Süreci", phone:"+90 212 666 77 88", email:"info@doruk.com", district:"Levent", goal:"Master franchise bölge hakları", hist:"15.04 ilk temas, 22.04 NDA imzalandı, 05.05 müzakere", notes:"Çok profesyonel firma. Hızlı karar veriyor. Kritik süreç.", followup:"2026-05-18", prio:"Çok Yüksek", targetType:"Her bölge", inv_type:"Kurumsal" },
    { name:"Deniz Acar", budget:2100000, city:"Ankara", sector:"Coffee", type:"Franchise", stage:"Marka Önerildi", phone:"+90 533 777 88 99", email:"deniz@demo.com", district:"Kızılay", goal:"Coffee konsept franchise", hist:"01.05 telefon görüşmesi", notes:"Blak Coffee Co önerisi iyi karşılandı", followup:"2026-05-30", prio:"Orta", targetType:"Cadde", inv_type:"Bireysel" },
    { name:"Kardeşler Gıda Ltd.", budget:1500000, city:"İzmir", sector:"Pastane", type:"Franchise", stage:"İletişim Kuruldu", phone:"+90 232 888 99 00", email:"info@kardesler.com", district:"Alsancak", goal:"Pastane franchise, aile şirketi", hist:"03.05 mesaj", notes:"Aile şirketi, deneyimli gıda sektörü geçmişi var", followup:"2026-06-05", prio:"Orta", targetType:"Cadde", inv_type:"Kurumsal" },
    { name:"Hüseyin Toprak", budget:4800000, city:"İstanbul", sector:"Seafood", type:"Ortaklık", stage:"Görüşme Yapıldı", phone:"+90 530 999 00 11", email:"huseyin@demo.com", district:"Bebek", goal:"Premium segment balık restoranı", hist:"28.04 kahve toplantısı", notes:"Yelken Balıkçısı ile görüştürüldü, ilgi yüksek", followup:"2026-05-22", prio:"Yüksek", targetType:"Sahil", inv_type:"Bireysel" },
  ];
  for (const inv of invRows) {
    const ex = await pool.query("SELECT id FROM investors WHERE name=$1", [inv.name]);
    if (ex.rowCount > 0) { investorIds[inv.name] = ex.rows[0].id; continue; }
    const r = await pool.query(`
      INSERT INTO investors(name,budget,currency,city,sector,investment_type,pipeline_stage,phone,email,district,goal,
        contact_history,meeting_notes,follow_up_date,priority,target_location_type,investor_type,created_by)
      VALUES($1,$2,'TRY',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
      [inv.name,inv.budget,inv.city,inv.sector,inv.type,inv.stage,inv.phone,inv.email,inv.district,
       inv.goal,inv.hist,inv.notes,inv.followup,inv.prio,inv.targetType,inv.inv_type,adminId]
    );
    investorIds[inv.name] = r.rows[0].id;
  }

  // ── LOCATIONS ──────────────────────────────────────────────────
  const locationIds = {};
  const locRows = [
    { name:"Bağdat Caddesi Premium", type:"Cadde", sqm:130, rent:380000, pot:"Yüksek", brands:["Blak Coffee Co","Tavada Tavuk"], addr:"Caddebostan Mah. Bağdat Cad. No:142", traffic:"Çok Yoğun", owner:"Yıldız Gayrimenkul", ownerPhone:"+90 555 330 11 22", city:"İstanbul", dist:"Kadıköy", status:"Boş", notes:"Günlük 12.000+ yaya trafiği. Metro çıkışı 200m. Şampiyon café lokasyonu.", segment:"A+", deposit:1140000, dues:25000 },
    { name:"Panora AVM - A Blok F05", type:"AVM", sqm:95, rent:240000, pot:"Orta", brands:["The Coffee Factory","Bigye"], addr:"Oran Mah. Silikon Cad. No:5", traffic:"Orta-Yüksek", owner:"Panora AVM Yönetim", ownerPhone:"+90 312 455 00 11", city:"Ankara", dist:"Çankaya", status:"Müzakere", notes:"Food court yakını, 3. katta. Aile hedef kitlesi.", segment:"B+", deposit:720000, dues:18000 },
    { name:"Nişantaşı Köşk Pasajı", type:"Cadde", sqm:160, rent:520000, pot:"Çok Yüksek", brands:["SushiMore","Pasta Punto"], addr:"Teşvikiye Mah. Abdi İpekçi Cad. No:22", traffic:"Çok Yoğun", owner:"Özel Mülkiyet - Köşk Ailesi", ownerPhone:"+90 533 200 30 40", city:"İstanbul", dist:"Şişli", status:"Boş", notes:"A+ lokasyon. Yabancı turist yoğun. Premium müşteri profili.", segment:"A+", deposit:1560000, dues:35000 },
    { name:"Alsancak Turan Caddesi", type:"Cadde", sqm:110, rent:280000, pot:"Yüksek", brands:["Türk Kahvesi Evi","Kasap Döner"], addr:"Alsancak Mah. 1482 Sok. No:8", traffic:"Yoğun", owner:"İzmir Gayrimenkul A.Ş.", ownerPhone:"+90 232 444 55 66", city:"İzmir", dist:"Konak", status:"Boş", notes:"İzmir'in ana yaya aksı. Sahil yürüyüş güzergahı.", segment:"A", deposit:840000, dues:20000 },
    { name:"Forum Bornova - ZF12", type:"AVM", sqm:75, rent:195000, pot:"Orta", brands:["Fit Salad Bar","Pizza Pino"], addr:"Bornova Mah. Ankara Cad. No:1", traffic:"Orta", owner:"Forum AVM Yönetim", ownerPhone:"+90 232 777 88 99", city:"İzmir", dist:"Bornova", status:"Müzakere", notes:"Gençlik AVM. Ege Üniversitesi yakını. Hedef kitle 18-35 yaş.", segment:"B", deposit:585000, dues:12000 },
    { name:"Lara Sahil Kavşağı", type:"Cadde", sqm:140, rent:320000, pot:"Yüksek", brands:["Fit Salad Bar","Blak Coffee Co"], addr:"Lara Mah. Lara Cad. No:200", traffic:"Yoğun", owner:"Antalya Emlak Ltd.", ownerPhone:"+90 242 111 22 33", city:"Antalya", dist:"Muratpaşa", status:"Boş", notes:"Turistik bölge. Yaz sezonu kapasitesi çok yüksek. Yıl boyu açık.", segment:"A", deposit:960000, dues:22000 },
    { name:"Maslak İş Merkezi Zemin", type:"Plaza", sqm:85, rent:290000, pot:"Orta", brands:["The Coffee Factory","Coffee in Munchies"], addr:"Maslak Mah. AOS 55. Sok. No:3", traffic:"Orta", owner:"GYO Ofis Yönetim", ownerPhone:"+90 212 444 55 66", city:"İstanbul", dist:"Sarıyer", status:"Boş", notes:"Kurumsal bölge. 25.000+ günlük ofis çalışanı. Sabah/öğle pik trafik.", segment:"B+", deposit:870000, dues:15000 },
    { name:"Bursa Zafer Plaza - Giriş", type:"AVM", sqm:68, rent:160000, pot:"Orta", brands:["Pizza Pino","Türk Kahvesi Evi"], addr:"Osmangazi Mah. Zafer Cad. No:1", traffic:"Orta", owner:"Zafer Plaza AVM", ownerPhone:"+90 224 333 44 55", city:"Bursa", dist:"Osmangazi", status:"Boş", notes:"Bursa merkezi AVM. Kuzey giriş kapısı, yüksek görünürlük.", segment:"B", deposit:480000, dues:10000 },
  ];
  for (const l of locRows) {
    const ex = await pool.query("SELECT id FROM locations WHERE name=$1", [l.name]);
    if (ex.rowCount > 0) { locationIds[l.name] = ex.rows[0].id; continue; }
    const r = await pool.query(`
      INSERT INTO locations(name,location_type,sqm,rent,currency,potential,recommended_brands,address,traffic,owner,owner_phone,city,district,status,notes,segment,deposit,dues)
      VALUES($1,$2,$3,$4,'TRY',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
      [l.name,l.type,l.sqm,l.rent,l.pot,l.brands,l.addr,l.traffic,l.owner,l.ownerPhone,l.city,l.dist,l.status,l.notes,l.segment,l.deposit,l.dues]
    );
    locationIds[l.name] = r.rows[0].id;
  }

  // ── PROJECTS (cross-linked) ────────────────────────────────────
  const projectIds = {};
  const projRows = [
    { name:"Blak Coffee Co - Bağdat Cad. Açılışı", type:"Franchise", team:"Franchise Ekibi", assignees:["Selin Demir","Mert Kaya"], prio:"Yüksek", prog:55, stage:"Sunum & Müzakere", due:"2026-06-30", desc:"Bağdat Caddesi premium lokasyonda Blak Coffee Co açılışı. Yatırımcı Ahmet Kılıç.", checklist:["Lokasyon ekspertiz","Marka sunum toplantısı","Kira müzakeresi","Sözleşme taslağı","Açılış planı"], investorName:"Ahmet Kılıç", brandName:"Blak Coffee Co", locationName:"Bağdat Caddesi Premium" },
    { name:"Tavada Tavuk - Panora AVM Franchise", type:"Franchise", team:"Operasyon Ekibi", assignees:["Mert Kaya","Ayşe Çetin"], prio:"Yüksek", prog:70, stage:"Sözleşme Süreci", due:"2026-06-15", desc:"Panora AVM A Blok'ta Tavada Tavuk franchise açılışı.", checklist:["Lokasyon onay","Marka anlaşması","Kiracı teslim tutanağı","Ruhsat başvurusu","Açılış planı"], investorName:"Yaman Holding", brandName:"Tavada Tavuk", locationName:"Panora AVM - A Blok F05" },
    { name:"SushiMore - Nişantaşı Açılışı", type:"Franchise", team:"Franchise Ekibi", assignees:["Selin Demir","Burak Yılmaz"], prio:"Çok Yüksek", prog:80, stage:"Hukuki Süreç", due:"2026-05-31", desc:"Nişantaşı premium lokasyonda SushiMore açılışı. Hukuki süreç devam ediyor.", checklist:["Kira sözleşmesi imzası","Marka lisans anlaşması","İşletme belgesi","Personel eğitimi","Açılış daveti"], investorName:"Hüseyin Toprak", brandName:"SushiMore", locationName:"Nişantaşı Köşk Pasajı" },
    { name:"Yaman Holding - Fast Casual Ortaklık", type:"Ortaklık", team:"Satış Ekibi", assignees:["Selin Demir","Ayşe Çetin"], prio:"Orta", prog:30, stage:"Teklif Hazırlanıyor", due:"2026-07-31", desc:"Yaman Holding ile çoklu şube ortaklık görüşmesi.", checklist:["Finansal analiz raporu","Ortaklık teklifi sunumu","Hukuki inceleme","İmza"], investorName:"Yaman Holding", brandName:"Bigye", locationName:null },
    { name:"Grup Doruk - Master Franchise Anlaşması", type:"Master Franchise", team:"Üst Yönetim", assignees:["Selin Demir","Burak Yılmaz","Esra Koç"], prio:"Çok Yüksek", prog:90, stage:"Sözleşme Süreci", due:"2026-05-20", desc:"Grup Doruk ile The Coffee Factory master franchise görüşmesi. Kritik aşama.", checklist:["NDA imzalandı","Due diligence tamamlandı","Sözleşme müzakeresi","İmza töreni"], investorName:"Grup Doruk Yatırım", brandName:"The Coffee Factory", locationName:null },
    { name:"Melek Arslan - Kasap Döner İzmir", type:"Franchise", team:"Satış Ekibi", assignees:["Ayşe Çetin"], prio:"Orta", prog:20, stage:"Lokasyon Araştırma", due:"2026-08-15", desc:"Melek Arslan için İzmir Alsancak bölgesinde Kasap Döner lokasyonu.", checklist:["Lokasyon shortlist","Kira teklifleri","Marka görüşmesi"], investorName:"Melek Arslan", brandName:"Kasap Döner", locationName:"Alsancak Turan Caddesi" },
    { name:"Can Teknoloji - Kahve Zinciri Projesi", type:"Master Franchise", team:"Franchise Ekibi", assignees:["Selin Demir","Kemal Erdoğan"], prio:"Yüksek", prog:40, stage:"Sunum & Müzakere", due:"2026-07-15", desc:"Can Teknoloji A.Ş. için 10 şube kahve zinciri projesi.", checklist:["Finansal model","Marka sunum","Pilot şube lokasyonu","Franchise sözleşmesi"], investorName:"Can Teknoloji A.Ş.", brandName:"Blak Coffee Co", locationName:"Maslak İş Merkezi Zemin" },
  ];
  for (const p of projRows) {
    const ex = await pool.query("SELECT id FROM projects WHERE name=$1 AND deleted_at IS NULL", [p.name]);
    if (ex.rowCount > 0) { projectIds[p.name] = ex.rows[0].id; continue; }
    const invId = investorIds[p.investorName] || null;
    const brandId = p.brandName ? brandIds[p.brandName] || null : null;
    const locId = p.locationName ? locationIds[p.locationName] || null : null;
    const r = await pool.query(`
      INSERT INTO projects(name,project_type,owner_team,assignees,priority,progress,stage,due_date,description,checklist,investor_id,brand_id,location_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [p.name,p.type,p.team,p.assignees,p.prio,p.prog,p.stage,p.due,p.desc,p.checklist,invId,brandId,locId]
    );
    projectIds[p.name] = r.rows[0].id;
  }

  // ── CONTRACTS (cross-linked) ────────────────────────────────────
  const contractIds = {};
  const cRows = [
    { name:"Blak Coffee Co Franchise Sözleşmesi", type:"Franchise", status:"Aktif", counterparty:"Blak Coffee Co Türkiye A.Ş.", start:"2026-01-15", end:"2029-01-14", sign:"2026-01-10", amount:350000, fee:85000, feeComm:65000, feeCommPct:8.5, currency:"TRY", risk:"Düşük", notes:"İstanbul Bağdat Caddesi noktası. 3 yıl + uzatma opsiyonu.", investorName:"Ahmet Kılıç", brandName:"Blak Coffee Co", projectName:"Blak Coffee Co - Bağdat Cad. Açılışı" },
    { name:"Tavada Tavuk Danışmanlık Sözleşmesi", type:"Danışmanlık", status:"Aktif", counterparty:"Tavada Tavuk Ltd. Şti.", start:"2026-02-01", end:"2026-12-31", sign:"2026-01-28", amount:120000, fee:120000, feeComm:null, feeCommPct:null, currency:"TRY", risk:"Düşük", notes:"Ankara bölge genişleme danışmanlığı. Aylık 10.000 TL.", investorName:"Yaman Holding", brandName:"Tavada Tavuk", projectName:"Tavada Tavuk - Panora AVM Franchise" },
    { name:"SushiMore Ön Anlaşma", type:"Ön Sözleşme", status:"Müzakere", counterparty:"SushiMore Restoranlar A.Ş.", start:"2026-04-01", end:"2027-03-31", sign:null, amount:480000, fee:95000, feeComm:120000, feeCommPct:12.0, currency:"TRY", risk:"Orta", notes:"Nişantaşı premium lokasyon. Final müzakere aşamasında.", investorName:"Hüseyin Toprak", brandName:"SushiMore", projectName:"SushiMore - Nişantaşı Açılışı" },
    { name:"Grup Doruk Master Franchise Protokolü", type:"Master Franchise", status:"Aktif", counterparty:"Grup Doruk Yatırım A.Ş.", start:"2026-03-01", end:"2031-02-28", sign:"2026-02-25", amount:1800000, fee:300000, feeComm:250000, feeCommPct:15.0, currency:"TRY", risk:"Düşük", notes:"The Coffee Factory 5 yıllık master franchise. Kritik gelir kaynağı.", investorName:"Grup Doruk Yatırım", brandName:"The Coffee Factory", projectName:"Grup Doruk - Master Franchise Anlaşması" },
    { name:"Can Teknoloji Danışmanlık Protokolü", type:"Danışmanlık", status:"Onay Bekliyor", counterparty:"Can Teknoloji A.Ş.", start:"2026-05-01", end:"2027-04-30", sign:null, amount:240000, fee:240000, feeComm:null, feeCommPct:null, currency:"TRY", risk:"Orta", notes:"10 şube için operasyonel danışmanlık. Aylık 20.000 TL.", investorName:"Can Teknoloji A.Ş.", brandName:"Blak Coffee Co", projectName:"Can Teknoloji - Kahve Zinciri Projesi" },
  ];
  for (const c of cRows) {
    const ex = await pool.query("SELECT id FROM contracts WHERE name=$1 AND deleted_at IS NULL", [c.name]);
    if (ex.rowCount > 0) { contractIds[c.name] = ex.rows[0].id; continue; }
    const invId = investorIds[c.investorName] || null;
    const brandId = c.brandName ? brandIds[c.brandName] || null : null;
    const projId = c.projectName ? projectIds[c.projectName] || null : null;
    const r = await pool.query(`
      INSERT INTO contracts(name,contract_type,status,counterparty,start_date,end_date,sign_date,amount,consulting_fee,
        franchise_commission,franchise_commission_pct,currency,risk_level,notes,investor_id,brand_id,project_id,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING id`,
      [c.name,c.type,c.status,c.counterparty,c.start,c.end,c.sign||null,c.amount,c.fee,
       c.feeComm||null,c.feeCommPct||null,c.currency,c.risk,c.notes,invId,brandId,projId,adminId]
    );
    contractIds[c.name] = r.rows[0].id;
  }

  // ── TASKS (cross-linked) ───────────────────────────────────────
  const taskRows = [
    { title:"Blak Coffee Co - Bağdat Cad. kira müzakeresi", desc:"Kiraya veren Yıldız Gayrimenkul ile kira rakamı müzakere edilecek. Hedef: 350.000 TL altı.", status:"Devam Ediyor", prio:"Çok Yüksek", assignee:"Mert Kaya", due:"2026-05-18", mod:"Proje", projName:"Blak Coffee Co - Bağdat Cad. Açılışı" },
    { title:"SushiMore franchise sözleşmesi imzalatma", desc:"Hukuk departmanı nihai sözleşmeyi hazırladı. İmza töreni organize edilecek.", status:"Açık", prio:"Çok Yüksek", assignee:"Burak Yılmaz", due:"2026-05-28", mod:"Sözleşme", contractName:"SushiMore Ön Anlaşma" },
    { title:"Yaman Holding finansal analiz raporu hazırla", desc:"Çoklu şube ortaklık teklifine esas finansal model ve projeksiyon raporu.", status:"Devam Ediyor", prio:"Yüksek", assignee:"Ayşe Çetin", due:"2026-05-22", mod:"Proje", projName:"Yaman Holding - Fast Casual Ortaklık" },
    { title:"Panora AVM - Tavada Tavuk ruhsat başvurusu", desc:"Çankaya Belediyesi işyeri açma ruhsatı için evrak tamamlanacak.", status:"Açık", prio:"Yüksek", assignee:"Mert Kaya", due:"2026-05-25", mod:"Lokasyon", locationName:"Panora AVM - A Blok F05" },
    { title:"Grup Doruk master franchise sözleşme incelemesi", desc:"Hukuk departmanı 90 sayfalık master franchise sözleşmesini inceleyecek.", status:"Tamamlandı", prio:"Yüksek", assignee:"Burak Yılmaz", due:"2026-05-15", mod:"Sözleşme", contractName:"Grup Doruk Master Franchise Protokolü" },
    { title:"Mayıs KPI ve pipeline raporu", desc:"Aylık yönetim raporu: yatırımcı, marka, proje ve finans özeti.", status:"Devam Ediyor", prio:"Orta", assignee:"Esra Koç", due:"2026-05-31", mod:"Genel" },
    { title:"Nişantaşı lokasyon ekspertiz raporu", desc:"Köşk Pasajı için bağımsız ekspertiz firmasına rapor yaptırılacak.", status:"Açık", prio:"Yüksek", assignee:"Mert Kaya", due:"2026-05-24", mod:"Lokasyon", locationName:"Nişantaşı Köşk Pasajı" },
    { title:"Ahmet Kılıç - Blak Coffee Co sunum toplantısı hazırlığı", desc:"Yatırımcıya özel finansal projeksiyon ve marka tanıtım sunumu hazırlanacak.", status:"Tamamlandı", prio:"Yüksek", assignee:"Selin Demir", due:"2026-05-10", mod:"Yatırımcı", investorName:"Ahmet Kılıç" },
    { title:"Can Teknoloji sözleşme taslağı gönder", desc:"10 şube danışmanlık protokolü taslağını inceleme için müşteriye ilet.", status:"Açık", prio:"Orta", assignee:"Burak Yılmaz", due:"2026-05-30", mod:"Yatırımcı", investorName:"Can Teknoloji A.Ş." },
    { title:"Blak Coffee Co Web sitesi ve sosyal medya profil güncelleme", desc:"Yeni şube açılışı öncesi marka materyalleri güncellenmeli.", status:"Açık", prio:"Düşük", assignee:"Kemal Erdoğan", due:"2026-06-01", mod:"Marka", brandName:"Blak Coffee Co" },
    { title:"Melek Arslan - Kasap Döner lokasyon shortlist", desc:"İzmir Alsancak bölgesi için 3-5 lokasyon shortlist hazırla.", status:"Açık", prio:"Orta", assignee:"Selin Demir", due:"2026-06-05", mod:"Proje", projName:"Melek Arslan - Kasap Döner İzmir" },
    { title:"Forum Bornova AVM kira müzakeresi", desc:"AVM yönetimi ile kira ve stopaj şartları müzakere edilecek.", status:"Açık", prio:"Orta", assignee:"Mert Kaya", due:"2026-05-29", mod:"Lokasyon", locationName:"Forum Bornova - ZF12" },
    { title:"Grup Doruk - imza töreni organizasyonu", desc:"Noterde master franchise sözleşmesi imzalanacak. Protokol tarihi belirlenecek.", status:"Açık", prio:"Çok Yüksek", assignee:"Selin Demir", due:"2026-05-20", mod:"Sözleşme", contractName:"Grup Doruk Master Franchise Protokolü" },
    { title:"Haziran ayı tahsilat planı", desc:"Açık finans kayıtları için tahsilat takvimine bakılacak.", status:"Açık", prio:"Orta", assignee:"Esra Koç", due:"2026-06-01", mod:"Genel" },
    { title:"SushiMore personel eğitim programı koordinasyonu", desc:"Açılış öncesi mutfak ve servis personeli eğitimi planlanacak.", status:"Açık", prio:"Orta", assignee:"Mert Kaya", due:"2026-06-10", mod:"Proje", projName:"SushiMore - Nişantaşı Açılışı" },
  ];
  for (const t of taskRows) {
    const texists = await pool.query("SELECT id FROM tasks WHERE title=$1 AND deleted_at IS NULL", [t.title]);
    if (texists.rowCount > 0) continue;
    const invId = t.investorName ? investorIds[t.investorName] || null : null;
    const brandId = t.brandName ? brandIds[t.brandName] || null : null;
    const projId = t.projName ? projectIds[t.projName] || null : null;
    const locId = t.locationName ? locationIds[t.locationName] || null : null;
    const contId = t.contractName ? contractIds[t.contractName] || null : null;
    await pool.query(`
      INSERT INTO tasks(title,note,description,status,priority,assignee_name,due_date,module_type,investor_id,brand_id,project_id,location_id,contract_id)
      VALUES($1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [t.title,t.desc,t.status,t.prio,t.assignee,t.due,t.mod,invId,brandId,projId,locId,contId]
    );
  }

  // ── FINANCE RECORDS (linked to contracts) ──────────────────────
  const financeCount = await pool.query("SELECT COUNT(*)::int AS count FROM finance_records WHERE contract_id IS NOT NULL");
  if (financeCount.rows[0].count === 0) {
    const finRows = [
      { contName:"Blak Coffee Co Franchise Sözleşmesi", incType:"Franchise Ücreti", amount:350000, vat:20, payType:"Taksitli", status:"Kısmi Ödeme", due:"2026-02-01", paid:"2026-02-03", method:"Havale", desc:"Franchise giriş bedeli - 1. taksit" },
      { contName:"Blak Coffee Co Franchise Sözleşmesi", incType:"Danışmanlık", amount:85000, vat:20, payType:"Peşin", status:"Tahsil Edildi", due:"2026-01-15", paid:"2026-01-16", method:"EFT", desc:"Açılış danışmanlık ücreti" },
      { contName:"Tavada Tavuk Danışmanlık Sözleşmesi", incType:"Danışmanlık", amount:30000, vat:20, payType:"Aylık", status:"Tahsil Edildi", due:"2026-02-01", paid:"2026-02-02", method:"Havale", desc:"Şubat danışmanlık ödemesi" },
      { contName:"Tavada Tavuk Danışmanlık Sözleşmesi", incType:"Danışmanlık", amount:30000, vat:20, payType:"Aylık", status:"Tahsil Edildi", due:"2026-03-01", paid:"2026-03-03", method:"Havale", desc:"Mart danışmanlık ödemesi" },
      { contName:"Tavada Tavuk Danışmanlık Sözleşmesi", incType:"Danışmanlık", amount:30000, vat:20, payType:"Aylık", status:"Tahsil Edildi", due:"2026-04-01", paid:"2026-04-02", method:"Havale", desc:"Nisan danışmanlık ödemesi" },
      { contName:"Tavada Tavuk Danışmanlık Sözleşmesi", incType:"Danışmanlık", amount:30000, vat:20, payType:"Aylık", status:"Açık", due:"2026-05-01", paid:null, method:null, desc:"Mayıs danışmanlık ödemesi" },
      { contName:"Grup Doruk Master Franchise Protokolü", incType:"Master Franchise Ücreti", amount:1800000, vat:20, payType:"Taksitli", status:"Kısmi Ödeme", due:"2026-03-15", paid:"2026-03-20", method:"Banka Transferi", desc:"Master franchise giriş bedeli - 1. taksit %50" },
      { contName:"Grup Doruk Master Franchise Protokolü", incType:"Danışmanlık", amount:300000, vat:20, payType:"Peşin", status:"Tahsil Edildi", due:"2026-03-01", paid:"2026-03-05", method:"EFT", desc:"Kurulum danışmanlık ücreti" },
      { contName:"SushiMore Ön Anlaşma", incType:"Ön Anlaşma Bedeli", amount:50000, vat:20, payType:"Peşin", status:"Tahsil Edildi", due:"2026-04-10", paid:"2026-04-11", method:"Havale", desc:"Ön anlaşma kaparo bedeli" },
      { contName:"SushiMore Ön Anlaşma", incType:"Franchise Ücreti", amount:430000, vat:20, payType:"Taksitli", status:"Açık", due:"2026-06-01", paid:null, method:null, desc:"Franchise giriş bedeli - sözleşme imzası sonrası" },
    ];
    for (const f of finRows) {
      const contId = contractIds[f.contName] || null;
      const net = f.amount + (f.amount * f.vat / 100);
      await pool.query(`
        INSERT INTO finance_records(contract_id,income_type,amount,vat_pct,vat_amount,net_amount,currency,payment_type,status,due_date,paid_date,payment_method,description,created_by)
        VALUES($1,$2,$3,$4,$5,$6,'TRY',$7,$8,$9,$10,$11,$12,$13)`,
        [contId,f.incType,f.amount,f.vat,f.amount*f.vat/100,net,f.payType,f.status,f.due,f.paid||null,f.method||null,f.desc,adminId]
      );
    }
  }

  // ── PNL REVENUES (monthly branch data) ─────────────────────────
  const pnlRevCount = await pool.query("SELECT COUNT(*)::int AS count FROM pnl_revenues");
  if (pnlRevCount.rows[0].count === 0) {
    const months = [
      { name:"OCAK", year:2026, amount:485000 }, { name:"ŞUBAT", year:2026, amount:520000 },
      { name:"MART", year:2026, amount:612000 }, { name:"NİSAN", year:2026, amount:578000 },
      { name:"MAYIS", year:2026, amount:645000 },
    ];
    for (const m of months) {
      await pool.query(`
        INSERT INTO pnl_revenues(entry_date,branch,revenue_type,description,amount,source,month_name,year_value,created_by)
        VALUES ($1,'Genel','Satış','Aylık toplam ciro',$2,'Manuel',$3,$4,$5),
               ($1,'Genel','Paket Servis','Paket servis gelirleri',$6,'Manuel',$3,$4,$5)`,
        [`${m.year}-${months.indexOf(m)+1 < 10 ? '0'+(months.indexOf(m)+1) : months.indexOf(m)+1}-01`,
         m.amount, Math.round(m.amount*0.18), m.name, m.year, adminId]
      );
    }
  }

  // ── PNL EXPENSES (monthly) ────────────────────────────────────
  const pnlExpCount = await pool.query("SELECT COUNT(*)::int AS count FROM pnl_expenses");
  if (pnlExpCount.rows[0].count === 0) {
    const expMonths = [
      { name:"OCAK", year:2026, gida:145000, personel:95000, kira:78000, elektrik:18000, diger:22000 },
      { name:"ŞUBAT", year:2026, gida:152000, personel:95000, kira:78000, elektrik:16000, diger:19000 },
      { name:"MART", year:2026, gida:178000, personel:105000, kira:78000, elektrik:17000, diger:24000 },
      { name:"NİSAN", year:2026, gida:168000, personel:105000, kira:78000, elektrik:15000, diger:21000 },
      { name:"MAYIS", year:2026, gida:185000, personel:112000, kira:78000, elektrik:19000, diger:26000 },
    ];
    for (const m of expMonths) {
      const idx = expMonths.indexOf(m) + 1;
      const dateStr = `${m.year}-${idx < 10 ? '0'+idx : idx}-01`;
      const cats = [['Gıda',m.gida],['Personel',m.personel],['Kira',m.kira],['Elektrik',m.elektrik],['Diğer',m.diger]];
      for (const [cat, amt] of cats) {
        await pool.query(`
          INSERT INTO pnl_expenses(entry_date,branch,category,description,amount,source,month_name,year_value,created_by)
          VALUES($1,'Genel',$2,$3,$4,'Manuel',$5,$6,$7)`,
          [dateStr, cat, `${m.name} ${cat.toLowerCase()} giderleri`, amt, m.name, m.year, adminId]
        );
      }
    }
  }

  // ── PNL PERSONNEL ──────────────────────────────────────────────
  const pnlPerCount = await pool.query("SELECT COUNT(*)::int AS count FROM pnl_personnel");
  if (pnlPerCount.rows[0].count === 0) {
    const personnel = [
      { name:"Selin Demir", pos:"Franchise Yöneticisi", salary:28000, bonus:5000, ded:0 },
      { name:"Mert Kaya", pos:"Operasyon Uzmanı", salary:22000, bonus:3000, ded:0 },
      { name:"Ayşe Çetin", pos:"Satış Temsilcisi", salary:18000, bonus:4500, ded:0 },
      { name:"Burak Yılmaz", pos:"Hukuk Danışmanı", salary:32000, bonus:0, ded:0 },
      { name:"Esra Koç", pos:"Muhasebeci", salary:24000, bonus:2000, ded:0 },
      { name:"Kemal Erdoğan", pos:"Pazarlama Uzmanı", salary:20000, bonus:2500, ded:0 },
    ];
    const months = [
      {name:"OCAK",year:2026,idx:1},{name:"ŞUBAT",year:2026,idx:2},{name:"MART",year:2026,idx:3},
      {name:"NİSAN",year:2026,idx:4},{name:"MAYIS",year:2026,idx:5},
    ];
    for (const m of months) {
      const dateStr = `${m.year}-${m.idx < 10 ? '0'+m.idx : m.idx}-01`;
      for (const p of personnel) {
        await pool.query(`
          INSERT INTO pnl_personnel(entry_date,branch,person_name,position,salary,bonus,deduction,total_cost,source,month_name,year_value,created_by)
          VALUES($1,'Genel',$2,$3,$4,$5,$6,$7,'Manuel',$8,$9,$10)`,
          [dateStr,p.name,p.pos,p.salary,m.name==='OCAK'&&p.name==='Selin Demir'?p.bonus:m.idx===3?p.bonus:0,
           p.ded, p.salary+p.bonus, m.name, m.year, adminId]
        );
      }
    }
  }

  // ── INVESTOR MEETINGS ──────────────────────────────────────────
  const meetingCount = await pool.query("SELECT COUNT(*)::int AS count FROM investor_meetings WHERE investor_id IS NOT NULL");
  if (meetingCount.rows[0].count === 0) {
    const meetings = [
      { invName:"Ahmet Kılıç", type:"Telefon", date:"2026-04-24", by:"Selin Demir", notes:"İlk temas. Coffee franchise arıyor. Bağdat Caddesi ilgisini çekti.", action:"Sunum göndermek", reminder:"2026-04-28" },
      { invName:"Ahmet Kılıç", type:"Yüz Yüze", date:"2026-05-02", by:"Selin Demir", notes:"Blak Coffee Co sunumu yapıldı. Lokasyon gezisi yapıldı. Çok ilgili.", action:"Teklif hazırlamak", reminder:"2026-05-08" },
      { invName:"Yaman Holding", type:"Ofis Toplantısı", date:"2026-04-26", by:"Selin Demir", notes:"CFO ve CEO ile görüşüldü. Çoklu şube modeli tartışıldı.", action:"Finansal model göndermek", reminder:"2026-05-02" },
      { invName:"Yaman Holding", type:"Video Görüşme", date:"2026-05-05", by:"Ayşe Çetin", notes:"Sözleşme taslağı üzerinden geçildi. 3 madde değiştirildi.", action:"Hukuk incelemesi", reminder:"2026-05-12" },
      { invName:"Can Teknoloji A.Ş.", type:"Ofis Toplantısı", date:"2026-04-20", by:"Selin Demir", notes:"10 şube planı paylaşıldı. Finansman için banka görüşmesi var.", action:"Master franchise şartlarını hazırlamak", reminder:"2026-04-27" },
      { invName:"Can Teknoloji A.Ş.", type:"Sunum", date:"2026-04-28", by:"Selin Demir", notes:"Kapsamlı sunum yapıldı. Finansal projeksiyon beğenildi.", action:"Sözleşme taslağı göndermek", reminder:"2026-05-05" },
      { invName:"Hüseyin Toprak", type:"Kahve Toplantısı", date:"2026-04-28", by:"Selin Demir", notes:"Bebek lokasyonu için SushiMore önerildi. Çok hevesli.", action:"Nişantaşı lokasyon turu organize et", reminder:"2026-05-03" },
      { invName:"Melek Arslan", type:"Telefon", date:"2026-04-22", by:"Ayşe Çetin", notes:"İzmir'de tek mağaza arıyor. Kasap Döner ile tanıştırmak istedik.", action:"Marka tanıtım göndermek", reminder:"2026-04-26" },
      { invName:"Ömer Yıldız", type:"Ofis Ziyareti", date:"2026-04-29", by:"Selin Demir", notes:"Antalya Lara bölgesi için AVM lokasyonu tercih ediyor.", action:"Forum lokasyon alternatifleri hazırlamak", reminder:"2026-05-06" },
      { invName:"Grup Doruk Yatırım", type:"NDA İmzası", date:"2026-04-22", by:"Burak Yılmaz", notes:"Gizlilik sözleşmesi imzalandı. Due diligence başlıyor.", action:"Due diligence belgelerini göndermek", reminder:"2026-04-25" },
      { invName:"Grup Doruk Yatırım", type:"Ofis Toplantısı", date:"2026-05-05", by:"Selin Demir", notes:"Master franchise müzakereleri devam ediyor. Bölge hakları tartışıldı.", action:"Hukuk incelemesi tamamlamak", reminder:"2026-05-10" },
    ];
    for (const m of meetings) {
      const invId = investorIds[m.invName] || null;
      if (!invId) continue;
      await pool.query(`
        INSERT INTO investor_meetings(investor_id,meeting_type,meeting_date,met_by,notes,next_action,reminder_date,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [invId, m.type, m.date, m.by, m.notes, m.action, m.reminder, adminId]
      );
    }
  }

  // ── INVESTOR BRAND MATCHES ─────────────────────────────────────
  const matchCount = await pool.query("SELECT COUNT(*)::int AS count FROM investor_brand_matches");
  if (matchCount.rows[0].count === 0) {
    const matchPairs = [
      { inv:"Ahmet Kılıç", brand:"Blak Coffee Co", score:92, notes:"Mükemmel uyum: bütçe, sektör, lokasyon tercihi" },
      { inv:"Ahmet Kılıç", brand:"The Coffee Factory", score:78, notes:"İyi uyum: sektör ve bütçe uyuyor" },
      { inv:"Yaman Holding", brand:"Tavada Tavuk", score:88, notes:"Güçlü uyum: kurumsal yatırım + fast casual" },
      { inv:"Yaman Holding", brand:"Bigye", score:72, notes:"Orta-iyi uyum: bütçe yüksek ama sektör uyuyor" },
      { inv:"Can Teknoloji A.Ş.", brand:"Blak Coffee Co", score:85, notes:"Yüksek bütçe + coffee sektörü" },
      { inv:"Can Teknoloji A.Ş.", brand:"Coffee in Munchies", score:70, notes:"Alternatif coffee markası" },
      { inv:"Hüseyin Toprak", brand:"Yelken Balıkçısı", score:90, notes:"Mükemmel: premium seafood + yüksek bütçe" },
      { inv:"Hüseyin Toprak", brand:"SushiMore", score:82, notes:"İyi: premium Asya mutfağı" },
      { inv:"Melek Arslan", brand:"Kasap Döner", score:80, notes:"Uygun bütçe ve sektör" },
      { inv:"Ömer Yıldız", brand:"Fit Salad Bar", score:76, notes:"Sağlıklı yaşam sektörü + AVM tercihi" },
      { inv:"Grup Doruk Yatırım", brand:"The Coffee Factory", score:95, notes:"Master franchise: en yüksek uyum" },
      { inv:"Deniz Acar", brand:"Blak Coffee Co", score:82, notes:"Coffee sektörü + bütçe uyumu" },
      { inv:"Deniz Acar", brand:"Türk Kahvesi Evi", score:75, notes:"Ankara + coffee + düşük yatırım" },
    ];
    for (const m of matchPairs) {
      const invId = investorIds[m.inv] || null;
      const brandId = brandIds[m.brand] || null;
      if (!invId || !brandId) continue;
      await pool.query(`
        INSERT INTO investor_brand_matches(investor_id,brand_id,score,notes,created_by)
        VALUES($1,$2,$3,$4,$5) ON CONFLICT(investor_id,brand_id) DO NOTHING`,
        [invId, brandId, m.score, m.notes, adminId]
      );
    }
  }

  // ── MESSAGE TEMPLATES ──────────────────────────────────────────
  const templateCount = await pool.query("SELECT COUNT(*)::int AS count FROM message_templates");
  if (templateCount.rows[0].count === 0) {
    await pool.query(`
      INSERT INTO message_templates(channel,event_name,title,body,active,image_url) VALUES
      ('whatsapp','Yeni Lead','Hoş Geldiniz','Sayın {{name}}, Mi Core CRM''e başvurunuz alındı. En kısa sürede iletişime geçeceğiz.',true,null),
      ('whatsapp','Toplantı Hatırlatma','Toplantı Hatırlatma','{{name}}, yarın saat {{time}} görüşmemiz bulunmaktadır. Onaylıyor musunuz?',true,null),
      ('mail','Sunum Gönderimi','Franchise Sunum Paketi','Merhaba {{name}}, ilgilendiğiniz {{brand}} markasının sunum paketi ektedir.',true,null),
      ('mail','Sözleşme Süreci','Sözleşme Hazır','Sayın {{name}}, sözleşmeniz hazırlandı. İmza süreci için lütfen randevu alınız.',true,null),
      ('mail','Teklif','Franchise Teklifi','Merhaba {{name}}, sizin için hazırladığımız {{brand}} franchise teklifini ekte bulabilirsiniz.',true,null),
      ('sms','Hatırlatma','Takip Hatırlatma','{{name}}, {{date}} tarihindeki görüşmemiz için hatırlatma: {{note}}.',true,null)
    `);
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

app.get("/api/admin/seed", authMiddleware, async (req, res) => {
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
  try {
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
  let kpis = { total: 0, activeAgreed: 0, inDiscussion: 0, passive: 0, avgInvestment: 0, newThisMonth: 0 };
  try { kpis = await computeBrandKpis(); } catch (e) { console.error('computeBrandKpis error:', e.message); }
  res.json({ items: rows, total, page, pageSize, kpis });
  } catch (err) { next(err); }
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

function locationRowFromBody(body, userId) {
  const b = body || {};
  return [
    b.name,
    b.type || b.locationType,
    Number(b.sqm || 0),
    Number(b.rent || 0),
    b.currency || "TRY",
    b.potential || "Orta",
    Array.isArray(b.recommendedBrands) ? b.recommendedBrands : [],
    b.address || null,
    b.traffic || null,
    b.owner || null,
    b.ownerPhone || null,
    b.city || null,
    b.district || null,
    b.region || null,
    b.avenueName || null,
    b.mapsLink || null,
    b.segment || null,
    b.storefrontLength == null || b.storefrontLength === "" ? null : Number(b.storefrontLength),
    b.floorInfo || null,
    b.chimneyStatus || null,
    b.infrastructureStatus || null,
    b.revenueRentPct == null || b.revenueRentPct === "" ? null : Number(b.revenueRentPct),
    b.dues == null || b.dues === "" ? null : Number(b.dues),
    b.deposit == null || b.deposit === "" ? null : Number(b.deposit),
    b.footfallScore == null || b.footfallScore === "" ? null : Number(b.footfallScore),
    b.competitorBrands || null,
    b.targetCustomerProfile || null,
    b.suitableSectors || null,
    b.status || "Boş",
    b.brandFitScore == null || b.brandFitScore === "" ? null : Number(b.brandFitScore),
    b.streetClass || null,
    b.avmSegment || null,
    Array.isArray(b.files) ? b.files : [],
    b.notes || null,
    b.attachmentName || null,
    b.attachmentData || null,
    b.attachmentUrl || null,
    userId || null,
  ];
}

async function computeLocationKpis() {
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
  const [total, active, empty, highPotential, avgRent, addedMonth] = await Promise.all([
    pool.query("SELECT COUNT(*)::int AS c FROM locations"),
    pool.query("SELECT COUNT(*)::int AS c FROM locations WHERE status IN ('Dolu','Görüşmede','Kiralandı')"),
    pool.query("SELECT COUNT(*)::int AS c FROM locations WHERE status='Boş'"),
    pool.query("SELECT COUNT(*)::int AS c FROM locations WHERE potential IN ('Yüksek','Premium')"),
    pool.query("SELECT COALESCE(AVG(rent::numeric),0)::numeric AS a FROM locations"),
    pool.query("SELECT COUNT(*)::int AS c FROM locations WHERE created_at::date >= $1::date", [monthStart]),
  ]);
  return {
    total: total.rows[0].c,
    active: active.rows[0].c,
    empty: empty.rows[0].c,
    highPotential: highPotential.rows[0].c,
    avgRent: Number(avgRent.rows[0].a || 0),
    newThisMonth: addedMonth.rows[0].c,
  };
}

app.get("/api/locations", authMiddleware, async (req, res) => {
  const q = req.query || {};
  const page = Math.max(1, Number(q.page) || 1);
  const pageSize = Math.min(100, Math.max(5, Number(q.pageSize) || 20));
  const offset = (page - 1) * pageSize;
  const sortMap = { name: "l.name", rent: "l.rent", sqm: "l.sqm", potential: "l.potential", created_at: "l.created_at" };
  const sortCol = sortMap[q.sort] || "l.created_at";
  const order = String(q.order || "desc").toLowerCase() === "asc" ? "ASC" : "DESC";
  const conds = ["1=1"];
  const params = [];
  const add = (sql, val) => {
    params.push(val);
    conds.push(`${sql}$${params.length}`);
  };
  if (q.name) add("l.name ILIKE ", `%${q.name}%`);
  if (q.city) add("COALESCE(l.city,'') ILIKE ", `%${q.city}%`);
  if (q.district) add("COALESCE(l.district,'') ILIKE ", `%${q.district}%`);
  if (q.region) add("COALESCE(l.region,'') ILIKE ", `%${q.region}%`);
  if (q.type) add("l.location_type = ", q.type);
  if (q.sqmMin) add("l.sqm >= ", Number(q.sqmMin));
  if (q.sqmMax) add("l.sqm <= ", Number(q.sqmMax));
  if (q.rentMin) add("l.rent >= ", Number(q.rentMin));
  if (q.rentMax) add("l.rent <= ", Number(q.rentMax));
  if (q.potential) add("l.potential = ", q.potential);
  if (q.status) add("l.status = ", q.status);
  if (q.brandFit) add("COALESCE(l.brand_fit_score,0) >= ", Number(q.brandFit));
  if (q.footfall) add("COALESCE(l.footfall_score,0) >= ", Number(q.footfall));
  if (q.segment) add("COALESCE(l.segment,'') = ", q.segment);
  const whereSql = conds.join(" AND ");
  const countR = await pool.query(`SELECT COUNT(*)::int AS c FROM locations l WHERE ${whereSql}`, params);
  const total = countR.rows[0].c;
  const result = await pool.query(
    `SELECT l.* FROM locations l WHERE ${whereSql} ORDER BY ${sortCol} ${order} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, pageSize, offset],
  );
  const kpis = await computeLocationKpis();
  res.json({ items: result.rows.map(mapLocation), total, page, pageSize, kpis });
});

app.post("/api/locations/bulk", authMiddleware, async (req, res) => {
  const { ids = [], status = null, potential = null } = req.body || {};
  const idList = Array.isArray(ids) ? ids.map((x) => Number(x)).filter((n) => Number.isFinite(n)) : [];
  if (!idList.length) return res.status(400).json({ message: "ids zorunlu." });
  if (status) await pool.query("UPDATE locations SET status=$1, updated_at=NOW() WHERE id = ANY($2::int[])", [status, idList]);
  if (potential) await pool.query("UPDATE locations SET potential=$1, updated_at=NOW() WHERE id = ANY($2::int[])", [potential, idList]);
  res.json({ ok: true, updated: idList.length });
});

app.get("/api/locations/:id/detail", authMiddleware, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: "Geçersiz id." });
  const base = await pool.query("SELECT * FROM locations WHERE id=$1", [id]);
  if (base.rowCount === 0) return res.status(404).json({ message: "Kayıt bulunamadı." });
  const location = mapLocation(base.rows[0]);
  const [projects, investors] = await Promise.all([
    pool.query("SELECT * FROM projects WHERE location_id=$1 ORDER BY id DESC", [id]),
    pool.query(
      `SELECT i.*, ibm.score FROM investor_brand_matches ibm
       JOIN investors i ON i.id = ibm.investor_id
       WHERE ibm.brand_id::text = ANY($1::text[]) ORDER BY ibm.score DESC NULLS LAST LIMIT 30`,
      [location.recommendedBrands.map((x) => String(x))],
    ).catch(() => ({ rows: [] })),
  ]);
  res.json({ location, projects: projects.rows.map(mapProject), investors: investors.rows.map(mapInvestor) });
});

app.post("/api/locations", authMiddleware, async (req, res) => {
  const values = locationRowFromBody(req.body, req.user.id);
  const inserted = await pool.query(
    `INSERT INTO locations(
      name,location_type,sqm,rent,currency,potential,recommended_brands,address,traffic,owner,owner_phone,
      city,district,region,avenue_name,maps_link,segment,storefront_length,floor_info,chimney_status,infrastructure_status,
      revenue_rent_pct,dues,deposit,footfall_score,competitor_brands,target_customer_profile,suitable_sectors,status,brand_fit_score,street_class,avm_segment,files,notes,attachment_name,attachment_data,attachment_url,created_by
    ) VALUES(
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38
    ) RETURNING *`,
    values,
  );
  const item = mapLocation(inserted.rows[0]);
  await logActivity({ userId: req.user.id, moduleName: "locations", actionType: "create", recordId: item.id, summary: `${item.name} eklendi`, afterData: item });
  await pool.query(
    `INSERT INTO tasks(note,status,priority,due_date) VALUES($1,'Açık','Orta', CURRENT_DATE + INTERVAL '2 day')`,
    [`Analiz yap: ${item.name}`],
  );
  res.status(201).json(item);
});

app.put("/api/locations/:id", authMiddleware, async (req, res) => {
  const before = await pool.query("SELECT * FROM locations WHERE id=$1", [req.params.id]);
  const values = [...locationRowFromBody(req.body, req.user.id), req.params.id];
  const updated = await pool.query(
    `UPDATE locations SET
      name=$1,location_type=$2,sqm=$3,rent=$4,currency=$5,potential=$6,recommended_brands=$7,address=$8,traffic=$9,owner=$10,owner_phone=$11,
      city=$12,district=$13,region=$14,avenue_name=$15,maps_link=$16,segment=$17,storefront_length=$18,floor_info=$19,chimney_status=$20,infrastructure_status=$21,
      revenue_rent_pct=$22,dues=$23,deposit=$24,footfall_score=$25,competitor_brands=$26,target_customer_profile=$27,suitable_sectors=$28,status=$29,brand_fit_score=$30,street_class=$31,avm_segment=$32,files=$33,notes=$34,attachment_name=$35,attachment_data=$36,attachment_url=$37,created_by=$38,updated_at=NOW()
      WHERE id=$39 RETURNING *`,
    values,
  );
  if (updated.rowCount === 0) return res.status(404).json({ message: "Kayıt bulunamadı." });
  const item = mapLocation(updated.rows[0]);
  if (item.status === "Kiralandı") {
    await pool.query(`UPDATE projects SET stage='Kapanış', progress=100, updated_at=NOW() WHERE location_id=$1 AND stage <> 'Kapanış'`, [item.id]);
  }
  await logActivity({ userId: req.user.id, moduleName: "locations", actionType: "update", recordId: item.id, summary: `${item.name} güncellendi`, beforeData: before.rows[0] || null, afterData: item });
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

function projectRowFromBody(body) {
  const b = body || {};
  return [
    b.name,
    b.type || b.projectType || "Franchise",
    b.owner || b.ownerTeam || "Operasyon",
    Array.isArray(b.assignees) ? b.assignees : [],
    b.priority || "Orta",
    Number(b.progress || 0),
    b.stage || b.pipelineStage || "Lead",
    b.dueDate || b.closeDate || null,
    b.description || null,
    Array.isArray(b.checklist) ? b.checklist : [],
    b.investorId || b.investor_id || null,
    b.brandId || b.brand_id || null,
    b.locationId || b.location_id || null,
    b.estimatedInvestment == null || b.estimatedInvestment === "" ? null : Number(b.estimatedInvestment),
    b.estimatedRevenue == null || b.estimatedRevenue === "" ? null : Number(b.estimatedRevenue),
    b.ownerPerson || null,
    b.startDate || null,
    b.closeDate || null,
    b.riskLevel || null,
    b.pipelineStage || b.stage || null,
    Array.isArray(b.files) ? b.files : [],
  ];
}

async function computeProjectKpis() {
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
  const [total, active, closed, waiting, avgClose, monthOpen] = await Promise.all([
    pool.query("SELECT COUNT(*)::int AS c FROM projects"),
    pool.query("SELECT COUNT(*)::int AS c FROM projects WHERE stage NOT IN ('Kapanış')"),
    pool.query("SELECT COUNT(*)::int AS c FROM projects WHERE stage='Kapanış'"),
    pool.query("SELECT COUNT(*)::int AS c FROM projects WHERE stage IN ('Lead','Analiz')"),
    pool.query("SELECT COALESCE(AVG(EXTRACT(DAY FROM (COALESCE(close_date,due_date) - created_at::date))),0)::numeric AS a FROM projects WHERE stage='Kapanış'"),
    pool.query("SELECT COUNT(*)::int AS c FROM projects WHERE created_at::date >= $1::date", [monthStart]),
  ]);
  return {
    total: total.rows[0].c,
    active: active.rows[0].c,
    closed: closed.rows[0].c,
    waiting: waiting.rows[0].c,
    avgCloseDays: Number(avgClose.rows[0].a || 0),
    newThisMonth: monthOpen.rows[0].c,
  };
}

app.get("/api/projects", authMiddleware, async (req, res) => {
  const q = req.query || {};
  const page = Math.max(1, Number(q.page) || 1);
  const pageSize = Math.min(100, Math.max(5, Number(q.pageSize) || 20));
  const offset = (page - 1) * pageSize;
  const conds = ["1=1"];
  const params = [];
  const add = (sql, val) => {
    params.push(val);
    conds.push(`${sql}$${params.length}`);
  };
  if (q.name) add("p.name ILIKE ", `%${q.name}%`);
  if (q.type) add("p.project_type = ", q.type);
  if (q.stage) add("p.stage = ", q.stage);
  if (q.priority) add("p.priority = ", q.priority);
  if (q.investorId) add("p.investor_id = ", Number(q.investorId));
  if (q.brandId) add("p.brand_id = ", Number(q.brandId));
  if (q.locationId) add("p.location_id = ", Number(q.locationId));
  if (q.startFrom) add("COALESCE(p.start_date, p.created_at::date) >= ", q.startFrom);
  if (q.closeTo) add("COALESCE(p.close_date, p.due_date) <= ", q.closeTo);
  const whereSql = conds.join(" AND ");
  const totalR = await pool.query(`SELECT COUNT(*)::int AS c FROM projects p WHERE ${whereSql}`, params);
  const list = await pool.query(
    `SELECT p.*, i.name AS investor_name, b.name AS brand_name, l.name AS location_name
     FROM projects p
     LEFT JOIN investors i ON i.id = p.investor_id
     LEFT JOIN brands b ON b.id = p.brand_id
     LEFT JOIN locations l ON l.id = p.location_id
     WHERE ${whereSql}
     ORDER BY p.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, pageSize, offset],
  );
  const items = list.rows.map((r) => {
    const m = mapProject(r);
    m.investorName = r.investor_name || "";
    m.brandName = r.brand_name || "";
    m.locationName = r.location_name || "";
    return m;
  });
  const kpis = await computeProjectKpis();
  res.json({ items, total: totalR.rows[0].c, page, pageSize, kpis });
});

app.get("/api/projects/kanban", authMiddleware, async (req, res) => {
  const rows = await pool.query("SELECT * FROM projects ORDER BY created_at DESC");
  const byStage = {};
  rows.rows.forEach((r) => {
    const key = r.stage || "Lead";
    if (!byStage[key]) byStage[key] = [];
    byStage[key].push(mapProject(r));
  });
  res.json(byStage);
});

app.post("/api/projects/bulk", authMiddleware, async (req, res) => {
  const { ids = [], stage = null, priority = null } = req.body || {};
  const idList = Array.isArray(ids) ? ids.map((x) => Number(x)).filter((n) => Number.isFinite(n)) : [];
  if (!idList.length) return res.status(400).json({ message: "ids zorunlu." });
  if (stage) await pool.query("UPDATE projects SET stage=$1, pipeline_stage=$1, updated_at=NOW() WHERE id = ANY($2::int[])", [stage, idList]);
  if (priority) await pool.query("UPDATE projects SET priority=$1, updated_at=NOW() WHERE id = ANY($2::int[])", [priority, idList]);
  res.json({ ok: true, updated: idList.length });
});

app.get("/api/projects/:id/detail", authMiddleware, async (req, res) => {
  const id = Number(req.params.id);
  const row = await pool.query("SELECT * FROM projects WHERE id=$1", [id]);
  if (row.rowCount === 0) return res.status(404).json({ message: "Kayıt bulunamadı." });
  const project = mapProject(row.rows[0]);
  const [tasks, contracts] = await Promise.all([
    pool.query("SELECT * FROM tasks WHERE note ILIKE $1 ORDER BY id DESC LIMIT 100", [`%${project.name}%`]),
    pool.query("SELECT * FROM contracts WHERE brand_id=$1 OR investor_id=$2 ORDER BY id DESC", [project.brandId || 0, project.investorId || 0]),
  ]);
  res.json({ project, tasks: tasks.rows.map(mapTask), contracts: contracts.rows.map(mapContract) });
});

app.post("/api/projects", authMiddleware, async (req, res) => {
  const inserted = await pool.query(
    `INSERT INTO projects(
      name,project_type,owner_team,assignees,priority,progress,stage,due_date,description,checklist,investor_id,brand_id,location_id,estimated_investment,estimated_revenue,owner_person,start_date,close_date,risk_level,pipeline_stage,files
    ) VALUES(
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21
    ) RETURNING *`,
    projectRowFromBody(req.body),
  );
  const project = mapProject(inserted.rows[0]);
  if (project.investorId) {
    await pool.query(`UPDATE investors SET last_activity_at=NOW(), updated_at=NOW() WHERE id=$1`, [project.investorId]);
  }
  if (project.brandId) {
    await pool.query(`UPDATE brands SET updated_at=NOW() WHERE id=$1`, [project.brandId]);
  }
  if (project.locationId) {
    await pool.query(`UPDATE locations SET updated_at=NOW() WHERE id=$1`, [project.locationId]);
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
  await pool.query(
    `INSERT INTO tasks(note,status,priority,due_date) VALUES
     ($1,'Açık','Orta',CURRENT_DATE + INTERVAL '2 day'),
     ($2,'Açık','Orta',CURRENT_DATE + INTERVAL '5 day')`,
    [`Proje başlangıç analizi: ${project.name}`, `Saha ve teklif hazırlığı: ${project.name}`],
  );
  res.status(201).json(project);
});

app.put("/api/projects/:id", authMiddleware, async (req, res) => {
  const before = await pool.query("SELECT * FROM projects WHERE id=$1", [req.params.id]);
  const updated = await pool.query(
    `UPDATE projects
     SET name=$1,project_type=$2,owner_team=$3,assignees=$4,priority=$5,progress=$6,stage=$7,due_date=$8,description=$9,checklist=$10,investor_id=$11,brand_id=$12,location_id=$13,estimated_investment=$14,estimated_revenue=$15,owner_person=$16,start_date=$17,close_date=$18,risk_level=$19,pipeline_stage=$20,files=$21,updated_at=NOW()
     WHERE id=$22 RETURNING *`,
    [...projectRowFromBody(req.body), req.params.id],
  );
  if (updated.rowCount === 0) {
    return res.status(404).json({ message: "Kayıt bulunamadı." });
  }
  const item = mapProject(updated.rows[0]);
  if ((before.rows[0]?.stage || "") !== item.stage && item.stage === "Sözleşme") {
    await pool.query(
      `INSERT INTO contracts(note,contract_type,status,counterparty,brand_id,investor_id)
       VALUES($1,'Otomatik', 'Taslak', $2, $3, $4)`,
      [`Proje sözleşme başlangıcı: ${item.name}`, item.name, item.brandId || null, item.investorId || null],
    );
  }
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

// ─── CONTRACT KPI ────────────────────────────────────────────────────────────
async function computeContractKpis() {
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
  const thirtyDays = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];
  const today = new Date().toISOString().split("T")[0];
  const [total, active, signedMonth, expiringSoon, terminated, totalValue] = await Promise.all([
    pool.query("SELECT COUNT(*)::int AS c FROM contracts WHERE deleted_at IS NULL"),
    pool.query("SELECT COUNT(*)::int AS c FROM contracts WHERE deleted_at IS NULL AND status='Aktif'"),
    pool.query("SELECT COUNT(*)::int AS c FROM contracts WHERE deleted_at IS NULL AND sign_date >= $1::date", [monthStart]),
    pool.query("SELECT COUNT(*)::int AS c FROM contracts WHERE deleted_at IS NULL AND status='Aktif' AND end_date BETWEEN $1::date AND $2::date", [today, thirtyDays]),
    pool.query("SELECT COUNT(*)::int AS c FROM contracts WHERE deleted_at IS NULL AND status='Feshedildi'"),
    pool.query("SELECT COALESCE(SUM(amount::numeric),0)::numeric AS s FROM contracts WHERE deleted_at IS NULL AND status IN ('Aktif','İmzalandı')"),
  ]);
  return {
    total: total.rows[0].c,
    active: active.rows[0].c,
    signedThisMonth: signedMonth.rows[0].c,
    expiringSoon: expiringSoon.rows[0].c,
    terminated: terminated.rows[0].c,
    totalValue: Number(totalValue.rows[0].s || 0),
  };
}

app.get("/api/contracts", authMiddleware, async (req, res) => {
  const q = req.query || {};
  const page = Math.max(1, Number(q.page) || 1);
  const pageSize = Math.min(100, Math.max(5, Number(q.pageSize) || 20));
  const offset = (page - 1) * pageSize;
  const conds = ["c.deleted_at IS NULL"];
  const params = [];
  const add = (sql, val) => { params.push(val); conds.push(`${sql}$${params.length}`); };
  if (q.name) add("c.name ILIKE ", `%${q.name}%`);
  if (q.type) add("c.contract_type = ", q.type);
  if (q.status) add("c.status = ", q.status);
  if (q.investorId) add("c.investor_id = ", Number(q.investorId));
  if (q.brandId) add("c.brand_id = ", Number(q.brandId));
  if (q.projectId) add("c.project_id = ", Number(q.projectId));
  if (q.locationId) add("c.location_id = ", Number(q.locationId));
  if (q.consultant) add("c.consultant_name ILIKE ", `%${q.consultant}%`);
  if (q.startFrom) add("c.start_date >= ", q.startFrom);
  if (q.startTo) add("c.start_date <= ", q.startTo);
  if (q.endFrom) add("c.end_date >= ", q.endFrom);
  if (q.endTo) add("c.end_date <= ", q.endTo);
  if (q.amountMin) add("c.amount >= ", Number(q.amountMin));
  if (q.amountMax) add("c.amount <= ", Number(q.amountMax));
  const whereSql = conds.join(" AND ");
  const totalR = await pool.query(`SELECT COUNT(*)::int AS c FROM contracts c WHERE ${whereSql}`, params);
  const rows = await pool.query(
    `SELECT c.*, i.name AS investor_name, b.name AS brand_name, p.name AS project_name, l.name AS location_name
     FROM contracts c
     LEFT JOIN investors i ON i.id = c.investor_id
     LEFT JOIN brands b ON b.id = c.brand_id
     LEFT JOIN projects p ON p.id = c.project_id
     LEFT JOIN locations l ON l.id = c.location_id
     WHERE ${whereSql}
     ORDER BY c.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, pageSize, offset],
  );
  const kpis = await computeContractKpis();
  // Check contracts expiring in 30 days
  const today = new Date().toISOString().split("T")[0];
  const soon = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];
  const warnings = await pool.query(
    `SELECT id, name, end_date FROM contracts WHERE deleted_at IS NULL AND status='Aktif' AND end_date BETWEEN $1::date AND $2::date ORDER BY end_date ASC LIMIT 10`,
    [today, soon],
  );
  res.json({ items: rows.rows.map(mapContract), total: totalR.rows[0].c, page, pageSize, kpis, expiryWarnings: warnings.rows });
});

app.get("/api/contracts/:id/detail", authMiddleware, async (req, res) => {
  const id = Number(req.params.id);
  const row = await pool.query(
    `SELECT c.*, i.name AS investor_name, b.name AS brand_name, p.name AS project_name, l.name AS location_name
     FROM contracts c
     LEFT JOIN investors i ON i.id = c.investor_id
     LEFT JOIN brands b ON b.id = c.brand_id
     LEFT JOIN projects p ON p.id = c.project_id
     LEFT JOIN locations l ON l.id = c.location_id
     WHERE c.id=$1`, [id],
  );
  if (row.rowCount === 0) return res.status(404).json({ message: "Bulunamadı." });
  const contract = mapContract(row.rows[0]);
  const [financeRecords, agreements] = await Promise.all([
    pool.query("SELECT fr.*, c.name AS contract_name FROM finance_records fr LEFT JOIN contracts c ON c.id=fr.contract_id WHERE fr.contract_id=$1 ORDER BY fr.id DESC", [id]),
    pool.query("SELECT * FROM brand_agreements WHERE brand_id=$1 ORDER BY version_no DESC", [row.rows[0].brand_id || 0]),
  ]);
  res.json({
    contract,
    financeRecords: financeRecords.rows.map(mapFinanceRecord),
    agreements: agreements.rows,
  });
});

app.post("/api/contracts", authMiddleware, async (req, res) => {
  const b = req.body || {};
  const inserted = await pool.query(
    `INSERT INTO contracts(
      name, note, contract_type, status, counterparty, start_date, end_date, sign_date, renewal_date,
      amount, consulting_fee, franchise_commission, franchise_commission_pct, location_commission, extra_income,
      currency, file_url, docs_urls,
      investor_id, brand_id, project_id, location_id,
      consultant_name, legal_person, finance_person, risk_level, risk_note, notes, created_by
    ) VALUES(
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29
    ) RETURNING *`,
    [
      b.name || b.note || "Yeni sözleşme",
      b.note || null,
      b.type || b.contractType || null,
      b.status || "Taslak",
      b.counterparty || null,
      b.startDate || null, b.endDate || null, b.signDate || null, b.renewalDate || null,
      b.amount ? Number(b.amount) : null,
      b.consultingFee ? Number(b.consultingFee) : null,
      b.franchiseCommission ? Number(b.franchiseCommission) : null,
      b.franchiseCommissionPct ? Number(b.franchiseCommissionPct) : null,
      b.locationCommission ? Number(b.locationCommission) : null,
      b.extraIncome || null,
      b.currency || "TRY",
      b.fileUrl || null,
      Array.isArray(b.docsUrls) ? b.docsUrls : [],
      b.investorId || b.investor_id || null,
      b.brandId || b.brand_id || null,
      b.projectId || b.project_id || null,
      b.locationId || b.location_id || null,
      b.consultantName || null, b.legalPerson || null, b.financePerson || null,
      b.riskLevel || null, b.riskNote || null, b.notes || null,
      req.user.id,
    ],
  );
  const item = mapContract(inserted.rows[0]);
  await logActivity({ userId: req.user.id, moduleName: "contracts", actionType: "create", recordId: item.id, summary: `${item.name} oluşturuldu`, afterData: item });
  // Otomasyon: İmzalandı → finans kaydı oluştur
  if (item.status === "İmzalandı" && item.amount) {
    await pool.query(
      `INSERT INTO finance_records(contract_id,investor_id,brand_id,income_type,amount,net_amount,currency,description,created_by)
       VALUES($1,$2,$3,'Danışmanlık',$4,$4,$5,$6,$7)`,
      [item.id, item.investorId, item.brandId, Number(item.amount), item.currency, `${item.name} – otomatik finans kaydı`, req.user.id],
    );
  }
  res.status(201).json(item);
});

app.put("/api/contracts/:id", authMiddleware, async (req, res) => {
  const b = req.body || {};
  const before = await pool.query("SELECT * FROM contracts WHERE id=$1", [req.params.id]);
  const updated = await pool.query(
    `UPDATE contracts SET
      name=$1, note=$2, contract_type=$3, status=$4, counterparty=$5, start_date=$6, end_date=$7, sign_date=$8, renewal_date=$9,
      amount=$10, consulting_fee=$11, franchise_commission=$12, franchise_commission_pct=$13, location_commission=$14, extra_income=$15,
      currency=$16, file_url=$17, docs_urls=$18,
      investor_id=$19, brand_id=$20, project_id=$21, location_id=$22,
      consultant_name=$23, legal_person=$24, finance_person=$25, risk_level=$26, risk_note=$27, notes=$28, updated_at=NOW()
     WHERE id=$29 RETURNING *`,
    [
      b.name || before.rows[0]?.name,
      b.note || null,
      b.type || b.contractType || null,
      b.status || "Taslak",
      b.counterparty || null,
      b.startDate || null, b.endDate || null, b.signDate || null, b.renewalDate || null,
      b.amount ? Number(b.amount) : null,
      b.consultingFee ? Number(b.consultingFee) : null,
      b.franchiseCommission ? Number(b.franchiseCommission) : null,
      b.franchiseCommissionPct ? Number(b.franchiseCommissionPct) : null,
      b.locationCommission ? Number(b.locationCommission) : null,
      b.extraIncome || null,
      b.currency || "TRY",
      b.fileUrl || null,
      Array.isArray(b.docsUrls) ? b.docsUrls : [],
      b.investorId ?? before.rows[0]?.investor_id ?? null,
      b.brandId ?? before.rows[0]?.brand_id ?? null,
      b.projectId ?? before.rows[0]?.project_id ?? null,
      b.locationId ?? before.rows[0]?.location_id ?? null,
      b.consultantName || null, b.legalPerson || null, b.financePerson || null,
      b.riskLevel || null, b.riskNote || null, b.notes || null,
      req.params.id,
    ],
  );
  if (updated.rowCount === 0) return res.status(404).json({ message: "Kayıt bulunamadı." });
  const item = mapContract(updated.rows[0]);
  const prevStatus = before.rows[0]?.status || "";
  // Otomasyon: Yeni İmzalandı → finans kaydı
  if (prevStatus !== "İmzalandı" && item.status === "İmzalandı" && item.amount) {
    const existing = await pool.query("SELECT id FROM finance_records WHERE contract_id=$1 LIMIT 1", [item.id]);
    if (existing.rowCount === 0) {
      await pool.query(
        `INSERT INTO finance_records(contract_id,investor_id,brand_id,income_type,amount,net_amount,currency,description,created_by)
         VALUES($1,$2,$3,'Danışmanlık',$4,$4,$5,$6,$7)`,
        [item.id, item.investorId, item.brandId, Number(item.amount), item.currency, `${item.name} – otomatik finans kaydı`, req.user.id],
      );
    }
  }
  // Otomasyon: Feshedildi → finans iptal
  if (item.status === "Feshedildi") {
    await pool.query(`UPDATE finance_records SET status='İptal', updated_at=NOW() WHERE contract_id=$1 AND status='Açık'`, [item.id]);
  }
  await logActivity({ userId: req.user.id, moduleName: "contracts", actionType: "update", recordId: item.id, summary: `${item.name} güncellendi`, beforeData: before.rows[0] || null, afterData: item });
  res.json(item);
});

app.delete("/api/contracts/:id", authMiddleware, async (req, res) => {
  const row = await pool.query("SELECT id,name FROM contracts WHERE id=$1", [req.params.id]);
  await pool.query("UPDATE contracts SET deleted_at=NOW() WHERE id=$1", [req.params.id]);
  if (row.rowCount > 0) {
    await logActivity({ userId: req.user.id, moduleName: "contracts", actionType: "delete", recordId: Number(req.params.id), summary: `${row.rows[0].name || "Sözleşme"} silindi`, beforeData: row.rows[0] });
  }
  res.status(204).send();
});

// ─── FINANCE RECORDS ─────────────────────────────────────────────────────────
async function computeFinanceKpis() {
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
  const today = new Date().toISOString().split("T")[0];
  const [totalIncome, collected, pending, overdue, monthIncome, totalExpense] = await Promise.all([
    pool.query("SELECT COALESCE(SUM(amount::numeric),0)::numeric AS s FROM finance_records WHERE deleted_at IS NULL"),
    pool.query("SELECT COALESCE(SUM(amount::numeric),0)::numeric AS s FROM finance_records WHERE deleted_at IS NULL AND status='Tahsil edildi'"),
    pool.query("SELECT COALESCE(SUM(amount::numeric),0)::numeric AS s FROM finance_records WHERE deleted_at IS NULL AND status='Açık'"),
    pool.query("SELECT COALESCE(SUM(amount::numeric),0)::numeric AS s FROM finance_records WHERE deleted_at IS NULL AND status='Gecikti'"),
    pool.query("SELECT COALESCE(SUM(amount::numeric),0)::numeric AS s FROM finance_records WHERE deleted_at IS NULL AND created_at::date >= $1::date", [monthStart]),
    pool.query("SELECT COALESCE(SUM(amount::numeric),0)::numeric AS s FROM finance_expenses WHERE expense_date >= $1::date", [monthStart]),
  ]);
  const net = Number(collected.rows[0].s || 0) - Number(totalExpense.rows[0].s || 0);
  return {
    totalIncome: Number(totalIncome.rows[0].s || 0),
    collected: Number(collected.rows[0].s || 0),
    pending: Number(pending.rows[0].s || 0),
    overdue: Number(overdue.rows[0].s || 0),
    monthIncome: Number(monthIncome.rows[0].s || 0),
    netProfit: net,
  };
}

app.get("/api/finance", authMiddleware, async (req, res) => {
  const q = req.query || {};
  const page = Math.max(1, Number(q.page) || 1);
  const pageSize = Math.min(100, Math.max(5, Number(q.pageSize) || 20));
  const offset = (page - 1) * pageSize;
  const conds = ["fr.deleted_at IS NULL"];
  const params = [];
  const add = (sql, val) => { params.push(val); conds.push(`${sql}$${params.length}`); };
  if (q.contractId) add("fr.contract_id = ", Number(q.contractId));
  if (q.investorId) add("fr.investor_id = ", Number(q.investorId));
  if (q.brandId) add("fr.brand_id = ", Number(q.brandId));
  if (q.projectId) add("fr.project_id = ", Number(q.projectId));
  if (q.incomeType) add("fr.income_type = ", q.incomeType);
  if (q.status) add("fr.status = ", q.status);
  if (q.dateFrom) add("fr.created_at::date >= ", q.dateFrom);
  if (q.dateTo) add("fr.created_at::date <= ", q.dateTo);
  const where = conds.join(" AND ");
  const totalR = await pool.query(`SELECT COUNT(*)::int AS c FROM finance_records fr WHERE ${where}`, params);
  const rows = await pool.query(
    `SELECT fr.*, c.name AS contract_name, i.name AS investor_name, b.name AS brand_name
     FROM finance_records fr
     LEFT JOIN contracts c ON c.id = fr.contract_id
     LEFT JOIN investors i ON i.id = fr.investor_id
     LEFT JOIN brands b ON b.id = fr.brand_id
     WHERE ${where}
     ORDER BY fr.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, pageSize, offset],
  );
  const kpis = await computeFinanceKpis();
  // Overdue warnings
  const today = new Date().toISOString().split("T")[0];
  const overdueWarn = await pool.query(
    `SELECT id, contract_id, amount, due_date FROM finance_records WHERE deleted_at IS NULL AND status='Açık' AND due_date < $1::date ORDER BY due_date ASC LIMIT 10`,
    [today],
  );
  res.json({ items: rows.rows.map(mapFinanceRecord), total: totalR.rows[0].c, page, pageSize, kpis, overdueWarnings: overdueWarn.rows });
});

app.get("/api/finance/:id", authMiddleware, async (req, res) => {
  const id = Number(req.params.id);
  const row = await pool.query(
    `SELECT fr.*, c.name AS contract_name, i.name AS investor_name, b.name AS brand_name
     FROM finance_records fr
     LEFT JOIN contracts c ON c.id=fr.contract_id
     LEFT JOIN investors i ON i.id=fr.investor_id
     LEFT JOIN brands b ON b.id=fr.brand_id
     WHERE fr.id=$1`, [id],
  );
  if (row.rowCount === 0) return res.status(404).json({ message: "Bulunamadı." });
  const plans = await pool.query("SELECT * FROM payment_plans WHERE finance_record_id=$1 ORDER BY taksit_no ASC", [id]);
  res.json({ record: mapFinanceRecord(row.rows[0]), paymentPlans: plans.rows.map(mapPaymentPlan) });
});

app.post("/api/finance", authMiddleware, async (req, res) => {
  const b = req.body || {};
  const amount = Number(b.amount || 0);
  const vatPct = Number(b.vatPct || 0);
  const vatAmount = Math.round(amount * vatPct / 100 * 100) / 100;
  const netAmount = amount + vatAmount;
  const inserted = await pool.query(
    `INSERT INTO finance_records(contract_id,project_id,investor_id,brand_id,income_type,amount,vat_pct,vat_amount,net_amount,currency,description,payment_type,status,consultant_commission_pct,company_share_pct,due_date,payment_method,created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
    [
      b.contractId || null, b.projectId || null, b.investorId || null, b.brandId || null,
      b.incomeType || "Danışmanlık",
      amount, vatPct, vatAmount, netAmount,
      b.currency || "TRY",
      b.description || null,
      b.paymentType || "Peşin",
      b.status || "Açık",
      b.consultantCommissionPct != null ? Number(b.consultantCommissionPct) : null,
      b.companySharePct != null ? Number(b.companySharePct) : null,
      b.dueDate || null,
      b.paymentMethod || null,
      req.user.id,
    ],
  );
  const item = mapFinanceRecord(inserted.rows[0]);
  // Auto-create payment plan for taksitli
  if (b.paymentType === "Taksitli" && Array.isArray(b.installments) && b.installments.length > 0) {
    for (const inst of b.installments) {
      await pool.query(
        `INSERT INTO payment_plans(finance_record_id,taksit_no,amount,due_date,status) VALUES($1,$2,$3,$4,'Bekliyor')`,
        [item.id, Number(inst.no || 1), Number(inst.amount || 0), inst.dueDate],
      );
    }
  }
  await logActivity({ userId: req.user.id, moduleName: "finance", actionType: "create", recordId: item.id, summary: `Finans kaydı oluşturuldu: ${item.incomeType}`, afterData: item });
  res.status(201).json(item);
});

app.put("/api/finance/:id", authMiddleware, async (req, res) => {
  const b = req.body || {};
  const amount = Number(b.amount || 0);
  const vatPct = Number(b.vatPct || 0);
  const vatAmount = Math.round(amount * vatPct / 100 * 100) / 100;
  const netAmount = amount + vatAmount;
  const updated = await pool.query(
    `UPDATE finance_records SET contract_id=$1,project_id=$2,investor_id=$3,brand_id=$4,income_type=$5,amount=$6,vat_pct=$7,vat_amount=$8,net_amount=$9,currency=$10,description=$11,payment_type=$12,status=$13,consultant_commission_pct=$14,company_share_pct=$15,due_date=$16,paid_date=$17,payment_method=$18,updated_at=NOW()
     WHERE id=$19 RETURNING *`,
    [
      b.contractId || null, b.projectId || null, b.investorId || null, b.brandId || null,
      b.incomeType || "Danışmanlık",
      amount, vatPct, vatAmount, netAmount,
      b.currency || "TRY", b.description || null, b.paymentType || "Peşin", b.status || "Açık",
      b.consultantCommissionPct != null ? Number(b.consultantCommissionPct) : null,
      b.companySharePct != null ? Number(b.companySharePct) : null,
      b.dueDate || null, b.paidDate || null, b.paymentMethod || null,
      req.params.id,
    ],
  );
  if (updated.rowCount === 0) return res.status(404).json({ message: "Bulunamadı." });
  res.json(mapFinanceRecord(updated.rows[0]));
});

app.delete("/api/finance/:id", authMiddleware, async (req, res) => {
  await pool.query("UPDATE finance_records SET deleted_at=NOW() WHERE id=$1", [req.params.id]);
  res.status(204).send();
});

// Ödeme al (taksit / peşin)
app.post("/api/finance/:id/collect", authMiddleware, async (req, res) => {
  const { amount = null, paymentMethod = "Banka Transferi", paidDate = null, installmentId = null } = req.body || {};
  const today = paidDate || new Date().toISOString().split("T")[0];
  if (installmentId) {
    await pool.query(`UPDATE payment_plans SET status='Ödendi', paid_date=$1, payment_method=$2, updated_at=NOW() WHERE id=$3`, [today, paymentMethod, installmentId]);
    // Check if all installments paid
    const rec = await pool.query("SELECT finance_record_id FROM payment_plans WHERE id=$1", [installmentId]);
    if (rec.rowCount > 0) {
      const remaining = await pool.query(`SELECT COUNT(*)::int AS c FROM payment_plans WHERE finance_record_id=$1 AND status<>'Ödendi'`, [rec.rows[0].finance_record_id]);
      if (remaining.rows[0].c === 0) {
        await pool.query(`UPDATE finance_records SET status='Tahsil edildi', paid_date=$1, updated_at=NOW() WHERE id=$2`, [today, rec.rows[0].finance_record_id]);
      }
    }
  } else {
    await pool.query(`UPDATE finance_records SET status='Tahsil edildi', paid_date=$1, payment_method=$2, updated_at=NOW() WHERE id=$3`, [today, paymentMethod, req.params.id]);
  }
  res.json({ ok: true });
});

// Ödeme planı upsert
app.post("/api/finance/:id/payment-plan", authMiddleware, async (req, res) => {
  const { installments = [] } = req.body || {};
  const finId = Number(req.params.id);
  await pool.query("DELETE FROM payment_plans WHERE finance_record_id=$1", [finId]);
  for (const inst of installments) {
    await pool.query(
      `INSERT INTO payment_plans(finance_record_id,taksit_no,amount,due_date,status,note) VALUES($1,$2,$3,$4,$5,$6)`,
      [finId, Number(inst.no || 1), Number(inst.amount || 0), inst.dueDate, inst.status || "Bekliyor", inst.note || null],
    );
  }
  const plans = await pool.query("SELECT * FROM payment_plans WHERE finance_record_id=$1 ORDER BY taksit_no", [finId]);
  res.json(plans.rows.map(mapPaymentPlan));
});

// Gider API
app.get("/api/finance/expenses", authMiddleware, async (req, res) => {
  const q = req.query || {};
  const conds = ["1=1"]; const params = [];
  const add = (sql, val) => { params.push(val); conds.push(`${sql}$${params.length}`); };
  if (q.projectId) add("e.project_id = ", Number(q.projectId));
  if (q.contractId) add("e.contract_id = ", Number(q.contractId));
  if (q.type) add("e.expense_type = ", q.type);
  if (q.dateFrom) add("e.expense_date >= ", q.dateFrom);
  if (q.dateTo) add("e.expense_date <= ", q.dateTo);
  const rows = await pool.query(`SELECT e.*, p.name AS project_name FROM finance_expenses e LEFT JOIN projects p ON p.id=e.project_id WHERE ${conds.join(" AND ")} ORDER BY e.expense_date DESC`, params);
  res.json(rows.rows.map(mapExpense));
});

app.post("/api/finance/expenses", authMiddleware, async (req, res) => {
  const b = req.body || {};
  const inserted = await pool.query(
    `INSERT INTO finance_expenses(contract_id,project_id,expense_type,amount,currency,expense_date,description,created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [b.contractId || null, b.projectId || null, b.expenseType || "Operasyon", Number(b.amount || 0), b.currency || "TRY", b.expenseDate || new Date().toISOString().split("T")[0], b.description || null, req.user.id],
  );
  res.status(201).json(mapExpense(inserted.rows[0]));
});

app.delete("/api/finance/expenses/:id", authMiddleware, async (req, res) => {
  await pool.query("DELETE FROM finance_expenses WHERE id=$1", [req.params.id]);
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

const TASK_BASE_SELECT = `
  SELECT t.*,
    i.name AS investor_name,
    b.name AS brand_name,
    p.name AS project_name,
    l.name AS location_name,
    c.name AS contract_name
  FROM tasks t
  LEFT JOIN investors i ON i.id = t.investor_id
  LEFT JOIN brands b ON b.id = t.brand_id
  LEFT JOIN projects p ON p.id = t.project_id
  LEFT JOIN locations l ON l.id = t.location_id
  LEFT JOIN contracts c ON c.id = t.contract_id
`;

app.get("/api/tasks/kpis", authMiddleware, async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];
    const [total, open, inProgress, done, overdue, thisWeek, critical] = await Promise.all([
      pool.query("SELECT COUNT(*)::int AS c FROM tasks WHERE deleted_at IS NULL"),
      pool.query("SELECT COUNT(*)::int AS c FROM tasks WHERE status='Açık' AND deleted_at IS NULL"),
      pool.query("SELECT COUNT(*)::int AS c FROM tasks WHERE status='Devam Ediyor' AND deleted_at IS NULL"),
      pool.query("SELECT COUNT(*)::int AS c FROM tasks WHERE status='Tamamlandı' AND deleted_at IS NULL"),
      pool.query("SELECT COUNT(*)::int AS c FROM tasks WHERE status != 'Tamamlandı' AND due_date < $1 AND deleted_at IS NULL", [today]),
      pool.query("SELECT COUNT(*)::int AS c FROM tasks WHERE status != 'Tamamlandı' AND due_date BETWEEN $1 AND $2 AND deleted_at IS NULL", [today, weekEnd]),
      pool.query("SELECT COUNT(*)::int AS c FROM tasks WHERE priority IN ('Yüksek','Çok Yüksek') AND status != 'Tamamlandı' AND deleted_at IS NULL"),
    ]);
    res.json({
      total: total.rows[0].c, open: open.rows[0].c, inProgress: inProgress.rows[0].c,
      done: done.rows[0].c, overdue: overdue.rows[0].c, thisWeek: thisWeek.rows[0].c, critical: critical.rows[0].c,
    });
  } catch (err) { next(err); }
});

app.get("/api/tasks", authMiddleware, async (req, res) => {
  try {
    const q = req.query || {};
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(100, Math.max(5, Number(q.pageSize) || 50));
    const offset = (page - 1) * pageSize;
    const conds = ["t.deleted_at IS NULL"];
    const params = [];
    const add = (sql, val) => { params.push(val); conds.push(`${sql}$${params.length}`); };

    if (req.user.role !== "admin" && req.user.role !== "manager") {
      const member = await pool.query("SELECT id FROM team_members WHERE user_id=$1 LIMIT 1", [req.user.id]);
      if (member.rowCount > 0) {
        add("t.assignee_id = ", member.rows[0].id);
      }
    }
    if (q.q) {
      params.push(`%${q.q}%`);
      conds.push(`(t.title ILIKE $${params.length} OR t.note ILIKE $${params.length} OR t.description ILIKE $${params.length})`);
    }
    if (q.status) add("t.status = ", q.status);
    if (q.priority) add("t.priority = ", q.priority);
    if (q.moduleType) add("t.module_type = ", q.moduleType);
    if (q.assigneeName) add("t.assignee_name ILIKE ", `%${q.assigneeName}%`);
    if (q.dateFrom) add("t.due_date >= ", q.dateFrom);
    if (q.dateTo) add("t.due_date <= ", q.dateTo);
    if (q.overdue === "true") { const today = new Date().toISOString().split("T")[0]; add("t.due_date < ", today); conds.push("t.status != 'Tamamlandı'"); }
    if (q.investorId) add("t.investor_id = ", Number(q.investorId));
    if (q.projectId) add("t.project_id = ", Number(q.projectId));

    const where = conds.join(" AND ");
    const countR = await pool.query(`SELECT COUNT(*)::int AS c FROM tasks t WHERE ${where}`, params);
    const listParams = [...params, pageSize, offset];
    const sortCol = { due_date: "t.due_date", priority: "t.priority", status: "t.status", created_at: "t.created_at" }[q.sort] || "t.created_at";
    const order = q.order === "asc" ? "ASC" : "DESC";
    const result = await pool.query(
      `${TASK_BASE_SELECT} WHERE ${where} ORDER BY ${sortCol} ${order} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      listParams
    );
    res.json({ items: result.rows.map(mapTask), total: countR.rows[0].c, page, pageSize });
  } catch (err) { next(err); }
});

app.post("/api/tasks", authMiddleware, async (req, res) => {
  try {
    const {
      title, note, description = "", status = "Açık", assigneeId = null, assigneeName = null,
      priority = "Orta", dueDate = null, investorId = null, brandId = null,
      projectId = null, locationId = null, contractId = null, moduleType = "Genel", tags = [],
    } = req.body || {};
    const taskTitle = title || note || "";
    const inserted = await pool.query(
      `INSERT INTO tasks(title,note,description,status,assignee_id,assignee_name,priority,due_date,investor_id,brand_id,project_id,location_id,contract_id,module_type,tags)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [taskTitle, taskTitle, description, status, assigneeId, assigneeName, priority, dueDate || null,
       investorId || null, brandId || null, projectId || null, locationId || null, contractId || null, moduleType, tags],
    );
    const item = mapTask(inserted.rows[0]);
    await logActivity({ userId: req.user.id, moduleName: "tasks", actionType: "create", recordId: item.id, summary: `Görev oluşturuldu: ${taskTitle}`, afterData: item });
    if (assigneeId) {
      const member = await pool.query("SELECT email,name FROM team_members WHERE id=$1", [assigneeId]);
      if (member.rowCount > 0 && member.rows[0].email) {
        try { await sendMailToRecipient(member.rows[0].email, `Yeni Görev: ${taskTitle}`, `Size yeni bir görev atandı.\nGörev: ${taskTitle}\nÖncelik: ${priority}\nSon Tarih: ${dueDate || "-"}`); } catch (_) {}
      }
    }
    res.status(201).json(item);
  } catch (err) { next(err); }
});

app.put("/api/tasks/:id", authMiddleware, async (req, res) => {
  try {
    const {
      title, note, description, status, assigneeId = null, assigneeName = null,
      priority = "Orta", dueDate = null, investorId = null, brandId = null,
      projectId = null, locationId = null, contractId = null, moduleType, tags,
    } = req.body || {};
    const taskTitle = title || note || "";
    const completedAt = status === "Tamamlandı" ? "NOW()" : "NULL";
    const updated = await pool.query(
      `UPDATE tasks SET title=$1,note=$1,description=$2,status=$3,assignee_id=$4,assignee_name=$5,priority=$6,due_date=$7,
       investor_id=$8,brand_id=$9,project_id=$10,location_id=$11,contract_id=$12,module_type=$13,tags=$14,
       updated_at=NOW(),completed_at=${completedAt === "NOW()" ? "NOW()" : "NULL"}
       WHERE id=$15 RETURNING *`,
      [taskTitle, description || null, status, assigneeId, assigneeName, priority, dueDate || null,
       investorId || null, brandId || null, projectId || null, locationId || null, contractId || null,
       moduleType || "Genel", tags || [], req.params.id],
    );
    if (updated.rowCount === 0) return res.status(404).json({ message: "Kayıt bulunamadı." });
    const item = mapTask(updated.rows[0]);
    await logActivity({ userId: req.user.id, moduleName: "tasks", actionType: "update", recordId: item.id, summary: `Görev güncellendi: ${taskTitle}`, afterData: item });
    res.json(item);
  } catch (err) { next(err); }
});

app.delete("/api/tasks/:id", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin" && req.user.role !== "manager") {
      return res.status(403).json({ message: "Yetkisiz." });
    }
    const row = await pool.query("SELECT id,title,note FROM tasks WHERE id=$1", [req.params.id]);
    await pool.query("UPDATE tasks SET deleted_at=NOW() WHERE id=$1", [req.params.id]);
    if (row.rowCount > 0) {
      await logActivity({ userId: req.user.id, moduleName: "tasks", actionType: "delete", recordId: Number(req.params.id), summary: `Görev silindi: ${row.rows[0].title || row.rows[0].note}`, beforeData: row.rows[0] });
    }
    res.status(204).send();
  } catch (err) { next(err); }
});

app.post("/api/matching", authMiddleware, async (req, res) => {
  // Existing matching code...
});

app.post("/api/investor-brand-matches", authMiddleware, async (req, res) => {
  try {
    const { investorId, brandId, score, notes } = req.body || {};
    if (!investorId || !brandId) return res.status(400).json({ message: "investorId ve brandId zorunlu." });
    const result = await pool.query(
      `INSERT INTO investor_brand_matches(investor_id, brand_id, score, notes, created_by)
       VALUES($1, $2, $3, $4, $5)
       ON CONFLICT(investor_id, brand_id) DO UPDATE SET score=EXCLUDED.score, notes=EXCLUDED.notes
       RETURNING *`,
      [Number(investorId), Number(brandId), Number(score || 0), notes || null, req.user.id],
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
});

app.get("/api/investor-brand-matches", authMiddleware, async (req, res) => {
  try {
    const { investorId } = req.query || {};
    const cond = investorId ? "WHERE ibm.investor_id=$1" : "";
    const params = investorId ? [Number(investorId)] : [];
    const result = await pool.query(
      `SELECT ibm.*, i.name AS investor_name, b.name AS brand_name FROM investor_brand_matches ibm
       JOIN investors i ON i.id = ibm.investor_id JOIN brands b ON b.id = ibm.brand_id
       ${cond} ORDER BY ibm.score DESC NULLS LAST LIMIT 100`,
      params,
    );
    res.json(result.rows);
  } catch (err) { next(err); }
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
      sql: `SELECT id,name,city,district,region,location_type,segment,sqm,rent,currency,potential,status,
            footfall_score,street_class,avm_segment,recommended_brands,created_at
            FROM locations ORDER BY id DESC`,
      file: "lokasyonlar.xlsx",
      sheet: "Lokasyonlar",
    },
    projects: {
      sql: `SELECT id,name,project_type,owner_team,owner_person,stage,pipeline_stage,priority,progress,start_date,due_date,close_date,
            investor_id,brand_id,location_id,estimated_investment,estimated_revenue,created_at
            FROM projects ORDER BY id DESC`,
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
