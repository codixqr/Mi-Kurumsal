'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/apiClient';

const SECTORS = [
  'Gıda',
  'Kahve',
  'Perakende',
  'Eğitim',
  'Hizmet',
  'Gayrimenkul',
  'Teknoloji',
  'Spor',
  'Sağlık',
  'Otomotiv',
  'Giyim',
  'Kozmetik',
  'Diğer',
];

const AGREEMENT_STATUSES = ['Görüşülüyor', 'Anlaşmalı', 'Beklemede', 'Pasif', 'Reddedildi'];
const BRAND_TYPES = ['Franchise', 'Bayilik', 'Master franchise', 'Yatırım ortaklığı', 'Lokasyon arayan marka'];
const LOC_TYPES = ['AVM', 'Cadde', 'Plaza', 'Sanayi', 'Turistik bölge', 'Ana yol', 'Fark etmez'];

const defaultFilters = () => ({
  q: '',
  name: '',
  sector: '',
  subSector: '',
  targetCity: '',
  budgetMin: '',
  budgetMax: '',
  locationType: '',
  agreementStatus: '',
  active: '',
  givesFranchise: '',
  hasRoyalty: '',
  createdFrom: '',
  createdTo: '',
});

const defaultForm = () => ({
  id: null,
  name: '',
  contactPerson: '',
  contactPhone: '',
  whatsappPhone: '',
  email: '',
  website: '',
  sector: 'Gıda',
  subSector: '',
  brandType: 'Franchise',
  agreementStatus: 'Görüşülüyor',
  active: true,
  targetLocations: '',
  targetRegions: '',
  locationType: 'Fark etmez',
  minSqm: '',
  maxSqm: '',
  storefrontNeed: '',
  chimneyNeed: '',
  techInfrastructure: '',
  staffNeed: '',
  minBudget: '',
  maxBudget: '',
  currency: 'TRY',
  franchiseFee: '',
  royaltyRate: '',
  adContributionPct: '',
  avgMonthlyRevenue: '',
  profitMarginPct: '',
  paybackMonths: '',
  contractTermMonths: '',
  initialInvestment: '',
  branchCount: '',
  monthlyGrowth: '0',
  givesFranchise: true,
  hasRoyalty: true,
  presentationUrl: '',
  logoUrl: '',
  contractDraftUrl: '',
  documents: [],
  brandNotes: '',
  businessPlan: '',
  operationPlan: '',
  onboardingSteps: '',
  kpiTargets: '',
  scoreOperation: '',
  scoreFranchiseFit: '',
  scoreLocationFlex: '',
  scoreInvestorInterest: '',
  scoreProfitability: '',
  scoreGrowth: '',
});

const fmt = (n) => Number(n || 0).toLocaleString('tr-TR');
const budgetLabel = (b) => `${fmt(b.minBudget)} – ${fmt(b.maxBudget)} ${b.currency || 'TRY'}`;
const sqmLabel = (b) => `${fmt(b.minSqm)} – ${fmt(b.maxSqm)} m²`;

