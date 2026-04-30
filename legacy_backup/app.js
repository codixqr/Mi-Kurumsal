const API_BASE = "";
const TOKEN_KEY = "mi_crm_token";

const state = {
  user: null,
  isDemo: false,
  pipelineStages: [],
  investors: [],
  brands: [],
  locations: [],
  projects: [],
  contracts: [],
  tasks: [],
  timeline: [],
  templates: [],
  pnlReports: [],
  brandAgreements: [],
  pnlDetailLines: [],
  reportSummary: null,
  kpis: [],
  editing: {
    investorId: null,
    brandId: null,
    locationId: null,
    projectId: null,
    contractId: null,
    taskId: null,
    templateId: null,
  },
};

const demoData = {
  pipelineStages: [
    "Yeni Lead",
    "İletişim Kuruldu",
    "Analiz Yapıldı",
    "Marka Önerildi",
    "Sunum Yapıldı",
    "Teklif Verildi",
    "Kapandı (Kazanıldı/Kaybedildi)",
  ],
  investors: [
    {
      id: 1,
      name: "Örnek Yatırımcı A",
      budget: 2500000,
      currency: "TRY",
      city: "İstanbul",
      sector: "Coffee",
      type: "Franchise",
      pipeline: "Marka Önerildi",
      phone: "+90 555 000 00 01",
      email: "a@ornek.com",
      district: "Kadıköy",
      goal: "Coffee franchise",
      contactHistory: "21.04 arandı, 24.04 toplantı yapıldı",
      meetingNotes: "Lokasyon olarak AVM öncelikli.",
      followUpDate: "2026-05-02",
      documents: ["sunum.pdf"],
    },
    {
      id: 2,
      name: "Kurumsal Grup",
      budget: 4000000,
      currency: "USD",
      city: "İzmir",
      sector: "Fast Casual",
      type: "Ortaklık",
      pipeline: "Teklif Verildi",
      phone: "+90 555 000 00 02",
      email: "grup@ornek.com",
      district: "Bornova",
      goal: "Çoklu şube yatırım",
      contactHistory: "26.04 online görüşme",
      meetingNotes: "Kira bütçesi esnek.",
      followUpDate: "2026-05-05",
      documents: ["teklif.docx"],
    },
  ],
  brands: [
    { id: 1, name: "Tavada Tavuk", sector: "Fast Casual", currency: "TRY", minBudget: 1500000, maxBudget: 3500000, minSqm: 90, maxSqm: 220, targetLocations: "AVM + Cadde", active: true, monthlyGrowth: 11 },
    { id: 2, name: "Bigye", sector: "Fast Casual", currency: "TRY", minBudget: 1300000, maxBudget: 2900000, minSqm: 70, maxSqm: 180, targetLocations: "AVM", active: true, monthlyGrowth: 9 },
    { id: 3, name: "Kasap Döner", sector: "Doner", currency: "TRY", minBudget: 1200000, maxBudget: 2600000, minSqm: 65, maxSqm: 150, targetLocations: "Cadde", active: true, monthlyGrowth: 8 },
    { id: 4, name: "Cajun Corner", sector: "Fast Casual", currency: "TRY", minBudget: 1400000, maxBudget: 3100000, minSqm: 80, maxSqm: 170, targetLocations: "AVM + Cadde", active: true, monthlyGrowth: 10 },
    { id: 5, name: "Springfield ( Yeni Nesil Dürüm)", sector: "Doner", currency: "TRY", minBudget: 1250000, maxBudget: 2500000, minSqm: 60, maxSqm: 130, targetLocations: "Cadde", active: true, monthlyGrowth: 7 },
    { id: 6, name: "Yelken Balıkçısı", sector: "Seafood", currency: "TRY", minBudget: 2000000, maxBudget: 5000000, minSqm: 140, maxSqm: 350, targetLocations: "Sahil + Premium Cadde", active: true, monthlyGrowth: 6 },
    { id: 7, name: "Mogaf Döner", sector: "Doner", currency: "TRY", minBudget: 1100000, maxBudget: 2100000, minSqm: 50, maxSqm: 120, targetLocations: "Cadde + Mahalle", active: true, monthlyGrowth: 8 },
    { id: 8, name: "Blak Coffee Co", sector: "Coffee", currency: "TRY", minBudget: 1700000, maxBudget: 3600000, minSqm: 90, maxSqm: 180, targetLocations: "Cadde + AVM", active: true, monthlyGrowth: 13 },
    { id: 9, name: "The Coffee Factory", sector: "Coffee", currency: "TRY", minBudget: 1400000, maxBudget: 3300000, minSqm: 80, maxSqm: 170, targetLocations: "AVM", active: true, monthlyGrowth: 12 },
    { id: 10, name: "Coffee in Munchies", sector: "Coffee", currency: "TRY", minBudget: 1300000, maxBudget: 2900000, minSqm: 75, maxSqm: 160, targetLocations: "Cadde + AVM", active: true, monthlyGrowth: 9 },
  ],
  locations: [
    {
      id: 1,
      name: "Bağdat Caddesi",
      type: "Cadde",
      sqm: 130,
      currency: "TRY",
      rent: 380000,
      potential: "Yüksek",
      recommendedBrands: ["Blak Coffee Co", "Tavada Tavuk"],
      address: "Caddebostan, İstanbul",
      traffic: "Yoğun",
      owner: "Örnek Gayrimenkul",
      ownerPhone: "+90 555 333 00 00",
      notes: "",
      attachmentName: "",
      attachmentData: "",
    },
  ],
  projects: [
    {
      id: 1,
      name: "Tavada Tavuk - Franchise Genişleme",
      type: "Franchise",
      owner: "Franchise Ekibi",
      assignees: ["Ali", "Zeynep"],
      priority: "Yüksek",
      progress: 40,
      stage: "Sunum & Müzakere",
      dueDate: "2026-05-12",
      description: "Anadolu yakasında 2 yeni nokta hedefleniyor.",
      checklist: ["Lokasyon shortlist", "Marka sunumu", "Teklif"],
    },
  ],
  contracts: [
    {
      id: 1,
      note: "Blak Coffee Co danışmanlık sözleşmesi - İmza bekleniyor",
      type: "Danışmanlık Sözleşmesi",
      status: "İmzaya Gönderildi",
      counterparty: "Blak Coffee Co",
      startDate: "2026-04-01",
      endDate: "2027-04-01",
      amount: 500000,
      currency: "TRY",
      fileName: "",
      fileData: "",
    },
  ],
  tasks: [{ id: 1, note: "Franchise ekibi: Springfield shortlist hazırla", status: "Açık" }],
  pnlReports: [
    { id: 1, month_name: "AĞUSTOS", year_value: 2023, revenue: 503000, expense: 515132.53, profit: -12132.53, note: "Excel başlangıç verisi" },
    { id: 2, month_name: "EYLÜL", year_value: 2023, revenue: 548017.72, expense: 452365, profit: 95652.72, note: "Excel başlangıç verisi" },
    { id: 3, month_name: "EKİM", year_value: 2023, revenue: 548017.72, expense: 452365, profit: 95652.72, note: "Excel başlangıç verisi" },
    { id: 4, month_name: "KASIM", year_value: 2023, revenue: 1250000, expense: 579000, profit: 671000, note: "Excel başlangıç verisi" },
    { id: 5, month_name: "ARALIK", year_value: 2023, revenue: 570486.74, expense: 416526, profit: 153960.74, note: "Excel başlangıç verisi" },
  ],
};

