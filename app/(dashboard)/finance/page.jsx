'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/apiClient';

const GELİR_TİPLERİ = ['Danışmanlık', 'Franchise', 'Lokasyon', 'Ek hizmet'];
const GİDER_TİPLERİ = ['Maaş', 'Pazarlama', 'Operasyon', 'Seyahat'];
const ÖDEME_YÖNTEMLERİ = ['Banka Transferi', 'Nakit', 'Kredi Kartı', 'Çek'];
const DURUMLAR = ['Açık', 'Tahsil edildi', 'Gecikti', 'İptal'];
const PARA_BİRİMLERİ = ['TRY', 'USD', 'EUR'];
const PLAN_DURUMLARI = ['Bekliyor', 'Ödendi', 'Gecikti'];

const defaultFilters = () => ({
  contractId: '', investorId: '', brandId: '', projectId: '',
  incomeType: '', status: '', dateFrom: '', dateTo: '',
});

const defaultFinansForm = () => ({
  id: null,
  contractId: '', projectId: '', investorId: '', brandId: '',
  incomeType: 'Danışmanlık', amount: '', vatPct: '0',
  currency: 'TRY', description: '',
  paymentType: 'Peşin', status: 'Açık',
  consultantCommissionPct: '', companySharePct: '',
  dueDate: '', paymentMethod: 'Banka Transferi',
  installments: [],
});

const defaultGiderForm = () => ({
  contractId: '', projectId: '', expenseType: 'Operasyon',
  amount: '', currency: 'TRY', expenseDate: '', description: '',
});

const fmt = (n) => Number(n || 0).toLocaleString('tr-TR');
const fmtKur = (n) => fmt(n) + ' ₺';

const durumRengi = (s) => {
  if (s === 'Tahsil edildi' || s === 'Ödendi') return { background: '#dcfce7', color: '#166534' };
  if (s === 'Gecikti') return { background: '#fee2e2', color: '#b91c1c' };
  if (s === 'İptal') return { background: '#f1f5f9', color: '#94a3b8' };
  return { background: '#fef3c7', color: '#b45309' };
};

