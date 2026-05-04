'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/apiClient';

const MONTHS = ['OCAK','ŞUBAT','MART','NİSAN','MAYIS','HAZİRAN','TEMMUZ','AĞUSTOS','EYLÜL','EKİM','KASIM','ARALIK'];
const EXPENSE_CATS = ['Gıda','Personel','Kira','Elektrik','Su','Doğalgaz','POS Komisyon','Paket Servis','Vergi','Devir Sayım / Stok Farkı','Diğer'];
const TABS = [
  { id: 'ozet', label: 'Özet & Rapor' },
  { id: 'gelirler', label: 'Gelirler' },
  { id: 'giderler', label: 'Giderler' },
  { id: 'personel', label: 'Personel Giderleri' },
  { id: 'excel', label: 'Excel İçe Aktar' },
];

const fmt = (n) => Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 0 });
const pct = (n) => `%${Number(n || 0).toFixed(1)}`;

const emptyRevForm = () => ({
  entryDate: new Date().toISOString().split('T')[0],
  branch: 'Genel', revenueType: 'Satış', description: '', amount: '', monthName: MONTHS[new Date().getMonth()], yearValue: String(new Date().getFullYear()),
});
const emptyExpForm = () => ({
  entryDate: new Date().toISOString().split('T')[0],
  branch: 'Genel', category: 'Gıda', subCategory: '', description: '', amount: '', monthName: MONTHS[new Date().getMonth()], yearValue: String(new Date().getFullYear()),
});
const emptyPerForm = () => ({
  entryDate: new Date().toISOString().split('T')[0],
  branch: 'Genel', personName: '', position: '', salary: '', bonus: '', deduction: '', monthName: MONTHS[new Date().getMonth()], yearValue: String(new Date().getFullYear()),
});