function formatCurrency(value) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatMoney(value, currency = "TRY") {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: currency || "TRY",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function token() {
  return localStorage.getItem(TOKEN_KEY);
}

async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
        ...(options.headers || {}),
      },
    });
  } catch (error) {
    throw new Error("Sunucuya ulaşılamadı. Backend ve PostgreSQL çalışıyor mu kontrol edin.");
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || "API hatası");
  }
  if (response.status === 204) {
    return null;
  }
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response.blob();
}

async function apiForm(path, formData, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      ...options,
      headers: {
        ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
        ...(options.headers || {}),
      },
      body: formData,
    });
  } catch (error) {
    throw new Error("Sunucuya ulaşılamadı. Backend ve PostgreSQL çalışıyor mu kontrol edin.");
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || "Dosya yükleme hatası");
  }
  return response.json();
}

async function uploadFileForModule(file, moduleName) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("moduleName", moduleName);
  return apiForm("/api/uploads", formData);
}

function setAuthView(isAuthenticated) {
  document.getElementById("authView").classList.toggle("hidden", isAuthenticated);
  document.getElementById("appView").classList.toggle("hidden", !isAuthenticated);
}

function getRecommendationTag(score) {
  if (score >= 85) return { text: "Güçlü Eşleşme", className: "tag tag-success" };
  if (score >= 70) return { text: "Takip Edilebilir", className: "tag tag-warning" };
  return { text: "Düşük Uyum", className: "tag tag-danger" };
}

function setMessage(text, isError = false) {
  const node = document.getElementById("authMessage");
  node.textContent = text;
  node.style.color = isError ? "#b44343" : "#1f7a5c";
}

function renderPipeline() {
  const board = document.getElementById("pipelineBoard");
  if (!board) return;
  board.innerHTML = state.pipelineStages
    .map((stage) => `<span class="pipeline-badge">${stage}</span>`)
    .join("");
}

function renderInvestors() {
  document.getElementById("investorTableBody").innerHTML = state.investors
    .map(
      (row) => `<tr>
        <td>${row.name}</td>
        <td>${formatMoney(row.budget, row.currency || "TRY")}</td>
        <td>${row.city}</td>
        <td>${row.sector}</td>
        <td>${row.type}${row.phone ? `<br><small>${row.phone}</small>` : ""}</td>
        <td>${row.pipeline}</td>
        <td>
          <button class="table-btn" data-action="edit-investor" data-id="${row.id}">Düzenle</button>
          <button class="table-btn danger" data-action="delete-investor" data-id="${row.id}">Sil</button>
        </td>
      </tr>`,
    )
    .join("");
}

function renderBrands() {
  document.getElementById("brandTableBody").innerHTML = state.brands
    .map(
      (row) => `<tr>
        <td><button class="table-btn" data-action="view-brand-profile" data-id="${row.id}">${row.name}</button></td>
        <td>${row.sector}</td>
        <td>${formatMoney(row.minBudget, row.currency || "TRY")} - ${formatMoney(row.maxBudget, row.currency || "TRY")}</td>
        <td>${row.minSqm} - ${row.maxSqm}</td>
        <td>${row.targetLocations}</td>
        <td><span class="${row.active ? "tag tag-success" : "tag tag-danger"}">${row.active ? "Aktif" : "Pasif"}</span></td>
        <td>
          <button class="table-btn" data-action="view-brand-profile" data-id="${row.id}">Detay</button>
          <button class="table-btn" data-action="edit-brand" data-id="${row.id}">Düzenle</button>
          <button class="table-btn danger" data-action="delete-brand" data-id="${row.id}">Sil</button>
        </td>
      </tr>`,
    )
    .join("");
}

function renderLocations() {
  document.getElementById("locationTableBody").innerHTML = state.locations
    .map(
      (row) => `<tr>
        <td>${row.name}</td>
        <td>${row.type}</td>
        <td>${row.sqm}</td>
        <td>${formatMoney(row.rent, row.currency || "TRY")}</td>
        <td>${row.potential}</td>
        <td>${(row.recommendedBrands || []).join(", ")}</td>
        <td>
          ${(row.attachmentUrl || row.attachmentData) ? `<button class="table-btn" data-action="download-location-file" data-id="${row.id}">${row.attachmentName || "Dosya Aç"}</button>` : "-"}
        </td>
        <td>
          <button class="table-btn" data-action="edit-location" data-id="${row.id}">Düzenle</button>
          <button class="table-btn danger" data-action="delete-location" data-id="${row.id}">Sil</button>
        </td>
      </tr>`,
    )
    .join("");
}

function renderProjects() {
  document.getElementById("projectTableBody").innerHTML = state.projects
    .map(
      (row) => `<tr>
        <td>${row.name}</td>
        <td>${row.type}</td>
        <td>${row.owner}${row.assignees?.length ? `<br><small>${row.assignees.join(", ")}</small>` : ""}</td>
        <td>${row.stage}${row.progress !== undefined ? `<br><small>%${row.progress}</small>` : ""}</td>
        <td>${row.dueDate}</td>
        <td>
          <button class="table-btn" data-action="edit-project" data-id="${row.id}">Düzenle</button>
          <button class="table-btn danger" data-action="delete-project" data-id="${row.id}">Sil</button>
        </td>
      </tr>`,
    )
    .join("");
}

function renderContracts() {
  document.getElementById("contractList").innerHTML = state.contracts
    .map(
      (item) => `<li>
        <span>
          <strong>${item.type || "Sözleşme"}</strong> - ${item.note}
          ${item.status ? `<br><small>Durum: ${item.status}</small>` : ""}
          ${item.amount ? `<br><small>Tutar: ${formatMoney(item.amount, item.currency || "TRY")}</small>` : ""}
          ${item.fileName ? `<br><small>Dosya: ${item.fileName}</small>` : ""}
        </span>
        <span class="list-actions">
          ${(item.fileUrl || item.fileData) ? `<button class="table-btn" data-action="download-contract" data-id="${item.id}">PDF Görüntüle</button>` : ""}
          <button class="table-btn" data-action="edit-contract" data-id="${item.id}">Düzenle</button>
          <button class="table-btn danger" data-action="delete-contract" data-id="${item.id}">Sil</button>
        </span>
      </li>`,
    )
    .join("");
}