export default function FinansPage() {
  const [tab, setTab] = useState('gelir');
  const [items, setItems] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [kpis, setKpis] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(15);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(defaultFilters);
  const [filterDraft, setFilterDraft] = useState(defaultFilters);
  const [overdueWarnings, setOverdueWarnings] = useState([]);
  const [finForm, setFinForm] = useState(defaultFinansForm());
  const [finFormOpen, setFinFormOpen] = useState(false);
  const [giderForm, setGiderForm] = useState(defaultGiderForm());
  const [giderOpen, setGiderOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(null);
  const [planData, setPlanData] = useState([]);
  const [planLoading, setPlanLoading] = useState(false);
  const [lookups, setLookups] = useState({ investors: [], brands: [], projects: [], contracts: [] });

  const buildQuery = useCallback(() => {
    const p = new URLSearchParams();
    p.set('page', String(page)); p.set('pageSize', String(pageSize));
    Object.entries(filters).forEach(([k, v]) => { if (v) p.set(k, v); });
    return p.toString();
  }, [filters, page, pageSize]);

  const fetchGelir = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient.get(`/finance?${buildQuery()}`);
      setItems(data.items || []);
      setTotal(data.total || 0);
      setKpis(data.kpis || null);
      setOverdueWarnings(data.overdueWarnings || []);
    } finally { setLoading(false); }
  }, [buildQuery]);

  const fetchGider = useCallback(async () => {
    const data = await apiClient.get('/finance/expenses');
    setExpenses(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => { fetchGelir(); }, [fetchGelir]);
  useEffect(() => { if (tab === 'gider') fetchGider(); }, [tab, fetchGider]);

  useEffect(() => {
    Promise.all([
      apiClient.get('/investors?page=1&pageSize=300'),
      apiClient.get('/brands?page=1&pageSize=300'),
      apiClient.get('/projects?page=1&pageSize=300'),
      apiClient.get('/contracts?page=1&pageSize=300'),
    ]).then(([i, b, pr, c]) => {
      setLookups({
        investors: Array.isArray(i) ? i : i.items || [],
        brands: Array.isArray(b) ? b : b.items || [],
        projects: Array.isArray(pr) ? pr : pr.items || [],
        contracts: Array.isArray(c) ? c : c.items || [],
      });
    }).catch(() => {});
  }, []);

  const saveFinans = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...finForm,
        contractId: finForm.contractId ? Number(finForm.contractId) : null,
        investorId: finForm.investorId ? Number(finForm.investorId) : null,
        brandId: finForm.brandId ? Number(finForm.brandId) : null,
        projectId: finForm.projectId ? Number(finForm.projectId) : null,
        amount: Number(finForm.amount || 0),
        vatPct: Number(finForm.vatPct || 0),
        consultantCommissionPct: finForm.consultantCommissionPct !== '' ? Number(finForm.consultantCommissionPct) : null,
        companySharePct: finForm.companySharePct !== '' ? Number(finForm.companySharePct) : null,
      };
      if (finForm.id) await apiClient.put(`/finance/${finForm.id}`, payload);
      else await apiClient.post('/finance', payload);
      setFinForm(defaultFinansForm()); setFinFormOpen(false); fetchGelir();
    } catch (err) { alert(err.message || 'Hata'); }
  };

  const saveGider = async (e) => {
    e.preventDefault();
    try {
      await apiClient.post('/finance/expenses', {
        ...giderForm,
        contractId: giderForm.contractId ? Number(giderForm.contractId) : null,
        projectId: giderForm.projectId ? Number(giderForm.projectId) : null,
        amount: Number(giderForm.amount || 0),
      });
      setGiderForm(defaultGiderForm()); setGiderOpen(false); fetchGider();
    } catch (err) { alert(err.message || 'Hata'); }
  };

  const odemeAl = async (item) => {
    const yontem = prompt('Ödeme yöntemi:', 'Banka Transferi');
    if (yontem === null) return;
    await apiClient.post(`/finance/${item.id}/collect`, { paymentMethod: yontem });
    fetchGelir();
  };

  const openPlan = async (item) => {
    setPlanOpen(item);
    setPlanLoading(true);
    try {
      const d = await apiClient.get(`/finance/${item.id}`);
      setPlanData(d.paymentPlans || []);
    } finally { setPlanLoading(false); }
  };

  const planOde = async (planItem) => {
    const yontem = prompt('Ödeme yöntemi:', 'Banka Transferi');
    if (yontem === null) return;
    await apiClient.post(`/finance/${planOpen.id}/collect`, { installmentId: planItem.id, paymentMethod: yontem });
    openPlan(planOpen);
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const kpiKartlari = [
    { etiket: 'Toplam gelir', deger: fmtKur(kpis?.totalIncome) },
    { etiket: 'Tahsil edilen', deger: fmtKur(kpis?.collected) },
    { etiket: 'Bekleyen tahsilat', deger: fmtKur(kpis?.pending) },
    { etiket: 'Geciken ödemeler', deger: fmtKur(kpis?.overdue) },
    { etiket: 'Bu ay gelir', deger: fmtKur(kpis?.monthIncome) },
    { etiket: 'Net kar', deger: fmtKur(kpis?.netProfit) },
  ];

  const giderToplamı = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const gelirToplamı = items.reduce((s, r) => s + Number(r.amount || 0), 0);

  return (
    <div className="inv-page">
      <div className="module-head" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>Finans Yönetimi</h2>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.9rem' }}>Gelir, tahsilat, ödeme planları ve gider yönetimi</p>
        </div>
        <div className="header-actions" style={{ flexWrap: 'wrap' }}>
          <button className="secondary-btn" onClick={() => { setGiderForm(defaultGiderForm()); setGiderOpen(true); }}>+ Gider ekle</button>
          <button className="primary-btn" onClick={() => { setFinForm(defaultFinansForm()); setFinFormOpen(true); }}>+ Finans kaydı</button>
        </div>
      </div>

      {/* KPI KARTLARI */}
      <section className="inv-kpi-grid">
        {kpiKartlari.map((k) => (
          <article key={k.etiket} className="inv-kpi-card">
            <div className="inv-kpi-label">{k.etiket}</div>
            <div className="inv-kpi-value">{k.deger}</div>
          </article>
        ))}
      </section>

      {/* GECİKME UYARILARI */}
      {overdueWarnings.length > 0 && (
        <div className="inv-alert inv-alert-hot" style={{ marginBottom: 12 }}>
          <strong>Vadesi geçen ödemeler:</strong>{' '}
          {overdueWarnings.map((w) => `#${w.id} (vade: ${w.due_date})`).join(' • ')}
        </div>
      )}

      {/* ANA SEKMELER */}
      <div className="inv-tabs" style={{ marginBottom: 16 }}>
        {[['gelir', 'Gelir kayıtları'], ['gider', 'Gider yönetimi'], ['analiz', 'Kar analizi']].map(([id, lbl]) => (
          <button key={id} className={`inv-tab${tab === id ? ' active' : ''}`} onClick={() => setTab(id)}>{lbl}</button>
        ))}
      </div>

      {/* GELİR SEKMESİ */}
      {tab === 'gelir' && (
        <>
          {/* FİLTRELER */}
          <div className="inv-filters" style={{ marginBottom: 12 }}>
            <div className="field" style={{ margin: 0 }}>
              <label>Sözleşme</label>
              <select value={filterDraft.contractId} onChange={(e) => setFilterDraft({ ...filterDraft, contractId: e.target.value })}>
                <option value="">Tümü</option>
                {lookups.contracts.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Yatırımcı</label>
              <select value={filterDraft.investorId} onChange={(e) => setFilterDraft({ ...filterDraft, investorId: e.target.value })}>
                <option value="">Tümü</option>
                {lookups.investors.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Gelir tipi</label>
              <select value={filterDraft.incomeType} onChange={(e) => setFilterDraft({ ...filterDraft, incomeType: e.target.value })}>
                <option value="">Tümü</option>
                {GELİR_TİPLERİ.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Durum</label>
              <select value={filterDraft.status} onChange={(e) => setFilterDraft({ ...filterDraft, status: e.target.value })}>
                <option value="">Tümü</option>
                {DURUMLAR.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Tarih (başlangıç)</label>
              <input type="date" value={filterDraft.dateFrom} onChange={(e) => setFilterDraft({ ...filterDraft, dateFrom: e.target.value })} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Tarih (bitiş)</label>
              <input type="date" value={filterDraft.dateTo} onChange={(e) => setFilterDraft({ ...filterDraft, dateTo: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <button className="primary-btn" onClick={() => { setFilters({ ...filterDraft }); setPage(1); }}>Filtrele</button>
              <button className="secondary-btn" onClick={() => { const d = defaultFilters(); setFilters(d); setFilterDraft(d); setPage(1); }}>Sıfırla</button>
            </div>
          </div>

          {/* GELİR TABLOSU */}
          <div className="inv-table-wrap">
            <table className="inv-table">
              <thead>
                <tr>
                  <th>Sözleşme</th>
                  <th>Yatırımcı</th>
                  <th>Marka</th>
                  <th>Gelir tipi</th>
                  <th>Tutar</th>
                  <th>KDV %</th>
                  <th>Net tutar</th>
                  <th>Ödeme tipi</th>
                  <th>Durum</th>
                  <th>Vade</th>
                  <th>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={11} style={{ padding: 24, textAlign: 'center' }}>Yükleniyor…</td></tr>}
                {!loading && items.length === 0 && <tr><td colSpan={11} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>Kayıt bulunamadı.</td></tr>}
                {!loading && items.map((item) => (
                  <tr key={item.id}>
                    <td style={{ fontSize: 13 }}>{item.contractName || '—'}</td>
                    <td style={{ fontSize: 13 }}>{item.investorName || '—'}</td>
                    <td style={{ fontSize: 13 }}>{item.brandName || '—'}</td>
                    <td><span className="badge">{item.incomeType}</span></td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmt(item.amount)} {item.currency}</td>
                    <td>%{item.vatPct}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmt(item.netAmount)} {item.currency}</td>
                    <td style={{ fontSize: 12 }}>{item.paymentType}</td>
                    <td><span className="badge" style={durumRengi(item.status)}>{item.status}</span></td>
                    <td style={{ fontSize: 12 }}>{item.dueDate || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        <button className="edit-btn" onClick={() => {
                          setFinForm({
                            ...defaultFinansForm(), ...item, id: item.id,
                            contractId: item.contractId ? String(item.contractId) : '',
                            investorId: item.investorId ? String(item.investorId) : '',
                            brandId: item.brandId ? String(item.brandId) : '',
                            projectId: item.projectId ? String(item.projectId) : '',
                            amount: String(item.amount || ''),
                            vatPct: String(item.vatPct || '0'),
                            consultantCommissionPct: item.consultantCommissionPct != null ? String(item.consultantCommissionPct) : '',
                            companySharePct: item.companySharePct != null ? String(item.companySharePct) : '',
                          });
                          setFinFormOpen(true);
                        }}>Düzenle</button>
                        <button className="secondary-btn" onClick={() => odemeAl(item)} style={{ fontSize: '0.75rem', padding: '4px 8px', background: '#f0fdf4', color: '#166534' }}>Ödeme al</button>
                        <button className="secondary-btn" onClick={() => openPlan(item)} style={{ fontSize: '0.75rem', padding: '4px 8px' }}>Ödeme planı</button>
                        <button className="danger-btn" onClick={async () => { if (!confirm('Silinsin mi?')) return; await apiClient.delete(`/finance/${item.id}`); fetchGelir(); }} style={{ fontSize: '0.75rem', padding: '4px 8px' }}>Sil</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="inv-pagination">
            <button className="secondary-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Önceki</button>
            <span>Sayfa {page} / {totalPages} ({total} kayıt)</span>
            <button className="secondary-btn" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Sonraki</button>
          </div>
        </>
      )}

      {/* GİDER SEKMESİ */}
      {tab === 'gider' && (
        <div>
          <div className="inv-table-wrap">
            <table className="inv-table">
              <thead>
                <tr>
                  <th>Gider tipi</th>
                  <th>Tutar</th>
                  <th>Tarih</th>
                  <th>Proje</th>
                  <th>Açıklama</th>
                  <th>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {expenses.length === 0 && <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>Gider kaydı yok.</td></tr>}
                {expenses.map((e) => (
                  <tr key={e.id}>
                    <td><span className="badge">{e.expenseType}</span></td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmt(e.amount)} {e.currency}</td>
                    <td style={{ fontSize: 12 }}>{e.expenseDate}</td>
                    <td style={{ fontSize: 12 }}>{e.projectId || '—'}</td>
                    <td style={{ fontSize: 12, maxWidth: 200 }}>{e.description || '—'}</td>
                    <td>
                      <button className="danger-btn" style={{ fontSize: '0.75rem', padding: '4px 8px' }} onClick={async () => { if (!confirm('Silinsin mi?')) return; await apiClient.delete(`/finance/expenses/${e.id}`); fetchGider(); }}>Sil</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 12, fontSize: '0.9rem', color: '#475569' }}>
            <strong>Toplam gider:</strong> {fmtKur(giderToplamı)}
          </div>
        </div>
      )}

      {/* ANALİZ SEKMESİ */}
      {tab === 'analiz' && (
        <div className="inv-form-grid" style={{ gap: 16 }}>
          <div className="inv-kpi-card" style={{ gridColumn: '1 / -1' }}>
            <h3 style={{ margin: '0 0 12px' }}>Kar analizi özeti</h3>
            <dl className="inv-dl">
              <dt>Toplam gelir</dt><dd>{fmtKur(kpis?.totalIncome)}</dd>
              <dt>Tahsil edilen gelir</dt><dd>{fmtKur(kpis?.collected)}</dd>
              <dt>Bekleyen tahsilat</dt><dd>{fmtKur(kpis?.pending)}</dd>
              <dt>Geciken ödemeler</dt><dd style={{ color: '#b91c1c' }}>{fmtKur(kpis?.overdue)}</dd>
              <dt>Bu ay gelir</dt><dd>{fmtKur(kpis?.monthIncome)}</dd>
              <dt>Toplam gider (bu ay)</dt><dd>{fmtKur(giderToplamı)}</dd>
              <dt>Net kar</dt><dd style={{ color: '#166534', fontWeight: 700 }}>{fmtKur(kpis?.netProfit)}</dd>
              <dt>Kar marjı</dt><dd style={{ fontWeight: 600 }}>
                {kpis?.collected && giderToplamı !== undefined
                  ? `%${(((kpis.collected - giderToplamı) / (kpis.collected || 1)) * 100).toFixed(1)}`
                  : '—'}
              </dd>
            </dl>
          </div>
          <div className="inv-kpi-card">
            <div className="inv-kpi-label">Gelir dağılımı (türe göre)</div>
            {GELİR_TİPLERİ.map((tip) => {
              const topTutar = items.filter((x) => x.incomeType === tip).reduce((s, x) => s + Number(x.amount || 0), 0);
              return topTutar > 0 ? (
                <div key={tip} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.85rem' }}>
                  <span>{tip}</span><strong>{fmtKur(topTutar)}</strong>
                </div>
              ) : null;
            })}
          </div>
          <div className="inv-kpi-card">
            <div className="inv-kpi-label">Gider dağılımı (türe göre)</div>
            {GİDER_TİPLERİ.map((tip) => {
              const topTutar = expenses.filter((x) => x.expenseType === tip).reduce((s, x) => s + Number(x.amount || 0), 0);
              return topTutar > 0 ? (
                <div key={tip} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.85rem' }}>
                  <span>{tip}</span><strong>{fmtKur(topTutar)}</strong>
                </div>
              ) : null;
            })}
          </div>
        </div>
      )}

      {/* FİNANS KAYDI FORMU */}
      {finFormOpen && (
        <div className="inv-modal-overlay" onClick={() => { setFinFormOpen(false); setFinForm(defaultFinansForm()); }}>
          <div className="inv-modal" onClick={(e) => e.stopPropagation()}>
            <div className="inv-modal-head">
              <h3 style={{ margin: 0 }}>{finForm.id ? 'Finans kaydı düzenle' : 'Yeni finans kaydı'}</h3>
              <button className="secondary-btn" onClick={() => { setFinFormOpen(false); setFinForm(defaultFinansForm()); }}>Kapat</button>
            </div>
            <form className="inv-modal-body" onSubmit={saveFinans} style={{ overflowY: 'auto' }}>
              <div className="inv-form-grid">
                <div className="field">
                  <label>Sözleşme</label>
                  <select value={finForm.contractId} onChange={(e) => setFinForm({ ...finForm, contractId: e.target.value })}>
                    <option value="">Seçiniz</option>
                    {lookups.contracts.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Yatırımcı</label>
                  <select value={finForm.investorId} onChange={(e) => setFinForm({ ...finForm, investorId: e.target.value })}>
                    <option value="">Seçiniz</option>
                    {lookups.investors.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Marka</label>
                  <select value={finForm.brandId} onChange={(e) => setFinForm({ ...finForm, brandId: e.target.value })}>
                    <option value="">Seçiniz</option>
                    {lookups.brands.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Proje</label>
                  <select value={finForm.projectId} onChange={(e) => setFinForm({ ...finForm, projectId: e.target.value })}>
                    <option value="">Seçiniz</option>
                    {lookups.projects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Gelir tipi</label>
                  <select value={finForm.incomeType} onChange={(e) => setFinForm({ ...finForm, incomeType: e.target.value })}>
                    {GELİR_TİPLERİ.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Tutar *</label>
                  <input required type="number" min="0" step="0.01" value={finForm.amount} onChange={(e) => setFinForm({ ...finForm, amount: e.target.value })} />
                </div>
                <div className="field">
                  <label>KDV %</label>
                  <input type="number" min="0" step="0.01" value={finForm.vatPct} onChange={(e) => setFinForm({ ...finForm, vatPct: e.target.value })} />
                </div>
                <div className="field">
                  <label>Para birimi</label>
                  <select value={finForm.currency} onChange={(e) => setFinForm({ ...finForm, currency: e.target.value })}>
                    {PARA_BİRİMLERİ.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Ödeme tipi</label>
                  <select value={finForm.paymentType} onChange={(e) => setFinForm({ ...finForm, paymentType: e.target.value })}>
                    <option>Peşin</option>
                    <option>Taksitli</option>
                  </select>
                </div>
                <div className="field">
                  <label>Ödeme yöntemi</label>
                  <select value={finForm.paymentMethod} onChange={(e) => setFinForm({ ...finForm, paymentMethod: e.target.value })}>
                    {ÖDEME_YÖNTEMLERİ.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Vade tarihi</label>
                  <input type="date" value={finForm.dueDate} onChange={(e) => setFinForm({ ...finForm, dueDate: e.target.value })} />
                </div>
                <div className="field">
                  <label>Durum</label>
                  <select value={finForm.status} onChange={(e) => setFinForm({ ...finForm, status: e.target.value })}>
                    {DURUMLAR.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Danışman payı %</label>
                  <input type="number" min="0" step="0.01" value={finForm.consultantCommissionPct} onChange={(e) => setFinForm({ ...finForm, consultantCommissionPct: e.target.value })} />
                </div>
                <div className="field">
                  <label>Şirket payı %</label>
                  <input type="number" min="0" step="0.01" value={finForm.companySharePct} onChange={(e) => setFinForm({ ...finForm, companySharePct: e.target.value })} />
                </div>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label>Açıklama</label>
                  <textarea rows={2} value={finForm.description} onChange={(e) => setFinForm({ ...finForm, description: e.target.value })} />
                </div>

                {finForm.paymentType === 'Taksitli' && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <strong>Taksit planı</strong>
                      <button type="button" className="secondary-btn" onClick={() => {
                        const no = (finForm.installments || []).length + 1;
                        const miktarBasvuru = Math.round((Number(finForm.amount || 0) / (no || 1)) * 100) / 100;
                        setFinForm((f) => ({
                          ...f,
                          installments: [...(f.installments || []), { no, amount: miktarBasvuru, dueDate: '', status: 'Bekliyor' }],
                        }));
                      }}>+ Taksit ekle</button>
                    </div>
                    <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                      <thead><tr>{['No', 'Tutar', 'Vade', 'Durum', ''].map((h) => <th key={h} style={{ textAlign: 'left', padding: '4px 6px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>{h}</th>)}</tr></thead>
                      <tbody>
                        {(finForm.installments || []).map((inst, idx) => (
                          <tr key={idx}>
                            <td style={{ padding: '4px 6px' }}>{inst.no}</td>
                            <td style={{ padding: '4px 6px' }}>
                              <input type="number" style={{ width: 100 }} value={inst.amount}
                                onChange={(e) => setFinForm((f) => {
                                  const copy = [...f.installments];
                                  copy[idx] = { ...copy[idx], amount: e.target.value };
                                  return { ...f, installments: copy };
                                })} />
                            </td>
                            <td style={{ padding: '4px 6px' }}>
                              <input type="date" value={inst.dueDate}
                                onChange={(e) => setFinForm((f) => {
                                  const copy = [...f.installments];
                                  copy[idx] = { ...copy[idx], dueDate: e.target.value };
                                  return { ...f, installments: copy };
                                })} />
                            </td>
                            <td style={{ padding: '4px 6px' }}>
                              <select value={inst.status} onChange={(e) => setFinForm((f) => {
                                const copy = [...f.installments];
                                copy[idx] = { ...copy[idx], status: e.target.value };
                                return { ...f, installments: copy };
                              })}>
                                {PLAN_DURUMLARI.map((s) => <option key={s}>{s}</option>)}
                              </select>
                            </td>
                            <td style={{ padding: '4px 6px' }}>
                              <button type="button" className="danger-btn" style={{ fontSize: '0.7rem', padding: '2px 6px' }} onClick={() => setFinForm((f) => ({ ...f, installments: f.installments.filter((_, i) => i !== idx) }))}>Sil</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8 }}>
                  <button type="submit" className="primary-btn">Kaydet</button>
                  <button type="button" className="secondary-btn" onClick={() => { setFinFormOpen(false); setFinForm(defaultFinansForm()); }}>Vazgeç</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* GİDER FORMU */}
      {giderOpen && (
        <div className="inv-modal-overlay" onClick={() => setGiderOpen(false)}>
          <div className="inv-modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="inv-modal-head">
              <h3 style={{ margin: 0 }}>Yeni gider kaydı</h3>
              <button className="secondary-btn" onClick={() => setGiderOpen(false)}>Kapat</button>
            </div>
            <form className="inv-modal-body" onSubmit={saveGider}>
              <div className="inv-form-grid">
                <div className="field">
                  <label>Gider tipi</label>
                  <select value={giderForm.expenseType} onChange={(e) => setGiderForm({ ...giderForm, expenseType: e.target.value })}>
                    {GİDER_TİPLERİ.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Tutar *</label>
                  <input required type="number" min="0" step="0.01" value={giderForm.amount} onChange={(e) => setGiderForm({ ...giderForm, amount: e.target.value })} />
                </div>
                <div className="field">
                  <label>Para birimi</label>
                  <select value={giderForm.currency} onChange={(e) => setGiderForm({ ...giderForm, currency: e.target.value })}>
                    {PARA_BİRİMLERİ.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Gider tarihi *</label>
                  <input required type="date" value={giderForm.expenseDate} onChange={(e) => setGiderForm({ ...giderForm, expenseDate: e.target.value })} />
                </div>
                <div className="field">
                  <label>Sözleşme</label>
                  <select value={giderForm.contractId} onChange={(e) => setGiderForm({ ...giderForm, contractId: e.target.value })}>
                    <option value="">Seçiniz</option>
                    {lookups.contracts.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Proje</label>
                  <select value={giderForm.projectId} onChange={(e) => setGiderForm({ ...giderForm, projectId: e.target.value })}>
                    <option value="">Seçiniz</option>
                    {lookups.projects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                </div>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label>Açıklama</label>
                  <textarea rows={2} value={giderForm.description} onChange={(e) => setGiderForm({ ...giderForm, description: e.target.value })} />
                </div>
                <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8 }}>
                  <button type="submit" className="primary-btn">Kaydet</button>
                  <button type="button" className="secondary-btn" onClick={() => setGiderOpen(false)}>Vazgeç</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ÖDEME PLANI MODALİ */}
      {planOpen && (
        <div className="inv-modal-overlay" onClick={() => setPlanOpen(null)}>
          <div className="inv-modal" style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
            <div className="inv-modal-head">
              <h3 style={{ margin: 0 }}>Ödeme planı — #{planOpen.id}</h3>
              <button className="secondary-btn" onClick={() => setPlanOpen(null)}>Kapat</button>
            </div>
            <div className="inv-modal-body">
              {planLoading ? <p>Yükleniyor…</p> : planData.length === 0 ? (
                <p style={{ color: '#64748b' }}>Bu kayıt için ödeme planı tanımlanmamış.</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr>{['Taksit', 'Tutar', 'Vade', 'Ödeme tarihi', 'Yöntem', 'Durum', 'İşlem'].map((h) => <th key={h} style={{ textAlign: 'left', padding: '6px 8px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {planData.map((p) => (
                      <tr key={p.id}>
                        <td style={{ padding: '6px 8px' }}>#{p.taksitNo}</td>
                        <td style={{ padding: '6px 8px' }}>{fmt(p.amount)}</td>
                        <td style={{ padding: '6px 8px' }}>{p.dueDate}</td>
                        <td style={{ padding: '6px 8px' }}>{p.paidDate || '—'}</td>
                        <td style={{ padding: '6px 8px' }}>{p.paymentMethod || '—'}</td>
                        <td style={{ padding: '6px 8px' }}>
                          <span className="badge" style={durumRengi(p.status)}>{p.status}</span>
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          {p.status !== 'Ödendi' && (
                            <button className="secondary-btn" style={{ fontSize: '0.75rem', padding: '3px 8px', background: '#f0fdf4', color: '#166534' }} onClick={() => planOde(p)}>
                              Ödendi
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
