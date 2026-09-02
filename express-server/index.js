require("dotenv").config();
const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const {
  Pool
} = require("pg");
const {
  S3Client
} = require("@aws-sdk/client-s3");
const multerS3 = require("multer-s3");
const xlsx = require("xlsx");
const nodemailer = require("nodemailer");
const twilio = require("twilio");
const multer = require("multer");
const PDFDocument = require("pdfkit");
const app = express();
const port = Number(process.env.PORT || 3000);
const jwtSecret = process.env.JWT_SECRET || "crm_dev_secret_change_me";
const pool = require("./config/db");
const https = require("https");
let robotoRegularBuffer = null;
let robotoBoldBuffer = null;
function fetchFont(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to download font: status ${res.statusCode}`));
        return;
      }
      const chunks = [];
      res.on("data", chunk => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}
async function getRobotoRegular() {
  if (!robotoRegularBuffer) {
    console.log("Downloading Roboto-Regular font...");
    robotoRegularBuffer = await fetchFont("https://raw.githubusercontent.com/google/fonts/main/ofl/roboto/static/Roboto-Regular.ttf");
  }
  return robotoRegularBuffer;
}
async function getRobotoBold() {
  if (!robotoBoldBuffer) {
    console.log("Downloading Roboto-Bold font...");
    robotoBoldBuffer = await fetchFont("https://raw.githubusercontent.com/google/fonts/main/ofl/roboto/static/Roboto-Bold.ttf");
  }
  return robotoBoldBuffer;
}
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..")));

// --- MOUNT ROUTES ---
app.use('/api/investors', require('./routes/investors'));
app.use('/api/brands', require('./routes/brands'));
app.use('/api/locations', require('./routes/locations'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/contracts', require('./routes/contracts'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/templates', require('./routes/templates'));
app.use('/api/matching', require('./routes/matching'));
app.use('/api/pnl', require('./routes/pnl'));
app.use('/api/activity', require('./routes/activity'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/uploads', require('./routes/uploads'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/config', require('./routes/config'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/finance', require('./routes/finance'));
app.use('/api/team-members', require('./routes/team-members'));
app.use('/api/investor-brand-matches', require('./routes/investor-brand-matches'));
app.use('/api/export', require('./routes/export'));
app.use('/api/export-pdf', require('./routes/export-pdf'));
app.use('/api/recycle-bin', require('./routes/recycle-bin'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/health', require('./routes/health'));

const uploadsDir = process.env.VERCEL ? path.join("/tmp", "uploads") : path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadsDir)) {
  try {
    fs.mkdirSync(uploadsDir, {
      recursive: true
    });
  } catch (err) {
    console.error("Dizin oluşturulamadı:", err);
  }
}
app.use("/uploads", express.static(uploadsDir));
let uploadStorage;
const isR2Enabled = process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME;
if (isR2Enabled) {
  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
    }
  });
  uploadStorage = multerS3({
    s3: s3,
    bucket: process.env.R2_BUCKET_NAME,
    acl: "public-read",
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: function (req, file, cb) {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, "uploads/" + uniqueSuffix + "-" + file.originalname.replace(/[^\w.\-]/g, "_"));
    }
  });
} else {
  uploadStorage = multer.diskStorage({
    destination: uploadsDir,
    filename: (req, file, cb) => {
      const safeName = `${Date.now()}-${Math.round(Math.random() * 1e9)}-${file.originalname.replace(/[^\w.\-]/g, "_")}`;
      cb(null, safeName);
    }
  });
}
const upload = multer({
  storage: uploadStorage,
  limits: {
    fileSize: 25 * 1024 * 1024
  }
});
const uploadLocal = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (req, file, cb) => {
      const safeName = `${Date.now()}-${Math.round(Math.random() * 1e9)}-${file.originalname.replace(/[^\w.\-]/g, "_")}`;
      cb(null, safeName);
    }
  }),
  limits: {
    fileSize: 25 * 1024 * 1024
  }
});
const pipelineStages = ["Yeni Lead", "İletişim Kuruldu", "Analiz Yapıldı", "Marka Önerildi", "Sunum Yapıldı", "Teklif Verildi", "Kapandı (Kazanıldı/Kaybedildi)"];
const scoreWeights = {
  budget: 30,
  city: 25,
  sector: 25,
  sqm: 20
};
const cityFitMap = {
  İstanbul: ["Cadde + AVM", "AVM", "Cadde", "Sahil + Premium Cadde", "Cadde + Mahalle"],
  Ankara: ["Cadde + AVM", "AVM", "Cadde"],
  İzmir: ["Cadde + AVM", "Cadde", "Sahil + Premium Cadde"],
  Bursa: ["Cadde", "AVM", "Cadde + Mahalle"],
  Antalya: ["Sahil + Premium Cadde", "Cadde", "AVM"]
};
const ENTITY_CONFIG = {
  investors: {
    table: "investors",
    labelField: "name",
    where: "deleted_at IS NULL"
  },
  brands: {
    table: "brands",
    labelField: "name",
    where: "deleted_at IS NULL"
  },
  locations: {
    table: "locations",
    labelField: "name",
    where: "deleted_at IS NULL"
  },
  projects: {
    table: "projects",
    labelField: "name",
    where: "deleted_at IS NULL"
  },
  contracts: {
    table: "contracts",
    labelField: "note",
    where: "deleted_at IS NULL"
  },
  tasks: {
    table: "tasks",
    labelField: "note",
    where: "deleted_at IS NULL"
  }
};
const {
  authMiddleware,
  requireAdmin,
  requirePermission
} = require("./middlewares/auth");
function signToken(user, permissions = []) {
  return jwt.sign({
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    permissions
  }, jwtSecret, {
    expiresIn: "12h"
  });
}

// Global Permission Guards

function fillTemplate(rawTemplate, payload) {
  return rawTemplate.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = payload[key];
    return value === undefined || value === null ? "" : String(value);
  });
}
async function logAutomation(channel, eventName, payload, status, errorMessage = null) {
  await pool.query(`INSERT INTO automation_logs(channel, event_name, payload, status, error_message)
     VALUES($1, $2, $3, $4, $5)`, [channel, eventName, payload, status, errorMessage]);
}
async function logActivity({
  userId,
  moduleName,
  actionType,
  recordId = null,
  summary,
  beforeData = null,
  afterData = null
}) {
  await pool.query(`INSERT INTO activity_logs(user_id,module_name,action_type,record_id,summary,before_data,after_data)
     VALUES($1,$2,$3,$4,$5,$6,$7)`, [userId, moduleName, actionType, recordId, summary, beforeData, afterData]);
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
    auth: {
      user,
      pass
    }
  });
  await transporter.sendMail({
    from,
    to,
    subject,
    text
  });
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
    auth: {
      user,
      pass
    }
  });
  await transporter.sendMail({
    from,
    to,
    subject,
    text
  });
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
  await client.messages.create({
    from,
    to,
    body: message
  });
}
async function triggerAutomation(eventName, payload) {
  if (process.env.AUTOMATION_ENABLED === "false") {
    return;
  }
  const templateResult = await pool.query("SELECT * FROM message_templates WHERE event_name=$1 AND active=true", [eventName]);
  const templates = templateResult.rows;
  const mailTemplate = templates.find(x => x.channel === "mail");
  const whatsTemplate = templates.find(x => x.channel === "whatsapp");
  const emailSubject = mailTemplate ? fillTemplate(mailTemplate.title, payload) : `Mi CRM Otomasyon: ${eventName}`;
  const emailMessage = mailTemplate ? fillTemplate(mailTemplate.body, payload) : `[${eventName}] ${JSON.stringify(payload, null, 2)}`;
  try {
    await sendMailNotification(emailSubject, emailMessage);
    await logAutomation("mail", eventName, payload, "success");
  } catch (error) {
    await logAutomation("mail", eventName, payload, "failed", error.message);
  }
  const whatsappMessage = whatsTemplate ? fillTemplate(whatsTemplate.body, payload) : `Mi CRM ${eventName}\n${payload.summary || ""}`;
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
    updatedAt: row.updated_at
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
    matchingEligible: row.active === true && String(row.agreement_status || "") === "Anlaşmalı"
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
    attachmentUrl: row.attachment_url || ""
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
    assignedMemberId: row.assigned_member_id || null,
    estimatedInvestment: row.estimated_investment != null ? Number(row.estimated_investment) : null,
    estimatedRevenue: row.estimated_revenue != null ? Number(row.estimated_revenue) : null,
    ownerPerson: row.owner_person || "",
    startDate: row.start_date || null,
    closeDate: row.close_date || null,
    riskLevel: row.risk_level || "",
    pipelineStage: row.pipeline_stage || row.stage || "",
    files: row.files || []
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
    contractName: row.contract_name || null
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
    active: row.active
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
    assignedMemberId: row.assigned_member_id || null,
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
    locationName: row.location_name || ""
  };
}
function mapFinanceRecord(row) {
  return {
    id: row.id,
    contractId: row.contract_id || null,
    projectId: row.project_id || null,
    investorId: row.investor_id || null,
    brandId: row.brand_id || null,
    locationId: row.location_id || null,
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
    locationName: row.location_name || ""
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
    note: row.note || ""
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
    createdAt: row.created_at
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
  if (fs.existsSync(schemaPath)) {
    try {
      const schema = fs.readFileSync(schemaPath, "utf8");
      await pool.query(schema);
    } catch (e) {
      console.log("schema.sql çalıştırılırken hata:", e.message);
    }
  } else {
    console.log("schema.sql bulunamadı, mevcut tablolara ALTER uygulanacak.");
  }
  await pool.query("ALTER TABLE investors ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP");
  await pool.query("ALTER TABLE brands ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP");
  await pool.query("ALTER TABLE locations ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP");
  await pool.query("ALTER TABLE projects ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP");
  await pool.query("ALTER TABLE contracts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP");
  await pool.query("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP");
  await pool.query("ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS record_id INTEGER");
  await pool.query("ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS before_data JSONB");
  await pool.query("ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS after_data JSONB");
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
  await pool.query("ALTER TABLE contracts ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL");
  await pool.query("ALTER TABLE contracts ADD COLUMN IF NOT EXISTS assigned_member_id INTEGER REFERENCES team_members(id) ON DELETE SET NULL");
  await pool.query("ALTER TABLE projects ADD COLUMN IF NOT EXISTS assigned_member_id INTEGER REFERENCES team_members(id) ON DELETE SET NULL");
  await pool.query("ALTER TABLE finance_records ADD COLUMN IF NOT EXISTS location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL");
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
  await pool.query(`CREATE TABLE IF NOT EXISTS customer_pnl_revenues (
    id SERIAL PRIMARY KEY,
    investor_id INTEGER NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL,
    month_name TEXT NOT NULL,
    year_value INTEGER NOT NULL,
    category TEXT NOT NULL DEFAULT 'Ciro',
    description TEXT,
    amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    note TEXT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS customer_pnl_expenses (
    id SERIAL PRIMARY KEY,
    investor_id INTEGER NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL,
    month_name TEXT NOT NULL,
    year_value INTEGER NOT NULL,
    category TEXT NOT NULL DEFAULT 'Gıda',
    sub_category TEXT,
    description TEXT,
    amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    note TEXT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
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
    const inserted = await pool.query("INSERT INTO users(name, email, password_hash, role) VALUES($1, $2, $3, $4) RETURNING id", [adminName, adminEmail, hash, "admin"]);
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
  const brandRows = [{
    name: "Blak Coffee Co",
    sector: "Coffee",
    minB: 1700000,
    maxB: 3600000,
    minS: 90,
    maxS: 180,
    target: "Cadde + AVM",
    agr: "Anlaşmalı",
    fee: 250000,
    royalty: 6.5,
    months: 36,
    contact: "Hasan Bey",
    phone: "+90 212 100 20 30",
    email: "hasan@blakcoffee.com",
    scoreOp: 85,
    scoreFit: 90,
    scoreLoc: 80,
    scoreInv: 88
  }, {
    name: "Tavada Tavuk",
    sector: "Fast Casual",
    minB: 1500000,
    maxB: 3500000,
    minS: 90,
    maxS: 220,
    target: "AVM + Cadde",
    agr: "Anlaşmalı",
    fee: 200000,
    royalty: 5.0,
    months: 48,
    contact: "Ali Kaya",
    phone: "+90 212 200 30 40",
    email: "ali@tavadatavuk.com",
    scoreOp: 80,
    scoreFit: 85,
    scoreLoc: 75,
    scoreInv: 82
  }, {
    name: "SushiMore",
    sector: "Japon",
    minB: 1800000,
    maxB: 4200000,
    minS: 100,
    maxS: 250,
    target: "AVM + Premium Cadde",
    agr: "Görüşülüyor",
    fee: 300000,
    royalty: 7.0,
    months: 36,
    contact: "Selin Hanım",
    phone: "+90 212 300 40 50",
    email: "selin@sushimore.com",
    scoreOp: 75,
    scoreFit: 80,
    scoreLoc: 90,
    scoreInv: 78
  }, {
    name: "Kasap Döner",
    sector: "Doner",
    minB: 1200000,
    maxB: 2600000,
    minS: 65,
    maxS: 150,
    target: "Cadde",
    agr: "Anlaşmalı",
    fee: 150000,
    royalty: 4.5,
    months: 24,
    contact: "Mehmet Usta",
    phone: "+90 532 400 50 60",
    email: "info@kasapdoner.com",
    scoreOp: 82,
    scoreFit: 78,
    scoreLoc: 70,
    scoreInv: 80
  }, {
    name: "The Coffee Factory",
    sector: "Coffee",
    minB: 1400000,
    maxB: 3300000,
    minS: 80,
    maxS: 170,
    target: "AVM",
    agr: "Anlaşmalı",
    fee: 220000,
    royalty: 6.0,
    months: 36,
    contact: "Zeynep Hanım",
    phone: "+90 212 500 60 70",
    email: "zeynep@coffeefactory.com",
    scoreOp: 78,
    scoreFit: 82,
    scoreLoc: 85,
    scoreInv: 79
  }, {
    name: "Yelken Balıkçısı",
    sector: "Seafood",
    minB: 2000000,
    maxB: 5000000,
    minS: 140,
    maxS: 350,
    target: "Sahil + Premium Cadde",
    agr: "Anlaşmalı",
    fee: 400000,
    royalty: 8.0,
    months: 60,
    contact: "Yılmaz Bey",
    phone: "+90 242 600 70 80",
    email: "yilmaz@yelken.com",
    scoreOp: 72,
    scoreFit: 75,
    scoreLoc: 88,
    scoreInv: 74
  }, {
    name: "Bigye",
    sector: "Fast Casual",
    minB: 1300000,
    maxB: 2900000,
    minS: 70,
    maxS: 180,
    target: "AVM",
    agr: "Görüşülüyor",
    fee: 180000,
    royalty: 5.5,
    months: 36,
    contact: "Can Bey",
    phone: "+90 212 700 80 90",
    email: "can@bigye.com",
    scoreOp: 70,
    scoreFit: 72,
    scoreLoc: 68,
    scoreInv: 73
  }, {
    name: "Mogaf Döner",
    sector: "Doner",
    minB: 1100000,
    maxB: 2100000,
    minS: 50,
    maxS: 120,
    target: "Cadde + Mahalle",
    agr: "Görüşülüyor",
    fee: 130000,
    royalty: 4.0,
    months: 24,
    contact: "Cengiz Bey",
    phone: "+90 544 800 90 00",
    email: "cengiz@mogaf.com",
    scoreOp: 68,
    scoreFit: 70,
    scoreLoc: 65,
    scoreInv: 70
  }, {
    name: "Cajun Corner",
    sector: "Fast Casual",
    minB: 1400000,
    maxB: 3100000,
    minS: 80,
    maxS: 170,
    target: "AVM + Cadde",
    agr: "Görüşülüyor",
    fee: 190000,
    royalty: 5.5,
    months: 36,
    contact: "Leyla Hanım",
    phone: "+90 532 900 10 20",
    email: "leyla@cajun.com",
    scoreOp: 73,
    scoreFit: 75,
    scoreLoc: 72,
    scoreInv: 76
  }, {
    name: "Pasta Punto",
    sector: "Pastane",
    minB: 1100000,
    maxB: 2400000,
    minS: 70,
    maxS: 160,
    target: "Cadde + AVM",
    agr: "Anlaşmalı",
    fee: 160000,
    royalty: 5.0,
    months: 36,
    contact: "Fatma Hanım",
    phone: "+90 212 010 20 30",
    email: "fatma@pastapunto.com",
    scoreOp: 76,
    scoreFit: 74,
    scoreLoc: 78,
    scoreInv: 77
  }, {
    name: "Pizza Pino",
    sector: "Fast Food",
    minB: 900000,
    maxB: 2200000,
    minS: 60,
    maxS: 140,
    target: "AVM + Cadde",
    agr: "Görüşülüyor",
    fee: 120000,
    royalty: 4.5,
    months: 24,
    contact: "Orhan Bey",
    phone: "+90 212 020 30 40",
    email: "orhan@pizzapino.com",
    scoreOp: 65,
    scoreFit: 68,
    scoreLoc: 62,
    scoreInv: 66
  }, {
    name: "Fit Salad Bar",
    sector: "Sağlıklı Yaşam",
    minB: 750000,
    maxB: 1800000,
    minS: 40,
    maxS: 90,
    target: "AVM + Ofis Bölgesi",
    agr: "Beklemede",
    fee: 90000,
    royalty: 4.0,
    months: 24,
    contact: "Ezgi Hanım",
    phone: "+90 533 030 40 50",
    email: "ezgi@fitsalad.com",
    scoreOp: 72,
    scoreFit: 70,
    scoreLoc: 75,
    scoreInv: 71
  }, {
    name: "Coffee in Munchies",
    sector: "Coffee",
    minB: 1300000,
    maxB: 2900000,
    minS: 75,
    maxS: 160,
    target: "Cadde + AVM",
    agr: "Beklemede",
    fee: 200000,
    royalty: 6.0,
    months: 36,
    contact: "Berk Bey",
    phone: "+90 541 040 50 60",
    email: "berk@munchies.com",
    scoreOp: 74,
    scoreFit: 76,
    scoreLoc: 80,
    scoreInv: 75
  }, {
    name: "Türk Kahvesi Evi",
    sector: "Kahve",
    minB: 600000,
    maxB: 1400000,
    minS: 30,
    maxS: 70,
    target: "Her bölge",
    agr: "Görüşülüyor",
    fee: 70000,
    royalty: 3.5,
    months: 24,
    contact: "Nesrin Hanım",
    phone: "+90 505 050 60 70",
    email: "nesrin@turkkahvesi.com",
    scoreOp: 80,
    scoreFit: 82,
    scoreLoc: 85,
    scoreInv: 83
  }, {
    name: "Springfield Yeni Nesil Dürüm",
    sector: "Doner",
    minB: 1250000,
    maxB: 2500000,
    minS: 60,
    maxS: 130,
    target: "Cadde",
    agr: "Beklemede",
    fee: 140000,
    royalty: 4.5,
    months: 36,
    contact: "Tarık Bey",
    phone: "+90 532 060 70 80",
    email: "tarik@springfield.com",
    scoreOp: 69,
    scoreFit: 71,
    scoreLoc: 67,
    scoreInv: 70
  }];
  for (const b of brandRows) {
    const ex = await pool.query("SELECT id FROM brands WHERE name=$1", [b.name]);
    if (ex.rowCount > 0) {
      brandIds[b.name] = ex.rows[0].id;
      continue;
    }
    const r = await pool.query(`
      INSERT INTO brands(name,sector,min_budget,max_budget,min_sqm,max_sqm,target_locations,active,monthly_growth,
        agreement_status,franchise_fee,royalty_rate,contract_term_months,contact_person,contact_phone,email,
        gives_franchise,has_royalty,score_operation,score_franchise_fit,score_location_flex,score_investor_interest)
      VALUES($1,$2,$3,$4,$5,$6,$7,true,10,$8,$9,$10,$11,$12,$13,$14,true,true,$15,$16,$17,$18) RETURNING id`, [b.name, b.sector, b.minB, b.maxB, b.minS, b.maxS, b.target, b.agr, b.fee, b.royalty, b.months, b.contact, b.phone, b.email, b.scoreOp, b.scoreFit, b.scoreLoc, b.scoreInv]);
    brandIds[b.name] = r.rows[0].id;
  }

  // ── INVESTORS ──────────────────────────────────────────────────
  const investorIds = {};
  const invRows = [{
    name: "Ahmet Kılıç",
    budget: 2600000,
    city: "İstanbul",
    sector: "Coffee",
    type: "Franchise",
    stage: "Marka Önerildi",
    phone: "+90 544 222 33 44",
    email: "ahmet@crm.com",
    district: "Kadıköy",
    goal: "2 şube coffee yatırımı",
    hist: "24.04 arandı, bilgi paketi gönderildi",
    notes: "AVM + cadde alternatifleri istiyor, mobilya konusunda tedarikçi arıyor",
    followup: "2026-05-20",
    prio: "Yüksek",
    targetType: "Cadde",
    inv_type: "Bireysel"
  }, {
    name: "Yaman Holding",
    budget: 4100000,
    city: "Ankara",
    sector: "Fast Casual",
    type: "Ortaklık",
    stage: "Teklif Verildi",
    phone: "+90 530 444 55 66",
    email: "yaman@demo.com",
    district: "Çankaya",
    goal: "Bölgesel büyüme, 5+ şube",
    hist: "26.04 toplantı, 02.05 teklif sunuldu",
    notes: "Sözleşme taslağı paylaşıldı. Hukuk departmanları inceliyor.",
    followup: "2026-05-20",
    prio: "Yüksek",
    targetType: "AVM",
    inv_type: "Kurumsal"
  }, {
    name: "Melek Arslan",
    budget: 1800000,
    city: "İzmir",
    sector: "Doner",
    type: "Franchise",
    stage: "İletişim Kuruldu",
    phone: "+90 533 111 22 33",
    email: "melek@demo.com",
    district: "Bornova",
    goal: "Tek mağaza başlangıcı",
    hist: "22.04 mesaj, 27.04 arama",
    notes: "Lokasyon arayışında, Forum Bornova ilgileniyor",
    followup: "2026-05-25",
    prio: "Orta",
    targetType: "AVM",
    inv_type: "Bireysel"
  }, {
    name: "Can Teknoloji A.Ş.",
    budget: 6500000,
    city: "İstanbul",
    sector: "Kahve",
    type: "Master Franchise",
    stage: "Sunum Yapıldı",
    phone: "+90 212 333 44 55",
    email: "can@demo.com",
    district: "Maslak",
    goal: "Çoklu şube planı, 10+ nokta",
    hist: "20.04 toplantı, 28.04 sunum yapıldı",
    notes: "Finansman sürecinde. Banka kredi onayı bekleniyor.",
    followup: "2026-05-22",
    prio: "Çok Yüksek",
    targetType: "Cadde + AVM",
    inv_type: "Kurumsal"
  }, {
    name: "Fatma Şahin",
    budget: 950000,
    city: "Bursa",
    sector: "Fast Food",
    type: "Franchise",
    stage: "Yeni Lead",
    phone: "+90 544 777 88 99",
    email: "fatma@demo.com",
    district: "Nilüfer",
    goal: "İlk yatırım deneyimi",
    hist: "25.04 web formu doldurdu",
    notes: "Ürün araştırıyor, kıyaslama yapıyor. Takip edilmeli.",
    followup: "2026-06-01",
    prio: "Düşük",
    targetType: "AVM",
    inv_type: "Bireysel"
  }, {
    name: "Ömer Yıldız",
    budget: 3200000,
    city: "Antalya",
    sector: "Sağlıklı Yaşam",
    type: "Franchise",
    stage: "Görüşme Yapıldı",
    phone: "+90 532 555 66 77",
    email: "omer@demo.com",
    district: "Lara",
    goal: "2-3 şube hedefi, turistik bölge",
    hist: "23.04 arama, 29.04 ofis ziyareti",
    notes: "AVM odaklı bakıyor, turistik bölge tercihi var",
    followup: "2026-05-28",
    prio: "Orta",
    targetType: "AVM",
    inv_type: "Bireysel"
  }, {
    name: "Grup Doruk Yatırım",
    budget: 8200000,
    city: "İstanbul",
    sector: "Fast Casual",
    type: "Master Franchise",
    stage: "Sözleşme Süreci",
    phone: "+90 212 666 77 88",
    email: "info@doruk.com",
    district: "Levent",
    goal: "Master franchise bölge hakları",
    hist: "15.04 ilk temas, 22.04 NDA imzalandı, 05.05 müzakere",
    notes: "Çok profesyonel firma. Hızlı karar veriyor. Kritik süreç.",
    followup: "2026-05-18",
    prio: "Çok Yüksek",
    targetType: "Her bölge",
    inv_type: "Kurumsal"
  }, {
    name: "Deniz Acar",
    budget: 2100000,
    city: "Ankara",
    sector: "Coffee",
    type: "Franchise",
    stage: "Marka Önerildi",
    phone: "+90 533 777 88 99",
    email: "deniz@demo.com",
    district: "Kızılay",
    goal: "Coffee konsept franchise",
    hist: "01.05 telefon görüşmesi",
    notes: "Blak Coffee Co önerisi iyi karşılandı",
    followup: "2026-05-30",
    prio: "Orta",
    targetType: "Cadde",
    inv_type: "Bireysel"
  }, {
    name: "Kardeşler Gıda Ltd.",
    budget: 1500000,
    city: "İzmir",
    sector: "Pastane",
    type: "Franchise",
    stage: "İletişim Kuruldu",
    phone: "+90 232 888 99 00",
    email: "info@kardesler.com",
    district: "Alsancak",
    goal: "Pastane franchise, aile şirketi",
    hist: "03.05 mesaj",
    notes: "Aile şirketi, deneyimli gıda sektörü geçmişi var",
    followup: "2026-06-05",
    prio: "Orta",
    targetType: "Cadde",
    inv_type: "Kurumsal"
  }, {
    name: "Hüseyin Toprak",
    budget: 4800000,
    city: "İstanbul",
    sector: "Seafood",
    type: "Ortaklık",
    stage: "Görüşme Yapıldı",
    phone: "+90 530 999 00 11",
    email: "huseyin@demo.com",
    district: "Bebek",
    goal: "Premium segment balık restoranı",
    hist: "28.04 kahve toplantısı",
    notes: "Yelken Balıkçısı ile görüştürüldü, ilgi yüksek",
    followup: "2026-05-22",
    prio: "Yüksek",
    targetType: "Sahil",
    inv_type: "Bireysel"
  }];
  for (const inv of invRows) {
    const ex = await pool.query("SELECT id FROM investors WHERE name=$1", [inv.name]);
    if (ex.rowCount > 0) {
      investorIds[inv.name] = ex.rows[0].id;
      continue;
    }
    const r = await pool.query(`
      INSERT INTO investors(name,budget,currency,city,sector,investment_type,pipeline_stage,phone,email,district,goal,
        contact_history,meeting_notes,follow_up_date,priority,target_location_type,investor_type,created_by)
      VALUES($1,$2,'TRY',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`, [inv.name, inv.budget, inv.city, inv.sector, inv.type, inv.stage, inv.phone, inv.email, inv.district, inv.goal, inv.hist, inv.notes, inv.followup, inv.prio, inv.targetType, inv.inv_type, adminId]);
    investorIds[inv.name] = r.rows[0].id;
  }

  // ── LOCATIONS ──────────────────────────────────────────────────
  const locationIds = {};
  const locRows = [{
    name: "Bağdat Caddesi Premium",
    type: "Cadde",
    sqm: 130,
    rent: 380000,
    pot: "Yüksek",
    brands: ["Blak Coffee Co", "Tavada Tavuk"],
    addr: "Caddebostan Mah. Bağdat Cad. No:142",
    traffic: "Çok Yoğun",
    owner: "Yıldız Gayrimenkul",
    ownerPhone: "+90 555 330 11 22",
    city: "İstanbul",
    dist: "Kadıköy",
    status: "Boş",
    notes: "Günlük 12.000+ yaya trafiği. Metro çıkışı 200m. Şampiyon café lokasyonu.",
    segment: "A+",
    deposit: 1140000,
    dues: 25000
  }, {
    name: "Panora AVM - A Blok F05",
    type: "AVM",
    sqm: 95,
    rent: 240000,
    pot: "Orta",
    brands: ["The Coffee Factory", "Bigye"],
    addr: "Oran Mah. Silikon Cad. No:5",
    traffic: "Orta-Yüksek",
    owner: "Panora AVM Yönetim",
    ownerPhone: "+90 312 455 00 11",
    city: "Ankara",
    dist: "Çankaya",
    status: "Müzakere",
    notes: "Food court yakını, 3. katta. Aile hedef kitlesi.",
    segment: "B+",
    deposit: 720000,
    dues: 18000
  }, {
    name: "Nişantaşı Köşk Pasajı",
    type: "Cadde",
    sqm: 160,
    rent: 520000,
    pot: "Çok Yüksek",
    brands: ["SushiMore", "Pasta Punto"],
    addr: "Teşvikiye Mah. Abdi İpekçi Cad. No:22",
    traffic: "Çok Yoğun",
    owner: "Özel Mülkiyet - Köşk Ailesi",
    ownerPhone: "+90 533 200 30 40",
    city: "İstanbul",
    dist: "Şişli",
    status: "Boş",
    notes: "A+ lokasyon. Yabancı turist yoğun. Premium müşteri profili.",
    segment: "A+",
    deposit: 1560000,
    dues: 35000
  }, {
    name: "Alsancak Turan Caddesi",
    type: "Cadde",
    sqm: 110,
    rent: 280000,
    pot: "Yüksek",
    brands: ["Türk Kahvesi Evi", "Kasap Döner"],
    addr: "Alsancak Mah. 1482 Sok. No:8",
    traffic: "Yoğun",
    owner: "İzmir Gayrimenkul A.Ş.",
    ownerPhone: "+90 232 444 55 66",
    city: "İzmir",
    dist: "Konak",
    status: "Boş",
    notes: "İzmir'in ana yaya aksı. Sahil yürüyüş güzergahı.",
    segment: "A",
    deposit: 840000,
    dues: 20000
  }, {
    name: "Forum Bornova - ZF12",
    type: "AVM",
    sqm: 75,
    rent: 195000,
    pot: "Orta",
    brands: ["Fit Salad Bar", "Pizza Pino"],
    addr: "Bornova Mah. Ankara Cad. No:1",
    traffic: "Orta",
    owner: "Forum AVM Yönetim",
    ownerPhone: "+90 232 777 88 99",
    city: "İzmir",
    dist: "Bornova",
    status: "Müzakere",
    notes: "Gençlik AVM. Ege Üniversitesi yakını. Hedef kitle 18-35 yaş.",
    segment: "B",
    deposit: 585000,
    dues: 12000
  }, {
    name: "Lara Sahil Kavşağı",
    type: "Cadde",
    sqm: 140,
    rent: 320000,
    pot: "Yüksek",
    brands: ["Fit Salad Bar", "Blak Coffee Co"],
    addr: "Lara Mah. Lara Cad. No:200",
    traffic: "Yoğun",
    owner: "Antalya Emlak Ltd.",
    ownerPhone: "+90 242 111 22 33",
    city: "Antalya",
    dist: "Muratpaşa",
    status: "Boş",
    notes: "Turistik bölge. Yaz sezonu kapasitesi çok yüksek. Yıl boyu açık.",
    segment: "A",
    deposit: 960000,
    dues: 22000
  }, {
    name: "Maslak İş Merkezi Zemin",
    type: "Plaza",
    sqm: 85,
    rent: 290000,
    pot: "Orta",
    brands: ["The Coffee Factory", "Coffee in Munchies"],
    addr: "Maslak Mah. AOS 55. Sok. No:3",
    traffic: "Orta",
    owner: "GYO Ofis Yönetim",
    ownerPhone: "+90 212 444 55 66",
    city: "İstanbul",
    dist: "Sarıyer",
    status: "Boş",
    notes: "Kurumsal bölge. 25.000+ günlük ofis çalışanı. Sabah/öğle pik trafik.",
    segment: "B+",
    deposit: 870000,
    dues: 15000
  }, {
    name: "Bursa Zafer Plaza - Giriş",
    type: "AVM",
    sqm: 68,
    rent: 160000,
    pot: "Orta",
    brands: ["Pizza Pino", "Türk Kahvesi Evi"],
    addr: "Osmangazi Mah. Zafer Cad. No:1",
    traffic: "Orta",
    owner: "Zafer Plaza AVM",
    ownerPhone: "+90 224 333 44 55",
    city: "Bursa",
    dist: "Osmangazi",
    status: "Boş",
    notes: "Bursa merkezi AVM. Kuzey giriş kapısı, yüksek görünürlük.",
    segment: "B",
    deposit: 480000,
    dues: 10000
  }];
  for (const l of locRows) {
    const ex = await pool.query("SELECT id FROM locations WHERE name=$1", [l.name]);
    if (ex.rowCount > 0) {
      locationIds[l.name] = ex.rows[0].id;
      continue;
    }
    const r = await pool.query(`
      INSERT INTO locations(name,location_type,sqm,rent,currency,potential,recommended_brands,address,traffic,owner,owner_phone,city,district,status,notes,segment,deposit,dues)
      VALUES($1,$2,$3,$4,'TRY',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`, [l.name, l.type, l.sqm, l.rent, l.pot, l.brands, l.addr, l.traffic, l.owner, l.ownerPhone, l.city, l.dist, l.status, l.notes, l.segment, l.deposit, l.dues]);
    locationIds[l.name] = r.rows[0].id;
  }

  // ── PROJECTS (cross-linked) ────────────────────────────────────
  const projectIds = {};
  const projRows = [{
    name: "Blak Coffee Co - Bağdat Cad. Açılışı",
    type: "Franchise",
    team: "Franchise Ekibi",
    assignees: ["Selin Demir", "Mert Kaya"],
    prio: "Yüksek",
    prog: 55,
    stage: "Sunum & Müzakere",
    due: "2026-06-30",
    desc: "Bağdat Caddesi premium lokasyonda Blak Coffee Co açılışı. Yatırımcı Ahmet Kılıç.",
    checklist: ["Lokasyon ekspertiz", "Marka sunum toplantısı", "Kira müzakeresi", "Sözleşme taslağı", "Açılış planı"],
    investorName: "Ahmet Kılıç",
    brandName: "Blak Coffee Co",
    locationName: "Bağdat Caddesi Premium"
  }, {
    name: "Tavada Tavuk - Panora AVM Franchise",
    type: "Franchise",
    team: "Operasyon Ekibi",
    assignees: ["Mert Kaya", "Ayşe Çetin"],
    prio: "Yüksek",
    prog: 70,
    stage: "Sözleşme Süreci",
    due: "2026-06-15",
    desc: "Panora AVM A Blok'ta Tavada Tavuk franchise açılışı.",
    checklist: ["Lokasyon onay", "Marka anlaşması", "Kiracı teslim tutanağı", "Ruhsat başvurusu", "Açılış planı"],
    investorName: "Yaman Holding",
    brandName: "Tavada Tavuk",
    locationName: "Panora AVM - A Blok F05"
  }, {
    name: "SushiMore - Nişantaşı Açılışı",
    type: "Franchise",
    team: "Franchise Ekibi",
    assignees: ["Selin Demir", "Burak Yılmaz"],
    prio: "Çok Yüksek",
    prog: 80,
    stage: "Hukuki Süreç",
    due: "2026-05-31",
    desc: "Nişantaşı premium lokasyonda SushiMore açılışı. Hukuki süreç devam ediyor.",
    checklist: ["Kira sözleşmesi imzası", "Marka lisans anlaşması", "İşletme belgesi", "Personel eğitimi", "Açılış daveti"],
    investorName: "Hüseyin Toprak",
    brandName: "SushiMore",
    locationName: "Nişantaşı Köşk Pasajı"
  }, {
    name: "Yaman Holding - Fast Casual Ortaklık",
    type: "Ortaklık",
    team: "Satış Ekibi",
    assignees: ["Selin Demir", "Ayşe Çetin"],
    prio: "Orta",
    prog: 30,
    stage: "Teklif Hazırlanıyor",
    due: "2026-07-31",
    desc: "Yaman Holding ile çoklu şube ortaklık görüşmesi.",
    checklist: ["Finansal analiz raporu", "Ortaklık teklifi sunumu", "Hukuki inceleme", "İmza"],
    investorName: "Yaman Holding",
    brandName: "Bigye",
    locationName: null
  }, {
    name: "Grup Doruk - Master Franchise Anlaşması",
    type: "Master Franchise",
    team: "Üst Yönetim",
    assignees: ["Selin Demir", "Burak Yılmaz", "Esra Koç"],
    prio: "Çok Yüksek",
    prog: 90,
    stage: "Sözleşme Süreci",
    due: "2026-05-20",
    desc: "Grup Doruk ile The Coffee Factory master franchise görüşmesi. Kritik aşama.",
    checklist: ["NDA imzalandı", "Due diligence tamamlandı", "Sözleşme müzakeresi", "İmza töreni"],
    investorName: "Grup Doruk Yatırım",
    brandName: "The Coffee Factory",
    locationName: null
  }, {
    name: "Melek Arslan - Kasap Döner İzmir",
    type: "Franchise",
    team: "Satış Ekibi",
    assignees: ["Ayşe Çetin"],
    prio: "Orta",
    prog: 20,
    stage: "Lokasyon Araştırma",
    due: "2026-08-15",
    desc: "Melek Arslan için İzmir Alsancak bölgesinde Kasap Döner lokasyonu.",
    checklist: ["Lokasyon shortlist", "Kira teklifleri", "Marka görüşmesi"],
    investorName: "Melek Arslan",
    brandName: "Kasap Döner",
    locationName: "Alsancak Turan Caddesi"
  }, {
    name: "Can Teknoloji - Kahve Zinciri Projesi",
    type: "Master Franchise",
    team: "Franchise Ekibi",
    assignees: ["Selin Demir", "Kemal Erdoğan"],
    prio: "Yüksek",
    prog: 40,
    stage: "Sunum & Müzakere",
    due: "2026-07-15",
    desc: "Can Teknoloji A.Ş. için 10 şube kahve zinciri projesi.",
    checklist: ["Finansal model", "Marka sunum", "Pilot şube lokasyonu", "Franchise sözleşmesi"],
    investorName: "Can Teknoloji A.Ş.",
    brandName: "Blak Coffee Co",
    locationName: "Maslak İş Merkezi Zemin"
  }];
  for (const p of projRows) {
    const ex = await pool.query("SELECT id FROM projects WHERE name=$1 AND deleted_at IS NULL", [p.name]);
    if (ex.rowCount > 0) {
      projectIds[p.name] = ex.rows[0].id;
      continue;
    }
    const invId = investorIds[p.investorName] || null;
    const brandId = p.brandName ? brandIds[p.brandName] || null : null;
    const locId = p.locationName ? locationIds[p.locationName] || null : null;
    const r = await pool.query(`
      INSERT INTO projects(name,project_type,owner_team,assignees,priority,progress,stage,due_date,description,checklist,investor_id,brand_id,location_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`, [p.name, p.type, p.team, p.assignees, p.prio, p.prog, p.stage, p.due, p.desc, p.checklist, invId, brandId, locId]);
    projectIds[p.name] = r.rows[0].id;
  }

  // ── CONTRACTS (cross-linked) ────────────────────────────────────
  const contractIds = {};
  const cRows = [{
    name: "Blak Coffee Co Franchise Sözleşmesi",
    type: "Franchise",
    status: "Aktif",
    counterparty: "Blak Coffee Co Türkiye A.Ş.",
    start: "2026-01-15",
    end: "2029-01-14",
    sign: "2026-01-10",
    amount: 350000,
    fee: 85000,
    feeComm: 65000,
    feeCommPct: 8.5,
    currency: "TRY",
    risk: "Düşük",
    notes: "İstanbul Bağdat Caddesi noktası. 3 yıl + uzatma opsiyonu.",
    investorName: "Ahmet Kılıç",
    brandName: "Blak Coffee Co",
    projectName: "Blak Coffee Co - Bağdat Cad. Açılışı"
  }, {
    name: "Tavada Tavuk Danışmanlık Sözleşmesi",
    type: "Danışmanlık",
    status: "Aktif",
    counterparty: "Tavada Tavuk Ltd. Şti.",
    start: "2026-02-01",
    end: "2026-12-31",
    sign: "2026-01-28",
    amount: 120000,
    fee: 120000,
    feeComm: null,
    feeCommPct: null,
    currency: "TRY",
    risk: "Düşük",
    notes: "Ankara bölge genişleme danışmanlığı. Aylık 10.000 TL.",
    investorName: "Yaman Holding",
    brandName: "Tavada Tavuk",
    projectName: "Tavada Tavuk - Panora AVM Franchise"
  }, {
    name: "SushiMore Ön Anlaşma",
    type: "Ön Sözleşme",
    status: "Müzakere",
    counterparty: "SushiMore Restoranlar A.Ş.",
    start: "2026-04-01",
    end: "2027-03-31",
    sign: null,
    amount: 480000,
    fee: 95000,
    feeComm: 120000,
    feeCommPct: 12.0,
    currency: "TRY",
    risk: "Orta",
    notes: "Nişantaşı premium lokasyon. Final müzakere aşamasında.",
    investorName: "Hüseyin Toprak",
    brandName: "SushiMore",
    projectName: "SushiMore - Nişantaşı Açılışı"
  }, {
    name: "Grup Doruk Master Franchise Protokolü",
    type: "Master Franchise",
    status: "Aktif",
    counterparty: "Grup Doruk Yatırım A.Ş.",
    start: "2026-03-01",
    end: "2031-02-28",
    sign: "2026-02-25",
    amount: 1800000,
    fee: 300000,
    feeComm: 250000,
    feeCommPct: 15.0,
    currency: "TRY",
    risk: "Düşük",
    notes: "The Coffee Factory 5 yıllık master franchise. Kritik gelir kaynağı.",
    investorName: "Grup Doruk Yatırım",
    brandName: "The Coffee Factory",
    projectName: "Grup Doruk - Master Franchise Anlaşması"
  }, {
    name: "Can Teknoloji Danışmanlık Protokolü",
    type: "Danışmanlık",
    status: "Onay Bekliyor",
    counterparty: "Can Teknoloji A.Ş.",
    start: "2026-05-01",
    end: "2027-04-30",
    sign: null,
    amount: 240000,
    fee: 240000,
    feeComm: null,
    feeCommPct: null,
    currency: "TRY",
    risk: "Orta",
    notes: "10 şube için operasyonel danışmanlık. Aylık 20.000 TL.",
    investorName: "Can Teknoloji A.Ş.",
    brandName: "Blak Coffee Co",
    projectName: "Can Teknoloji - Kahve Zinciri Projesi"
  }];
  for (const c of cRows) {
    const ex = await pool.query("SELECT id FROM contracts WHERE name=$1 AND deleted_at IS NULL", [c.name]);
    if (ex.rowCount > 0) {
      contractIds[c.name] = ex.rows[0].id;
      continue;
    }
    const invId = investorIds[c.investorName] || null;
    const brandId = c.brandName ? brandIds[c.brandName] || null : null;
    const projId = c.projectName ? projectIds[c.projectName] || null : null;
    const r = await pool.query(`
      INSERT INTO contracts(name,contract_type,status,counterparty,start_date,end_date,sign_date,amount,consulting_fee,
        franchise_commission,franchise_commission_pct,currency,risk_level,notes,investor_id,brand_id,project_id,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING id`, [c.name, c.type, c.status, c.counterparty, c.start, c.end, c.sign || null, c.amount, c.fee, c.feeComm || null, c.feeCommPct || null, c.currency, c.risk, c.notes, invId, brandId, projId, adminId]);
    contractIds[c.name] = r.rows[0].id;
  }

  // ── TASKS (cross-linked) ───────────────────────────────────────
  const taskRows = [{
    title: "Blak Coffee Co - Bağdat Cad. kira müzakeresi",
    desc: "Kiraya veren Yıldız Gayrimenkul ile kira rakamı müzakere edilecek. Hedef: 350.000 TL altı.",
    status: "Devam Ediyor",
    prio: "Çok Yüksek",
    assignee: "Mert Kaya",
    due: "2026-05-18",
    mod: "Proje",
    projName: "Blak Coffee Co - Bağdat Cad. Açılışı"
  }, {
    title: "SushiMore franchise sözleşmesi imzalatma",
    desc: "Hukuk departmanı nihai sözleşmeyi hazırladı. İmza töreni organize edilecek.",
    status: "Açık",
    prio: "Çok Yüksek",
    assignee: "Burak Yılmaz",
    due: "2026-05-28",
    mod: "Sözleşme",
    contractName: "SushiMore Ön Anlaşma"
  }, {
    title: "Yaman Holding finansal analiz raporu hazırla",
    desc: "Çoklu şube ortaklık teklifine esas finansal model ve projeksiyon raporu.",
    status: "Devam Ediyor",
    prio: "Yüksek",
    assignee: "Ayşe Çetin",
    due: "2026-05-22",
    mod: "Proje",
    projName: "Yaman Holding - Fast Casual Ortaklık"
  }, {
    title: "Panora AVM - Tavada Tavuk ruhsat başvurusu",
    desc: "Çankaya Belediyesi işyeri açma ruhsatı için evrak tamamlanacak.",
    status: "Açık",
    prio: "Yüksek",
    assignee: "Mert Kaya",
    due: "2026-05-25",
    mod: "Lokasyon",
    locationName: "Panora AVM - A Blok F05"
  }, {
    title: "Grup Doruk master franchise sözleşme incelemesi",
    desc: "Hukuk departmanı 90 sayfalık master franchise sözleşmesini inceleyecek.",
    status: "Tamamlandı",
    prio: "Yüksek",
    assignee: "Burak Yılmaz",
    due: "2026-05-15",
    mod: "Sözleşme",
    contractName: "Grup Doruk Master Franchise Protokolü"
  }, {
    title: "Mayıs KPI ve pipeline raporu",
    desc: "Aylık yönetim raporu: yatırımcı, marka, proje ve finans özeti.",
    status: "Devam Ediyor",
    prio: "Orta",
    assignee: "Esra Koç",
    due: "2026-05-31",
    mod: "Genel"
  }, {
    title: "Nişantaşı lokasyon ekspertiz raporu",
    desc: "Köşk Pasajı için bağımsız ekspertiz firmasına rapor yaptırılacak.",
    status: "Açık",
    prio: "Yüksek",
    assignee: "Mert Kaya",
    due: "2026-05-24",
    mod: "Lokasyon",
    locationName: "Nişantaşı Köşk Pasajı"
  }, {
    title: "Ahmet Kılıç - Blak Coffee Co sunum toplantısı hazırlığı",
    desc: "Yatırımcıya özel finansal projeksiyon ve marka tanıtım sunumu hazırlanacak.",
    status: "Tamamlandı",
    prio: "Yüksek",
    assignee: "Selin Demir",
    due: "2026-05-10",
    mod: "Yatırımcı",
    investorName: "Ahmet Kılıç"
  }, {
    title: "Can Teknoloji sözleşme taslağı gönder",
    desc: "10 şube danışmanlık protokolü taslağını inceleme için müşteriye ilet.",
    status: "Açık",
    prio: "Orta",
    assignee: "Burak Yılmaz",
    due: "2026-05-30",
    mod: "Yatırımcı",
    investorName: "Can Teknoloji A.Ş."
  }, {
    title: "Blak Coffee Co Web sitesi ve sosyal medya profil güncelleme",
    desc: "Yeni şube açılışı öncesi marka materyalleri güncellenmeli.",
    status: "Açık",
    prio: "Düşük",
    assignee: "Kemal Erdoğan",
    due: "2026-06-01",
    mod: "Marka",
    brandName: "Blak Coffee Co"
  }, {
    title: "Melek Arslan - Kasap Döner lokasyon shortlist",
    desc: "İzmir Alsancak bölgesi için 3-5 lokasyon shortlist hazırla.",
    status: "Açık",
    prio: "Orta",
    assignee: "Selin Demir",
    due: "2026-06-05",
    mod: "Proje",
    projName: "Melek Arslan - Kasap Döner İzmir"
  }, {
    title: "Forum Bornova AVM kira müzakeresi",
    desc: "AVM yönetimi ile kira ve stopaj şartları müzakere edilecek.",
    status: "Açık",
    prio: "Orta",
    assignee: "Mert Kaya",
    due: "2026-05-29",
    mod: "Lokasyon",
    locationName: "Forum Bornova - ZF12"
  }, {
    title: "Grup Doruk - imza töreni organizasyonu",
    desc: "Noterde master franchise sözleşmesi imzalanacak. Protokol tarihi belirlenecek.",
    status: "Açık",
    prio: "Çok Yüksek",
    assignee: "Selin Demir",
    due: "2026-05-20",
    mod: "Sözleşme",
    contractName: "Grup Doruk Master Franchise Protokolü"
  }, {
    title: "Haziran ayı tahsilat planı",
    desc: "Açık finans kayıtları için tahsilat takvimine bakılacak.",
    status: "Açık",
    prio: "Orta",
    assignee: "Esra Koç",
    due: "2026-06-01",
    mod: "Genel"
  }, {
    title: "SushiMore personel eğitim programı koordinasyonu",
    desc: "Açılış öncesi mutfak ve servis personeli eğitimi planlanacak.",
    status: "Açık",
    prio: "Orta",
    assignee: "Mert Kaya",
    due: "2026-06-10",
    mod: "Proje",
    projName: "SushiMore - Nişantaşı Açılışı"
  }];
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
      VALUES($1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [t.title, t.desc, t.status, t.prio, t.assignee, t.due, t.mod, invId, brandId, projId, locId, contId]);
  }

  // ── FINANCE RECORDS (linked to contracts) ──────────────────────
  const financeCount = await pool.query("SELECT COUNT(*)::int AS count FROM finance_records WHERE contract_id IS NOT NULL");
  if (financeCount.rows[0].count === 0) {
    const finRows = [{
      contName: "Blak Coffee Co Franchise Sözleşmesi",
      incType: "Franchise Ücreti",
      amount: 350000,
      vat: 20,
      payType: "Taksitli",
      status: "Kısmi Ödeme",
      due: "2026-02-01",
      paid: "2026-02-03",
      method: "Havale",
      desc: "Franchise giriş bedeli - 1. taksit"
    }, {
      contName: "Blak Coffee Co Franchise Sözleşmesi",
      incType: "Danışmanlık",
      amount: 85000,
      vat: 20,
      payType: "Peşin",
      status: "Tahsil Edildi",
      due: "2026-01-15",
      paid: "2026-01-16",
      method: "EFT",
      desc: "Açılış danışmanlık ücreti"
    }, {
      contName: "Tavada Tavuk Danışmanlık Sözleşmesi",
      incType: "Danışmanlık",
      amount: 30000,
      vat: 20,
      payType: "Aylık",
      status: "Tahsil Edildi",
      due: "2026-02-01",
      paid: "2026-02-02",
      method: "Havale",
      desc: "Şubat danışmanlık ödemesi"
    }, {
      contName: "Tavada Tavuk Danışmanlık Sözleşmesi",
      incType: "Danışmanlık",
      amount: 30000,
      vat: 20,
      payType: "Aylık",
      status: "Tahsil Edildi",
      due: "2026-03-01",
      paid: "2026-03-03",
      method: "Havale",
      desc: "Mart danışmanlık ödemesi"
    }, {
      contName: "Tavada Tavuk Danışmanlık Sözleşmesi",
      incType: "Danışmanlık",
      amount: 30000,
      vat: 20,
      payType: "Aylık",
      status: "Tahsil Edildi",
      due: "2026-04-01",
      paid: "2026-04-02",
      method: "Havale",
      desc: "Nisan danışmanlık ödemesi"
    }, {
      contName: "Tavada Tavuk Danışmanlık Sözleşmesi",
      incType: "Danışmanlık",
      amount: 30000,
      vat: 20,
      payType: "Aylık",
      status: "Açık",
      due: "2026-05-01",
      paid: null,
      method: null,
      desc: "Mayıs danışmanlık ödemesi"
    }, {
      contName: "Grup Doruk Master Franchise Protokolü",
      incType: "Master Franchise Ücreti",
      amount: 1800000,
      vat: 20,
      payType: "Taksitli",
      status: "Kısmi Ödeme",
      due: "2026-03-15",
      paid: "2026-03-20",
      method: "Banka Transferi",
      desc: "Master franchise giriş bedeli - 1. taksit %50"
    }, {
      contName: "Grup Doruk Master Franchise Protokolü",
      incType: "Danışmanlık",
      amount: 300000,
      vat: 20,
      payType: "Peşin",
      status: "Tahsil Edildi",
      due: "2026-03-01",
      paid: "2026-03-05",
      method: "EFT",
      desc: "Kurulum danışmanlık ücreti"
    }, {
      contName: "SushiMore Ön Anlaşma",
      incType: "Ön Anlaşma Bedeli",
      amount: 50000,
      vat: 20,
      payType: "Peşin",
      status: "Tahsil Edildi",
      due: "2026-04-10",
      paid: "2026-04-11",
      method: "Havale",
      desc: "Ön anlaşma kaparo bedeli"
    }, {
      contName: "SushiMore Ön Anlaşma",
      incType: "Franchise Ücreti",
      amount: 430000,
      vat: 20,
      payType: "Taksitli",
      status: "Açık",
      due: "2026-06-01",
      paid: null,
      method: null,
      desc: "Franchise giriş bedeli - sözleşme imzası sonrası"
    }];
    for (const f of finRows) {
      const contId = contractIds[f.contName] || null;
      const net = f.amount + f.amount * f.vat / 100;
      await pool.query(`
        INSERT INTO finance_records(contract_id,income_type,amount,vat_pct,vat_amount,net_amount,currency,payment_type,status,due_date,paid_date,payment_method,description,created_by)
        VALUES($1,$2,$3,$4,$5,$6,'TRY',$7,$8,$9,$10,$11,$12,$13)`, [contId, f.incType, f.amount, f.vat, f.amount * f.vat / 100, net, f.payType, f.status, f.due, f.paid || null, f.method || null, f.desc, adminId]);
    }
  }

  // ── PNL REVENUES (monthly branch data) ─────────────────────────
  const pnlRevCount = await pool.query("SELECT COUNT(*)::int AS count FROM pnl_revenues");
  if (pnlRevCount.rows[0].count === 0) {
    const months = [{
      name: "OCAK",
      year: 2026,
      amount: 485000
    }, {
      name: "ŞUBAT",
      year: 2026,
      amount: 520000
    }, {
      name: "MART",
      year: 2026,
      amount: 612000
    }, {
      name: "NİSAN",
      year: 2026,
      amount: 578000
    }, {
      name: "MAYIS",
      year: 2026,
      amount: 645000
    }];
    for (const m of months) {
      await pool.query(`
        INSERT INTO pnl_revenues(entry_date,branch,revenue_type,description,amount,source,month_name,year_value,created_by)
        VALUES ($1,'Genel','Satış','Aylık toplam ciro',$2,'Manuel',$3,$4,$5),
               ($1,'Genel','Paket Servis','Paket servis gelirleri',$6,'Manuel',$3,$4,$5)`, [`${m.year}-${months.indexOf(m) + 1 < 10 ? '0' + (months.indexOf(m) + 1) : months.indexOf(m) + 1}-01`, m.amount, Math.round(m.amount * 0.18), m.name, m.year, adminId]);
    }
  }

  // ── PNL EXPENSES (monthly) ────────────────────────────────────
  const pnlExpCount = await pool.query("SELECT COUNT(*)::int AS count FROM pnl_expenses");
  if (pnlExpCount.rows[0].count === 0) {
    const expMonths = [{
      name: "OCAK",
      year: 2026,
      gida: 145000,
      personel: 95000,
      kira: 78000,
      elektrik: 18000,
      diger: 22000
    }, {
      name: "ŞUBAT",
      year: 2026,
      gida: 152000,
      personel: 95000,
      kira: 78000,
      elektrik: 16000,
      diger: 19000
    }, {
      name: "MART",
      year: 2026,
      gida: 178000,
      personel: 105000,
      kira: 78000,
      elektrik: 17000,
      diger: 24000
    }, {
      name: "NİSAN",
      year: 2026,
      gida: 168000,
      personel: 105000,
      kira: 78000,
      elektrik: 15000,
      diger: 21000
    }, {
      name: "MAYIS",
      year: 2026,
      gida: 185000,
      personel: 112000,
      kira: 78000,
      elektrik: 19000,
      diger: 26000
    }];
    for (const m of expMonths) {
      const idx = expMonths.indexOf(m) + 1;
      const dateStr = `${m.year}-${idx < 10 ? '0' + idx : idx}-01`;
      const cats = [['Gıda', m.gida], ['Personel', m.personel], ['Kira', m.kira], ['Elektrik', m.elektrik], ['Diğer', m.diger]];
      for (const [cat, amt] of cats) {
        await pool.query(`
          INSERT INTO pnl_expenses(entry_date,branch,category,description,amount,source,month_name,year_value,created_by)
          VALUES($1,'Genel',$2,$3,$4,'Manuel',$5,$6,$7)`, [dateStr, cat, `${m.name} ${cat.toLowerCase()} giderleri`, amt, m.name, m.year, adminId]);
      }
    }
  }

  // ── PNL PERSONNEL ──────────────────────────────────────────────
  const pnlPerCount = await pool.query("SELECT COUNT(*)::int AS count FROM pnl_personnel");
  if (pnlPerCount.rows[0].count === 0) {
    const personnel = [{
      name: "Selin Demir",
      pos: "Franchise Yöneticisi",
      salary: 28000,
      bonus: 5000,
      ded: 0
    }, {
      name: "Mert Kaya",
      pos: "Operasyon Uzmanı",
      salary: 22000,
      bonus: 3000,
      ded: 0
    }, {
      name: "Ayşe Çetin",
      pos: "Satış Temsilcisi",
      salary: 18000,
      bonus: 4500,
      ded: 0
    }, {
      name: "Burak Yılmaz",
      pos: "Hukuk Danışmanı",
      salary: 32000,
      bonus: 0,
      ded: 0
    }, {
      name: "Esra Koç",
      pos: "Muhasebeci",
      salary: 24000,
      bonus: 2000,
      ded: 0
    }, {
      name: "Kemal Erdoğan",
      pos: "Pazarlama Uzmanı",
      salary: 20000,
      bonus: 2500,
      ded: 0
    }];
    const months = [{
      name: "OCAK",
      year: 2026,
      idx: 1
    }, {
      name: "ŞUBAT",
      year: 2026,
      idx: 2
    }, {
      name: "MART",
      year: 2026,
      idx: 3
    }, {
      name: "NİSAN",
      year: 2026,
      idx: 4
    }, {
      name: "MAYIS",
      year: 2026,
      idx: 5
    }];
    for (const m of months) {
      const dateStr = `${m.year}-${m.idx < 10 ? '0' + m.idx : m.idx}-01`;
      for (const p of personnel) {
        await pool.query(`
          INSERT INTO pnl_personnel(entry_date,branch,person_name,position,salary,bonus,deduction,total_cost,source,month_name,year_value,created_by)
          VALUES($1,'Genel',$2,$3,$4,$5,$6,$7,'Manuel',$8,$9,$10)`, [dateStr, p.name, p.pos, p.salary, m.name === 'OCAK' && p.name === 'Selin Demir' ? p.bonus : m.idx === 3 ? p.bonus : 0, p.ded, p.salary + p.bonus, m.name, m.year, adminId]);
      }
    }
  }

  // ── INVESTOR MEETINGS ──────────────────────────────────────────
  const meetingCount = await pool.query("SELECT COUNT(*)::int AS count FROM investor_meetings WHERE investor_id IS NOT NULL");
  if (meetingCount.rows[0].count === 0) {
    const meetings = [{
      invName: "Ahmet Kılıç",
      type: "Telefon",
      date: "2026-04-24",
      by: "Selin Demir",
      notes: "İlk temas. Coffee franchise arıyor. Bağdat Caddesi ilgisini çekti.",
      action: "Sunum göndermek",
      reminder: "2026-04-28"
    }, {
      invName: "Ahmet Kılıç",
      type: "Yüz Yüze",
      date: "2026-05-02",
      by: "Selin Demir",
      notes: "Blak Coffee Co sunumu yapıldı. Lokasyon gezisi yapıldı. Çok ilgili.",
      action: "Teklif hazırlamak",
      reminder: "2026-05-08"
    }, {
      invName: "Yaman Holding",
      type: "Ofis Toplantısı",
      date: "2026-04-26",
      by: "Selin Demir",
      notes: "CFO ve CEO ile görüşüldü. Çoklu şube modeli tartışıldı.",
      action: "Finansal model göndermek",
      reminder: "2026-05-02"
    }, {
      invName: "Yaman Holding",
      type: "Video Görüşme",
      date: "2026-05-05",
      by: "Ayşe Çetin",
      notes: "Sözleşme taslağı üzerinden geçildi. 3 madde değiştirildi.",
      action: "Hukuk incelemesi",
      reminder: "2026-05-12"
    }, {
      invName: "Can Teknoloji A.Ş.",
      type: "Ofis Toplantısı",
      date: "2026-04-20",
      by: "Selin Demir",
      notes: "10 şube planı paylaşıldı. Finansman için banka görüşmesi var.",
      action: "Master franchise şartlarını hazırlamak",
      reminder: "2026-04-27"
    }, {
      invName: "Can Teknoloji A.Ş.",
      type: "Sunum",
      date: "2026-04-28",
      by: "Selin Demir",
      notes: "Kapsamlı sunum yapıldı. Finansal projeksiyon beğenildi.",
      action: "Sözleşme taslağı göndermek",
      reminder: "2026-05-05"
    }, {
      invName: "Hüseyin Toprak",
      type: "Kahve Toplantısı",
      date: "2026-04-28",
      by: "Selin Demir",
      notes: "Bebek lokasyonu için SushiMore önerildi. Çok hevesli.",
      action: "Nişantaşı lokasyon turu organize et",
      reminder: "2026-05-03"
    }, {
      invName: "Melek Arslan",
      type: "Telefon",
      date: "2026-04-22",
      by: "Ayşe Çetin",
      notes: "İzmir'de tek mağaza arıyor. Kasap Döner ile tanıştırmak istedik.",
      action: "Marka tanıtım göndermek",
      reminder: "2026-04-26"
    }, {
      invName: "Ömer Yıldız",
      type: "Ofis Ziyareti",
      date: "2026-04-29",
      by: "Selin Demir",
      notes: "Antalya Lara bölgesi için AVM lokasyonu tercih ediyor.",
      action: "Forum lokasyon alternatifleri hazırlamak",
      reminder: "2026-05-06"
    }, {
      invName: "Grup Doruk Yatırım",
      type: "NDA İmzası",
      date: "2026-04-22",
      by: "Burak Yılmaz",
      notes: "Gizlilik sözleşmesi imzalandı. Due diligence başlıyor.",
      action: "Due diligence belgelerini göndermek",
      reminder: "2026-04-25"
    }, {
      invName: "Grup Doruk Yatırım",
      type: "Ofis Toplantısı",
      date: "2026-05-05",
      by: "Selin Demir",
      notes: "Master franchise müzakereleri devam ediyor. Bölge hakları tartışıldı.",
      action: "Hukuk incelemesi tamamlamak",
      reminder: "2026-05-10"
    }];
    for (const m of meetings) {
      const invId = investorIds[m.invName] || null;
      if (!invId) continue;
      await pool.query(`
        INSERT INTO investor_meetings(investor_id,meeting_type,meeting_date,met_by,notes,next_action,reminder_date,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [invId, m.type, m.date, m.by, m.notes, m.action, m.reminder, adminId]);
    }
  }

  // ── INVESTOR BRAND MATCHES ─────────────────────────────────────
  const matchCount = await pool.query("SELECT COUNT(*)::int AS count FROM investor_brand_matches");
  if (matchCount.rows[0].count === 0) {
    const matchPairs = [{
      inv: "Ahmet Kılıç",
      brand: "Blak Coffee Co",
      score: 92,
      notes: "Mükemmel uyum: bütçe, sektör, lokasyon tercihi"
    }, {
      inv: "Ahmet Kılıç",
      brand: "The Coffee Factory",
      score: 78,
      notes: "İyi uyum: sektör ve bütçe uyuyor"
    }, {
      inv: "Yaman Holding",
      brand: "Tavada Tavuk",
      score: 88,
      notes: "Güçlü uyum: kurumsal yatırım + fast casual"
    }, {
      inv: "Yaman Holding",
      brand: "Bigye",
      score: 72,
      notes: "Orta-iyi uyum: bütçe yüksek ama sektör uyuyor"
    }, {
      inv: "Can Teknoloji A.Ş.",
      brand: "Blak Coffee Co",
      score: 85,
      notes: "Yüksek bütçe + coffee sektörü"
    }, {
      inv: "Can Teknoloji A.Ş.",
      brand: "Coffee in Munchies",
      score: 70,
      notes: "Alternatif coffee markası"
    }, {
      inv: "Hüseyin Toprak",
      brand: "Yelken Balıkçısı",
      score: 90,
      notes: "Mükemmel: premium seafood + yüksek bütçe"
    }, {
      inv: "Hüseyin Toprak",
      brand: "SushiMore",
      score: 82,
      notes: "İyi: premium Asya mutfağı"
    }, {
      inv: "Melek Arslan",
      brand: "Kasap Döner",
      score: 80,
      notes: "Uygun bütçe ve sektör"
    }, {
      inv: "Ömer Yıldız",
      brand: "Fit Salad Bar",
      score: 76,
      notes: "Sağlıklı yaşam sektörü + AVM tercihi"
    }, {
      inv: "Grup Doruk Yatırım",
      brand: "The Coffee Factory",
      score: 95,
      notes: "Master franchise: en yüksek uyum"
    }, {
      inv: "Deniz Acar",
      brand: "Blak Coffee Co",
      score: 82,
      notes: "Coffee sektörü + bütçe uyumu"
    }, {
      inv: "Deniz Acar",
      brand: "Türk Kahvesi Evi",
      score: 75,
      notes: "Ankara + coffee + düşük yatırım"
    }];
    for (const m of matchPairs) {
      const invId = investorIds[m.inv] || null;
      const brandId = brandIds[m.brand] || null;
      if (!invId || !brandId) continue;
      await pool.query(`
        INSERT INTO investor_brand_matches(investor_id,brand_id,score,notes,created_by)
        VALUES($1,$2,$3,$4,$5) ON CONFLICT(investor_id,brand_id) DO NOTHING`, [invId, brandId, m.score, m.notes, adminId]);
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

  // ── CUSTOMER P&L ÖRNEK VERİ ────────────────────────────────────────────────
  const firstInvId = investorIds['Ahmet Kılıç'] || investorIds[Object.keys(investorIds)[0]];
  const secondInvId = investorIds['Yaman Holding'] || investorIds[Object.keys(investorIds)[1]];
  if (firstInvId) {
    const exCpnl = await pool.query(`SELECT id FROM customer_pnl_revenues WHERE investor_id=$1 LIMIT 1`, [firstInvId]);
    if (exCpnl.rowCount === 0) {
      const months = [{
        name: 'Ocak',
        year: 2026,
        idx: 1
      }, {
        name: 'Şubat',
        year: 2026,
        idx: 2
      }, {
        name: 'Mart',
        year: 2026,
        idx: 3
      }, {
        name: 'Nisan',
        year: 2026,
        idx: 4
      }, {
        name: 'Mayıs',
        year: 2026,
        idx: 5
      }, {
        name: 'Haziran',
        year: 2026,
        idx: 6
      }];
      for (const m of months) {
        const dateStr = `2026-${String(m.idx).padStart(2, '0')}-01`;
        // Gelirler
        await pool.query(`INSERT INTO customer_pnl_revenues(investor_id,entry_date,month_name,year_value,category,description,amount,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [firstInvId, dateStr, m.name, m.year, 'Ciro', `${m.name} ayı satış geliri`, 140000 + m.idx * 8000, adminId]);
        await pool.query(`INSERT INTO customer_pnl_revenues(investor_id,entry_date,month_name,year_value,category,description,amount,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [firstInvId, dateStr, m.name, m.year, 'Komisyon Geliri', `${m.name} franchise komisyonu`, 18000 + m.idx * 500, adminId]);
        if (m.idx % 2 === 0) {
          await pool.query(`INSERT INTO customer_pnl_revenues(investor_id,entry_date,month_name,year_value,category,description,amount,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [firstInvId, dateStr, m.name, m.year, 'Danışmanlık Geliri', 'Ek danışmanlık hizmet bedeli', 12000, adminId]);
        }
        // Giderler
        await pool.query(`INSERT INTO customer_pnl_expenses(investor_id,entry_date,month_name,year_value,category,description,amount,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [firstInvId, dateStr, m.name, m.year, 'Personel', `${m.name} personel maaşları`, 55000, adminId]);
        await pool.query(`INSERT INTO customer_pnl_expenses(investor_id,entry_date,month_name,year_value,category,description,amount,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [firstInvId, dateStr, m.name, m.year, 'Kira', 'Mağaza kira bedeli', 28000, adminId]);
        await pool.query(`INSERT INTO customer_pnl_expenses(investor_id,entry_date,month_name,year_value,category,description,amount,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [firstInvId, dateStr, m.name, m.year, 'Gıda', `${m.name} malzeme/hammadde`, 32000 + m.idx * 1000, adminId]);
        await pool.query(`INSERT INTO customer_pnl_expenses(investor_id,entry_date,month_name,year_value,category,description,amount,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [firstInvId, dateStr, m.name, m.year, 'Elektrik', 'Elektrik + su faturası', 4500, adminId]);
        await pool.query(`INSERT INTO customer_pnl_expenses(investor_id,entry_date,month_name,year_value,category,description,amount,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [firstInvId, dateStr, m.name, m.year, 'POS Komisyon', 'Kart komisyon bedeli', 3200 + m.idx * 200, adminId]);
        if (m.idx === 3 || m.idx === 6) {
          await pool.query(`INSERT INTO customer_pnl_expenses(investor_id,entry_date,month_name,year_value,category,description,amount,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [firstInvId, dateStr, m.name, m.year, 'Vergi', 'Dönemsel vergi ödemesi', 14000, adminId]);
        }
      }
    }
  }
  if (secondInvId) {
    const exCpnl2 = await pool.query(`SELECT id FROM customer_pnl_revenues WHERE investor_id=$1 LIMIT 1`, [secondInvId]);
    if (exCpnl2.rowCount === 0) {
      const months2 = [{
        name: 'Mart',
        year: 2026,
        idx: 3
      }, {
        name: 'Nisan',
        year: 2026,
        idx: 4
      }, {
        name: 'Mayıs',
        year: 2026,
        idx: 5
      }];
      for (const m of months2) {
        const dateStr = `2026-${String(m.idx).padStart(2, '0')}-01`;
        await pool.query(`INSERT INTO customer_pnl_revenues(investor_id,entry_date,month_name,year_value,category,description,amount,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [secondInvId, dateStr, m.name, m.year, 'Ciro', `${m.name} çoklu şube ciro`, 380000 + m.idx * 15000, adminId]);
        await pool.query(`INSERT INTO customer_pnl_revenues(investor_id,entry_date,month_name,year_value,category,description,amount,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [secondInvId, dateStr, m.name, m.year, 'Komisyon Geliri', 'Master franchise komisyonu', 45000, adminId]);
        await pool.query(`INSERT INTO customer_pnl_expenses(investor_id,entry_date,month_name,year_value,category,description,amount,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [secondInvId, dateStr, m.name, m.year, 'Personel', 'Çoklu şube personel gideri', 140000, adminId]);
        await pool.query(`INSERT INTO customer_pnl_expenses(investor_id,entry_date,month_name,year_value,category,description,amount,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [secondInvId, dateStr, m.name, m.year, 'Kira', 'Şubeler toplam kira', 85000, adminId]);
        await pool.query(`INSERT INTO customer_pnl_expenses(investor_id,entry_date,month_name,year_value,category,description,amount,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [secondInvId, dateStr, m.name, m.year, 'Gıda', 'Malzeme ve hammadde', 92000, adminId]);
      }
    }
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
  const rows = xlsx.utils.sheet_to_json(sheet, {
    header: 1,
    defval: ""
  });
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
  return {
    monthName,
    revenue,
    expense,
    profit
  };
}
function extractPnLDetailLines(sheet) {
  const rows = xlsx.utils.sheet_to_json(sheet, {
    header: 1,
    defval: ""
  });
  const details = [];
  let currentCategory = "Diğer";
  const categoryHints = ["maliyetler", "personel giderleri", "satış komisyon gideri", "kira ve aidat gideri", "enerji giderleri", "değişken  giderler", "değişken giderler"];
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
      ratio
    });
  }
  return details;
}

// 12. Database Health Check API

// 13. Database Auto-Fix API (Güçlendirilmiş)

// LEGACY - kept for compatibility

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
  const assignId = rawAssign === "" || rawAssign === undefined || rawAssign === null ? null : Number(rawAssign);
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
    notes: b.notes || null
  };
}
async function computeInvestorKpis() {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
    const activeStages = ["Yeni Lead", "İlk Temas", "İhtiyaç Analizi", "Marka Eşleşmesi", "Sunum", "Lokasyon Çalışması", "Teklif", "Sözleşme"];
    const runQuery = async (sql, params = []) => {
      try {
        const qr = await pool.query(sql, params);
        return qr.rows[0]?.c || Number(qr.rows[0]?.a || 0);
      } catch (e) {
        console.error("computeInvestorKpis query failed:", sql, e.message);
        return 0;
      }
    };
    const [total, newLeads, active, hot, closedMonth, avgBudget] = await Promise.all([runQuery("SELECT COUNT(*)::int AS c FROM investors WHERE deleted_at IS NULL"), runQuery("SELECT COUNT(*)::int AS c FROM investors WHERE deleted_at IS NULL AND pipeline_stage = $1", ["Yeni Lead"]), runQuery("SELECT COUNT(*)::int AS c FROM investors WHERE deleted_at IS NULL AND pipeline_stage = ANY($1::text[])", [activeStages]), runQuery("SELECT COUNT(*)::int AS c FROM investors WHERE deleted_at IS NULL AND priority IN ('Yüksek','Çok sıcak')"), runQuery("SELECT COUNT(*)::int AS c FROM investors WHERE deleted_at IS NULL AND pipeline_stage = 'Kapanış' AND updated_at >= $1::date", [monthStart]), runQuery("SELECT COALESCE(AVG(budget::numeric), 0)::numeric AS a FROM investors WHERE deleted_at IS NULL")]);
    return {
      total,
      newLeads,
      activePipeline: active,
      hotInvestors: hot,
      closedThisMonth: closedMonth,
      avgBudget
    };
  } catch (err) {
    console.error("computeInvestorKpis failed:", err.message);
    return {
      total: 0,
      newLeads: 0,
      activePipeline: 0,
      hotInvestors: 0,
      closedThisMonth: 0,
      avgBudget: 0
    };
  }
}
async function investorReminders() {
  try {
    const today = new Date().toISOString().split("T")[0];
    const staleDate = new Date(Date.now() - 7 * 86400000).toISOString();
    let followUpDue = [];
    try {
      const follow = await pool.query(`SELECT id,name,follow_up_date,priority FROM investors
         WHERE follow_up_date IS NOT NULL AND follow_up_date <= $1::date
         ORDER BY follow_up_date ASC LIMIT 50`, [today]);
      followUpDue = follow.rows;
    } catch (err) {
      console.error("investorReminders followUp query failed:", err.message);
    }
    let staleHot = [];
    try {
      // Safely query created_at as fallback since last_activity_at column might not exist
      const stale = await pool.query(`SELECT id,name,priority,created_at FROM investors
         WHERE priority IN ('Yüksek','Çok sıcak')
         AND created_at < $1::timestamptz
         ORDER BY created_at ASC LIMIT 50`, [staleDate]);
      staleHot = stale.rows;
    } catch (err) {
      console.error("investorReminders stale query failed:", err.message);
    }
    return {
      followUpDue,
      staleHot
    };
  } catch (err) {
    console.error("investorReminders failed:", err.message);
    return {
      followUpDue: [],
      staleHot: []
    };
  }
}
function brandOnboardingFromBody(b) {
  const raw = b.onboardingSteps ?? b.onboarding_steps;
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === "string") return raw.split("\n").map(s => s.trim()).filter(Boolean);
  return [];
}
function brandWriteValues(body) {
  const b = body || {};
  const steps = brandOnboardingFromBody(b);
  const docs = Array.isArray(b.documents) ? b.documents.map(String) : [];
  const n = v => v === "" || v === undefined || v === null ? null : Number(v);
  return [b.name, b.sector, Number(b.minBudget ?? 0), Number(b.maxBudget ?? 0), b.currency || "TRY", Number(b.minSqm ?? 0), Number(b.maxSqm ?? 0), b.targetLocations ?? b.target_locations ?? "", b.active !== false, Number(b.monthlyGrowth ?? 0), b.agreementStatus ?? b.agreement_status ?? null, n(b.franchiseFee), n(b.royaltyRate), n(b.contractTermMonths), n(b.initialInvestment), n(b.branchCount), b.contactPerson || null, b.contactPhone || null, b.businessPlan || null, b.operationPlan || null, steps, b.kpiTargets || null, b.brandNotes || null, b.subSector || null, b.whatsappPhone || null, b.email || null, b.website || null, b.brandType || null, b.targetRegions || null, b.locationType || null, b.storefrontNeed || null, b.chimneyNeed || null, b.techInfrastructure || null, b.staffNeed || null, n(b.adContributionPct), n(b.avgMonthlyRevenue), n(b.profitMarginPct), n(b.paybackMonths), b.presentationUrl || null, b.logoUrl || null, b.contractDraftUrl || null, docs, b.givesFranchise !== false, b.hasRoyalty !== false, n(b.scoreOperation), n(b.scoreFranchiseFit), n(b.scoreLocationFlex), n(b.scoreInvestorInterest), n(b.scoreProfitability), n(b.scoreGrowth)];
}
async function computeBrandKpis() {
  try {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
    const runQuery = async (sql, params = []) => {
      try {
        const qr = await pool.query(sql, params);
        return qr.rows[0]?.c || Number(qr.rows[0]?.a || 0);
      } catch (e) {
        console.error("computeBrandKpis query failed:", sql, e.message);
        return 0;
      }
    };
    const [total, activeAgreed, inDiscussion, passive, avgInv, newMonth] = await Promise.all([runQuery("SELECT COUNT(*)::int AS c FROM brands WHERE deleted_at IS NULL"), runQuery("SELECT COUNT(*)::int AS c FROM brands WHERE deleted_at IS NULL AND active = true AND COALESCE(agreement_status,'') = 'Anlaşmalı'"), runQuery("SELECT COUNT(*)::int AS c FROM brands WHERE deleted_at IS NULL AND COALESCE(agreement_status,'') IN ('Görüşülüyor','Beklemede')"), runQuery("SELECT COUNT(*)::int AS c FROM brands WHERE deleted_at IS NULL AND (active = false OR COALESCE(agreement_status,'') IN ('Pasif','Reddedildi'))"), runQuery("SELECT COALESCE(AVG((min_budget::numeric + max_budget::numeric) / 2), 0)::numeric AS a FROM brands WHERE deleted_at IS NULL AND min_budget IS NOT NULL AND max_budget IS NOT NULL"), runQuery("SELECT COUNT(*)::int AS c FROM brands WHERE deleted_at IS NULL AND created_at::date >= $1::date", [monthStart])]);
    return {
      total,
      activeAgreed,
      inDiscussion,
      passive,
      avgInvestment: avgInv,
      newThisMonth: newMonth
    };
  } catch (err) {
    console.error("computeBrandKpis failed:", err.message);
    return {
      total: 0,
      activeAgreed: 0,
      inDiscussion: 0,
      passive: 0,
      avgInvestment: 0,
      newThisMonth: 0
    };
  }
}
function locationRowFromBody(body, userId) {
  const b = body || {};
  return [b.name, b.type || b.locationType, Number(b.sqm || 0), Number(b.rent || 0), b.currency || "TRY", b.potential || "Orta", Array.isArray(b.recommendedBrands) ? b.recommendedBrands : [], b.address || null, b.traffic || null, b.owner || null, b.ownerPhone || null, b.city || null, b.district || null, b.region || null, b.avenueName || null, b.mapsLink || null, b.segment || null, b.storefrontLength == null || b.storefrontLength === "" ? null : Number(b.storefrontLength), b.floorInfo || null, b.chimneyStatus || null, b.infrastructureStatus || null, b.revenueRentPct == null || b.revenueRentPct === "" ? null : Number(b.revenueRentPct), b.dues == null || b.dues === "" ? null : Number(b.dues), b.deposit == null || b.deposit === "" ? null : Number(b.deposit), b.footfallScore == null || b.footfallScore === "" ? null : Number(b.footfallScore), b.competitorBrands || null, b.targetCustomerProfile || null, b.suitableSectors || null, b.status || "Boş", b.brandFitScore == null || b.brandFitScore === "" ? null : Number(b.brandFitScore), b.streetClass || null, b.avmSegment || null, Array.isArray(b.files) ? b.files : [], b.notes || null, b.attachmentName || null, b.attachmentData || null, b.attachmentUrl || null, userId || null];
}
async function computeLocationKpis() {
  try {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
    const runQuery = async (sql, params = []) => {
      try {
        const qr = await pool.query(sql, params);
        return qr.rows[0]?.c || Number(qr.rows[0]?.a || 0);
      } catch (e) {
        console.error("computeLocationKpis query failed:", sql, e.message);
        return 0;
      }
    };
    const [total, active, empty, highPotential, avgRent, addedMonth] = await Promise.all([runQuery("SELECT COUNT(*)::int AS c FROM locations WHERE deleted_at IS NULL"), runQuery("SELECT COUNT(*)::int AS c FROM locations WHERE deleted_at IS NULL AND status IN ('Dolu','Görüşmede','Kiralandı')"), runQuery("SELECT COUNT(*)::int AS c FROM locations WHERE deleted_at IS NULL AND status='Boş'"), runQuery("SELECT COUNT(*)::int AS c FROM locations WHERE deleted_at IS NULL AND potential IN ('Yüksek','Premium')"), runQuery("SELECT COALESCE(AVG(rent::numeric),0)::numeric AS a FROM locations WHERE deleted_at IS NULL"), runQuery("SELECT COUNT(*)::int AS c FROM locations WHERE deleted_at IS NULL AND created_at::date >= $1::date", [monthStart])]);
    return {
      total,
      active,
      empty,
      highPotential,
      avgRent,
      newThisMonth: addedMonth
    };
  } catch (err) {
    console.error("computeLocationKpis failed:", err.message);
    return {
      total: 0,
      active: 0,
      empty: 0,
      highPotential: 0,
      avgRent: 0,
      newThisMonth: 0
    };
  }
}
function projectRowFromBody(body) {
  const b = body || {};
  return [b.name, b.type || b.projectType || "Franchise", b.owner || b.ownerTeam || "Operasyon", Array.isArray(b.assignees) ? b.assignees : [], b.priority || "Orta", Number(b.progress || 0), b.stage || b.pipelineStage || "Lead", b.dueDate || b.closeDate || null, b.description || null, Array.isArray(b.checklist) ? b.checklist : [], b.investorId || b.investor_id || null, b.brandId || b.brand_id || null, b.locationId || b.location_id || null, b.estimatedInvestment == null || b.estimatedInvestment === "" ? null : Number(b.estimatedInvestment), b.estimatedRevenue == null || b.estimatedRevenue === "" ? null : Number(b.estimatedRevenue), b.ownerPerson || null, b.startDate || null, b.closeDate || null, b.riskLevel || null, b.pipelineStage || b.stage || null, Array.isArray(b.files) ? b.files : []];
}
async function computeProjectKpis() {
  try {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
    const runQuery = async (sql, params = []) => {
      try {
        const qr = await pool.query(sql, params);
        return qr.rows[0]?.c || Number(qr.rows[0]?.a || 0);
      } catch (e) {
        console.error("computeProjectKpis query failed:", sql, e.message);
        return 0;
      }
    };
    const [total, active, closed, waiting, avgClose, monthOpen] = await Promise.all([runQuery("SELECT COUNT(*)::int AS c FROM projects WHERE deleted_at IS NULL"), runQuery("SELECT COUNT(*)::int AS c FROM projects WHERE deleted_at IS NULL AND stage NOT IN ('Kapanış')"), runQuery("SELECT COUNT(*)::int AS c FROM projects WHERE deleted_at IS NULL AND stage='Kapanış'"), runQuery("SELECT COUNT(*)::int AS c FROM projects WHERE deleted_at IS NULL AND stage IN ('Lead','Analiz')"), runQuery("SELECT COALESCE(AVG(EXTRACT(DAY FROM (due_date - created_at::date))),0)::numeric AS a FROM projects WHERE deleted_at IS NULL AND stage='Kapanış'"), runQuery("SELECT COUNT(*)::int AS c FROM projects WHERE deleted_at IS NULL AND created_at::date >= $1::date", [monthStart])]);
    return {
      total,
      active,
      closed,
      waiting,
      avgCloseDays: avgClose,
      newThisMonth: monthOpen
    };
  } catch (err) {
    console.error("computeProjectKpis failed:", err.message);
    return {
      total: 0,
      active: 0,
      closed: 0,
      waiting: 0,
      avgCloseDays: 0,
      newThisMonth: 0
    };
  }
}
// ─── CONTRACT KPI ────────────────────────────────────────────────────────────
async function computeContractKpis() {
  try {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
    const thirtyDays = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];
    const today = new Date().toISOString().split("T")[0];
    const runQuery = async (sql, params = []) => {
      try {
        const qr = await pool.query(sql, params);
        return qr.rows[0]?.c || Number(qr.rows[0]?.s || 0);
      } catch (e) {
        console.error("computeContractKpis query failed:", sql, e.message);
        return 0;
      }
    };
    const [total, active, signedMonth, expiringSoon, terminated, totalValue] = await Promise.all([runQuery("SELECT COUNT(*)::int AS c FROM contracts WHERE deleted_at IS NULL"), runQuery("SELECT COUNT(*)::int AS c FROM contracts WHERE deleted_at IS NULL AND status='Aktif'"), runQuery("SELECT COUNT(*)::int AS c FROM contracts WHERE deleted_at IS NULL AND start_date >= $1::date", [monthStart]), runQuery("SELECT COUNT(*)::int AS c FROM contracts WHERE deleted_at IS NULL AND status='Aktif' AND end_date BETWEEN $1::date AND $2::date", [today, thirtyDays]), runQuery("SELECT COUNT(*)::int AS c FROM contracts WHERE deleted_at IS NULL AND status='Feshedildi'"), runQuery("SELECT COALESCE(SUM(amount::numeric),0)::numeric AS s FROM contracts WHERE deleted_at IS NULL AND status IN ('Aktif','İmzalandı')")]);
    return {
      total,
      active,
      signedThisMonth: signedMonth,
      expiringSoon,
      terminated,
      totalValue
    };
  } catch (err) {
    console.error("computeContractKpis failed:", err.message);
    return {
      total: 0,
      active: 0,
      signedThisMonth: 0,
      expiringSoon: 0,
      terminated: 0,
      totalValue: 0
    };
  }
}
// ─── FINANCE RECORDS ─────────────────────────────────────────────────────────
async function computeFinanceKpis() {
  try {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
    const runQuery = async (sql, params = []) => {
      try {
        const qr = await pool.query(sql, params);
        return Number(qr.rows[0]?.s || 0);
      } catch (e) {
        console.error("computeFinanceKpis query failed:", sql, e.message);
        return 0;
      }
    };
    const [totalIncome, collected, pending, overdue, monthIncome, totalExpense] = await Promise.all([runQuery("SELECT COALESCE(SUM(amount::numeric),0)::numeric AS s FROM finance_records WHERE deleted_at IS NULL"), runQuery("SELECT COALESCE(SUM(amount::numeric),0)::numeric AS s FROM finance_records WHERE deleted_at IS NULL AND status='Tahsil edildi'"), runQuery("SELECT COALESCE(SUM(amount::numeric),0)::numeric AS s FROM finance_records WHERE deleted_at IS NULL AND status='Açık'"), runQuery("SELECT COALESCE(SUM(amount::numeric),0)::numeric AS s FROM finance_records WHERE deleted_at IS NULL AND status='Gecikti'"), runQuery("SELECT COALESCE(SUM(amount::numeric),0)::numeric AS s FROM finance_records WHERE deleted_at IS NULL AND created_at::date >= $1::date", [monthStart]), runQuery("SELECT COALESCE(SUM(amount::numeric),0)::numeric AS s FROM finance_expenses WHERE expense_date >= $1::date", [monthStart])]);
    const net = collected - totalExpense;
    return {
      totalIncome,
      collected,
      pending,
      overdue,
      monthIncome,
      netProfit: net
    };
  } catch (err) {
    console.error("computeFinanceKpis failed:", err.message);
    return {
      totalIncome: 0,
      collected: 0,
      pending: 0,
      overdue: 0,
      monthIncome: 0,
      netProfit: 0
    };
  }
}

// Ödeme al (taksit / peşin)

// Ödeme planı upsert

// Gider API

const TASK_BASE_SELECT = `
  SELECT t.*,
    i.name AS investor_name,
    b.name AS brand_name,
    p.name AS project_name,
    l.name AS location_name,
    c.note AS contract_name
  FROM tasks t
  LEFT JOIN investors i ON i.id = t.investor_id
  LEFT JOIN brands b ON b.id = t.brand_id
  LEFT JOIN projects p ON p.id = t.project_id
  LEFT JOIN locations l ON l.id = t.location_id
  LEFT JOIN contracts c ON c.id = t.contract_id
`;

// =====================================================
// PnL - Gelirler (Revenues) CRUD
// =====================================================

// =====================================================
// PnL - Giderler (Expenses) CRUD
// =====================================================

// =====================================================
// PnL - Personel Giderleri CRUD
// =====================================================

// =====================================================
// PnL - Özet & Aylık Rapor
// =====================================================

// =====================================================
// PnL - Başlık Eşleştirme (Field Mappings)
// =====================================================

// =====================================================
// PnL - Excel İçe Aktarma (Preview + Confirm)
// =====================================================
const PNL_BUILTIN_MAPPINGS = {
  "satışlar": {
    category: "Satış",
    type: "revenue"
  },
  "aylık toplam ciro": {
    category: "Satış",
    type: "revenue"
  },
  "ciro": {
    category: "Satış",
    type: "revenue"
  },
  "gelir": {
    category: "Satış",
    type: "revenue"
  },
  "gıda": {
    category: "Gıda",
    type: "expense"
  },
  "food cost": {
    category: "Gıda",
    type: "expense"
  },
  "malzeme": {
    category: "Gıda",
    type: "expense"
  },
  "personel": {
    category: "Personel",
    type: "expense"
  },
  "maaş": {
    category: "Personel",
    type: "expense"
  },
  "kira": {
    category: "Kira",
    type: "expense"
  },
  "aidat": {
    category: "Kira",
    type: "expense"
  },
  "elektrik": {
    category: "Elektrik",
    type: "expense"
  },
  "su": {
    category: "Su",
    type: "expense"
  },
  "doğalgaz": {
    category: "Doğalgaz",
    type: "expense"
  },
  "dogalgaz": {
    category: "Doğalgaz",
    type: "expense"
  },
  "pos komisyon": {
    category: "POS Komisyon",
    type: "expense"
  },
  "pos": {
    category: "POS Komisyon",
    type: "expense"
  },
  "paket servis": {
    category: "Paket Servis",
    type: "expense"
  },
  "vergi": {
    category: "Vergi",
    type: "expense"
  },
  "devir sayım": {
    category: "Devir Sayım / Stok Farkı",
    type: "expense"
  },
  "stok": {
    category: "Devir Sayım / Stok Farkı",
    type: "expense"
  },
  "diğer": {
    category: "Diğer",
    type: "expense"
  }
};
function resolveMapping(header, savedMappings) {
  const lc = String(header).toLowerCase("tr-TR").trim();
  if (PNL_BUILTIN_MAPPINGS[lc]) return PNL_BUILTIN_MAPPINGS[lc];
  for (const [key, val] of Object.entries(PNL_BUILTIN_MAPPINGS)) {
    if (lc.includes(key)) return val;
  }
  const saved = savedMappings.find(m => m.source_header.toLowerCase() === lc);
  if (saved) return {
    category: saved.mapped_category,
    type: saved.mapped_type
  };
  return null;
}

// =====================================================
// PnL - Legacy (eski özet listesi, geriye dönük uyum)
// =====================================================

// ─── Müşteri Kar/Zarar Modülü ───────────────────────────────────────────────

const MONTHS_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

// Excel Şablon İndir

// Aylık Özet

// Excel İçe Aktar — parse + preview

// Excel İçe Aktar — confirm (insert)

// Gelirler CRUD

// Giderler CRUD

// Özet

// PDF Export (branded)

// Excel Export

// ─── Global Error Handler ─────────────────────────────────────────────────────

// Inject helpers into global scope so separated route files can access them
// TODO: Refactor these into a separate utils/helpers.js file later
Object.assign(global, { fetchFont, getRobotoRegular, getRobotoBold, pipelineStages, scoreWeights, cityFitMap, ENTITY_CONFIG, signToken, fillTemplate, logAutomation, logActivity, sendMailNotification, sendMailToRecipient, sendWhatsAppNotification, triggerAutomation, mapInvestor, mapBrand, mapLocation, mapProject, mapTask, mapTeamMember, mapContract, mapFinanceRecord, mapPaymentPlan, mapExpense, scoreBudget, scoreCity, scoreSector, scoreSqm, initDb, seedDefaultDataIfNeeded, normalizeMonthName, pickNumeric, extractMonthlyPnL, extractPnLDetailLines, investorDateOrNull, investorRowFromBody, computeInvestorKpis, investorReminders, brandOnboardingFromBody, brandWriteValues, computeBrandKpis, locationRowFromBody, computeLocationKpis, projectRowFromBody, computeProjectKpis, computeContractKpis, computeFinanceKpis, TASK_BASE_SELECT, resolveMapping, start });

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({
    message: "Sunucu hatası oluştu.",
    detail: err.message
  });
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