function renderTasks() {
  document.getElementById("taskList").innerHTML = state.tasks
    .map(
      (item) => `<li>${item.note} <span class="tag tag-warning">${item.status}</span>
        <span class="list-actions">
          <button class="table-btn" data-action="edit-task" data-id="${item.id}">Düzenle</button>
          <button class="table-btn danger" data-action="delete-task" data-id="${item.id}">Sil</button>
        </span>
      </li>`,
    )
    .join("");
}

function renderKpis() {
  const r = state.reportSummary;
  const kpis = r
    ? [
        { label: "Filtreli Lead", value: String(r.leads) },
        { label: "Filtreli Kazanım", value: String(r.wins) },
        { label: "Dönüşüm Oranı", value: `%${r.conversionRate}` },
        { label: "Aktif Proje", value: String(r.activeProjects) },
        { label: "Top Sektör", value: r.topSector },
        { label: "Top Ekip", value: r.topTeam },
      ]
    : [
        { label: "Aylık Yeni Lead", value: String(state.investors.length) },
        { label: "Kazanılan Yatırımcı", value: String(state.investors.filter((i) => i.pipeline.includes("Kapandı")).length) },
        { label: "Dönüşüm Oranı", value: `${state.investors.length ? Math.round((state.investors.filter((i) => i.pipeline.includes("Kapandı")).length / state.investors.length) * 100) : 0}%` },
        { label: "En Çok Talep Gören Sektör", value: getTopSector() },
        { label: "En Karlı Lokasyon", value: getTopLocation() },
        { label: "Açık Görev", value: String(state.tasks.filter((t) => t.status !== "Tamamlandı").length) },
      ];
  document.getElementById("reportGrid").innerHTML = kpis
    .map((kpi) => `<article class="kpi"><span>${kpi.label}</span><strong>${kpi.value}</strong></article>`)
    .join("");
}

function renderTimeline() {
  document.getElementById("timelineTableBody").innerHTML = state.timeline
    .map(
      (item) => `<tr>
        <td>${new Date(item.created_at).toLocaleString("tr-TR")}</td>
        <td>${item.user_name || "-"}</td>
        <td>${item.module_name}</td>
        <td>${item.action_type}</td>
        <td>${item.summary}</td>
      </tr>`,
    )
    .join("");
}

function renderTemplates() {
  document.getElementById("templateTableBody").innerHTML = state.templates
    .map(
      (t) => `<tr>
        <td>${t.channel}</td>
        <td>${t.event_name}</td>
        <td>${t.title}</td>
        <td>${t.active ? "Aktif" : "Pasif"}</td>
        <td>
          <button class="table-btn" data-action="edit-template" data-id="${t.id}">Düzenle</button>
          <button class="table-btn" data-action="test-template" data-id="${t.id}">Test</button>
          <button class="table-btn danger" data-action="delete-template" data-id="${t.id}">Sil</button>
        </td>
      </tr>`,
    )
    .join("");
}

function renderPnL() {
  const body = document.getElementById("pnlTableBody");
  if (!body) return;
  body.innerHTML = state.pnlReports
    .map(
      (row) => `<tr>
        <td>${row.month_name}</td>
        <td>${row.year_value}</td>
        <td>${formatMoney(row.revenue, "TRY")}</td>
        <td>${formatMoney(row.expense, "TRY")}</td>
        <td>${formatMoney(row.profit, "TRY")}</td>
        <td>${row.note || "-"}</td>
        <td>
          <button class="table-btn" data-action="view-pnl-details" data-id="${row.id}">Detay</button>
          <button class="table-btn danger" data-action="delete-pnl" data-id="${row.id}">Sil</button>
        </td>
      </tr>`,
    )
    .join("");
}

function renderBrandAgreementHistory() {
  const body = document.getElementById("brandAgreementTableBody");
  if (!body) return;
  body.innerHTML = (state.brandAgreements || [])
    .map(
      (row) => `<tr>
        <td>v${row.version_no}</td>
        <td>${row.title}</td>
        <td>${row.revision_note || "-"}</td>
        <td>${row.effective_date || "-"}</td>
        <td>${row.file_url ? `<a href="${row.file_url}" target="_blank" rel="noreferrer">Aç</a>` : "-"}</td>
      </tr>`,
    )
    .join("");
}

function renderPnLDetails() {
  const body = document.getElementById("pnlDetailTableBody");
  if (!body) return;
  body.innerHTML = (state.pnlDetailLines || [])
    .map(
      (row) => `<tr>
        <td>${row.category}</td>
        <td>${row.item_name}</td>
        <td>${formatMoney(row.amount, "TRY")}</td>
        <td>${row.ratio ? `%${Number(row.ratio).toFixed(2)}` : "-"}</td>
      </tr>`,
    )
    .join("");
}

function fillBrandProfile(brandId) {
  const row = state.brands.find((x) => x.id === brandId);
  if (!row) return;
  document.getElementById("brandProfileId").value = String(brandId);
  document.getElementById("bpTitle").textContent = `${row.name} - Marka Profili`;
  document.getElementById("bpAgreementStatus").value = row.agreementStatus || "";
  document.getElementById("bpFranchiseFee").value = row.franchiseFee || 0;
  document.getElementById("bpRoyaltyRate").value = row.royaltyRate || 0;
  document.getElementById("bpContractTerm").value = row.contractTermMonths || 0;
  document.getElementById("bpInitialInvestment").value = row.initialInvestment || 0;
  document.getElementById("bpBranchCount").value = row.branchCount || 0;
  document.getElementById("bpContactPerson").value = row.contactPerson || "";
  document.getElementById("bpContactPhone").value = row.contactPhone || "";
  document.getElementById("bpBusinessPlan").value = row.businessPlan || "";
  document.getElementById("bpOperationPlan").value = row.operationPlan || "";
  document.getElementById("bpOnboardingSteps").value = (row.onboardingSteps || []).join("\n");
  document.getElementById("bpKpiTargets").value = row.kpiTargets || "";
  document.getElementById("bpBrandNotes").value = row.brandNotes || "";
  if (state.isDemo) {
    state.brandAgreements = [];
    renderBrandAgreementHistory();
    return;
  }
  api(`/api/brands/${brandId}/agreements`)
    .then((items) => {
      state.brandAgreements = items;
      renderBrandAgreementHistory();
    })
    .catch(() => {
      state.brandAgreements = [];
      renderBrandAgreementHistory();
    });
}