export default function PnlPage() {
  const [activeTab, setActiveTab] = useState('ozet');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterYear, setFilterYear] = useState(String(new Date().getFullYear()));
  const [filterBranch, setFilterBranch] = useState('all');

  const [summary, setSummary] = useState(null);
  const [monthlySummaries, setMonthlySummaries] = useState([]);
  const [revenues, setRevenues] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [personnel, setPersonnel] = useState([]);
  const [loading, setLoading] = useState(false);

  const [revForm, setRevForm] = useState(emptyRevForm());
  const [expForm, setExpForm] = useState(emptyExpForm());
  const [perForm, setPerForm] = useState(emptyPerForm());
  const [editRev, setEditRev] = useState(null);
  const [editExp, setEditExp] = useState(null);
  const [editPer, setEditPer] = useState(null);
  const [showRevForm, setShowRevForm] = useState(false);
  const [showExpForm, setShowExpForm] = useState(false);
  const [showPerForm, setShowPerForm] = useState(false);

  // Excel import state
  const [importFile, setImportFile] = useState(null);
  const [importYear, setImportYear] = useState(String(new Date().getFullYear()));
  const [importBranch, setImportBranch] = useState('Genel');
  const [importPreview, setImportPreview] = useState(null);
  const [importMappings, setImportMappings] = useState({});
  const [importing, setImporting] = useState(false);

  const buildQuery = useCallback(() => {
    const p = new URLSearchParams();
    if (filterMonth) p.append('month', filterMonth);
    if (filterYear) p.append('year', filterYear);
    if (filterBranch && filterBranch !== 'all') p.append('branch', filterBranch);
    return p.toString();
  }, [filterMonth, filterYear, filterBranch]);

  const loadSummary = useCallback(async () => {
    const q = buildQuery();
    const [s, ms] = await Promise.all([
      apiClient.get(`/pnl/summary${q ? '?' + q : ''}`).catch(() => null),
      apiClient.get('/pnl/monthly-summaries').catch(() => []),
    ]);
    setSummary(s);
    setMonthlySummaries(ms || []);
  }, [buildQuery]);

  const loadRevenues = useCallback(async () => {
    const q = buildQuery();
    const data = await apiClient.get(`/pnl/revenues${q ? '?' + q : ''}`).catch(() => []);
    setRevenues(data || []);
  }, [buildQuery]);

  const loadExpenses = useCallback(async () => {
    const q = buildQuery();
    const data = await apiClient.get(`/pnl/expenses${q ? '?' + q : ''}`).catch(() => []);
    setExpenses(data || []);
  }, [buildQuery]);

  const loadPersonnel = useCallback(async () => {
    const q = buildQuery();
    const data = await apiClient.get(`/pnl/personnel${q ? '?' + q : ''}`).catch(() => []);
    setPersonnel(data || []);
  }, [buildQuery]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadSummary(), loadRevenues(), loadExpenses(), loadPersonnel()]);
    setLoading(false);
  }, [loadSummary, loadRevenues, loadExpenses, loadPersonnel]);

  useEffect(() => { loadAll(); }, [filterMonth, filterYear, filterBranch]);

  // Revenue CRUD
  const saveRev = async (e) => {
    e.preventDefault();
    if (editRev) {
      await apiClient.put(`/pnl/revenues/${editRev}`, revForm);
      setEditRev(null);
    } else {
      await apiClient.post('/pnl/revenues', revForm);
    }
    setRevForm(emptyRevForm());
    setShowRevForm(false);
    await loadRevenues(); await loadSummary();
  };
  const deleteRev = async (id) => {
    if (!confirm('Bu gelir kaydını silmek istiyor musunuz?')) return;
    await apiClient.delete(`/pnl/revenues/${id}`);
    await loadRevenues(); await loadSummary();
  };
  const startEditRev = (r) => {
    setEditRev(r.id);
    setRevForm({ entryDate: r.entry_date?.split('T')[0] || '', branch: r.branch, revenueType: r.revenue_type, description: r.description || '', amount: String(r.amount), monthName: r.month_name, yearValue: String(r.year_value) });
    setShowRevForm(true);
  };

  // Expense CRUD
  const saveExp = async (e) => {
    e.preventDefault();
    if (editExp) {
      await apiClient.put(`/pnl/expenses/${editExp}`, expForm);
      setEditExp(null);
    } else {
      await apiClient.post('/pnl/expenses', expForm);
    }
    setExpForm(emptyExpForm());
    setShowExpForm(false);
    await loadExpenses(); await loadSummary();
  };
  const deleteExp = async (id) => {
    if (!confirm('Bu gider kaydını silmek istiyor musunuz?')) return;
    await apiClient.delete(`/pnl/expenses/${id}`);
    await loadExpenses(); await loadSummary();
  };
  const startEditExp = (r) => {
    setEditExp(r.id);
    setExpForm({ entryDate: r.entry_date?.split('T')[0] || '', branch: r.branch, category: r.category, subCategory: r.sub_category || '', description: r.description || '', amount: String(r.amount), monthName: r.month_name, yearValue: String(r.year_value) });
    setShowExpForm(true);
  };

  // Personnel CRUD
  const savePer = async (e) => {
    e.preventDefault();
    if (editPer) {
      await apiClient.put(`/pnl/personnel/${editPer}`, perForm);
      setEditPer(null);
    } else {
      await apiClient.post('/pnl/personnel', perForm);
    }
    setPerForm(emptyPerForm());
    setShowPerForm(false);
    await loadPersonnel(); await loadSummary();
  };
  const deletePer = async (id) => {
    if (!confirm('Bu personel kaydını silmek istiyor musunuz?')) return;
    await apiClient.delete(`/pnl/personnel/${id}`);
    await loadPersonnel(); await loadSummary();
  };
  const startEditPer = (r) => {
    setEditPer(r.id);
    setPerForm({ entryDate: r.entry_date?.split('T')[0] || '', branch: r.branch, personName: r.person_name, position: r.position || '', salary: String(r.salary), bonus: String(r.bonus), deduction: String(r.deduction), monthName: r.month_name, yearValue: String(r.year_value) });
    setShowPerForm(true);
  };

  // Excel Import
  const handleImportPreview = async () => {
    if (!importFile) return alert('Lütfen bir Excel dosyası seçiniz.');
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append('excelFile', importFile);
      const res = await fetch('/api/pnl/import-preview', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` },
        body: fd,
      });
      const data = await res.json();
      setImportPreview(data);
      const initMappings = {};
      data.sheetResults?.forEach(sheet => {
        sheet.unmapped?.forEach(row => {
          initMappings[row.label] = { category: 'Diğer', type: 'expense' };
        });
      });
      setImportMappings(initMappings);
    } catch { alert('Dosya analiz edilemedi.'); }
    setImporting(false);
  };

  const handleImportConfirm = async () => {
    if (!importPreview) return;
    setImporting(true);
    const rows = [];
    const mappingsToSave = [];
    importPreview.sheetResults?.forEach(sheet => {
      sheet.recognized?.forEach(r => rows.push({ ...r, entryDate: new Date().toISOString().split('T')[0] }));
      sheet.unmapped?.forEach(r => {
        const m = importMappings[r.label] || { category: 'Diğer', type: 'expense' };
        rows.push({ ...r, category: m.category, type: m.type, entryDate: new Date().toISOString().split('T')[0] });
        mappingsToSave.push({ label: r.label, category: m.category, type: m.type });
      });
    });
    try {
      const result = await apiClient.post('/pnl/import-confirm', { rows, year: importYear, branch: importBranch, mappingsToSave });
      alert(result.message || 'İçe aktarma tamamlandı.');
      setImportPreview(null);
      setImportFile(null);
      await loadAll();
    } catch { alert('İçe aktarma sırasında hata oluştu.'); }
    setImporting(false);
  };

  const tabStyle = (id) => ({
    padding: '9px 20px',
    borderRadius: '8px 8px 0 0',
    border: 'none',
    cursor: 'pointer',
    fontWeight: activeTab === id ? 700 : 400,
    background: activeTab === id ? '#16a34a' : '#f1f5f9',
    color: activeTab === id ? '#fff' : '#374151',
    fontSize: '14px',
    marginRight: '4px',
    transition: 'all .15s',
  });

  const summaryCard = (label, value, sub, color) => (
    <div style={{ background: '#fff', border: `2px solid ${color || '#e2e8f0'}`, borderRadius: 12, padding: '18px 22px', minWidth: 160, flex: 1 }}>
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || '#111' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{sub}</div>}
    </div>
  );

  const BarChart = ({ data, maxVal }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
      {data.map(d => (
        <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 130, fontSize: 12, color: '#374151', textAlign: 'right', flexShrink: 0 }}>{d.label}</div>
          <div style={{ flex: 1, background: '#f3f4f6', borderRadius: 4, height: 18, overflow: 'hidden' }}>
            <div style={{ width: `${maxVal > 0 ? (d.value / maxVal * 100).toFixed(1) : 0}%`, background: d.color || '#16a34a', height: '100%', borderRadius: 4, minWidth: d.value > 0 ? 4 : 0 }} />
          </div>
          <div style={{ width: 90, fontSize: 12, color: '#374151', flexShrink: 0 }}>{fmt(d.value)} TL</div>
        </div>
      ))}
    </div>
  );

  return (
    <section className="card page-section active">
      <div className="module-head">
        <h2>Kar / Zarar Yönetimi</h2>
        <div className="header-actions">
          <button className="export-btn" onClick={() => window.open(`/api/export/pnl?token=${localStorage.getItem('access_token')}`)}>Excel Dışa Aktar</button>
        </div>
      </div>

      {/* Global Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', background: '#f8fafc', borderRadius: 10, padding: '12px 16px' }}>
        <div className="field" style={{ margin: 0 }}>
          <label style={{ fontSize: 12, color: '#6b7280' }}>Ay</label>
          <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)} style={{ padding: '6px 10px', fontSize: 13 }}>
            <option value="">Tüm Aylar</option>
            {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label style={{ fontSize: 12, color: '#6b7280' }}>Yıl</label>
          <input type="number" value={filterYear} onChange={e => setFilterYear(e.target.value)} style={{ padding: '6px 10px', fontSize: 13, width: 90 }} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label style={{ fontSize: 12, color: '#6b7280' }}>Şube</label>
          <input list="branches-list" value={filterBranch} onChange={e => setFilterBranch(e.target.value)} style={{ padding: '6px 10px', fontSize: 13 }} placeholder="Tüm Şubeler" />
          <datalist id="branches-list"><option value="all" /><option value="Genel" /></datalist>
        </div>
        <button className="primary-btn" style={{ alignSelf: 'flex-end', padding: '6px 16px' }} onClick={loadAll} disabled={loading}>{loading ? '...' : 'Filtrele'}</button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '2px solid #e2e8f0', marginBottom: 20, flexWrap: 'wrap' }}>
        {TABS.map(t => <button key={t.id} style={tabStyle(t.id)} onClick={() => setActiveTab(t.id)}>{t.label}</button>)}
      </div>

      {/* ===== ÖZET TAB ===== */}
      {activeTab === 'ozet' && (
        <div>
          {summary && (
            <>
              {/* Summary Cards */}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
                {summaryCard('Toplam Ciro', fmt(summary.totalRevenue) + ' TL', 'Tüm gelirler toplamı', '#16a34a')}
                {summaryCard('Toplam Gider', fmt(summary.totalExpense) + ' TL', 'Gider + Personel', '#dc2626')}
                {summaryCard('Net Kar', (summary.netProfit >= 0 ? '+' : '') + fmt(summary.netProfit) + ' TL', summary.netProfit >= 0 ? 'Kârlı dönem' : 'Zararlı dönem', summary.netProfit >= 0 ? '#16a34a' : '#dc2626')}
                {summaryCard('Kar Marjı', pct(summary.profitMargin), 'Net Kar / Ciro', '#2563eb')}
                {summaryCard('Gider Oranı', pct(summary.expenseRatio), 'Toplam Gider / Ciro', '#7c3aed')}
                {summaryCard('Personel Oranı', pct(summary.personnelRatio), 'Personel / Ciro', '#ea580c')}
                {summaryCard('Gıda Maliyeti', pct(summary.foodRatio), 'Gıda / Ciro', '#0891b2')}
              </div>

              {/* Expense Breakdown Chart */}
              {summary.expenseByCategory?.length > 0 && (
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, marginBottom: 20 }}>
                  <h3 style={{ margin: '0 0 12px', color: '#16a34a', fontSize: 15 }}>Gider Dağılımı</h3>
                  <BarChart
                    data={summary.expenseByCategory.map((c, i) => ({
                      label: c.category,
                      value: c.total,
                      color: ['#16a34a','#dc2626','#2563eb','#7c3aed','#ea580c','#0891b2','#d97706','#6b7280','#10b981','#f43f5e','#8b5cf6'][i % 11],
                    }))}
                    maxVal={Math.max(...summary.expenseByCategory.map(c => c.total))}
                  />
                </div>
              )}
            </>
          )}

          {/* Monthly Summaries Table */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
            <h3 style={{ margin: '0 0 12px', color: '#16a34a', fontSize: 15 }}>Aylık Özet Rapor</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Ay</th><th>Yıl</th><th>Toplam Ciro</th><th>Toplam Gider</th><th>Net Kar</th><th>Kar Marjı</th></tr>
                </thead>
                <tbody>
                  {monthlySummaries.length === 0 ? (
                    <tr><td colSpan={6} style={{ textAlign: 'center', color: '#888' }}>Henüz veri yok. Gelir veya gider kaydı giriniz.</td></tr>
                  ) : monthlySummaries.map((m, i) => (
                    <tr key={i} style={{ cursor: 'pointer' }} onClick={() => { setFilterMonth(m.monthName); setFilterYear(String(m.yearValue)); }}>
                      <td><strong>{m.monthName}</strong></td>
                      <td>{m.yearValue}</td>
                      <td style={{ color: '#16a34a', fontWeight: 600 }}>{fmt(m.revenue)} TL</td>
                      <td style={{ color: '#dc2626' }}>{fmt(m.expense)} TL</td>
                      <td style={{ color: m.netProfit >= 0 ? '#16a34a' : '#dc2626', fontWeight: 700 }}>
                        {m.netProfit >= 0 ? '+' : ''}{fmt(m.netProfit)} TL
                      </td>
                      <td><span style={{ background: m.profitMargin >= 0 ? '#dcfce7' : '#fee2e2', color: m.profitMargin >= 0 ? '#16a34a' : '#dc2626', borderRadius: 6, padding: '2px 8px', fontSize: 12 }}>{pct(m.profitMargin)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===== GELİRLER TAB ===== */}
      {activeTab === 'gelirler' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0, color: '#16a34a' }}>Gelir Kayıtları</h3>
            <button className="primary-btn" onClick={() => { setEditRev(null); setRevForm(emptyRevForm()); setShowRevForm(!showRevForm); }}>
              {showRevForm ? 'Formu Kapat' : '+ Yeni Gelir Ekle'}
            </button>
          </div>

          {showRevForm && (
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 18, marginBottom: 16 }}>
              <h4 style={{ margin: '0 0 12px', color: '#16a34a' }}>{editRev ? 'Geliri Düzenle' : 'Yeni Gelir Girişi'}</h4>
              <form onSubmit={saveRev} className="entry-form">
                <div className="field"><label>Tarih *</label><input type="date" required value={revForm.entryDate} onChange={e => setRevForm({...revForm, entryDate: e.target.value})} /></div>
                <div className="field"><label>Ay *</label>
                  <select value={revForm.monthName} onChange={e => setRevForm({...revForm, monthName: e.target.value})}>
                    {MONTHS.map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>
                <div className="field"><label>Yıl *</label><input type="number" required value={revForm.yearValue} onChange={e => setRevForm({...revForm, yearValue: e.target.value})} /></div>
                <div className="field"><label>Şube *</label><input list="rev-branch" required value={revForm.branch} onChange={e => setRevForm({...revForm, branch: e.target.value})} /><datalist id="rev-branch"><option value="Genel" /></datalist></div>
                <div className="field">
                  <label>Gelir Türü</label>
                  <input list="rev-types" value={revForm.revenueType} onChange={e => setRevForm({...revForm, revenueType: e.target.value})} />
                  <datalist id="rev-types"><option value="Satış" /><option value="Ek Gelir" /><option value="Komisyon" /><option value="Diğer" /></datalist>
                </div>
                <div className="field field-wide"><label>Açıklama</label><input value={revForm.description} onChange={e => setRevForm({...revForm, description: e.target.value})} /></div>
                <div className="field"><label>Tutar (TL) *</label><input type="number" required step="0.01" min="0" value={revForm.amount} onChange={e => setRevForm({...revForm, amount: e.target.value})} /></div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="submit" className="primary-btn">{editRev ? 'Güncelle' : 'Kaydet'}</button>
                  <button type="button" className="secondary-btn" onClick={() => { setShowRevForm(false); setEditRev(null); }}>İptal</button>
                  {editRev && <button type="button" className="danger-btn" onClick={() => { deleteRev(editRev); setShowRevForm(false); setEditRev(null); }}>Sil</button>}
                </div>
              </form>
            </div>
          )}

          <div className="table-wrap">
            <table>
              <thead><tr><th>Tarih</th><th>Şube</th><th>Ay/Yıl</th><th>Tür</th><th>Açıklama</th><th>Tutar</th><th>Kaynak</th><th>İşlem</th></tr></thead>
              <tbody>
                {revenues.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', color: '#888' }}>Kayıt bulunamadı.</td></tr>
                ) : revenues.map(r => (
                  <tr key={r.id}>
                    <td>{r.entry_date?.split('T')[0]}</td>
                    <td>{r.branch}</td>
                    <td>{r.month_name} {r.year_value}</td>
                    <td>{r.revenue_type}</td>
                    <td>{r.description || '-'}</td>
                    <td style={{ color: '#16a34a', fontWeight: 600 }}>{fmt(r.amount)} TL</td>
                    <td><span style={{ background: r.source === 'Excel' ? '#dbeafe' : '#dcfce7', color: r.source === 'Excel' ? '#1d4ed8' : '#166534', borderRadius: 5, padding: '1px 7px', fontSize: 11 }}>{r.source}</span></td>
                    <td>
                      <button className="edit-btn" onClick={() => startEditRev(r)}>Düzenle</button>
                      <button className="danger-btn" onClick={() => deleteRev(r.id)}>Sil</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 8, color: '#16a34a', fontWeight: 700, fontSize: 15 }}>
            Toplam: {fmt(revenues.reduce((s, r) => s + Number(r.amount), 0))} TL
          </div>
        </div>
      )}

      {/* ===== GİDERLER TAB ===== */}
      {activeTab === 'giderler' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0, color: '#dc2626' }}>Gider Kayıtları</h3>
            <button className="primary-btn" onClick={() => { setEditExp(null); setExpForm(emptyExpForm()); setShowExpForm(!showExpForm); }}>
              {showExpForm ? 'Formu Kapat' : '+ Yeni Gider Ekle'}
            </button>
          </div>

          {/* Quick Templates */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: '#6b7280', alignSelf: 'center' }}>Hızlı şablon:</span>
            {['Kira','Elektrik','Su','Doğalgaz','POS Komisyon'].map(cat => (
              <button key={cat} type="button" style={{ padding: '3px 10px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 6, background: '#f9fafb', cursor: 'pointer' }}
                onClick={() => { setExpForm({ ...emptyExpForm(), category: cat }); setShowExpForm(true); }}>
                + {cat}
              </button>
            ))}
          </div>

          {showExpForm && (
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 18, marginBottom: 16 }}>
              <h4 style={{ margin: '0 0 12px', color: '#dc2626' }}>{editExp ? 'Gideri Düzenle' : 'Yeni Gider Girişi'}</h4>
              <form onSubmit={saveExp} className="entry-form">
                <div className="field"><label>Tarih *</label><input type="date" required value={expForm.entryDate} onChange={e => setExpForm({...expForm, entryDate: e.target.value})} /></div>
                <div className="field"><label>Ay *</label>
                  <select value={expForm.monthName} onChange={e => setExpForm({...expForm, monthName: e.target.value})}>
                    {MONTHS.map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>
                <div className="field"><label>Yıl *</label><input type="number" required value={expForm.yearValue} onChange={e => setExpForm({...expForm, yearValue: e.target.value})} /></div>
                <div className="field"><label>Şube *</label><input list="exp-branch" required value={expForm.branch} onChange={e => setExpForm({...expForm, branch: e.target.value})} /><datalist id="exp-branch"><option value="Genel" /></datalist></div>
                <div className="field">
                  <label>Kategori *</label>
                  <select value={expForm.category} onChange={e => setExpForm({...expForm, category: e.target.value})}>
                    {EXPENSE_CATS.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="field"><label>Alt Kategori</label><input value={expForm.subCategory} onChange={e => setExpForm({...expForm, subCategory: e.target.value})} placeholder="Opsiyonel" /></div>
                <div className="field field-wide"><label>Açıklama</label><input value={expForm.description} onChange={e => setExpForm({...expForm, description: e.target.value})} /></div>
                <div className="field"><label>Tutar (TL) *</label><input type="number" required step="0.01" min="0" value={expForm.amount} onChange={e => setExpForm({...expForm, amount: e.target.value})} /></div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="submit" className="primary-btn">{editExp ? 'Güncelle' : 'Kaydet'}</button>
                  <button type="button" className="secondary-btn" onClick={() => { setShowExpForm(false); setEditExp(null); }}>İptal</button>
                  {editExp && <button type="button" className="danger-btn" onClick={() => { deleteExp(editExp); setShowExpForm(false); setEditExp(null); }}>Sil</button>}
                </div>
              </form>
            </div>
          )}

          <div className="table-wrap">
            <table>
              <thead><tr><th>Tarih</th><th>Şube</th><th>Ay/Yıl</th><th>Kategori</th><th>Alt Kategori</th><th>Açıklama</th><th>Tutar</th><th>Kaynak</th><th>İşlem</th></tr></thead>
              <tbody>
                {expenses.length === 0 ? (
                  <tr><td colSpan={9} style={{ textAlign: 'center', color: '#888' }}>Kayıt bulunamadı.</td></tr>
                ) : expenses.map(r => (
                  <tr key={r.id}>
                    <td>{r.entry_date?.split('T')[0]}</td>
                    <td>{r.branch}</td>
                    <td>{r.month_name} {r.year_value}</td>
                    <td><span style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 5, padding: '1px 7px', fontSize: 11 }}>{r.category}</span></td>
                    <td>{r.sub_category || '-'}</td>
                    <td>{r.description || '-'}</td>
                    <td style={{ color: '#dc2626', fontWeight: 600 }}>{fmt(r.amount)} TL</td>
                    <td><span style={{ background: r.source === 'Excel' ? '#dbeafe' : '#f0fdf4', color: r.source === 'Excel' ? '#1d4ed8' : '#166534', borderRadius: 5, padding: '1px 7px', fontSize: 11 }}>{r.source}</span></td>
                    <td>
                      <button className="edit-btn" onClick={() => startEditExp(r)}>Düzenle</button>
                      <button className="danger-btn" onClick={() => deleteExp(r.id)}>Sil</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 8, color: '#dc2626', fontWeight: 700, fontSize: 15 }}>
            Toplam: {fmt(expenses.reduce((s, r) => s + Number(r.amount), 0))} TL
          </div>
        </div>
      )}

      {/* ===== PERSONEL TAB ===== */}
      {activeTab === 'personel' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0, color: '#ea580c' }}>Personel Gider Kayıtları</h3>
            <button className="primary-btn" onClick={() => { setEditPer(null); setPerForm(emptyPerForm()); setShowPerForm(!showPerForm); }}>
              {showPerForm ? 'Formu Kapat' : '+ Personel Gideri Ekle'}
            </button>
          </div>

          {showPerForm && (
            <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: 18, marginBottom: 16 }}>
              <h4 style={{ margin: '0 0 12px', color: '#ea580c' }}>{editPer ? 'Kaydı Düzenle' : 'Yeni Personel Gideri'}</h4>
              <form onSubmit={savePer} className="entry-form">
                <div className="field"><label>Tarih *</label><input type="date" required value={perForm.entryDate} onChange={e => setPerForm({...perForm, entryDate: e.target.value})} /></div>
                <div className="field"><label>Ay *</label>
                  <select value={perForm.monthName} onChange={e => setPerForm({...perForm, monthName: e.target.value})}>
                    {MONTHS.map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>
                <div className="field"><label>Yıl *</label><input type="number" required value={perForm.yearValue} onChange={e => setPerForm({...perForm, yearValue: e.target.value})} /></div>
                <div className="field"><label>Şube *</label><input list="per-branch" required value={perForm.branch} onChange={e => setPerForm({...perForm, branch: e.target.value})} /><datalist id="per-branch"><option value="Genel" /></datalist></div>
                <div className="field"><label>Personel Adı *</label><input required value={perForm.personName} onChange={e => setPerForm({...perForm, personName: e.target.value})} /></div>
                <div className="field"><label>Pozisyon</label><input value={perForm.position} onChange={e => setPerForm({...perForm, position: e.target.value})} placeholder="Kasiyer, Müdür..." /></div>
                <div className="field"><label>Maaş (TL)</label><input type="number" step="0.01" min="0" value={perForm.salary} onChange={e => setPerForm({...perForm, salary: e.target.value})} /></div>
                <div className="field"><label>Ek Ödeme (TL)</label><input type="number" step="0.01" min="0" value={perForm.bonus} onChange={e => setPerForm({...perForm, bonus: e.target.value})} /></div>
                <div className="field"><label>Kesinti (TL)</label><input type="number" step="0.01" min="0" value={perForm.deduction} onChange={e => setPerForm({...perForm, deduction: e.target.value})} /></div>
                <div className="field">
                  <label>Toplam Maliyet</label>
                  <input readOnly value={fmt(Number(perForm.salary || 0) + Number(perForm.bonus || 0) - Number(perForm.deduction || 0)) + ' TL'} style={{ background: '#f3f4f6' }} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="submit" className="primary-btn">{editPer ? 'Güncelle' : 'Kaydet'}</button>
                  <button type="button" className="secondary-btn" onClick={() => { setShowPerForm(false); setEditPer(null); }}>İptal</button>
                  {editPer && <button type="button" className="danger-btn" onClick={() => { deletePer(editPer); setShowPerForm(false); setEditPer(null); }}>Sil</button>}
                </div>
              </form>
            </div>
          )}

          <div className="table-wrap">
            <table>
              <thead><tr><th>Tarih</th><th>Şube</th><th>Ay/Yıl</th><th>Personel</th><th>Pozisyon</th><th>Maaş</th><th>Ek</th><th>Kesinti</th><th>Toplam</th><th>Kaynak</th><th>İşlem</th></tr></thead>
              <tbody>
                {personnel.length === 0 ? (
                  <tr><td colSpan={11} style={{ textAlign: 'center', color: '#888' }}>Kayıt bulunamadı.</td></tr>
                ) : personnel.map(r => (
                  <tr key={r.id}>
                    <td>{r.entry_date?.split('T')[0]}</td>
                    <td>{r.branch}</td>
                    <td>{r.month_name} {r.year_value}</td>
                    <td><strong>{r.person_name}</strong></td>
                    <td>{r.position || '-'}</td>
                    <td>{fmt(r.salary)} TL</td>
                    <td style={{ color: '#16a34a' }}>+{fmt(r.bonus)} TL</td>
                    <td style={{ color: '#dc2626' }}>-{fmt(r.deduction)} TL</td>
                    <td style={{ fontWeight: 700, color: '#ea580c' }}>{fmt(r.total_cost)} TL</td>
                    <td><span style={{ background: r.source === 'Excel' ? '#dbeafe' : '#fff7ed', color: r.source === 'Excel' ? '#1d4ed8' : '#9a3412', borderRadius: 5, padding: '1px 7px', fontSize: 11 }}>{r.source}</span></td>
                    <td>
                      <button className="edit-btn" onClick={() => startEditPer(r)}>Düzenle</button>
                      <button className="danger-btn" onClick={() => deletePer(r.id)}>Sil</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 8, color: '#ea580c', fontWeight: 700, fontSize: 15 }}>
            Toplam: {fmt(personnel.reduce((s, r) => s + Number(r.total_cost), 0))} TL
          </div>
        </div>
      )}

      {/* ===== EXCEL İÇE AKTAR TAB ===== */}
      {activeTab === 'excel' && (
        <div>
          <h3 style={{ color: '#2563eb', margin: '0 0 16px' }}>Excel'den İçe Aktarma</h3>

          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: 18, marginBottom: 16 }}>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: '#1e40af' }}>
              Excel dosyanızı yükleyin. Her sheet bir ay olarak işlenecektir. Tanınan başlıklar otomatik eşleştirilecek, tanınmayanlar için kategori seçimi yapabilirsiniz.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div className="field" style={{ margin: 0 }}>
                <label>Excel Dosyası</label>
                <input type="file" accept=".xlsx,.xls" onChange={e => setImportFile(e.target.files[0])} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Yıl</label>
                <input type="number" value={importYear} onChange={e => setImportYear(e.target.value)} style={{ width: 90 }} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Şube</label>
                <input list="imp-branch" value={importBranch} onChange={e => setImportBranch(e.target.value)} placeholder="Genel" />
                <datalist id="imp-branch"><option value="Genel" /></datalist>
              </div>
              <button className="primary-btn" onClick={handleImportPreview} disabled={importing || !importFile}>
                {importing ? 'Analiz ediliyor...' : 'Dosyayı Analiz Et'}
              </button>
            </div>
          </div>

          {importPreview && (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 18 }}>
              <h4 style={{ margin: '0 0 12px', color: '#2563eb' }}>İçe Aktarma Önizlemesi — {importPreview.fileName}</h4>

              {importPreview.sheetResults?.map((sheet, si) => (
                <div key={si} style={{ marginBottom: 20, borderBottom: '1px solid #f1f5f9', paddingBottom: 16 }}>
                  <h5 style={{ color: '#374151', margin: '0 0 10px' }}>{sheet.sheetName} ({sheet.monthName}) — {sheet.recognized.length + sheet.unmapped.length} satır</h5>

                  {sheet.recognized.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <p style={{ fontSize: 12, color: '#16a34a', fontWeight: 600, margin: '0 0 6px' }}>Otomatik Eşleşen ({sheet.recognized.length} satır):</p>
                      <table style={{ fontSize: 12, width: '100%' }}>
                        <thead><tr style={{ background: '#f0fdf4' }}><th>Başlık</th><th>Tutar</th><th>Kategori</th><th>Tür</th></tr></thead>
                        <tbody>
                          {sheet.recognized.map((r, ri) => (
                            <tr key={ri}>
                              <td>{r.label}</td>
                              <td>{fmt(r.amount)} TL</td>
                              <td>{r.category}</td>
                              <td><span style={{ color: r.type === 'revenue' ? '#16a34a' : '#dc2626' }}>{r.type === 'revenue' ? 'Gelir' : 'Gider'}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {sheet.unmapped.length > 0 && (
                    <div>
                      <p style={{ fontSize: 12, color: '#ea580c', fontWeight: 600, margin: '0 0 6px' }}>Manuel Eşleştirme Gerekli ({sheet.unmapped.length} satır):</p>
                      <table style={{ fontSize: 12, width: '100%' }}>
                        <thead><tr style={{ background: '#fff7ed' }}><th>Başlık</th><th>Tutar</th><th>Kategori Seç</th><th>Tür</th></tr></thead>
                        <tbody>
                          {sheet.unmapped.map((r, ri) => (
                            <tr key={ri}>
                              <td>{r.label}</td>
                              <td>{fmt(r.amount)} TL</td>
                              <td>
                                <select value={importMappings[r.label]?.category || 'Diğer'}
                                  onChange={e => setImportMappings(prev => ({ ...prev, [r.label]: { ...prev[r.label], category: e.target.value } }))}>
                                  <option value="Satış">Satış (Gelir)</option>
                                  {EXPENSE_CATS.map(c => <option key={c} value={c}>{c}</option>)}
                                  <option value="Atla">— Atla —</option>
                                </select>
                              </td>
                              <td>
                                <select value={importMappings[r.label]?.type || 'expense'}
                                  onChange={e => setImportMappings(prev => ({ ...prev, [r.label]: { ...prev[r.label], type: e.target.value } }))}>
                                  <option value="expense">Gider</option>
                                  <option value="revenue">Gelir</option>
                                </select>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}

              <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                <button className="primary-btn" onClick={handleImportConfirm} disabled={importing}>
                  {importing ? 'Aktarılıyor...' : 'İçe Aktarmayı Onayla ve Kaydet'}
                </button>
                <button className="secondary-btn" onClick={() => { setImportPreview(null); setImportFile(null); }}>İptal</button>
              </div>
              <p style={{ fontSize: 11, color: '#6b7280', marginTop: 8 }}>
                Yaptığınız eşleştirmeler kaydedilecek ve bir dahaki dosyada otomatik uygulanacaktır.
              </p>
            </div>
          )}

          {!importPreview && (
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 16 }}>
              <h4 style={{ margin: '0 0 10px', fontSize: 14, color: '#374151' }}>Otomatik Tanınan Başlıklar</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {['SATIŞLAR → Satış (Gelir)','Ciro → Satış (Gelir)','Gıda → Gıda (Gider)','Personel → Personel (Gider)','Kira → Kira (Gider)','Elektrik → Elektrik (Gider)','Su → Su (Gider)','Doğalgaz → Doğalgaz (Gider)','POS → POS Komisyon (Gider)'].map(t => (
                  <span key={t} style={{ background: '#e0f2fe', color: '#0369a1', fontSize: 11, padding: '3px 9px', borderRadius: 6 }}>{t}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
