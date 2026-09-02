'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiClient } from '@/lib/apiClient';
import { useAuth } from '@/lib/AuthContext';
import citiesData from '@/lib/tr-cities-districts.json';
import { ColumnPicker, useColumnVisibility } from '@/lib/ColumnPicker';


const formatNumberString = (val) => {
  if (val === null || val === undefined || val === '') return '';
  const clean = String(val).replace(/\D/g, '');
  if (!clean) return '';
  return Number(clean).toLocaleString('tr-TR');
};

const parseFormattedString = (val) => {
  return String(val).replace(/\D/g, '');
};

const CITIES = [
  'Adana', 'Adıyaman', 'Afyonkarahisar', 'Ağrı', 'Amasya', 'Ankara', 'Antalya', 'Artvin', 'Aydın', 'Balıkesir', 'Bilecik', 'Bingöl', 'Bitlis', 'Bolu', 'Burdur', 'Bursa', 'Çanakkale', 'Çankırı', 'Çorum', 'Denizli', 'Diyarbakır', 'Edirne', 'Elazığ', 'Erzincan', 'Erzurum', 'Eskişehir', 'Gaziantep', 'Giresun', 'Gümüşhane', 'Hakkari', 'Hatay', 'Isparta', 'Mersin', 'İstanbul', 'İzmir', 'Kars', 'Kastamonu', 'Kayseri', 'Kırklareli', 'Kırşehir', 'Kocaeli', 'Konya', 'Kütahya', 'Malatya', 'Manisa', 'Kahramanmaraş', 'Mardin', 'Muğla', 'Muş', 'Nevşehir', 'Niğde', 'Ordu', 'Rize', 'Sakarya', 'Samsun', 'Siirt', 'Sinop', 'Sivas', 'Tekirdağ', 'Tokat', 'Trabzon', 'Tunceli', 'Şanlıurfa', 'Uşak', 'Van', 'Yozgat', 'Zonguldak', 'Aksaray', 'Bayburt', 'Karaman', 'Kırıkkale', 'Batman', 'Şırnak', 'Bartın', 'Ardahan', 'Iğdır', 'Yalova', 'Karabük', 'Kilis', 'Osmaniye', 'Düzce',
];

const SECTORS = ['Gıda', 'Kahve', 'Perakende', 'Eğitim', 'Hizmet', 'Gayrimenkul', 'Teknoloji', 'Spor', 'Sağlık', 'Otomotiv', 'Giyim', 'Diğer'];

const PIPELINES = [
  'Yeni Lead', 'İlk Temas', 'İhtiyaç Analizi', 'Marka Eşleşmesi', 'Sunum', 'Lokasyon Çalışması', 'Teklif', 'Sözleşme', 'Kapanış', 'Kaybedildi',
];

const PRIORITIES = ['Düşük', 'Orta', 'Yüksek', 'Çok sıcak'];
const INVESTOR_TYPES = ['Bireysel', 'Şirket', 'Grup yatırımcı'];
const INVESTMENT_TYPES = ['Franchise', 'Lokasyon arıyor', 'Marka satın alma', 'Ortaklık', 'Danışmanlık'];
const TIMING = ['Hemen', '1 ay', '3 ay', '6 ay', 'Belirsiz'];
const FINANCING = ['Hazır sermaye', 'Kredi', 'Ortaklı', 'Belirsiz'];
const LEAD_SOURCES = ['Web sitesi', 'WhatsApp', 'Instagram', 'Referans', 'Fuar', 'Telefon', 'E-posta', 'Diğer'];
const LOC_TYPES = ['AVM', 'Cadde', 'Plaza', 'Sanayi', 'Turistik bölge', 'Fark etmez'];
const MEETING_TYPES = ['Telefon', 'WhatsApp', 'Toplantı', 'E-posta'];

const defaultFilters = () => ({
  q: '',
  name: '',
  phone: '',
  email: '',
  city: '',
  district: '',
  sector: '',
  budgetMin: '',
  budgetMax: '',
  currency: '',
  pipeline: '',
  priority: '',
  investmentType: '',
  assignedMemberId: '',
  followUpFrom: '',
  followUpTo: '',
  createdFrom: '',
  createdTo: '',
});

const defaultForm = () => ({
  id: null,
  investorType: 'Bireysel',
  name: '',
  contactPerson: '',
  phone: '',
  whatsappPhone: '',
  email: '',
  city: '',
  district: '',
  targetCities: '',
  targetLocationType: 'Fark etmez',
  sector: 'Gıda',
  subSector: '',
  budgetMin: '',
  budgetMax: '',
  currency: 'TRY',
  investmentType: 'Franchise',
  investmentTiming: 'Belirsiz',
  financingStatus: 'Belirsiz',
  priority: 'Orta',
  pipeline: 'Yeni Lead',
  leadSource: 'WhatsApp',
  assignedMemberId: '',
  followUpDate: '',
  lastMeetingDate: '',
  nextAction: '',
  notes: '',
  meetingNotes: '',
  contactHistory: '',
  goal: '',
  documents: [],
});

const fmt = (n) => Number(n || 0).toLocaleString('tr-TR');
const budgetLabel = (inv) => `${fmt(inv.budgetMin)} – ${fmt(inv.budgetMax)} ${inv.currency || 'TRY'}`;

const priorityClass = (p) => {
  if (p === 'Çok sıcak') return 'inv-priority-chip inv-p-hot';
  if (p === 'Yüksek') return 'inv-priority-chip inv-p-high';
  if (p === 'Orta') return 'inv-priority-chip inv-p-mid';
  return 'inv-priority-chip inv-p-low';
};