function renderDashboardOverview() {
  const followUpList = document.getElementById("dashboardFollowUpList");
  const taskList = document.getElementById("dashboardTaskList");
  const brandList = document.getElementById("dashboardBrandList");
  if (!followUpList || !taskList || !brandList) return;

  const upcoming = state.investors
    .filter((i) => i.followUpDate)
    .sort((a, b) => new Date(a.followUpDate) - new Date(b.followUpDate))
    .slice(0, 5);
  followUpList.innerHTML = upcoming.length
    ? upcoming
        .map((i) => `<li>${i.name} - ${new Date(i.followUpDate).toLocaleDateString("tr-TR")} (${i.pipeline})</li>`)
        .join("")
    : "<li>Yaklaşan takip bulunmuyor.</li>";

  const openTasks = state.tasks.filter((t) => t.status !== "Tamamlandı").slice(0, 6);
  taskList.innerHTML = openTasks.length
    ? openTasks.map((t) => `<li>${t.note} - <strong>${t.status}</strong></li>`).join("")
    : "<li>Açık görev bulunmuyor.</li>";

  const topBrands = [...state.brands]
    .sort((a, b) => Number(b.monthlyGrowth || 0) - Number(a.monthlyGrowth || 0))
    .slice(0, 5);
  brandList.innerHTML = topBrands.length
    ? topBrands.map((b) => `<li>${b.name} - Aylık büyüme %${b.monthlyGrowth || 0}</li>`).join("")
    : "<li>Marka verisi bulunmuyor.</li>";
}

function getTopSector() {
  if (!state.investors.length) return "-";
  const counts = {};
  for (const i of state.investors) counts[i.sector] = (counts[i.sector] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function getTopLocation() {
  if (!state.locations.length) return "-";
  const sorted = [...state.locations].sort((a, b) => Number(b.rent) - Number(a.rent));
  return sorted[0].name;
}

async function refreshDashboard() {
  if (state.isDemo) {
    document.getElementById("activeInvestorsStat").textContent = String(state.investors.length);
    document.getElementById("activeProjectsStat").textContent = String(state.projects.length);
    document.getElementById("openTasksStat").textContent = String(state.tasks.filter((t) => t.status !== "Tamamlandı").length);
    document.getElementById("strongMatchStat").textContent = String(state.brands.filter((b) => b.monthlyGrowth >= 10).length);
    return;
  }
  const dashboard = await api("/api/dashboard");
  document.getElementById("activeInvestorsStat").textContent = String(dashboard.activeInvestors);
  document.getElementById("activeProjectsStat").textContent = String(dashboard.activeProjects);
  document.getElementById("openTasksStat").textContent = String(state.tasks.filter((t) => t.status !== "Tamamlandı").length);
  document.getElementById("strongMatchStat").textContent = String(dashboard.strongMatches);
}

async function loadAllData() {
  if (state.isDemo) {
    state.pipelineStages = [...demoData.pipelineStages];
    state.investors = [...demoData.investors];
    state.brands = [...demoData.brands];
    state.locations = [...demoData.locations];
    state.projects = [...demoData.projects];
    state.contracts = [...demoData.contracts];
    state.tasks = [...demoData.tasks];
    state.pnlReports = [...demoData.pnlReports];
    state.brandAgreements = [];
    state.pnlDetailLines = [];
    state.timeline = [];
    state.templates = [];
    state.reportSummary = null;
    renderPipeline();
    renderInvestors();
    renderBrands();
    if (state.brands.length) fillBrandProfile(state.brands[0].id);
    renderLocations();
    renderProjects();
    renderContracts();
    renderTasks();
    renderTimeline();
    renderTemplates();
    renderPnL();
    renderBrandAgreementHistory();
    renderPnLDetails();
    renderKpis();
    renderDashboardOverview();
    await refreshDashboard();
    return;
  }

  const [config, investors, brands, locations, projects, contracts, tasks, timeline, templates, pnlReports] = await Promise.all([
    api("/api/config"),
    api("/api/investors"),
    api("/api/brands"),
    api("/api/locations"),
    api("/api/projects"),
    api("/api/contracts"),
    api("/api/tasks"),
    api("/api/activity?limit=100"),
    api("/api/templates"),
    api("/api/pnl"),
  ]);
  state.pipelineStages = config.pipelineStages;
  state.investors = investors;
  state.brands = brands;
  state.locations = locations;
  state.projects = projects;
  state.contracts = contracts;
  state.tasks = tasks;
  state.timeline = timeline;
  state.templates = templates;
  state.pnlReports = pnlReports;
  state.brandAgreements = [];
  state.pnlDetailLines = [];
  state.reportSummary = null;
  renderPipeline();
  renderInvestors();
  renderBrands();
  if (state.brands.length) fillBrandProfile(state.brands[0].id);
  renderLocations();
  renderProjects();
  renderContracts();
  renderTasks();
  renderTimeline();
  renderTemplates();
  renderPnL();
  renderBrandAgreementHistory();
  renderPnLDetails();
  renderKpis();
  renderDashboardOverview();
  await refreshDashboard();
}

function clearEditForm(module) {
  if (module === "investor") {
    state.editing.investorId = null;
    document.getElementById("investorId").value = "";
    document.getElementById("investorSubmitBtn").textContent = "Yatırımcı Ekle";
    document.getElementById("investorDeleteBtn")?.classList.add("hidden");
  }
  if (module === "brand") {
    state.editing.brandId = null;
    document.getElementById("brandId").value = "";
    document.getElementById("brandSubmitBtn").textContent = "Marka Ekle";
    document.getElementById("brandDeleteBtn")?.classList.add("hidden");
  }
  if (module === "location") {
    state.editing.locationId = null;
    document.getElementById("locationId").value = "";
    document.getElementById("locationSubmitBtn").textContent = "Lokasyon Ekle";
    document.getElementById("locationAttachment").value = "";
    document.getElementById("locationDeleteBtn")?.classList.add("hidden");
  }
  if (module === "project") {
    state.editing.projectId = null;
    document.getElementById("projectId").value = "";
    document.getElementById("projectSubmitBtn").textContent = "Proje Ekle";
    document.getElementById("projectDeleteBtn")?.classList.add("hidden");
  }
  if (module === "contract") {
    state.editing.contractId = null;
    document.getElementById("contractId").value = "";
    document.getElementById("contractSubmitBtn").textContent = "Kayıt Ekle";
    document.getElementById("contractFile").value = "";
    document.getElementById("contractDeleteBtn")?.classList.add("hidden");
  }
  if (module === "task") {
    state.editing.taskId = null;
    document.getElementById("taskId").value = "";
    document.getElementById("taskSubmitBtn").textContent = "Görev Ekle";
    document.getElementById("taskDeleteBtn")?.classList.add("hidden");
  }
  if (module === "template") {
    state.editing.templateId = null;
    document.getElementById("templateId").value = "";
    document.getElementById("templateSubmitBtn").textContent = "Şablon Ekle";
    document.getElementById("templateDeleteBtn")?.classList.add("hidden");
  }
}

function setupInlineDeleteButtons() {
  const configs = [
    ["investor", "investorForm", "investorDeleteBtn", () => state.editing.investorId],
    ["brand", "brandForm", "brandDeleteBtn", () => state.editing.brandId],
    ["location", "locationForm", "locationDeleteBtn", () => state.editing.locationId],
    ["project", "projectForm", "projectDeleteBtn", () => state.editing.projectId],
    ["contract", "contractForm", "contractDeleteBtn", () => state.editing.contractId],
    ["task", "taskForm", "taskDeleteBtn", () => state.editing.taskId],
    ["template", "templateForm", "templateDeleteBtn", () => state.editing.templateId],
  ];
  for (const [module, formId, buttonId, idGetter] of configs) {
    const form = document.getElementById(formId);
    if (!form || document.getElementById(buttonId)) continue;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = buttonId;
    btn.className = "danger-btn hidden";
    btn.textContent = "Düzenlenen Kaydı Sil";
    btn.addEventListener("click", async () => {
      const id = Number(idGetter() || 0);
      if (!id) return;
      await deleteByAction(`delete-${module}`, id);
      form.reset();
      clearEditForm(module);
    });
    form.appendChild(btn);
  }
}

function bindAuth() {
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");
  const showLoginBtn = document.getElementById("showLoginBtn");
  const showRegisterBtn = document.getElementById("showRegisterBtn");
  const demoModeBtn = document.getElementById("demoModeBtn");

  showLoginBtn.addEventListener("click", () => {
    loginForm.classList.remove("hidden");
    registerForm.classList.add("hidden");
    showLoginBtn.classList.add("active");
    showRegisterBtn.classList.remove("active");
  });

  showRegisterBtn.addEventListener("click", () => {
    registerForm.classList.remove("hidden");
    loginForm.classList.add("hidden");
    showRegisterBtn.classList.add("active");
    showLoginBtn.classList.remove("active");
  });

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const payload = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: document.getElementById("loginEmail").value,
          password: document.getElementById("loginPassword").value,
        }),
      });
      localStorage.setItem(TOKEN_KEY, payload.token);
      state.user = payload.user;
      setAuthView(true);
      await loadAfterLogin();
      setMessage("Giriş başarılı.");
    } catch (error) {
      setMessage(error.message, true);
    }
  });

  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const payload = await api("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          name: document.getElementById("registerName").value,
          email: document.getElementById("registerEmail").value,
          password: document.getElementById("registerPassword").value,
        }),
      });
      localStorage.setItem(TOKEN_KEY, payload.token);
      state.user = payload.user;
      setAuthView(true);
      await loadAfterLogin();
      setMessage("Kullanıcı oluşturuldu ve giriş yapıldı.");
    } catch (error) {
      setMessage(error.message, true);
    }
  });

  demoModeBtn.addEventListener("click", async () => {
    state.isDemo = true;
    state.user = { name: "Demo Kullanıcı" };
    setAuthView(true);
    await loadAfterLogin();
    setMessage("Demo mod açıldı. Backend olmadan çalışıyorsun.");
  });
}