export default function BrandsPage() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(12);
  const [sort, setSort] = useState('created_at');
  const [order, setOrder] = useState('desc');
  const [kpis, setKpis] = useState(null);
  const [filters, setFilters] = useState(defaultFilters);
  const [filterDraft, setFilterDraft] = useState(defaultFilters);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkAgreement, setBulkAgreement] = useState('');
  const [bulkActive, setBulkActive] = useState('');
  const [form, setForm] = useState(defaultForm());
  const [formOpen, setFormOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTab, setDetailTab] = useState('genel');
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const buildQuery = useCallback(() => {
    const p = new URLSearchParams();
    p.set('page', String(page));
    p.set('pageSize', String(pageSize));
    p.set('sort', sort);
    p.set('order', order);
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== '' && v !== null && v !== undefined) p.set(k, String(v));
    });
    return p.toString();
  }, [filters, page, pageSize, sort, order]);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient.get(`/brands?${buildQuery()}`);
      setItems(data.items || []);
      setTotal(data.total || 0);
      setKpis(data.kpis || null);
    } catch (e) {
      console.error(e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const toggleSort = (col) => {
    if (sort === col) setOrder(order === 'asc' ? 'desc' : 'asc');
    else {
      setSort(col);
      setOrder('desc');
    }
    setPage(1);
  };

  const applyFilters = () => {
    setFilters({ ...filterDraft });
    setPage(1);
  };

  const resetFilters = () => {
    const d = defaultFilters();
    setFilterDraft(d);
    setFilters(d);
    setPage(1);
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === items.length) setSelectedIds([]);
    else setSelectedIds(items.map((i) => i.id));
  };

  const runBulk = async () => {
    if (!selectedIds.length) return;
    try {
      await apiClient.post('/brands/bulk', {
        ids: selectedIds,
        agreementStatus: bulkAgreement || undefined,
        active: bulkActive === '' ? undefined : bulkActive === 'true',
      });
      setSelectedIds([]);
      setBulkAgreement('');
      setBulkActive('');
      fetchList();
    } catch (e) {
      alert(e.message || 'Toplu işlem başarısız');
    }
  };

  const exportExcel = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch('/api/export/brands', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('fail');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'markalar.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Excel indirilemedi.');
    }
  };

  const uploadFiles = async (fileList, moduleName = 'brands') => {
    const token = localStorage.getItem('access_token');
    const urls = [];
    for (const file of fileList) {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('moduleName', moduleName);
      const res = await fetch('/api/uploads', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
      if (!res.ok) continue;
      const j = await res.json();
      if (j.file_url) urls.push(j.file_url);
    }
    return urls;
  };

  const payloadFromForm = () => ({
    name: form.name,
    sector: form.sector,
    subSector: form.subSector || null,
    minBudget: Number(form.minBudget || 0),
    maxBudget: Number(form.maxBudget || form.minBudget || 0),
    currency: form.currency,
    minSqm: Number(form.minSqm || 0),
    maxSqm: Number(form.maxSqm || form.minSqm || 0),
    targetLocations: form.targetLocations,
    targetRegions: form.targetRegions || null,
    locationType: form.locationType || null,
    storefrontNeed: form.storefrontNeed || null,
    chimneyNeed: form.chimneyNeed || null,
    techInfrastructure: form.techInfrastructure || null,
    staffNeed: form.staffNeed || null,
    active: form.active,
    monthlyGrowth: Number(form.monthlyGrowth || 0),
    agreementStatus: form.agreementStatus,
    brandType: form.brandType,
    franchiseFee: form.franchiseFee === '' ? null : Number(form.franchiseFee),
    royaltyRate: form.royaltyRate === '' ? null : Number(form.royaltyRate),
    adContributionPct: form.adContributionPct === '' ? null : Number(form.adContributionPct),
    avgMonthlyRevenue: form.avgMonthlyRevenue === '' ? null : Number(form.avgMonthlyRevenue),
    profitMarginPct: form.profitMarginPct === '' ? null : Number(form.profitMarginPct),
    paybackMonths: form.paybackMonths === '' ? null : Number(form.paybackMonths),
    contractTermMonths: form.contractTermMonths === '' ? null : Number(form.contractTermMonths),
    initialInvestment: form.initialInvestment === '' ? null : Number(form.initialInvestment),
    branchCount: form.branchCount === '' ? null : Number(form.branchCount),
    contactPerson: form.contactPerson || null,
    contactPhone: form.contactPhone || null,
    whatsappPhone: form.whatsappPhone || null,
    email: form.email || null,
    website: form.website || null,
    businessPlan: form.businessPlan || null,
    operationPlan: form.operationPlan || null,
    onboardingSteps: form.onboardingSteps,
    kpiTargets: form.kpiTargets || null,
    brandNotes: form.brandNotes || null,
    presentationUrl: form.presentationUrl || null,
    logoUrl: form.logoUrl || null,
    contractDraftUrl: form.contractDraftUrl || null,
    documents: form.documents,
    givesFranchise: form.givesFranchise,
    hasRoyalty: form.hasRoyalty,
    scoreOperation: form.scoreOperation === '' ? null : Number(form.scoreOperation),
    scoreFranchiseFit: form.scoreFranchiseFit === '' ? null : Number(form.scoreFranchiseFit),
    scoreLocationFlex: form.scoreLocationFlex === '' ? null : Number(form.scoreLocationFlex),
    scoreInvestorInterest: form.scoreInvestorInterest === '' ? null : Number(form.scoreInvestorInterest),
    scoreProfitability: form.scoreProfitability === '' ? null : Number(form.scoreProfitability),
    scoreGrowth: form.scoreGrowth === '' ? null : Number(form.scoreGrowth),
  });

  const saveBrand = async (e) => {
    e.preventDefault();
    try {
      const payload = payloadFromForm();
      if (form.id) await apiClient.put(`/brands/${form.id}`, payload);
      else await apiClient.post('/brands', payload);
      setForm(defaultForm());
      setFormOpen(false);
      fetchList();
    } catch (err) {
      alert(err.message || 'Kayıt hatası');
    }
  };

  const brandToForm = (b) => ({
    id: b.id,
    name: b.name,
    contactPerson: b.contactPerson || '',
    contactPhone: b.contactPhone || '',
    whatsappPhone: b.whatsappPhone || '',
    email: b.email || '',
    website: b.website || '',
    sector: b.sector,
    subSector: b.subSector || '',
    brandType: b.brandType || 'Franchise',
    agreementStatus: b.agreementStatus || 'Görüşülüyor',
    active: b.active !== false,
    targetLocations: b.targetLocations || '',
    targetRegions: b.targetRegions || '',
    locationType: b.locationType || 'Fark etmez',
    minSqm: String(b.minSqm ?? ''),
    maxSqm: String(b.maxSqm ?? ''),
    storefrontNeed: b.storefrontNeed || '',
    chimneyNeed: b.chimneyNeed || '',
    techInfrastructure: b.techInfrastructure || '',
    staffNeed: b.staffNeed || '',
    minBudget: String(b.minBudget ?? ''),
    maxBudget: String(b.maxBudget ?? ''),
    currency: b.currency || 'TRY',
    franchiseFee: b.franchiseFee != null ? String(b.franchiseFee) : '',
    royaltyRate: b.royaltyRate != null ? String(b.royaltyRate) : '',
    adContributionPct: b.adContributionPct != null ? String(b.adContributionPct) : '',
    avgMonthlyRevenue: b.avgMonthlyRevenue != null ? String(b.avgMonthlyRevenue) : '',
    profitMarginPct: b.profitMarginPct != null ? String(b.profitMarginPct) : '',
    paybackMonths: b.paybackMonths != null ? String(b.paybackMonths) : '',
    contractTermMonths: b.contractTermMonths != null ? String(b.contractTermMonths) : '',
    initialInvestment: b.initialInvestment != null ? String(b.initialInvestment) : '',
    branchCount: b.branchCount != null ? String(b.branchCount) : '',
    monthlyGrowth: String(b.monthlyGrowth ?? 0),
    givesFranchise: b.givesFranchise !== false,
    hasRoyalty: b.hasRoyalty !== false,
    presentationUrl: b.presentationUrl || '',
    logoUrl: b.logoUrl || '',
    contractDraftUrl: b.contractDraftUrl || '',
    documents: b.documents || [],
    brandNotes: b.brandNotes || '',
    businessPlan: b.businessPlan || '',
    operationPlan: b.operationPlan || '',
    onboardingSteps: Array.isArray(b.onboardingSteps) ? b.onboardingSteps.join('\n') : '',
    kpiTargets: b.kpiTargets || '',
    scoreOperation: b.scoreOperation != null ? String(b.scoreOperation) : '',
    scoreFranchiseFit: b.scoreFranchiseFit != null ? String(b.scoreFranchiseFit) : '',
    scoreLocationFlex: b.scoreLocationFlex != null ? String(b.scoreLocationFlex) : '',
    scoreInvestorInterest: b.scoreInvestorInterest != null ? String(b.scoreInvestorInterest) : '',
    scoreProfitability: b.scoreProfitability != null ? String(b.scoreProfitability) : '',
    scoreGrowth: b.scoreGrowth != null ? String(b.scoreGrowth) : '',
  });

  const editRow = (b) => {
    setForm(brandToForm(b));
    setFormOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deleteRow = async (b) => {
    if (!confirm(`${b.name} silinsin mi?`)) return;
    try {
      await apiClient.delete(`/brands/${b.id}`);
      fetchList();
    } catch {
      alert('Silinemedi');
    }
  };

  const openDetail = async (b) => {
    setDetailOpen(true);
    setDetailTab('genel');
    setDetail({ brand: b });
    setDetailLoading(true);
    try {
      const d = await apiClient.get(`/brands/${b.id}/detail`);
      setDetail(d);
    } catch {
      setDetail({ brand: b, error: true });
    } finally {
      setDetailLoading(false);
    }
  };

  const createProject = async (b) => {
    const name = window.prompt('Proje adı:', `${b.name} – Gelişim`);
    if (!name) return;
    const due = new Date(Date.now() + 21 * 86400000).toISOString().split('T')[0];
    try {
      await apiClient.post('/projects', {
        name,
        type: 'Marka gelişim',
        owner: 'Franchise ekibi',
        assignees: [],
        priority: 'Orta',
        progress: 0,
        stage: 'Başlangıç',
        dueDate: due,
        description: `Marka: ${b.name} (#${b.id})`,
        checklist: ['Analiz', 'Lokasyon', 'Sözleşme'],
        brandId: b.id,
      });
      fetchList();
      alert('Proje oluşturuldu.');
    } catch (e) {
      alert(e.message || 'Hata');
    }
  };

  const createContract = async (b) => {
    try {
      await apiClient.post('/contracts', {
        note: `${b.name} markası – sözleşme taslağı`,
        type: 'Franchise',
        status: 'Taslak',
        counterparty: b.name,
        brandId: b.id,
      });
      alert('Sözleşme kaydı oluşturuldu.');
      if (detail?.brand?.id === b.id) {
        const d = await apiClient.get(`/brands/${b.id}/detail`);
        setDetail(d);
      }
    } catch (e) {
      alert(e.message || 'Hata');
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="inv-page brands-page">
      <div className="module-head" style={{ flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0 }}>Marka Portföy Yönetimi</h2>
          <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '0.9rem' }}>
            Franchise portföyü, şartlar, lokasyon kriterleri ve eşleşmeler
          </p>
        </div>
        <div className="header-actions" style={{ flexWrap: 'wrap' }}>
          <button type="button" className="secondary-btn" onClick={exportExcel}>
            Excel dışa aktar
          </button>
          <button type="button" className="primary-btn" onClick={() => { setForm(defaultForm()); setFormOpen(true); }}>
            + Yeni marka
          </button>
        </div>
      </div>

      <section className="inv-kpi-grid">
        <article className="inv-kpi-card">
          <div className="inv-kpi-label">Toplam marka</div>
          <div className="inv-kpi-value">{kpis?.total ?? '—'}</div>
        </article>
        <article className="inv-kpi-card">
          <div className="inv-kpi-label">Aktif anlaşmalı</div>
          <div className="inv-kpi-value">{kpis?.activeAgreed ?? '—'}</div>
        </article>
        <article className="inv-kpi-card">
          <div className="inv-kpi-label">Görüşülen</div>
          <div className="inv-kpi-value">{kpis?.inDiscussion ?? '—'}</div>
        </article>
        <article className="inv-kpi-card">
          <div className="inv-kpi-label">Pasif / Red</div>
          <div className="inv-kpi-value">{kpis?.passive ?? '—'}</div>
        </article>
        <article className="inv-kpi-card">
          <div className="inv-kpi-label">Ort. yatırım (min–max ort.)</div>
          <div className="inv-kpi-value">{fmt(kpis?.avgInvestment)} ₺</div>
        </article>
        <article className="inv-kpi-card">
          <div className="inv-kpi-label">Bu ay eklenen</div>
          <div className="inv-kpi-value">{kpis?.newThisMonth ?? '—'}</div>
        </article>
      </section>

      <div className="inv-alert" style={{ marginBottom: 12 }}>
        <strong>Eşleştirme motoru:</strong> Yalnızca <em>Anlaşmalı</em> ve <em>aktif</em> markalar önerilir. Pasif markalar yeni eşleşmelerde listelenmez.
      </div>

      <div className="inv-filters">
        <div className="field" style={{ margin: 0 }}>
          <label>Marka adı</label>
          <input value={filterDraft.name} onChange={(e) => setFilterDraft({ ...filterDraft, name: e.target.value })} placeholder="Ara..." />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Genel arama</label>
          <input value={filterDraft.q} onChange={(e) => setFilterDraft({ ...filterDraft, q: e.target.value })} placeholder="Ad / sektör" />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Sektör</label>
          <select value={filterDraft.sector} onChange={(e) => setFilterDraft({ ...filterDraft, sector: e.target.value })}>
            <option value="">Tümü</option>
            {SECTORS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Alt sektör</label>
          <input value={filterDraft.subSector} onChange={(e) => setFilterDraft({ ...filterDraft, subSector: e.target.value })} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Hedef şehir</label>
          <input value={filterDraft.targetCity} onChange={(e) => setFilterDraft({ ...filterDraft, targetCity: e.target.value })} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Min bütçe</label>
          <input type="number" value={filterDraft.budgetMin} onChange={(e) => setFilterDraft({ ...filterDraft, budgetMin: e.target.value })} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Max bütçe</label>
          <input type="number" value={filterDraft.budgetMax} onChange={(e) => setFilterDraft({ ...filterDraft, budgetMax: e.target.value })} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Lokasyon tipi</label>
          <select value={filterDraft.locationType} onChange={(e) => setFilterDraft({ ...filterDraft, locationType: e.target.value })}>
            <option value="">Tümü</option>
            {LOC_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Anlaşma durumu</label>
          <select value={filterDraft.agreementStatus} onChange={(e) => setFilterDraft({ ...filterDraft, agreementStatus: e.target.value })}>
            <option value="">Tümü</option>
            {AGREEMENT_STATUSES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Aktif</label>
          <select value={filterDraft.active} onChange={(e) => setFilterDraft({ ...filterDraft, active: e.target.value })}>
            <option value="">Tümü</option>
            <option value="true">Aktif</option>
            <option value="false">Pasif</option>
          </select>
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Franchise veriyor</label>
          <select value={filterDraft.givesFranchise} onChange={(e) => setFilterDraft({ ...filterDraft, givesFranchise: e.target.value })}>
            <option value="">Tümü</option>
            <option value="true">Evet</option>
            <option value="false">Hayır</option>
          </select>
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Royalty var</label>
          <select value={filterDraft.hasRoyalty} onChange={(e) => setFilterDraft({ ...filterDraft, hasRoyalty: e.target.value })}>
            <option value="">Tümü</option>
            <option value="true">Evet</option>
            <option value="false">Hayır</option>
          </select>
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Kayıt başlangıç</label>
          <input type="date" value={filterDraft.createdFrom} onChange={(e) => setFilterDraft({ ...filterDraft, createdFrom: e.target.value })} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Kayıt bitiş</label>
          <input type="date" value={filterDraft.createdTo} onChange={(e) => setFilterDraft({ ...filterDraft, createdTo: e.target.value })} />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" className="primary-btn" onClick={applyFilters}>
            Filtrele
          </button>
          <button type="button" className="secondary-btn" onClick={resetFilters}>
            Sıfırla
          </button>
        </div>
      </div>

      {selectedIds.length > 0 && (
        <div className="inv-bulk-bar">
          <span>{selectedIds.length} seçili</span>
          <select value={bulkAgreement} onChange={(e) => setBulkAgreement(e.target.value)}>
            <option value="">Anlaşma durumu (toplu)</option>
            {AGREEMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select value={bulkActive} onChange={(e) => setBulkActive(e.target.value)}>
            <option value="">Aktif / Pasif</option>
            <option value="true">Aktif yap</option>
            <option value="false">Pasif yap</option>
          </select>
          <button type="button" className="primary-btn" onClick={runBulk}>
            Uygula
          </button>
        </div>
      )}

      {formOpen && (
        <div className="inv-drawer">
          <div className="inv-modal-head" style={{ borderRadius: '12px 12px 0 0' }}>
            <h3 style={{ margin: 0 }}>{form.id ? 'Markayı düzenle' : 'Yeni marka'}</h3>
            <button type="button" className="secondary-btn" onClick={() => { setFormOpen(false); setForm(defaultForm()); }}>
              Kapat
            </button>
          </div>
          <form onSubmit={saveBrand} className="inv-form-grid" style={{ maxHeight: '70vh', overflowY: 'auto', padding: 16 }}>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Marka adı *</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="field">
              <label>Yetkili kişi</label>
              <input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
            </div>
            <div className="field">
              <label>Telefon</label>
              <input value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
            </div>
            <div className="field">
              <label>WhatsApp</label>
              <input value={form.whatsappPhone} onChange={(e) => setForm({ ...form, whatsappPhone: e.target.value })} />
            </div>
            <div className="field">
              <label>E-posta</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="field">
              <label>Web sitesi</label>
              <input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
            </div>
            <div className="field">
              <label>Sektör *</label>
              <select value={form.sector} onChange={(e) => setForm({ ...form, sector: e.target.value })} required>
                {SECTORS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Alt sektör</label>
              <input value={form.subSector} onChange={(e) => setForm({ ...form, subSector: e.target.value })} />
            </div>
            <div className="field">
              <label>Marka tipi</label>
              <select value={form.brandType} onChange={(e) => setForm({ ...form, brandType: e.target.value })}>
                {BRAND_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Anlaşma durumu</label>
              <select value={form.agreementStatus} onChange={(e) => setForm({ ...form, agreementStatus: e.target.value })}>
                {AGREEMENT_STATUSES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Aktif</label>
              <select value={form.active ? 'true' : 'false'} onChange={(e) => setForm({ ...form, active: e.target.value === 'true' })}>
                <option value="true">Aktif</option>
                <option value="false">Pasif</option>
              </select>
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Hedef şehirler</label>
              <input value={form.targetLocations} onChange={(e) => setForm({ ...form, targetLocations: e.target.value })} placeholder="İstanbul, Ankara..." />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Hedef bölgeler</label>
              <input value={form.targetRegions} onChange={(e) => setForm({ ...form, targetRegions: e.target.value })} />
            </div>
            <div className="field">
              <label>Lokasyon tipi</label>
              <select value={form.locationType} onChange={(e) => setForm({ ...form, locationType: e.target.value })}>
                {LOC_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Min m²</label>
              <input type="number" value={form.minSqm} onChange={(e) => setForm({ ...form, minSqm: e.target.value })} required />
            </div>
            <div className="field">
              <label>Max m²</label>
              <input type="number" value={form.maxSqm} onChange={(e) => setForm({ ...form, maxSqm: e.target.value })} required />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Cephe ihtiyacı</label>
              <input value={form.storefrontNeed} onChange={(e) => setForm({ ...form, storefrontNeed: e.target.value })} />
            </div>
            <div className="field">
              <label>Baca ihtiyacı</label>
              <input value={form.chimneyNeed} onChange={(e) => setForm({ ...form, chimneyNeed: e.target.value })} />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Teknik altyapı</label>
              <input value={form.techInfrastructure} onChange={(e) => setForm({ ...form, techInfrastructure: e.target.value })} />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Personel ihtiyacı</label>
              <input value={form.staffNeed} onChange={(e) => setForm({ ...form, staffNeed: e.target.value })} />
            </div>
            <div className="field">
              <label>Toplam yatırım min</label>
              <input type="number" value={form.minBudget} onChange={(e) => setForm({ ...form, minBudget: e.target.value })} required />
            </div>
            <div className="field">
              <label>Toplam yatırım max</label>
              <input type="number" value={form.maxBudget} onChange={(e) => setForm({ ...form, maxBudget: e.target.value })} required />
            </div>
            <div className="field">
              <label>Para birimi</label>
              <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                <option value="TRY">TRY</option>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <div className="field">
              <label>Franchise giriş bedeli</label>
              <input type="number" value={form.franchiseFee} onChange={(e) => setForm({ ...form, franchiseFee: e.target.value })} />
            </div>
            <div className="field">
              <label>Royalty %</label>
              <input type="number" step="0.01" value={form.royaltyRate} onChange={(e) => setForm({ ...form, royaltyRate: e.target.value })} />
            </div>
            <div className="field">
              <label>Reklam katkı %</label>
              <input type="number" step="0.01" value={form.adContributionPct} onChange={(e) => setForm({ ...form, adContributionPct: e.target.value })} />
            </div>
            <div className="field">
              <label>Ort. aylık ciro</label>
              <input type="number" value={form.avgMonthlyRevenue} onChange={(e) => setForm({ ...form, avgMonthlyRevenue: e.target.value })} />
            </div>
            <div className="field">
              <label>Ort. kârlılık %</label>
              <input type="number" step="0.01" value={form.profitMarginPct} onChange={(e) => setForm({ ...form, profitMarginPct: e.target.value })} />
            </div>
            <div className="field">
              <label>Geri dönüş (ay)</label>
              <input type="number" value={form.paybackMonths} onChange={(e) => setForm({ ...form, paybackMonths: e.target.value })} />
            </div>
            <div className="field">
              <label>Franchise veriyor</label>
              <select value={form.givesFranchise ? 'true' : 'false'} onChange={(e) => setForm({ ...form, givesFranchise: e.target.value === 'true' })}>
                <option value="true">Evet</option>
                <option value="false">Hayır</option>
              </select>
            </div>
            <div className="field">
              <label>Royalty var</label>
              <select value={form.hasRoyalty ? 'true' : 'false'} onChange={(e) => setForm({ ...form, hasRoyalty: e.target.value === 'true' })}>
                <option value="true">Evet</option>
                <option value="false">Hayır</option>
              </select>
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Marka skorları (0–10)</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
                {[
                  ['scoreOperation', 'Operasyon gücü'],
                  ['scoreFranchiseFit', 'Franchise uygunluğu'],
                  ['scoreLocationFlex', 'Lokasyon esnekliği'],
                  ['scoreInvestorInterest', 'Yatırımcı ilgisi'],
                  ['scoreProfitability', 'Karlılık potansiyeli'],
                  ['scoreGrowth', 'Büyüme potansiyeli'],
                ].map(([key, label]) => (
                  <div key={key}>
                    <label style={{ fontSize: '0.75rem' }}>{label}</label>
                    <input type="number" min={0} max={10} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
                  </div>
                ))}
              </div>
            </div>
            <div className="field">
              <label>Logo yükle</label>
              <input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const u = await uploadFiles(e.target.files);
                  if (u[0]) setForm((f) => ({ ...f, logoUrl: u[0] }));
                }}
              />
              {form.logoUrl && (
                <a href={form.logoUrl} target="_blank" rel="noreferrer" style={{ fontSize: '0.8rem' }}>
                  Mevcut logo
                </a>
              )}
            </div>
            <div className="field">
              <label>Sunum yükle</label>
              <input
                type="file"
                onChange={async (e) => {
                  const u = await uploadFiles(e.target.files);
                  if (u[0]) setForm((f) => ({ ...f, presentationUrl: u[0] }));
                }}
              />
            </div>
            <div className="field">
              <label>Sözleşme taslağı</label>
              <input
                type="file"
                onChange={async (e) => {
                  const u = await uploadFiles(e.target.files);
                  if (u[0]) setForm((f) => ({ ...f, contractDraftUrl: u[0] }));
                }}
              />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Ek dosyalar</label>
              <input
                type="file"
                multiple
                onChange={async (e) => {
                  const u = await uploadFiles(e.target.files);
                  if (u.length) setForm((f) => ({ ...f, documents: [...(f.documents || []), ...u] }));
                }}
              />
              <ul style={{ fontSize: '0.8rem', margin: '6px 0 0', paddingLeft: 18 }}>
                {(form.documents || []).map((url, i) => (
                  <li key={url + i}>
                    <a href={url} target="_blank" rel="noreferrer">
                      Dosya {i + 1}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Notlar</label>
              <textarea rows={3} value={form.brandNotes} onChange={(e) => setForm({ ...form, brandNotes: e.target.value })} />
            </div>
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8 }}>
              <button type="submit" className="primary-btn">
                Kaydet
              </button>
              <button type="button" className="secondary-btn" onClick={() => { setFormOpen(false); setForm(defaultForm()); }}>
                Vazgeç
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="inv-table-wrap">
        <table className="inv-table">
          <thead>
            <tr>
              <th style={{ width: 36 }}>
                <input type="checkbox" checked={items.length > 0 && selectedIds.length === items.length} onChange={toggleSelectAll} />
              </th>
              <th>
                <button type="button" className="inv-sort-btn" onClick={() => toggleSort('name')}>
                  Marka
                </button>
              </th>
              <th>
                <button type="button" className="inv-sort-btn" onClick={() => toggleSort('sector')}>
                  Sektör
                </button>
              </th>
              <th>Bütçe aralığı</th>
              <th>Hedef şehirler</th>
              <th>Lokasyon tipi</th>
              <th>m²</th>
              <th>
                <button type="button" className="inv-sort-btn" onClick={() => toggleSort('agreement_status')}>
                  Anlaşma
                </button>
              </th>
              <th>Aktif</th>
              <th>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={10} style={{ padding: 24, textAlign: 'center' }}>
                  Yükleniyor…
                </td>
              </tr>
            )}
            {!loading &&
              items.map((b) => (
                <tr key={b.id} className={selectedIds.includes(b.id) ? 'selected-row' : ''}>
                  <td>
                    <input type="checkbox" checked={selectedIds.includes(b.id)} onChange={() => toggleSelect(b.id)} />
                  </td>
                  <td>
                    <strong>{b.name}</strong>
                    {b.matchingEligible && (
                      <span className="badge tag-success" style={{ marginLeft: 6, fontSize: '0.65rem' }}>
                        Eşleştirmede
                      </span>
                    )}
                  </td>
                  <td>{b.sector}</td>
                  <td>{budgetLabel(b)}</td>
                  <td style={{ maxWidth: 160, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.targetLocations}</td>
                  <td>{b.locationType || '—'}</td>
                  <td>{sqmLabel(b)}</td>
                  <td>
                    <span className="badge">{b.agreementStatus || '—'}</span>
                  </td>
                  <td>{b.active ? 'Evet' : 'Hayır'}</td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      <button type="button" className="edit-btn" onClick={() => editRow(b)}>
                        Düzenle
                      </button>
                      <button type="button" className="secondary-btn" style={{ fontSize: '0.75rem', padding: '4px 8px' }} onClick={() => openDetail(b)}>
                        Detay
                      </button>
                      <button type="button" className="secondary-btn" style={{ fontSize: '0.75rem', padding: '4px 8px' }} onClick={() => { window.location.href = '/matching'; }}>
                        Yatırımcı
                      </button>
                      <button type="button" className="secondary-btn" style={{ fontSize: '0.75rem', padding: '4px 8px' }} onClick={() => { window.location.href = '/locations'; }}>
                        Lokasyon
                      </button>
                      <button type="button" className="secondary-btn" style={{ fontSize: '0.75rem', padding: '4px 8px' }} onClick={() => createProject(b)}>
                        Proje
                      </button>
                      <button type="button" className="secondary-btn" style={{ fontSize: '0.75rem', padding: '4px 8px' }} onClick={() => { window.location.href = '/tasks'; }}>
                        Görev
                      </button>
                      {b.presentationUrl && (
                        <a className="secondary-btn" style={{ fontSize: '0.75rem', padding: '4px 8px', display: 'inline-block' }} href={b.presentationUrl} target="_blank" rel="noreferrer">
                          Sunum
                        </a>
                      )}
                      <button type="button" className="secondary-btn" style={{ fontSize: '0.75rem', padding: '4px 8px' }} onClick={() => createContract(b)}>
                        Sözleşme
                      </button>
                      <button type="button" className="danger-btn" style={{ fontSize: '0.75rem', padding: '4px 8px' }} onClick={() => deleteRow(b)}>
                        Sil
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="inv-pagination">
        <button type="button" className="secondary-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          Önceki
        </button>
        <span>
          Sayfa {page} / {totalPages} ({total} kayıt)
        </span>
        <button type="button" className="secondary-btn" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
          Sonraki
        </button>
      </div>

      {detailOpen && detail?.brand && (
        <div className="inv-modal-overlay" role="presentation" onClick={() => setDetailOpen(false)}>
          <div className="inv-modal" role="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="inv-modal-head">
              <h3 style={{ margin: 0 }}>{detail.brand.name}</h3>
              <button type="button" className="secondary-btn" onClick={() => setDetailOpen(false)}>
                Kapat
              </button>
            </div>
            <div className="inv-tabs">
              {[
                ['genel', 'Genel'],
                ['ihtiyac', 'İhtiyaç analizi'],
                ['franchise', 'Franchise şartları'],
                ['lokasyon', 'Lokasyon kriterleri'],
                ['finans', 'Finansal'],
                ['yetkili', 'Yetkili'],
                ['skor', 'Skorlar'],
                ['yatirimci', 'Eşleşen yatırımcılar'],
                ['lok', 'Eşleşen lokasyonlar'],
                ['proj', 'Projeler'],
                ['soz', 'Sözleşmeler'],
                ['gorev', 'Görevler'],
                ['dosya', 'Dosyalar'],
                ['not', 'Notlar'],
              ].map(([id, label]) => (
                <button key={id} type="button" className={`inv-tab ${detailTab === id ? 'active' : ''}`} onClick={() => setDetailTab(id)}>
                  {label}
                </button>
              ))}
            </div>
            <div className="inv-modal-body">
              {detailLoading && <p>Yükleniyor…</p>}
              {!detailLoading && detailTab === 'genel' && (
                <dl className="inv-dl">
                  <dt>Marka tipi</dt>
                  <dd>{detail.brand.brandType || '—'}</dd>
                  <dt>Anlaşma</dt>
                  <dd>{detail.brand.agreementStatus}</dd>
                  <dt>Aktif</dt>
                  <dd>{detail.brand.active ? 'Evet' : 'Hayır'}</dd>
                  <dt>Sektör</dt>
                  <dd>{detail.brand.sector} / {detail.brand.subSector || '—'}</dd>
                  <dt>Web</dt>
                  <dd>{detail.brand.website ? <a href={detail.brand.website}>{detail.brand.website}</a> : '—'}</dd>
                </dl>
              )}
              {!detailLoading && detailTab === 'ihtiyac' && (
                <div>
                  <h4 style={{ margin: '0 0 8px' }}>İş planı</h4>
                  <p style={{ whiteSpace: 'pre-wrap', marginBottom: 16 }}>{detail.brand.businessPlan || '—'}</p>
                  <h4 style={{ margin: '0 0 8px' }}>Operasyon planı</h4>
                  <p style={{ whiteSpace: 'pre-wrap', marginBottom: 16 }}>{detail.brand.operationPlan || '—'}</p>
                  <h4 style={{ margin: '0 0 8px' }}>Açılış adımları</h4>
                  <p style={{ whiteSpace: 'pre-wrap', marginBottom: 16 }}>
                    {Array.isArray(detail.brand.onboardingSteps) && detail.brand.onboardingSteps.length
                      ? detail.brand.onboardingSteps.join(', ')
                      : '—'}
                  </p>
                  <h4 style={{ margin: '0 0 8px' }}>KPI hedefleri</h4>
                  <p style={{ whiteSpace: 'pre-wrap' }}>{detail.brand.kpiTargets || '—'}</p>
                </div>
              )}
              {!detailLoading && detailTab === 'franchise' && (
                <dl className="inv-dl">
                  <dt>Franchise giriş</dt>
                  <dd>{fmt(detail.brand.franchiseFee)} {detail.brand.currency}</dd>
                  <dt>Royalty %</dt>
                  <dd>{detail.brand.royaltyRate ?? '—'}</dd>
                  <dt>Reklam katkı %</dt>
                  <dd>{detail.brand.adContributionPct ?? '—'}</dd>
                  <dt>Şube sayısı</dt>
                  <dd>{detail.brand.branchCount ?? '—'}</dd>
                </dl>
              )}
              {!detailLoading && detailTab === 'lokasyon' && (
                <dl className="inv-dl">
                  <dt>Hedef şehirler</dt>
                  <dd>{detail.brand.targetLocations}</dd>
                  <dt>Hedef bölgeler</dt>
                  <dd>{detail.brand.targetRegions || '—'}</dd>
                  <dt>Lokasyon tipi</dt>
                  <dd>{detail.brand.locationType || '—'}</dd>
                  <dt>m²</dt>
                  <dd>{sqmLabel(detail.brand)}</dd>
                  <dt>Cephe / Baca</dt>
                  <dd>{detail.brand.storefrontNeed || '—'} / {detail.brand.chimneyNeed || '—'}</dd>
                  <dt>Teknik / Personel</dt>
                  <dd>{detail.brand.techInfrastructure || '—'} | {detail.brand.staffNeed || '—'}</dd>
                </dl>
              )}
              {!detailLoading && detailTab === 'finans' && (
                <dl className="inv-dl">
                  <dt>Bütçe aralığı</dt>
                  <dd>{budgetLabel(detail.brand)}</dd>
                  <dt>Ort. aylık ciro</dt>
                  <dd>{detail.brand.avgMonthlyRevenue != null ? fmt(detail.brand.avgMonthlyRevenue) : '—'}</dd>
                  <dt>Kârlılık %</dt>
                  <dd>{detail.brand.profitMarginPct ?? '—'}</dd>
                  <dt>Geri dönüş (ay)</dt>
                  <dd>{detail.brand.paybackMonths ?? '—'}</dd>
                </dl>
              )}
              {!detailLoading && detailTab === 'yetkili' && (
                <dl className="inv-dl">
                  <dt>Yetkili</dt>
                  <dd>{detail.brand.contactPerson || '—'}</dd>
                  <dt>Telefon</dt>
                  <dd>{detail.brand.contactPhone || '—'}</dd>
                  <dt>WhatsApp</dt>
                  <dd>{detail.brand.whatsappPhone || '—'}</dd>
                  <dt>E-posta</dt>
                  <dd>{detail.brand.email || '—'}</dd>
                </dl>
              )}
              {!detailLoading && detailTab === 'skor' && (
                <ul style={{ listStyle: 'none', padding: 0 }}>
                  {[
                    ['Operasyon gücü', detail.brand.scoreOperation],
                    ['Franchise uygunluğu', detail.brand.scoreFranchiseFit],
                    ['Lokasyon esnekliği', detail.brand.scoreLocationFlex],
                    ['Yatırımcı ilgisi', detail.brand.scoreInvestorInterest],
                    ['Karlılık potansiyeli', detail.brand.scoreProfitability],
                    ['Büyüme potansiyeli', detail.brand.scoreGrowth],
                  ].map(([k, v]) => (
                    <li key={k} style={{ marginBottom: 8 }}>
                      <strong>{k}:</strong> {v ?? '—'}
                    </li>
                  ))}
                </ul>
              )}
              {!detailLoading && detailTab === 'yatirimci' && (
                <ul className="dashboard-list">
                  {(detail.investorMatches || []).map((m) => (
                    <li key={m.id}>
                      {m.investor_name} — skor: {m.score ?? '—'} ({m.investor_city})
                    </li>
                  ))}
                  {!(detail.investorMatches || []).length && <li>Kayıtlı eşleşme yok.</li>}
                </ul>
              )}
              {!detailLoading && detailTab === 'lok' && (
                <ul className="dashboard-list">
                  {(detail.locations || []).map((l) => (
                    <li key={l.id}>
                      {l.name} — {l.type || '—'} ({l.sqm} m²){l.address ? ` — ${l.address}` : ''}
                    </li>
                  ))}
                  {!(detail.locations || []).length && <li>Önerilen lokasyon bulunamadı.</li>}
                </ul>
              )}
              {!detailLoading && detailTab === 'proj' && (
                <ul className="dashboard-list">
                  {(detail.projects || []).map((p) => (
                    <li key={p.id}>{p.name} — {p.stage}</li>
                  ))}
                  {!(detail.projects || []).length && <li>Proje yok.</li>}
                </ul>
              )}
              {!detailLoading && detailTab === 'soz' && (
                <ul className="dashboard-list">
                  {(detail.contracts || []).map((c) => (
                    <li key={c.id}>{c.note} — {c.status || '—'}</li>
                  ))}
                  {!(detail.contracts || []).length && <li>Sözleşme kaydı yok.</li>}
                </ul>
              )}
              {!detailLoading && detailTab === 'gorev' && (
                <ul className="dashboard-list">
                  {(detail.tasks || []).map((t) => (
                    <li key={t.id}>
                      {t.note} — <span className="badge">{t.status}</span>
                    </li>
                  ))}
                  {!(detail.tasks || []).length && <li>Görev yok.</li>}
                </ul>
              )}
              {!detailLoading && detailTab === 'dosya' && (
                <ul className="dashboard-list">
                  {detail.brand.logoUrl && (
                    <li>
                      <a href={detail.brand.logoUrl} target="_blank" rel="noreferrer">
                        Logo
                      </a>
                    </li>
                  )}
                  {detail.brand.presentationUrl && (
                    <li>
                      <a href={detail.brand.presentationUrl} target="_blank" rel="noreferrer">
                        Sunum
                      </a>
                    </li>
                  )}
                  {detail.brand.contractDraftUrl && (
                    <li>
                      <a href={detail.brand.contractDraftUrl} target="_blank" rel="noreferrer">
                        Sözleşme taslağı
                      </a>
                    </li>
                  )}
                  {(detail.brand.documents || []).map((u, i) => (
                    <li key={u + i}>
                      <a href={u} target="_blank" rel="noreferrer">
                        Ek {i + 1}
                      </a>
                    </li>
                  ))}
                  {!detail.brand.logoUrl && !detail.brand.presentationUrl && !(detail.brand.documents || []).length && <li>Dosya yok.</li>}
                </ul>
              )}
              {!detailLoading && detailTab === 'not' && <p style={{ whiteSpace: 'pre-wrap' }}>{detail.brand.brandNotes || 'Not yok.'}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