const waLink = (inv) => {
  const raw = (inv.whatsappPhone || inv.phone || '').replace(/\D/g, '');
  if (!raw) return null;
  const num = raw.startsWith('0') ? `90${raw.slice(1)}` : raw.startsWith('90') ? raw : `90${raw}`;
  return `https://wa.me/${num}`;
};

export default function InvestorsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(15);
  const [sort, setSort] = useState('created_at');
  const [order, setOrder] = useState('desc');
  const [kpis, setKpis] = useState(null);
  const [reminders, setReminders] = useState({ followUpDue: [], staleHot: [] });
  const [filters, setFilters] = useState(defaultFilters);
  const [filterDraft, setFilterDraft] = useState(defaultFilters);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkMemberId, setBulkMemberId] = useState('');
  const [bulkPipeline, setBulkPipeline] = useState('');
  const [teamOptions, setTeamOptions] = useState([]);
  const [form, setForm] = useState(defaultForm());
  const [formOpen, setFormOpen] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTab, setDetailTab] = useState('genel');
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [meetingForm, setMeetingForm] = useState({
    meetingType: 'Telefon',
    meetingDate: new Date().toISOString().split('T')[0],
    metBy: user?.name || '',
    notes: '',
    nextAction: '',
    reminderDate: '',
  });

  const [matchOpen, setMatchOpen] = useState(false);
  const [matchTarget, setMatchTarget] = useState(null);
  const [matchRows, setMatchRows] = useState([]);

  const loadTeam = useCallback(async () => {
    try {
      const t = await apiClient.get('/team-members/options');
      setTeamOptions(t || []);
    } catch {
      setTeamOptions([]);
    }
  }, []);

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
      const data = await apiClient.get(`/investors?${buildQuery()}`);
      setItems(data.items || []);
      setTotal(data.total || 0);
      setKpis(data.kpis || null);
      setReminders(data.reminders || { followUpDue: [], staleHot: [] });
    } catch (e) {
      console.error(e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => {
    loadTeam();
  }, [loadTeam]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('new') === 'true') {
      setForm(defaultForm());
      setFormOpen(true);
      const url = new URL(window.location);
      url.searchParams.delete('new');
      window.history.replaceState({}, '', url);
    }
  }, []);

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
      await apiClient.post('/investors/bulk', {
        ids: selectedIds,
        assignedMemberId: bulkMemberId === '' ? undefined : Number(bulkMemberId),
        pipeline: bulkPipeline || undefined,
      });
      setSelectedIds([]);
      setBulkMemberId('');
      setBulkPipeline('');
      fetchList();
    } catch (e) {
      alert(e.message || 'Toplu işlem başarısız');
    }
  };

  const exportExcel = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch('/api/export/investors', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Dışa aktarılamadı');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'yatirimcilar.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Excel indirilemedi.');
    }
  };

  const uploadFiles = async (fileList) => {
    const token = localStorage.getItem('access_token');
    const urls = [];
    for (const file of fileList) {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('moduleName', 'investors');
      const res = await fetch('/api/uploads', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
      if (!res.ok) continue;
      const j = await res.json();
      if (j.file_url) urls.push(j.file_url);
    }
    return urls;
  };

  const payloadFromForm = () => ({
    name: form.name,
    investorType: form.investorType,
    contactPerson: form.contactPerson || null,
    phone: form.phone || null,
    whatsappPhone: form.whatsappPhone || null,
    email: form.email || null,
    city: form.city,
    district: form.district || null,
    targetCities: form.targetCities || null,
    targetLocationType: form.targetLocationType || null,
    sector: form.sector,
    subSector: form.subSector || null,
    budgetMin: Number(form.budgetMin || 0),
    budgetMax: Number(form.budgetMax || form.budgetMin || 0),
    currency: form.currency,
    investmentType: form.investmentType,
    investmentTiming: form.investmentTiming || null,
    financingStatus: form.financingStatus || null,
    priority: form.priority,
    pipeline: form.pipeline,
    leadSource: form.leadSource || null,
    assignedMemberId: form.assignedMemberId ? Number(form.assignedMemberId) : null,
    followUpDate: form.followUpDate || null,
    lastMeetingDate: form.lastMeetingDate || null,
    nextAction: form.nextAction || null,
    notes: form.notes || null,
    meetingNotes: form.meetingNotes || null,
    contactHistory: form.contactHistory || null,
    goal: form.goal || null,
    documents: form.documents,
  });

  const saveInvestor = async (e) => {
    e.preventDefault();
    try {
      const payload = payloadFromForm();
      if (form.id) await apiClient.put(`/investors/${form.id}`, payload);
      else await apiClient.post('/investors', payload);
      setForm(defaultForm());
      setFormOpen(false);
      fetchList();
    } catch (err) {
      alert(err.message || 'Kayıt hatası');
    }
  };

  const editRow = (inv) => {
    setForm({
      id: inv.id,
      investorType: inv.investorType || 'Bireysel',
      name: inv.name,
      contactPerson: inv.contactPerson || '',
      phone: inv.phone || '',
      whatsappPhone: inv.whatsappPhone || '',
      email: inv.email || '',
      city: inv.city,
      district: inv.district || '',
      targetCities: inv.targetCities || '',
      targetLocationType: inv.targetLocationType || 'Fark etmez',
      sector: inv.sector,
      subSector: inv.subSector || '',
      budgetMin: String(inv.budgetMin ?? ''),
      budgetMax: String(inv.budgetMax ?? ''),
      currency: inv.currency || 'TRY',
      investmentType: inv.type || 'Franchise',
      investmentTiming: inv.investmentTiming || '',
      financingStatus: inv.financingStatus || '',
      priority: inv.priority || 'Orta',
      pipeline: inv.pipeline || 'Yeni Lead',
      leadSource: inv.leadSource || '',
      assignedMemberId: inv.assignedMemberId ? String(inv.assignedMemberId) : '',
      followUpDate: inv.followUpDate || '',
      lastMeetingDate: inv.lastMeetingDate || '',
      nextAction: inv.nextAction || '',
      notes: inv.notes || '',
      meetingNotes: inv.meetingNotes || '',
      contactHistory: inv.contactHistory || '',
      goal: inv.goal || '',
      documents: inv.documents || [],
    });
    setFormOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deleteRow = async (inv) => {
    if (!confirm(`${inv.name} silinsin mi?`)) return;
    try {
      await apiClient.delete(`/investors/${inv.id}`);
      fetchList();
    } catch {
      alert('Silinemedi');
    }
  };

  const openDetail = async (inv) => {
    setDetailOpen(true);
    setDetailTab('genel');
    setDetail({ investor: inv });
    setDetailLoading(true);
    try {
      const d = await apiClient.get(`/investors/${inv.id}/detail`);
      setDetail(d);
    } catch {
      setDetail({ investor: inv, error: true });
    } finally {
      setDetailLoading(false);
    }
  };

  const saveMeeting = async (e) => {
    e.preventDefault();
    if (!detail?.investor?.id) return;
    try {
      await apiClient.post(`/investors/${detail.investor.id}/meetings`, {
        meetingType: meetingForm.meetingType,
        meetingDate: meetingForm.meetingDate,
        metBy: meetingForm.metBy,
        notes: meetingForm.notes,
        nextAction: meetingForm.nextAction,
        reminderDate: meetingForm.reminderDate || null,
      });
      setMeetingForm({
        meetingType: 'Telefon',
        meetingDate: new Date().toISOString().split('T')[0],
        metBy: user?.name || '',
        notes: '',
        nextAction: '',
        reminderDate: '',
      });
      const d = await apiClient.get(`/investors/${detail.investor.id}/detail`);
      setDetail(d);
      fetchList();
    } catch (err) {
      alert(err.message || 'Kaydedilemedi');
    }
  };

  const openMatch = async (inv) => {
    setMatchTarget(inv);
    setMatchOpen(true);
    setMatchRows([]);
    try {
      const rows = await apiClient.post('/matching/suggest', {
        budget: inv.budgetMax || inv.budget || 0,
        city: inv.city,
        sector: inv.sector,
        sqm: 150,
      });
      setMatchRows(Array.isArray(rows) ? rows : []);
    } catch {
      alert('Eşleştirme alınamadı');
    }
  };

  const saveMatches = async () => {
    if (!matchTarget || !matchRows.length) return;
    try {
      await apiClient.post(`/investors/${matchTarget.id}/match-brands`, {
        matches: matchRows.map((r) => ({ brandId: r.brand.id, score: r.score })),
      });
      setMatchOpen(false);
      fetchList();
      if (detail?.investor?.id === matchTarget.id) {
        const d = await apiClient.get(`/investors/${matchTarget.id}/detail`);
        setDetail(d);
      }
    } catch (e) {
      alert(e.message || 'Kayıt hatası');
    }
  };

  const createProject = async (inv) => {
    const name = window.prompt('Proje adı:', `${inv.name} – Franchise süreci`);
    if (!name) return;
    const due = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];
    try {
      await apiClient.post('/projects', {
        name,
        type: 'Yatırımcı gelişim',
        owner: 'Franchise ekibi',
        assignees: [],
        priority: 'Orta',
        progress: 0,
        stage: 'Başlangıç',
        dueDate: due,
        description: `Yatırımcı: ${inv.name} (#${inv.id})`,
        checklist: ['İlk temas', 'İhtiyaç analizi', 'Marka sunumu'],
        investorId: inv.id,
      });
      alert('Proje oluşturuldu.');
      fetchList();
      if (detail?.investor?.id === inv.id) openDetail(inv);
    } catch (e) {
      alert(e.message || 'Proje oluşturulamadı');
    }
  };

  const createTask = async (inv) => {
    if (!isAdmin) {
      alert('Görev tanımlama yönetici yetkisi gerektirir. Ayarlar > Görev Tanımlama bölümünü kullanın.');
      return;
    }
    const note = window.prompt('Görev açıklaması:', `${inv.name} – takip`);
    if (!note) return;
    try {
      const dueDate =
        inv.followUpDate || new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0];
      await apiClient.post('/tasks', {
        note,
        status: 'Açık',
        priority: inv.priority === 'Çok sıcak' ? 'Yüksek' : 'Orta',
        dueDate,
        investorId: inv.id,
      });
      alert('Görev oluşturuldu.');
    } catch (e) {
      alert(e.message || 'Görev oluşturulamadı');
    }
  };

  const locSuggest = (inv) => {
    const q = new URLSearchParams();
    if (inv.city) q.set('city', inv.city);
    window.location.href = `/locations?${q.toString()}`;
  };

  const kpiCards = useMemo(() => {
    if (!kpis) return null;
    return [
      { label: 'Toplam yatırımcı', value: kpis.total },
      { label: 'Yeni lead', value: kpis.newLeads },
      { label: 'Aktif pipeline', value: kpis.activePipeline },
      { label: 'Sıcak yatırımcı', value: kpis.hotInvestors },
      { label: 'Bu ay kapanan', value: kpis.closedThisMonth },
      { label: 'Ortalama bütçe', value: `${fmt(kpis.avgBudget)} TL` },
    ];
  }, [kpis]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const INV_COLS = [
    { key: 'phone', label: 'Telefon' },
    { key: 'city', label: 'Şehir / İlçe' },
    { key: 'sector', label: 'Sektör' },
    { key: 'budget', label: 'Bütçe' },
    { key: 'investmentType', label: 'Yatırım' },
    { key: 'pipeline', label: 'Pipeline' },
    { key: 'priority', label: 'Öncelik' },
    { key: 'consultant', label: 'Danışman' },
    { key: 'followUp', label: 'Takip tarihi' },
    { key: 'lastAction', label: 'Son aksiyon' },
  ];
  const [colVisible, toggleCol] = useColumnVisibility('investors', Object.fromEntries(INV_COLS.map((c) => [c.key, true])));

  return (
    <section className="card page-section active inv-page">
      <div className="module-head">
        <h2>Yatırımcı Yönetimi</h2>
        <div className="header-actions">
          <ColumnPicker columns={INV_COLS} visible={colVisible} onChange={toggleCol} />
          <button type="button" className="export-btn" onClick={exportExcel}>
            Excel Dışa Aktar
          </button>
          <button
            type="button"
            className="primary-btn"
            onClick={() => {
              setForm(defaultForm());
              setFormOpen(true);
            }}
          >
            + Yeni yatırımcı
          </button>
        </div>
      </div>

      {kpiCards && (
        <div className="inv-kpi-grid">
          {kpiCards.map((k) => (
            <div key={k.label} className="inv-kpi-card">
              <div className="inv-kpi-label">{k.label}</div>
              <div className="inv-kpi-value">{k.value}</div>
            </div>
          ))}
        </div>
      )}

      {(reminders.followUpDue?.length > 0 || reminders.staleHot?.length > 0) && (
        <div>
          {reminders.followUpDue?.length > 0 && (
            <div className="inv-alert inv-alert-warn">
              <strong>Takip tarihi gelen / geçen:</strong>{' '}
              {reminders.followUpDue.map((r) => r.name).slice(0, 8).join(', ')}
              {reminders.followUpDue.length > 8 ? ` +${reminders.followUpDue.length - 8}` : ''}
            </div>
          )}
          {reminders.staleHot?.length > 0 && (
            <div className="inv-alert inv-alert-hot">
              <strong>7 gündür işlem yapılmayan sıcak yatırımcı:</strong>{' '}
              {reminders.staleHot.map((r) => r.name).slice(0, 8).join(', ')}
              {reminders.staleHot.length > 8 ? ` +${reminders.staleHot.length - 8}` : ''}
            </div>
          )}
        </div>
      )}

      <div className="inv-filters">
        <div className="field" style={{ margin: 0 }}>
          <label>Genel arama</label>
          <input value={filterDraft.q} onChange={(e) => setFilterDraft({ ...filterDraft, q: e.target.value })} placeholder="Ad, e-posta, telefon, şehir" />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Ad / Şirket</label>
          <input value={filterDraft.name} onChange={(e) => setFilterDraft({ ...filterDraft, name: e.target.value })} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Telefon</label>
          <input value={filterDraft.phone} onChange={(e) => setFilterDraft({ ...filterDraft, phone: e.target.value })} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>E-posta</label>
          <input value={filterDraft.email} onChange={(e) => setFilterDraft({ ...filterDraft, email: e.target.value })} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Şehir</label>
          <select value={filterDraft.city ? filterDraft.city.toUpperCase() : ''} onChange={(e) => setFilterDraft({ ...filterDraft, city: e.target.value, district: '' })}>
            <option value="">Tümü</option>
            {citiesData.city.map((c) => (
              <option key={c.name} value={c.name}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>İlçe</label>
          <select value={filterDraft.district ? filterDraft.district.toUpperCase() : ''} onChange={(e) => setFilterDraft({ ...filterDraft, district: e.target.value })} disabled={!filterDraft.city}>
            <option value="">Tümü</option>
            {citiesData.city.find((c) => c.name.toLowerCase() === (filterDraft.city || '').toLowerCase())?.discrits.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Sektör</label>
          <input list="inv-sector-filter" value={filterDraft.sector} onChange={(e) => setFilterDraft({ ...filterDraft, sector: e.target.value })} />
          <datalist id="inv-sector-filter">{SECTORS.map((s) => <option key={s} value={s} />)}</datalist>
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Bütçe min</label>
          <input type="number" value={filterDraft.budgetMin} onChange={(e) => setFilterDraft({ ...filterDraft, budgetMin: e.target.value })} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Bütçe max</label>
          <input type="number" value={filterDraft.budgetMax} onChange={(e) => setFilterDraft({ ...filterDraft, budgetMax: e.target.value })} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Para birimi</label>
          <select value={filterDraft.currency} onChange={(e) => setFilterDraft({ ...filterDraft, currency: e.target.value })}>
            <option value="">Tümü</option>
            <option value="TRY">TL</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
          </select>
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Pipeline</label>
          <select value={filterDraft.pipeline} onChange={(e) => setFilterDraft({ ...filterDraft, pipeline: e.target.value })}>
            <option value="">Tümü</option>
            {PIPELINES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Yatırım tipi</label>
          <select value={filterDraft.investmentType} onChange={(e) => setFilterDraft({ ...filterDraft, investmentType: e.target.value })}>
            <option value="">Tümü</option>
            {INVESTMENT_TYPES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Öncelik</label>
          <select value={filterDraft.priority} onChange={(e) => setFilterDraft({ ...filterDraft, priority: e.target.value })}>
            <option value="">Tümü</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Atanan danışman</label>
          <select value={filterDraft.assignedMemberId} onChange={(e) => setFilterDraft({ ...filterDraft, assignedMemberId: e.target.value })}>
            <option value="">Tümü</option>
            {teamOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Takip tarihi (başlangıç)</label>
          <input type="date" value={filterDraft.followUpFrom} onChange={(e) => setFilterDraft({ ...filterDraft, followUpFrom: e.target.value })} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Takip tarihi (bitiş)</label>
          <input type="date" value={filterDraft.followUpTo} onChange={(e) => setFilterDraft({ ...filterDraft, followUpTo: e.target.value })} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Kayıt başlangıç</label>
          <input type="date" value={filterDraft.createdFrom} onChange={(e) => setFilterDraft({ ...filterDraft, createdFrom: e.target.value })} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Kayıt bitiş</label>
          <input type="date" value={filterDraft.createdTo} onChange={(e) => setFilterDraft({ ...filterDraft, createdTo: e.target.value })} />
        </div>
        <div className="field" style={{ margin: 0, gridColumn: '1 / -1', display: 'flex', gap: 8 }}>
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
          <span style={{ fontWeight: 600, marginRight: 8 }}>{selectedIds.length} seçili</span>
          <select value={bulkMemberId} onChange={(e) => setBulkMemberId(e.target.value)}>
            <option value="">Danışman ata…</option>
            {teamOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <select value={bulkPipeline} onChange={(e) => setBulkPipeline(e.target.value)}>
            <option value="">Pipeline değiştir…</option>
            {PIPELINES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <button type="button" className="primary-btn" onClick={runBulk}>
            Uygula
          </button>
          <button type="button" className="secondary-btn" onClick={() => setSelectedIds([])}>
            Seçimi kaldır
          </button>
        </div>
      )}

      {formOpen && (
        <div className="inv-drawer">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0, color: 'var(--primary-dark)' }}>{form.id ? 'Yatırımcıyı düzenle' : 'Yeni yatırımcı'}</h3>
            <button type="button" className="secondary-btn" onClick={() => { setFormOpen(false); setForm(defaultForm()); }}>
              Kapat
            </button>
          </div>
          <form onSubmit={saveInvestor}>
            <div className="inv-form-grid">
              <div className="field" style={{ margin: 0 }}>
                <label>Yatırımcı tipi</label>
                <select value={form.investorType} onChange={(e) => setForm({ ...form, investorType: e.target.value })}>
                  {INVESTOR_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="field field-wide" style={{ margin: 0, gridColumn: 'span 2' }}>
                <label>Ad Soyad / Şirket adı *</label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Yetkili kişi</label>
                <input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Telefon</label>
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>WhatsApp</label>
                <input value={form.whatsappPhone} onChange={(e) => setForm({ ...form, whatsappPhone: e.target.value })} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>E-posta</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Şehir *</label>
                <select required value={form.city ? form.city.toUpperCase() : ''} onChange={(e) => setForm({ ...form, city: e.target.value, district: '' })}>
                  <option value="">Seçin</option>
                  {citiesData.city.map((c) => (
                    <option key={c.name} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>İlçe</label>
                <select value={form.district ? form.district.toUpperCase() : ''} onChange={(e) => setForm({ ...form, district: e.target.value })} disabled={!form.city}>
                  <option value="">{form.city ? 'Seçin' : 'Önce il seçin'}</option>
                  {citiesData.city.find((c) => c.name.toLowerCase() === (form.city || '').toLowerCase())?.discrits.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div className="field field-wide" style={{ margin: 0, gridColumn: 'span 2' }}>
                <label>Hedef şehirler</label>
                <input value={form.targetCities} onChange={(e) => setForm({ ...form, targetCities: e.target.value })} placeholder="Virgülle ayırın" />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Hedef lokasyon tipi</label>
                <select value={form.targetLocationType} onChange={(e) => setForm({ ...form, targetLocationType: e.target.value })}>
                  {LOC_TYPES.map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Sektör *</label>
                <input required list="inv-sector-form" value={form.sector} onChange={(e) => setForm({ ...form, sector: e.target.value })} />
                <datalist id="inv-sector-form">{SECTORS.map((s) => <option key={s} value={s} />)}</datalist>
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Alt sektör</label>
                <input value={form.subSector} onChange={(e) => setForm({ ...form, subSector: e.target.value })} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Bütçe min *</label>
                <input required type="text" value={formatNumberString(form.budgetMin)} onChange={(e) => setForm({ ...form, budgetMin: parseFormattedString(e.target.value) })} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Bütçe max *</label>
                <input required type="text" value={formatNumberString(form.budgetMax)} onChange={(e) => setForm({ ...form, budgetMax: parseFormattedString(e.target.value) })} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Para birimi</label>
                <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                  <option value="TRY">TL</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Yatırım tipi</label>
                <select value={form.investmentType} onChange={(e) => setForm({ ...form, investmentType: e.target.value })}>
                  {INVESTMENT_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Yatırım zamanı</label>
                <select value={form.investmentTiming} onChange={(e) => setForm({ ...form, investmentTiming: e.target.value })}>
                  {TIMING.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Finansman</label>
                <select value={form.financingStatus} onChange={(e) => setForm({ ...form, financingStatus: e.target.value })}>
                  {FINANCING.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Öncelik</label>
                <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                  {PRIORITIES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Pipeline</label>
                <select value={form.pipeline} onChange={(e) => setForm({ ...form, pipeline: e.target.value })}>
                  {PIPELINES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Lead kaynağı</label>
                <select value={form.leadSource} onChange={(e) => setForm({ ...form, leadSource: e.target.value })}>
                  {LEAD_SOURCES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Atanan danışman</label>
                <select value={form.assignedMemberId} onChange={(e) => setForm({ ...form, assignedMemberId: e.target.value })}>
                  <option value="">—</option>
                  {teamOptions.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Takip tarihi</label>
                <input type="date" value={form.followUpDate} onChange={(e) => setForm({ ...form, followUpDate: e.target.value })} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Son görüşme</label>
                <input type="date" value={form.lastMeetingDate} onChange={(e) => setForm({ ...form, lastMeetingDate: e.target.value })} />
              </div>
              <div className="field field-wide" style={{ margin: 0, gridColumn: 'span 2' }}>
                <label>Sonraki aksiyon</label>
                <input value={form.nextAction} onChange={(e) => setForm({ ...form, nextAction: e.target.value })} />
              </div>
              <div className="field field-wide" style={{ margin: 0, gridColumn: '1 / -1' }}>
                <label>Notlar</label>
                <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <div className="field field-wide" style={{ margin: 0, gridColumn: '1 / -1' }}>
                <label>Görüşme / CRM notları</label>
                <textarea rows={2} value={form.meetingNotes} onChange={(e) => setForm({ ...form, meetingNotes: e.target.value })} />
              </div>
              <div className="field field-wide" style={{ margin: 0, gridColumn: '1 / -1' }}>
                <label>Dosya yükle</label>
                <input
                  type="file"
                  multiple
                  onChange={async (e) => {
                    const files = e.target.files;
                    if (!files?.length) return;
                    const urls = await uploadFiles(Array.from(files));
                    setForm((f) => ({ ...f, documents: [...(f.documents || []), ...urls] }));
                    e.target.value = '';
                  }}
                />
                {!!form.documents?.length && (
                  <div style={{ fontSize: 12, marginTop: 6 }}>
                    {form.documents.map((u) => (
                      <div key={u}>
                        <a href={u} target="_blank" rel="noreferrer">
                          {u.split('/').pop()}
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
              <button type="submit" className="primary-btn">
                {form.id ? 'Güncelle' : 'Kaydet'}
              </button>
              {form.id && (
                <button type="button" className="danger-btn" onClick={() => deleteRow({ id: form.id, name: form.name })}>
                  Sil
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="card">Yükleniyor…</div>
      ) : (
        <>
          <div className="inv-table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 36 }}>
                    <input type="checkbox" checked={items.length > 0 && selectedIds.length === items.length} onChange={toggleSelectAll} />
                  </th>
                  <th onClick={() => toggleSort('name')}>Yatırımcı {sort === 'name' ? (order === 'asc' ? '↑' : '↓') : ''}</th>
                  {colVisible.phone !== false && <th>Telefon</th>}
                  {colVisible.city !== false && <th onClick={() => toggleSort('city')}>Şehir / İlçe</th>}
                  {colVisible.sector !== false && <th>Sektör</th>}
                  {colVisible.budget !== false && <th onClick={() => toggleSort('budget')}>Bütçe</th>}
                  {colVisible.investmentType !== false && <th>Yatırım</th>}
                  {colVisible.pipeline !== false && <th onClick={() => toggleSort('pipeline')}>Pipeline</th>}
                  {colVisible.priority !== false && <th onClick={() => toggleSort('priority')}>Öncelik</th>}
                  {colVisible.consultant !== false && <th>Danışman</th>}
                  {colVisible.followUp !== false && <th onClick={() => toggleSort('follow_up_date')}>Takip</th>}
                  {colVisible.lastAction !== false && <th>Son aksiyon</th>}
                  <th>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={13} style={{ textAlign: 'center', padding: 24, color: '#64748b' }}>
                      Kayıt bulunamadı.
                    </td>
                  </tr>
                ) : (
                  items.map((inv) => (
                    <tr key={inv.id} className={selectedIds.includes(inv.id) ? 'selected-row' : ''}>
                      <td>
                        <input type="checkbox" checked={selectedIds.includes(inv.id)} onChange={() => toggleSelect(inv.id)} />
                      </td>
                      <td>
                        <strong onClick={() => openDetail(inv)} style={{ cursor: 'pointer', color: '#1a5c38', textDecoration: 'underline' }}>{inv.name}</strong>
                        <div style={{ fontSize: 11, color: '#64748b' }}>{inv.investorType}</div>
                      </td>
                      {colVisible.phone !== false && <td style={{ fontSize: 13 }}>{inv.phone || '—'}</td>}
                      {colVisible.city !== false && <td>{inv.city}<div style={{ fontSize: 11, color: '#64748b' }}>{inv.district || '—'}</div></td>}
                      {colVisible.sector !== false && <td>{inv.sector}</td>}
                      {colVisible.budget !== false && <td style={{ whiteSpace: 'nowrap' }}>{budgetLabel(inv)}</td>}
                      {colVisible.investmentType !== false && <td style={{ fontSize: 12 }}>{inv.type}</td>}
                      {colVisible.pipeline !== false && <td><span className="badge">{inv.pipeline}</span></td>}
                      {colVisible.priority !== false && <td><span className={priorityClass(inv.priority)}>{inv.priority}</span></td>}
                      {colVisible.consultant !== false && <td style={{ fontSize: 12 }}>{inv.assignedMemberName || '—'}</td>}
                      {colVisible.followUp !== false && <td style={{ fontSize: 12 }}>{inv.followUpDate || '—'}</td>}
                      {colVisible.lastAction !== false && <td style={{ fontSize: 12, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.nextAction || inv.meetingNotes?.slice(0, 40) || '—'}</td>}
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          <button type="button" className="edit-btn" onClick={() => editRow(inv)}>
                            Düzenle
                          </button>
                          <button type="button" className="secondary-btn" onClick={() => openDetail(inv)}>
                            Detay
                          </button>
                          {waLink(inv) && (
                            <a className="success-btn" href={waLink(inv)} target="_blank" rel="noreferrer" style={{ padding: '4px 8px', fontSize: 12 }}>
                              WA
                            </a>
                          )}
                          <button type="button" className="secondary-btn" style={{ fontSize: 11 }} onClick={() => openMatch(inv)}>
                            Marka
                          </button>
                          <button type="button" className="secondary-btn" style={{ fontSize: 11 }} onClick={() => locSuggest(inv)}>
                            Lokasyon
                          </button>
                          <button type="button" className="secondary-btn" style={{ fontSize: 11 }} onClick={() => createProject(inv)}>
                            Proje
                          </button>
                          <button type="button" className="secondary-btn" style={{ fontSize: 11 }} onClick={() => createTask(inv)}>
                            Görev
                          </button>
                          <button type="button" className="secondary-btn" style={{ fontSize: 11, background: '#fef3c7', color: '#92400e' }} onClick={async () => { if (!confirm('Arşivlensin mi?')) return; await apiClient.put(`/investors/${inv.id}`, { ...inv, pipeline: 'Arşiv' }); fetchList(); }}>
                            Arşivle
                          </button>
                          <button type="button" className="danger-btn" style={{ fontSize: 11 }} onClick={() => deleteRow(inv)}>
                            Sil
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="inv-pagination">
            <span>
              Toplam {total} kayıt — Sayfa {page}/{totalPages}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="secondary-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Önceki
              </button>
              <button type="button" className="secondary-btn" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Sonraki
              </button>
            </div>
          </div>
        </>
      )}

      {matchOpen && matchTarget && (
        <div className="inv-modal-overlay" role="presentation" onClick={() => setMatchOpen(false)}>
          <div className="inv-modal" role="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="inv-modal-head">
              <strong>Marka eşleştir — {matchTarget.name}</strong>
              <button type="button" className="secondary-btn" onClick={() => setMatchOpen(false)}>
                Kapat
              </button>
            </div>
            <div className="inv-modal-body">
              {!matchRows.length ? (
                <p>Öneri bulunamadı.</p>
              ) : (
                <>
                  <table>
                    <thead>
                      <tr>
                        <th>Marka</th>
                        <th>Skor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matchRows.map((r, i) => (
                        <tr key={i}>
                          <td>{r.brand?.name}</td>
                          <td>{r.score}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button type="button" className="primary-btn" style={{ marginTop: 12 }} onClick={saveMatches}>
                    Eşleşmeleri kaydet
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {detailOpen && detail?.investor && (
        <div className="inv-modal-overlay" role="presentation" onClick={() => setDetailOpen(false)}>
          <div className="inv-modal" role="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="inv-modal-head">
              <div>
                <strong>{detail.investor.name}</strong>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>#{detail.investor.id}</div>
              </div>
              <button type="button" className="secondary-btn" onClick={() => setDetailOpen(false)}>
                Kapat
              </button>
            </div>
            <div className="inv-tabs">
              {['genel', 'ihtiyac', 'gorusme', 'markalar', 'lokasyon', 'projeler', 'gorevler', 'dosyalar', 'finans'].map((t) => (
                <button key={t} type="button" className={`inv-tab ${detailTab === t ? 'active' : ''}`} onClick={() => setDetailTab(t)}>
                  {t === 'genel' && 'Genel'}
                  {t === 'ihtiyac' && 'İhtiyaç'}
                  {t === 'gorusme' && 'Görüşmeler'}
                  {t === 'markalar' && 'Markalar'}
                  {t === 'lokasyon' && 'Lokasyon'}
                  {t === 'projeler' && 'Projeler'}
                  {t === 'gorevler' && 'Görevler'}
                  {t === 'dosyalar' && 'Dosyalar'}
                  {t === 'finans' && 'Finans'}
                </button>
              ))}
            </div>
            <div className="inv-modal-body">
              {detailLoading ? (
                <p>Yükleniyor…</p>
              ) : (
                <>
                  {detailTab === 'genel' && (
                    <div className="inv-form-grid">
                      <div><strong>Tip:</strong> {detail.investor.investorType}</div>
                      <div><strong>Yetkili:</strong> {detail.investor.contactPerson || '—'}</div>
                      <div><strong>Telefon:</strong> {detail.investor.phone || '—'}</div>
                      <div><strong>WhatsApp:</strong> {detail.investor.whatsappPhone || '—'}</div>
                      <div><strong>E-posta:</strong> {detail.investor.email || '—'}</div>
                      <div><strong>Şehir:</strong> {detail.investor.city}</div>
                      <div><strong>Hedef şehirler:</strong> {detail.investor.targetCities || '—'}</div>
                      <div><strong>Lokasyon tipi:</strong> {detail.investor.targetLocationType || '—'}</div>
                      <div><strong>Bütçe:</strong> {budgetLabel(detail.investor)}</div>
                      <div><strong>Pipeline:</strong> {detail.investor.pipeline}</div>
                      <div><strong>Öncelik:</strong> {detail.investor.priority}</div>
                      <div><strong>Danışman:</strong> {detail.investor.assignedMemberName || '—'}</div>
                    </div>
                  )}
                  {detailTab === 'ihtiyac' && (
                    <div style={{ fontSize: 14, lineHeight: 1.6 }}>
                      <p>
                        <strong>Sektör / alt:</strong> {detail.investor.sector} {detail.investor.subSector ? ` / ${detail.investor.subSector}` : ''}
                      </p>
                      <p>
                        <strong>Yatırım:</strong> {detail.investor.type} — {detail.investor.investmentTiming || '—'} — {detail.investor.financingStatus || '—'}
                      </p>
                      <p>
                        <strong>Hedef:</strong> {detail.investor.goal || '—'}
                      </p>
                      <p>
                        <strong>Notlar:</strong> {detail.investor.notes || '—'}
                      </p>
                    </div>
                  )}
                  {detailTab === 'gorusme' && (
                    <div>
                      <form onSubmit={saveMeeting} style={{ marginBottom: 16, padding: 12, background: '#f8fafc', borderRadius: 10 }}>
                        <div className="inv-form-grid">
                          <div className="field" style={{ margin: 0 }}>
                            <label>Görüşme tipi</label>
                            <select value={meetingForm.meetingType} onChange={(e) => setMeetingForm({ ...meetingForm, meetingType: e.target.value })}>
                              {MEETING_TYPES.map((m) => (
                                <option key={m}>{m}</option>
                              ))}
                            </select>
                          </div>
                          <div className="field" style={{ margin: 0 }}>
                            <label>Tarih</label>
                            <input type="date" required value={meetingForm.meetingDate} onChange={(e) => setMeetingForm({ ...meetingForm, meetingDate: e.target.value })} />
                          </div>
                          <div className="field" style={{ margin: 0 }}>
                            <label>Görüşen</label>
                            <input value={meetingForm.metBy} onChange={(e) => setMeetingForm({ ...meetingForm, metBy: e.target.value })} />
                          </div>
                          <div className="field field-wide" style={{ margin: 0, gridColumn: '1 / -1' }}>
                            <label>Not</label>
                            <textarea rows={2} value={meetingForm.notes} onChange={(e) => setMeetingForm({ ...meetingForm, notes: e.target.value })} />
                          </div>
                          <div className="field" style={{ margin: 0 }}>
                            <label>Sonraki aksiyon</label>
                            <input value={meetingForm.nextAction} onChange={(e) => setMeetingForm({ ...meetingForm, nextAction: e.target.value })} />
                          </div>
                          <div className="field" style={{ margin: 0 }}>
                            <label>Hatırlatma</label>
                            <input type="date" value={meetingForm.reminderDate} onChange={(e) => setMeetingForm({ ...meetingForm, reminderDate: e.target.value })} />
                          </div>
                        </div>
                        <button type="submit" className="primary-btn" style={{ marginTop: 8 }}>
                          Görüşme ekle
                        </button>
                      </form>
                      <table>
                        <thead>
                          <tr>
                            <th>Tarih</th>
                            <th>Tip</th>
                            <th>Kişi</th>
                            <th>Not</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(detail.meetings || []).length === 0 ? (
                            <tr>
                              <td colSpan={4}>Kayıt yok</td>
                            </tr>
                          ) : (
                            detail.meetings.map((m) => (
                              <tr key={m.id}>
                                <td>{String(m.meeting_date).split('T')[0]}</td>
                                <td>{m.meeting_type}</td>
                                <td>{m.met_by}</td>
                                <td style={{ maxWidth: 220 }}>{m.notes}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {detailTab === 'markalar' && (
                    <ul>
                      {(detail.brandMatches || []).length === 0 ? (
                        <li>Henüz eşleşme yok. Tabloda Marka ile ekleyin.</li>
                      ) : (
                        detail.brandMatches.map((m) => (
                          <li key={m.id}>
                            {m.brand_name} — {m.score ?? '-'} puan
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                  {detailTab === 'lokasyon' && <p>Önerilen lokasyonlar için tabloda Lokasyon butonunu veya Lokasyonlar modülünü kullanın.</p>}
                  {detailTab === 'projeler' && (
                    <ul>
                      {(detail.projects || []).length === 0 ? (
                        <li>Proje yok</li>
                      ) : (
                        detail.projects.map((p) => (
                          <li key={p.id}>
                            {p.name} — {p.stage}
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                  {detailTab === 'gorevler' && (
                    <ul>
                      {(detail.tasks || []).length === 0 ? (
                        <li>Görev yok</li>
                      ) : (
                        detail.tasks.map((t) => (
                          <li key={t.id}>
                            {t.note} ({t.status})
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                  {detailTab === 'dosyalar' && (
                    <ul>
                      {(detail.investor.documents || []).length === 0 ? (
                        <li>Dosya yok</li>
                      ) : (
                        detail.investor.documents.map((d) => (
                          <li key={d}>
                            <a href={d} target="_blank" rel="noreferrer">
                              {d.split('/').pop()}
                            </a>
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                  {detailTab === 'finans' && (
                    <ul>
                      {(detail.contracts || []).length === 0 ? (
                        <li>Yatırımcıya bağlı sözleşme kaydı yok (ileride sözleşme oluştururken yatırımcı bağlanabilir).</li>
                      ) : (
                        detail.contracts.map((c) => (
                          <li key={c.id}>
                            {c.note} — {c.status || '-'}
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