function bindCoreEvents() {
  setupInlineDeleteButtons();
  document.getElementById("logoutBtn").addEventListener("click", () => {
    localStorage.removeItem(TOKEN_KEY);
    setAuthView(false);
    setMessage("Çıkış yapıldı.");
  });

  document.getElementById("newLeadBtn").addEventListener("click", () => {
    document.getElementById("leadName").focus();
  });

  document.getElementById("exportAllBtn").addEventListener("click", () => downloadExport("all"));
  document.querySelectorAll(".export-btn").forEach((button) => {
    button.addEventListener("click", () => downloadExport(button.dataset.module));
  });
  document.querySelectorAll(".pdf-export-btn").forEach((button) => {
    button.addEventListener("click", () => downloadPdfExport(button.dataset.module));
  });

  document.getElementById("reportFilterForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const from = document.getElementById("reportFrom").value;
    const to = document.getElementById("reportTo").value;
    state.reportSummary = await api(`/api/reports/summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    renderKpis();
  });

  document.querySelectorAll(".menu-link").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const page = link.dataset.page;
      document.querySelectorAll(".menu-link").forEach((x) => x.classList.remove("active"));
      link.classList.add("active");
      document.querySelectorAll(".page-section").forEach((section) => section.classList.remove("active"));
      const target = document.getElementById(`page-${page}`);
      if (target) {
        target.classList.add("active");
      }
    });
  });

  document.querySelectorAll(".quick-link-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const page = button.dataset.goPage;
      if (!page) return;
      document.querySelectorAll(".menu-link").forEach((x) => {
        x.classList.toggle("active", x.dataset.page === page);
      });
      document.querySelectorAll(".page-section").forEach((section) => section.classList.remove("active"));
      const target = document.getElementById(`page-${page}`);
      if (target) target.classList.add("active");
    });
  });
}

async function downloadExport(moduleName) {
  if (state.isDemo) {
    alert("Demo modda Excel dışa aktarma kapalı. Backend açıldığında aktif olur.");
    return;
  }
  const response = await fetch(`/api/export/${moduleName}`, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  if (!response.ok) {
    alert("Excel dışa aktarma başarısız.");
    return;
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `mi-crm-${moduleName}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}

async function downloadPdfExport(moduleName) {
  if (state.isDemo) {
    alert("Demo modda PDF dışa aktarma kapalı. Backend açıldığında aktif olur.");
    return;
  }
  const response = await fetch(`/api/export-pdf/${moduleName}`, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  if (!response.ok) {
    alert("PDF dışa aktarma başarısız.");
    return;
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `mi-crm-${moduleName}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function downloadDataUrl(dataUrl, fileName) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = fileName || "dosya";
  link.click();
}

function bindForms() {
  document.getElementById("matchingForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      investorName: document.getElementById("investorName").value,
      budget: Number(document.getElementById("budget").value),
      city: document.getElementById("city").value,
      sector: document.getElementById("sector").value,
      sqm: Number(document.getElementById("sqm").value),
    };
    const results = await api("/api/matching", { method: "POST", body: JSON.stringify(payload) });
    document.getElementById("matchResults").innerHTML = `<table><thead><tr><th>Yatırımcı</th><th>Marka</th><th>Skor</th><th>Öneri</th></tr></thead><tbody>${results
      .map((r) => {
        const tag = getRecommendationTag(r.score);
        return `<tr><td>${payload.investorName}</td><td>${r.brand.name}</td><td>${r.score}</td><td><span class="${tag.className}">${tag.text}</span></td></tr>`;
      })
      .join("")}</tbody></table>`;
    event.target.reset();
    await loadAllData();
  });

  document.getElementById("investorForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      name: document.getElementById("leadName").value,
      budget: Number(document.getElementById("leadBudget").value),
      currency: document.getElementById("leadCurrency").value,
      city: document.getElementById("leadCity").value,
      sector: document.getElementById("leadSector").value,
      type: document.getElementById("leadType").value,
      pipeline: document.getElementById("leadPipeline").value,
      phone: document.getElementById("leadPhone").value,
      email: document.getElementById("leadEmail").value,
      district: document.getElementById("leadDistrict").value,
      goal: document.getElementById("leadGoal").value,
      contactHistory: document.getElementById("leadContactHistory").value,
      meetingNotes: document.getElementById("leadMeetingNotes").value,
      followUpDate: document.getElementById("leadFollowUpDate").value,
      documents: Array.from(document.getElementById("leadDocuments").files || []).map((f) => f.name),
    };
    const id = state.editing.investorId;
    if (id) await api(`/api/investors/${id}`, { method: "PUT", body: JSON.stringify(payload) });
    else await api("/api/investors", { method: "POST", body: JSON.stringify(payload) });
    event.target.reset();
    clearEditForm("investor");
    await loadAllData();
  });

  document.getElementById("brandForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const existing = state.brands.find((x) => x.id === state.editing.brandId);
    const payload = {
      name: document.getElementById("brandName").value,
      sector: document.getElementById("brandSector").value,
      currency: document.getElementById("brandCurrency").value,
      minBudget: Number(document.getElementById("minBudget").value),
      maxBudget: Number(document.getElementById("maxBudget").value),
      minSqm: Number(document.getElementById("minSqm").value),
      maxSqm: Number(document.getElementById("maxSqm").value),
      targetLocations: document.getElementById("targetLocations").value,
      monthlyGrowth: Number(document.getElementById("monthlyGrowth").value),
      active: document.getElementById("brandStatus").value === "true",
      agreementStatus: existing?.agreementStatus || "",
      franchiseFee: existing?.franchiseFee || 0,
      royaltyRate: existing?.royaltyRate || 0,
      contractTermMonths: existing?.contractTermMonths || 0,
      initialInvestment: existing?.initialInvestment || 0,
      branchCount: existing?.branchCount || 0,
      contactPerson: existing?.contactPerson || "",
      contactPhone: existing?.contactPhone || "",
      businessPlan: existing?.businessPlan || "",
      operationPlan: existing?.operationPlan || "",
      onboardingSteps: existing?.onboardingSteps || [],
      kpiTargets: existing?.kpiTargets || "",
      brandNotes: existing?.brandNotes || "",
    };
    if (payload.minBudget > payload.maxBudget || payload.minSqm > payload.maxSqm) {
      alert("Min değerler max değerlerden büyük olamaz.");
      return;
    }
    const id = state.editing.brandId;
    if (id) await api(`/api/brands/${id}`, { method: "PUT", body: JSON.stringify(payload) });
    else await api("/api/brands", { method: "POST", body: JSON.stringify(payload) });
    event.target.reset();
    clearEditForm("brand");
    await loadAllData();
  });

  document.getElementById("locationForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      name: document.getElementById("locationName").value,
      type: document.getElementById("locationType").value,
      sqm: Number(document.getElementById("locationSqm").value),
      currency: document.getElementById("locationCurrency").value,
      rent: Number(document.getElementById("locationRent").value),
      potential: document.getElementById("locationPotential").value,
      address: document.getElementById("locationAddress").value,
      traffic: document.getElementById("locationTraffic").value,
      owner: document.getElementById("locationOwner").value,
      ownerPhone: document.getElementById("locationOwnerPhone").value,
      notes: document.getElementById("locationNotes").value,
      recommendedBrands: document
        .getElementById("recommendedBrands")
        .value.split(",")
        .map((x) => x.trim())
        .filter(Boolean),
    };
    const locationFileInput = document.getElementById("locationAttachment");
    const selectedFile = locationFileInput.files && locationFileInput.files[0] ? locationFileInput.files[0] : null;
    const existing = state.locations.find((x) => x.id === state.editing.locationId);
    payload.attachmentName = existing?.attachmentName || "";
    payload.attachmentData = existing?.attachmentData || "";
    payload.attachmentUrl = existing?.attachmentUrl || "";
    if (selectedFile) {
      const uploaded = await uploadFileForModule(selectedFile, "locations");
      payload.attachmentName = uploaded.original_name;
      payload.attachmentData = "";
      payload.attachmentUrl = uploaded.file_url;
    }
    const id = state.editing.locationId;
    if (id) await api(`/api/locations/${id}`, { method: "PUT", body: JSON.stringify(payload) });
    else await api("/api/locations", { method: "POST", body: JSON.stringify(payload) });
    event.target.reset();
    clearEditForm("location");
    await loadAllData();
  });

  document.getElementById("projectForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      name: document.getElementById("projectName").value,
      type: document.getElementById("projectType").value,
      owner: document.getElementById("projectOwner").value,
      assignees: document
        .getElementById("projectAssignees")
        .value.split(",")
        .map((x) => x.trim())
        .filter(Boolean),
      priority: document.getElementById("projectPriority").value,
      progress: Number(document.getElementById("projectProgress").value || 0),
      stage: document.getElementById("projectStage").value,
      dueDate: document.getElementById("projectDueDate").value,
      description: document.getElementById("projectDescription").value,
      checklist: document
        .getElementById("projectChecklist")
        .value.split("\n")
        .map((x) => x.trim())
        .filter(Boolean),
    };
    const id = state.editing.projectId;
    if (id) await api(`/api/projects/${id}`, { method: "PUT", body: JSON.stringify(payload) });
    else await api("/api/projects", { method: "POST", body: JSON.stringify(payload) });
    event.target.reset();
    clearEditForm("project");
    await loadAllData();
  });

  document.getElementById("contractForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const fileInput = document.getElementById("contractFile");
    const selectedFile = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
    const existing = state.contracts.find((x) => x.id === state.editing.contractId);
    let fileData = existing?.fileData || "";
    let fileUrl = existing?.fileUrl || "";
    let fileName = existing?.fileName || "";
    let fileMimeType = existing?.fileMimeType || "";
    if (selectedFile) {
      const uploaded = await uploadFileForModule(selectedFile, "contracts");
      fileData = "";
      fileName = uploaded.original_name;
      fileUrl = uploaded.file_url;
      fileMimeType = uploaded.mime_type || "";
    }

    const payload = {
      note: document.getElementById("contractText").value,
      type: document.getElementById("contractType").value,
      status: document.getElementById("contractStatus").value,
      counterparty: document.getElementById("contractCounterparty").value,
      startDate: document.getElementById("contractStartDate").value || null,
      endDate: document.getElementById("contractEndDate").value || null,
      amount: Number(document.getElementById("contractAmount").value || 0),
      currency: document.getElementById("contractCurrency").value,
      fileName,
      fileData,
      fileUrl,
      fileMimeType,
    };
    const id = state.editing.contractId;
    if (id) await api(`/api/contracts/${id}`, { method: "PUT", body: JSON.stringify(payload) });
    else await api("/api/contracts", { method: "POST", body: JSON.stringify(payload) });
    event.target.reset();
    clearEditForm("contract");
    await loadAllData();
  });

  document.getElementById("taskForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      note: document.getElementById("taskText").value,
      status: document.getElementById("taskStatus").value,
    };
    const id = state.editing.taskId;
    if (id) await api(`/api/tasks/${id}`, { method: "PUT", body: JSON.stringify(payload) });
    else await api("/api/tasks", { method: "POST", body: JSON.stringify(payload) });
    event.target.reset();
    clearEditForm("task");
    await loadAllData();
  });

  document.getElementById("templateForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      channel: document.getElementById("templateChannel").value,
      eventName: document.getElementById("templateEvent").value,
      title: document.getElementById("templateTitle").value,
      body: document.getElementById("templateBody").value,
      active: document.getElementById("templateActive").value === "true",
    };
    const id = state.editing.templateId;
    if (id) await api(`/api/templates/${id}`, { method: "PUT", body: JSON.stringify(payload) });
    else await api("/api/templates", { method: "POST", body: JSON.stringify(payload) });
    event.target.reset();
    clearEditForm("template");
    await loadAllData();
  });

  document.getElementById("brandProfileForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const brandId = Number(document.getElementById("brandProfileId").value);
    const existing = state.brands.find((x) => x.id === brandId);
    if (!brandId || !existing) return;
    const payload = {
      ...existing,
      agreementStatus: document.getElementById("bpAgreementStatus").value,
      franchiseFee: Number(document.getElementById("bpFranchiseFee").value || 0),
      royaltyRate: Number(document.getElementById("bpRoyaltyRate").value || 0),
      contractTermMonths: Number(document.getElementById("bpContractTerm").value || 0),
      initialInvestment: Number(document.getElementById("bpInitialInvestment").value || 0),
      branchCount: Number(document.getElementById("bpBranchCount").value || 0),
      contactPerson: document.getElementById("bpContactPerson").value,
      contactPhone: document.getElementById("bpContactPhone").value,
      businessPlan: document.getElementById("bpBusinessPlan").value,
      operationPlan: document.getElementById("bpOperationPlan").value,
      onboardingSteps: document
        .getElementById("bpOnboardingSteps")
        .value.split("\n")
        .map((x) => x.trim())
        .filter(Boolean),
      kpiTargets: document.getElementById("bpKpiTargets").value,
      brandNotes: document.getElementById("bpBrandNotes").value,
    };
    await api(`/api/brands/${brandId}`, { method: "PUT", body: JSON.stringify(payload) });
    await loadAllData();
    fillBrandProfile(brandId);
    alert("Marka profili güncellendi.");
  });

  document.getElementById("brandAgreementForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const brandId = Number(document.getElementById("brandProfileId").value);
    if (!brandId) {
      alert("Önce bir marka seçin.");
      return;
    }
    const fileInput = document.getElementById("bpAgreementFile");
    const selectedFile = fileInput?.files?.[0];
    let fileMeta = { fileName: null, fileUrl: null, mimeType: null };
    if (selectedFile) {
      const uploaded = await uploadFileForModule(selectedFile, "brand-agreements");
      fileMeta = { fileName: uploaded.original_name, fileUrl: uploaded.file_url, mimeType: uploaded.mime_type || null };
    }
    await api(`/api/brands/${brandId}/agreements`, {
      method: "POST",
      body: JSON.stringify({
        title: document.getElementById("bpAgreementTitle").value,
        revisionNote: document.getElementById("bpAgreementRevisionNote").value,
        effectiveDate: document.getElementById("bpAgreementEffectiveDate").value || null,
        ...fileMeta,
      }),
    });
    event.target.reset();
    fillBrandProfile(brandId);
    alert("Anlaşma dokümanı yeni versiyon olarak eklendi.");
  });

  document.getElementById("pnlForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      monthName: document.getElementById("pnlMonth").value,
      yearValue: Number(document.getElementById("pnlYear").value),
      revenue: Number(document.getElementById("pnlRevenue").value || 0),
      expense: Number(document.getElementById("pnlExpense").value || 0),
      profit: Number(document.getElementById("pnlProfit").value || 0),
      note: document.getElementById("pnlNote").value,
    };
    await api("/api/pnl", { method: "POST", body: JSON.stringify(payload) });
    event.target.reset();
    await loadAllData();
  });

  document.getElementById("pnlImportBtn")?.addEventListener("click", async () => {
    const fileInput = document.getElementById("pnlImportFile");
    const selectedFile = fileInput?.files?.[0];
    const formData = new FormData();
    if (selectedFile) formData.append("excelFile", selectedFile);
    await apiForm("/api/pnl/import", formData);
    if (fileInput) fileInput.value = "";
    await loadAllData();
    alert("Kar/Zarar verileri içe aktarıldı.");
  });
}

function fillFormForEdit(action, id) {
  if (action === "edit-investor") {
    const row = state.investors.find((x) => x.id === id);
    if (!row) return;
    state.editing.investorId = id;
    document.getElementById("leadName").value = row.name;
    document.getElementById("leadBudget").value = row.budget;
    document.getElementById("leadCurrency").value = row.currency || "TRY";
    document.getElementById("leadCity").value = row.city;
    document.getElementById("leadSector").value = row.sector;
    document.getElementById("leadType").value = row.type;
    document.getElementById("leadPipeline").value = row.pipeline;
    document.getElementById("leadPhone").value = row.phone || "";
    document.getElementById("leadEmail").value = row.email || "";
    document.getElementById("leadDistrict").value = row.district || "";
    document.getElementById("leadGoal").value = row.goal || "";
    document.getElementById("leadContactHistory").value = row.contactHistory || "";
    document.getElementById("leadMeetingNotes").value = row.meetingNotes || "";
    document.getElementById("leadFollowUpDate").value = row.followUpDate || "";
    document.getElementById("investorSubmitBtn").textContent = "Yatırımcı Güncelle";
    document.getElementById("investorDeleteBtn")?.classList.remove("hidden");
  }
  if (action === "edit-brand") {
    const row = state.brands.find((x) => x.id === id);
    if (!row) return;
    state.editing.brandId = id;
    document.getElementById("brandName").value = row.name;
    document.getElementById("brandSector").value = row.sector;
    document.getElementById("minBudget").value = row.minBudget;
    document.getElementById("brandCurrency").value = row.currency || "TRY";
    document.getElementById("maxBudget").value = row.maxBudget;
    document.getElementById("minSqm").value = row.minSqm;
    document.getElementById("maxSqm").value = row.maxSqm;
    document.getElementById("targetLocations").value = row.targetLocations;
    document.getElementById("monthlyGrowth").value = row.monthlyGrowth;
    document.getElementById("brandStatus").value = String(row.active);
    document.getElementById("brandSubmitBtn").textContent = "Marka Güncelle";
    document.getElementById("brandDeleteBtn")?.classList.remove("hidden");
    fillBrandProfile(id);
  }
  if (action === "edit-location") {
    const row = state.locations.find((x) => x.id === id);
    if (!row) return;
    state.editing.locationId = id;
    document.getElementById("locationName").value = row.name;
    document.getElementById("locationType").value = row.type;
    document.getElementById("locationSqm").value = row.sqm;
    document.getElementById("locationCurrency").value = row.currency || "TRY";
    document.getElementById("locationRent").value = row.rent;
    document.getElementById("locationPotential").value = row.potential;
    document.getElementById("locationAddress").value = row.address || "";
    document.getElementById("locationTraffic").value = row.traffic || "";
    document.getElementById("locationOwner").value = row.owner || "";
    document.getElementById("locationOwnerPhone").value = row.ownerPhone || "";
    document.getElementById("locationNotes").value = row.notes || "";
    document.getElementById("locationAttachment").value = "";
    document.getElementById("recommendedBrands").value = (row.recommendedBrands || []).join(", ");
    document.getElementById("locationSubmitBtn").textContent = "Lokasyon Güncelle";
    document.getElementById("locationDeleteBtn")?.classList.remove("hidden");
  }
  if (action === "edit-project") {
    const row = state.projects.find((x) => x.id === id);
    if (!row) return;
    state.editing.projectId = id;
    document.getElementById("projectName").value = row.name;
    document.getElementById("projectType").value = row.type;
    document.getElementById("projectOwner").value = row.owner;
    document.getElementById("projectAssignees").value = row.assignees ? row.assignees.join(", ") : "";
    document.getElementById("projectPriority").value = row.priority || "Orta";
    document.getElementById("projectProgress").value = row.progress ?? 0;
    document.getElementById("projectStage").value = row.stage;
    document.getElementById("projectDueDate").value = row.dueDate;
    document.getElementById("projectDescription").value = row.description || "";
    document.getElementById("projectChecklist").value = row.checklist ? row.checklist.join("\n") : "";
    document.getElementById("projectSubmitBtn").textContent = "Proje Güncelle";
    document.getElementById("projectDeleteBtn")?.classList.remove("hidden");
  }
  if (action === "edit-contract") {
    const row = state.contracts.find((x) => x.id === id);
    if (!row) return;
    state.editing.contractId = id;
    document.getElementById("contractText").value = row.note;
    document.getElementById("contractType").value = row.type || "";
    document.getElementById("contractStatus").value = row.status || "";
    document.getElementById("contractCounterparty").value = row.counterparty || "";
    document.getElementById("contractStartDate").value = row.startDate || "";
    document.getElementById("contractEndDate").value = row.endDate || "";
    document.getElementById("contractAmount").value = row.amount || "";
    document.getElementById("contractCurrency").value = row.currency || "TRY";
    document.getElementById("contractSubmitBtn").textContent = "Kayıt Güncelle";
    document.getElementById("contractDeleteBtn")?.classList.remove("hidden");
  }
  if (action === "edit-task") {
    const row = state.tasks.find((x) => x.id === id);
    if (!row) return;
    state.editing.taskId = id;
    document.getElementById("taskText").value = row.note;
    document.getElementById("taskStatus").value = row.status;
    document.getElementById("taskSubmitBtn").textContent = "Görev Güncelle";
    document.getElementById("taskDeleteBtn")?.classList.remove("hidden");
  }
  if (action === "edit-template") {
    const row = state.templates.find((x) => x.id === id);
    if (!row) return;
    state.editing.templateId = id;
    document.getElementById("templateChannel").value = row.channel;
    document.getElementById("templateEvent").value = row.event_name;
    document.getElementById("templateTitle").value = row.title;
    document.getElementById("templateBody").value = row.body;
    document.getElementById("templateActive").value = String(row.active);
    document.getElementById("templateSubmitBtn").textContent = "Şablon Güncelle";
    document.getElementById("templateDeleteBtn")?.classList.remove("hidden");
  }
}

async function deleteByAction(action, id) {
  const map = {
    "delete-investor": "/api/investors",
    "delete-brand": "/api/brands",
    "delete-location": "/api/locations",
    "delete-project": "/api/projects",
    "delete-contract": "/api/contracts",
    "delete-task": "/api/tasks",
    "delete-template": "/api/templates",
    "delete-pnl": "/api/pnl",
  };
  const endpoint = map[action];
  if (!endpoint) return;
  const ok = window.confirm("Bu kaydı silmek istediğinize emin misiniz?");
  if (!ok) return;
  await api(`${endpoint}/${id}`, { method: "DELETE" });
  await loadAllData();
}

function bindActionDelegation() {
  document.body.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const actionNode = target.closest("[data-action]");
    if (!(actionNode instanceof HTMLElement)) return;
    const action = actionNode.dataset.action;
    const id = Number(actionNode.dataset.id || 0);
    if (!action) return;
    if (action === "test-template") {
      await api(`/api/templates/${id}/test`, { method: "POST" });
      alert("Test mesajı gönderildi.");
      return;
    }
    if (action === "download-contract") {
      const item = state.contracts.find((x) => x.id === id);
      if (item?.fileUrl) {
        window.open(item.fileUrl, "_blank");
        return;
      }
      if (!item?.fileData) return;
      downloadDataUrl(item.fileData, item.fileName || `sozlesme-${id}.pdf`);
      return;
    }
    if (action === "download-location-file") {
      const item = state.locations.find((x) => x.id === id);
      if (item?.attachmentUrl) {
        window.open(item.attachmentUrl, "_blank");
        return;
      }
      if (!item?.attachmentData) return;
      downloadDataUrl(item.attachmentData, item.attachmentName || `lokasyon-${id}`);
      return;
    }
    if (action === "view-brand-profile") {
      const page = document.getElementById("page-brands");
      document.querySelectorAll(".menu-link").forEach((x) => x.classList.toggle("active", x.dataset.page === "brands"));
      document.querySelectorAll(".page-section").forEach((section) => section.classList.remove("active"));
      if (page) page.classList.add("active");
      fillBrandProfile(id);
      return;
    }
    if (action === "view-pnl-details") {
      if (!id || state.isDemo) {
        state.pnlDetailLines = [];
        renderPnLDetails();
        return;
      }
      state.pnlDetailLines = await api(`/api/pnl/${id}/details`);
      renderPnLDetails();
      return;
    }
    if (!id) return;
    if (action.startsWith("edit-")) fillFormForEdit(action, id);
    if (action.startsWith("delete-")) await deleteByAction(action, id);
  });
}

async function loadAfterLogin() {
  document.getElementById("welcomeText").textContent = state.isDemo
    ? "Demo mod aktif. Backend bağlandığında tüm modüller canlı veritabanı ile çalışır."
    : `${state.user?.name || "Kullanıcı"} ile giriş yapıldı. Danışmanlık + Gayrimenkul + Franchise operasyon merkezi`;
  await loadAllData();
}

async function checkSession() {
  if (state.isDemo) {
    setAuthView(true);
    await loadAfterLogin();
    return;
  }
  if (!token()) return setAuthView(false);
  try {
    const me = await api("/api/auth/me");
    state.user = me;
    setAuthView(true);
    await loadAfterLogin();
  } catch (error) {
    localStorage.removeItem(TOKEN_KEY);
    setAuthView(false);
  }
}

function init() {
  bindAuth();
  bindCoreEvents();
  bindForms();
  bindActionDelegation();
  checkSession();
}

init();
