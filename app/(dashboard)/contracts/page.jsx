'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/apiClient';
import { ColumnPicker, useColumnVisibility } from '@/lib/ColumnPicker';


const SOZLESME_TIPLERI = ['Danışmanlık', 'Franchise', 'Kiralama', 'Ortaklık'];
const DURUMLAR = ['Taslak', 'İmzalandı', 'Aktif', 'Askıda', 'Feshedildi'];
const RISK_SEVİYELERİ = ['Düşük', 'Orta', 'Yüksek'];
const PARA_BİRİMLERİ = ['TRY', 'USD', 'EUR'];

const defaultFilters = () => ({
  name: '', type: '', status: '', investorId: '', brandId: '', projectId: '', consultant: '',
  startFrom: '', startTo: '', endFrom: '', endTo: '', amountMin: '', amountMax: '',
});

const defaultForm = () => ({
  id: null,
  name: '', note: '', type: 'Danışmanlık', status: 'Taslak', counterparty: '',
  signDate: '', startDate: '', endDate: '', renewalDate: '',
  amount: '', consultingFee: '', franchiseCommission: '', franchiseCommissionPct: '',
  locationCommission: '', extraIncome: '', currency: 'TRY',
  investorId: '', brandId: '', projectId: '', locationId: '',
  consultantName: '', legalPerson: '', financePerson: '',
  riskLevel: 'Düşük', riskNote: '', notes: '', docsUrls: [], fileUrl: '',
});

const fmt = (n) => Number(n || 0).toLocaleString('tr-TR');

const durumRengi = (s) => {
  if (s === 'Aktif') return 'background:#dcfce7;color:#166534';
  if (s === 'İmzalandı') return 'background:#dbeafe;color:#1d4ed8';
  if (s === 'Feshedildi') return 'background:#fee2e2;color:#b91c1c';
  if (s === 'Askıda') return 'background:#fef3c7;color:#b45309';
  return 'background:#f1f5f9;color:#475569';
};

export default function SozlesmePage() {
  const [items, setItems] = useState([]);
  const [kpis, setKpis] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(15);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(defaultFilters);
  const [filterDraft, setFilterDraft] = useState(defaultFilters);
  const [expiryWarnings, setExpiryWarnings] = useState([]);
  const [form, setForm] = useState(defaultForm());
  const [formOpen, setFormOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailTab, setDetailTab] = useState('genel');
  const [lookups, setLookups] = useState({ investors: [], brands: [], projects: [], locations: [] });

  const buildQuery = useCallback(() => {
    const p = new URLSearchParams();
    p.set('page', String(page)); p.set('pageSize', String(pageSize));
    Object.entries(filters).forEach(([k, v]) => { if (v) p.set(k, v); });
    return p.toString();
  }, [filters, page, pageSize]);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient.get(`/contracts?${buildQuery()}`);
      setItems(data.items || []);
      setTotal(data.total || 0);
      setKpis(data.kpis || null);
      setExpiryWarnings(data.expiryWarnings || []);
    } finally { setLoading(false); }
  }, [buildQuery]);

  useEffect(() => { fetchList(); }, [fetchList]);

  useEffect(() => {
    Promise.all([
      apiClient.get('/investors?page=1&pageSize=300'),
      apiClient.get('/brands?page=1&pageSize=300'),
      apiClient.get('/projects?page=1&pageSize=300'),
      apiClient.get('/locations?page=1&pageSize=300'),
    ]).then(([i, b, pr, l]) => {
      setLookups({
        investors: Array.isArray(i) ? i : i.items || [],
        brands: Array.isArray(b) ? b : b.items || [],
        projects: Array.isArray(pr) ? pr : pr.items || [],
        locations: Array.isArray(l) ? l : l.items || [],
      });
    }).catch(() => {});
  }, []);

  const saveForm = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        investorId: form.investorId ? Number(form.investorId) : null,
        brandId: form.brandId ? Number(form.brandId) : null,
        projectId: form.projectId ? Number(form.projectId) : null,
        locationId: form.locationId ? Number(form.locationId) : null,
        amount: form.amount ? Number(form.amount) : null,
        consultingFee: form.consultingFee ? Number(form.consultingFee) : null,
        franchiseCommission: form.franchiseCommission ? Number(form.franchiseCommission) : null,
        franchiseCommissionPct: form.franchiseCommissionPct ? Number(form.franchiseCommissionPct) : null,
        locationCommission: form.locationCommission ? Number(form.locationCommission) : null,
      };
      if (form.id) await apiClient.put(`/contracts/${form.id}`, payload);
      else await apiClient.post('/contracts', payload);
      setForm(defaultForm()); setFormOpen(false); fetchList();
    } catch (err) { alert(err.message || 'Kayıt hatası'); }
  };

  const openDetail = async (item) => {
    setDetail({ contract: item });
    setDetailTab('genel');
    try {
      const d = await apiClient.get(`/contracts/${item.id}/detail`);
      setDetail(d);
    } catch { setDetail({ contract: item, error: true }); }
  };

  const uploadDocs = async (fileList) => {
    const token = localStorage.getItem('access_token');
    const urls = [];
    for (const file of fileList) {
      const fd = new FormData();
      fd.append('file', file); fd.append('moduleName', 'contracts');
      const res = await fetch('/api/uploads', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
      if (!res.ok) continue;
      const j = await res.json();
      if (j.file_url) urls.push(j.file_url);
    }
    return urls;
  };

  const feshet = async (item) => {
    if (!confirm(`"${item.name}" sözleşmesi feshedilsin mi?`)) return;
    await apiClient.put(`/contracts/${item.id}`, { ...item, status: 'Feshedildi', type: item.type });
    fetchList();
  };

  const yenile = async (item) => {
    const yeniTarih = prompt('Yeni bitiş tarihi (YYYY-AA-GG):', item.endDate || '');
    if (!yeniTarih) return;
    await apiClient.put(`/contracts/${item.id}`, { ...item, endDate: yeniTarih, status: 'Aktif', type: item.type });
    fetchList();
  };

  const exportExcel = async () => {
    const token = localStorage.getItem('access_token');
    const res = await fetch('/api/export/contracts', { headers: { Authorization: `Bearer ${token}` } });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'sozlesmeler.xlsx'; a.click();
    URL.revokeObjectURL(url);
  };

  const createFinance = async (item) => {
    if (!item.amount) { alert('Tutar girilmemiş. Önce sözleşmeyi güncelleyin.'); return; }
    try {
      await apiClient.post('/finance', {
        contractId: item.id, investorId: item.investorId, brandId: item.brandId,
        incomeType: item.type || 'Danışmanlık', amount: item.amount, currency: item.currency,
        description: `${item.name} finans kaydı`, paymentType: 'Peşin', status: 'Açık',
      });
      alert('Finans kaydı oluşturuldu.');
    } catch (err) { alert(err.message || 'Hata'); }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const kpiKartlari = [
    { etiket: 'Toplam sözleşme', deger: kpis?.total ?? '—' },
    { etiket: 'Aktif sözleşme', deger: kpis?.active ?? '—' },
    { etiket: 'Bu ay imzalanan', deger: kpis?.signedThisMonth ?? '—' },
    { etiket: 'Yakında bitecek', deger: kpis?.expiringSoon ?? '—' },
    { etiket: 'Feshedilen', deger: kpis?.terminated ?? '—' },
    { etiket: 'Toplam değer', deger: `${fmt(kpis?.totalValue)} ₺` },
  ];

  const CONT_COLS = [
    { key: 'investor', label: 'Yatırımcı' },
    { key: 'brand', label: 'Marka' },
    { key: 'location', label: 'Lokasyon' },
    { key: 'type', label: 'Tip' },
    { key: 'amount', label: 'Tutar' },
    { key: 'startDate', label: 'Başlangıç' },
    { key: 'endDate', label: 'Bitiş' },
    { key: 'status', label: 'Durum' },
    { key: 'consultant', label: 'Danışman' },
  ];
  const [colVisible, toggleCol] = useColumnVisibility('contracts', Object.fromEntries(CONT_COLS.map((c) => [c.key, true])));

  return (
    <div className="inv-page">
      <div className="module-head" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>Sözleşme Yönetimi</h2>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.9rem' }}>Tüm anlaşmaları hukuki ve finansal olarak takip edin</p>
        </div>
        <div className="header-actions" style={{ flexWrap: 'wrap' }}>
          <ColumnPicker columns={CONT_COLS} visible={colVisible} onChange={toggleCol} />
          <button className="secondary-btn" onClick={exportExcel}>Excel dışa aktar</button>
          <button className="primary-btn" onClick={() => { setForm(defaultForm()); setFormOpen(true); }}>+ Yeni sözleşme</button>
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

      {/* BİTİŞ UYARILARI */}
      {expiryWarnings.length > 0 && (
        <div className="inv-alert inv-alert-warn" style={{ marginBottom: 12 }}>
          <strong>30 gün içinde bitecek sözleşmeler:</strong>{' '}
          {expiryWarnings.map((w) => `${w.name} (${w.end_date})`).join(' • ')}
        </div>
      )}

      {/* FİLTRELER */}
      <div className="inv-filters">
        {[
          ['name', 'Sözleşme adı'],
          ['consultant', 'Danışman'],
          ['amountMin', 'Tutar min'],
          ['amountMax', 'Tutar max'],
          ['startFrom', 'Başlangıç (dan)'],
          ['startTo', 'Başlangıç (a)'],
          ['endFrom', 'Bitiş (dan)'],
          ['endTo', 'Bitiş (a)'],
        ].map(([k, lbl]) => (
          <div key={k} className="field" style={{ margin: 0 }}>
            <label>{lbl}</label>
            <input value={filterDraft[k] || ''} onChange={(e) => setFilterDraft({ ...filterDraft, [k]: e.target.value })} />
          </div>
        ))}
        <div className="field" style={{ margin: 0 }}>
          <label>Sözleşme tipi</label>
          <select value={filterDraft.type} onChange={(e) => setFilterDraft({ ...filterDraft, type: e.target.value })}>
            <option value="">Tümü</option>
            {SOZLESME_TIPLERI.map((t) => <option key={t}>{t}</option>)}
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
          <label>Yatırımcı</label>
          <select value={filterDraft.investorId} onChange={(e) => setFilterDraft({ ...filterDraft, investorId: e.target.value })}>
            <option value="">Tümü</option>
            {lookups.investors.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Marka</label>
          <select value={filterDraft.brandId} onChange={(e) => setFilterDraft({ ...filterDraft, brandId: e.target.value })}>
            <option value="">Tümü</option>
            {lookups.brands.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <button className="primary-btn" onClick={() => { setFilters({ ...filterDraft }); setPage(1); }}>Filtrele</button>
          <button className="secondary-btn" onClick={() => { const d = defaultFilters(); setFilters(d); setFilterDraft(d); setPage(1); }}>Sıfırla</button>
        </div>
      </div>

      {/* FORM ÇEKMECESI */}
      {formOpen && (
        <div className="inv-drawer">
          <div className="inv-modal-head" style={{ borderRadius: '12px 12px 0 0', marginBottom: 0 }}>
            <h3 style={{ margin: 0 }}>{form.id ? 'Sözleşmeyi düzenle' : 'Yeni sözleşme oluştur'}</h3>
            <button className="secondary-btn" onClick={() => { setFormOpen(false); setForm(defaultForm()); }}>Kapat</button>
          </div>
          <form className="inv-form-grid" onSubmit={saveForm} style={{ padding: 16, maxHeight: '72vh', overflowY: 'auto' }}>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Sözleşme adı *</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="field">
              <label>Sözleşme tipi</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {SOZLESME_TIPLERI.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Durum</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {DURUMLAR.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Karşı taraf</label>
              <input value={form.counterparty} onChange={(e) => setForm({ ...form, counterparty: e.target.value })} />
            </div>
            <div className="field">
              <label>Proje</label>
              <select value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
                <option value="">Seçiniz</option>
                {lookups.projects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Yatırımcı</label>
              <select value={form.investorId} onChange={(e) => setForm({ ...form, investorId: e.target.value })}>
                <option value="">Seçiniz</option>
                {lookups.investors.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Marka</label>
              <select value={form.brandId} onChange={(e) => setForm({ ...form, brandId: e.target.value })}>
                <option value="">Seçiniz</option>
                {lookups.brands.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Lokasyon</label>
              <select value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })}>
                <option value="">Seçiniz</option>
                {lookups.locations.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Sorumlu danışman</label>
              <input value={form.consultantName} onChange={(e) => setForm({ ...form, consultantName: e.target.value })} />
            </div>
            <div className="field">
              <label>Hukuk sorumlusu</label>
              <input value={form.legalPerson} onChange={(e) => setForm({ ...form, legalPerson: e.target.value })} />
            </div>
            <div className="field">
              <label>Finans sorumlusu</label>
              <input value={form.financePerson} onChange={(e) => setForm({ ...form, financePerson: e.target.value })} />
            </div>

            <div className="field">
              <label>İmza tarihi</label>
              <input type="date" value={form.signDate} onChange={(e) => setForm({ ...form, signDate: e.target.value })} />
            </div>
            <div className="field">
              <label>Başlangıç tarihi</label>
              <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </div>
            <div className="field">
              <label>Bitiş tarihi</label>
              <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </div>
            <div className="field">
              <label>Yenileme tarihi</label>
              <input type="date" value={form.renewalDate} onChange={(e) => setForm({ ...form, renewalDate: e.target.value })} />
            </div>

            <div className="field">
              <label>Toplam sözleşme bedeli</label>
              <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div className="field">
              <label>Danışmanlık ücreti</label>
              <input type="number" value={form.consultingFee} onChange={(e) => setForm({ ...form, consultingFee: e.target.value })} />
            </div>
            <div className="field">
              <label>Franchise komisyonu</label>
              <input type="number" value={form.franchiseCommission} onChange={(e) => setForm({ ...form, franchiseCommission: e.target.value })} />
            </div>
            <div className="field">
              <label>Franchise komisyon %</label>
              <input type="number" step="0.01" value={form.franchiseCommissionPct} onChange={(e) => setForm({ ...form, franchiseCommissionPct: e.target.value })} />
            </div>
            <div className="field">
              <label>Lokasyon komisyonu</label>
              <input type="number" value={form.locationCommission} onChange={(e) => setForm({ ...form, locationCommission: e.target.value })} />
            </div>
            <div className="field">
              <label>Para birimi</label>
              <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                {PARA_BİRİMLERİ.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Ek gelir kalemleri</label>
              <input value={form.extraIncome} onChange={(e) => setForm({ ...form, extraIncome: e.target.value })} />
            </div>

            <div className="field">
              <label>Risk seviyesi</label>
              <select value={form.riskLevel} onChange={(e) => setForm({ ...form, riskLevel: e.target.value })}>
                {RISK_SEVİYELERİ.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Risk notu</label>
              <input value={form.riskNote} onChange={(e) => setForm({ ...form, riskNote: e.target.value })} />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Notlar</label>
              <textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Sözleşme belgesi / protokol yükle</label>
              <input type="file" multiple onChange={async (e) => {
                const urls = await uploadDocs(e.target.files);
                setForm((f) => ({ ...f, docsUrls: [...(f.docsUrls || []), ...urls] }));
              }} />
              {(form.docsUrls || []).length > 0 && (
                <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: '0.8rem' }}>
                  {form.docsUrls.map((u, i) => <li key={u + i}><a href={u} target="_blank" rel="noreferrer">Belge {i + 1}</a></li>)}
                </ul>
              )}
            </div>
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8 }}>
              <button type="submit" className="primary-btn">Kaydet</button>
              <button type="button" className="secondary-btn" onClick={() => { setFormOpen(false); setForm(defaultForm()); }}>Vazgeç</button>
            </div>
          </form>
        </div>
      )}

      {/* TABLO */}
      <div className="inv-table-wrap">
        <table className="inv-table">
          <thead>
            <tr>
              <th>Sözleşme adı</th>
              {colVisible.investor !== false && <th>Yatırımcı</th>}
              {colVisible.brand !== false && <th>Marka</th>}
              {colVisible.location !== false && <th>Lokasyon</th>}
              {colVisible.type !== false && <th>Tip</th>}
              {colVisible.amount !== false && <th>Tutar</th>}
              {colVisible.startDate !== false && <th>Başlangıç</th>}
              {colVisible.endDate !== false && <th>Bitiş</th>}
              {colVisible.status !== false && <th>Durum</th>}
              {colVisible.consultant !== false && <th>Danışman</th>}
              <th>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={11} style={{ padding: 24, textAlign: 'center' }}>Yükleniyor…</td></tr>}
            {!loading && items.length === 0 && <tr><td colSpan={11} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>Kayıt bulunamadı.</td></tr>}
            {!loading && items.map((item) => (
              <tr key={item.id}>
                <td><strong onClick={() => openDetail(item)} style={{ cursor: 'pointer', color: '#1a5c38', textDecoration: 'underline' }}>{item.name}</strong></td>
                {colVisible.investor !== false && <td>{item.investorName || '—'}</td>}
                {colVisible.brand !== false && <td>{item.brandName || '—'}</td>}
                {colVisible.location !== false && <td>{item.locationName || '—'}</td>}
                {colVisible.type !== false && <td>{item.type || '—'}</td>}
                {colVisible.amount !== false && <td style={{ whiteSpace: 'nowrap' }}>{fmt(item.amount)} {item.currency}</td>}
                {colVisible.startDate !== false && <td style={{ fontSize: 12 }}>{item.startDate || '—'}</td>}
                {colVisible.endDate !== false && <td style={{ fontSize: 12 }}>{item.endDate || '—'}</td>}
                {colVisible.status !== false && <td><span className="badge" style={{ ...Object.fromEntries((durumRengi(item.status)).split(';').filter(Boolean).map((s) => { const [k, v] = s.split(':'); return [k.trim(), v?.trim()]; })) }}>{item.status}</span></td>}
                {colVisible.consultant !== false && <td style={{ fontSize: 12 }}>{item.consultantName || '—'}</td>}
                <td>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    <button className="edit-btn" onClick={() => {
                      setForm({
                        ...defaultForm(), ...item, id: item.id,
                        investorId: item.investorId ? String(item.investorId) : '',
                        brandId: item.brandId ? String(item.brandId) : '',
                        projectId: item.projectId ? String(item.projectId) : '',
                        locationId: item.locationId ? String(item.locationId) : '',
                        amount: item.amount ? String(item.amount) : '',
                        consultingFee: item.consultingFee ? String(item.consultingFee) : '',
                        franchiseCommission: item.franchiseCommission ? String(item.franchiseCommission) : '',
                        franchiseCommissionPct: item.franchiseCommissionPct ? String(item.franchiseCommissionPct) : '',
                        locationCommission: item.locationCommission ? String(item.locationCommission) : '',
                      });
                      setFormOpen(true);
                    }}>Düzenle</button>
                    <button className="secondary-btn" onClick={() => openDetail(item)} style={{ fontSize: '0.75rem', padding: '4px 8px' }}>Detay</button>
                    <button className="secondary-btn" onClick={() => createFinance(item)} style={{ fontSize: '0.75rem', padding: '4px 8px' }}>Finans oluştur</button>
                    {item.fileUrl && <a className="secondary-btn" href={item.fileUrl} target="_blank" rel="noreferrer" style={{ fontSize: '0.75rem', padding: '4px 8px' }}>PDF</a>}
                    <button className="secondary-btn" onClick={() => yenile(item)} style={{ fontSize: '0.75rem', padding: '4px 8px' }}>Yenile</button>
                    <button className="secondary-btn" onClick={() => feshet(item)} style={{ fontSize: '0.75rem', padding: '4px 8px', background: '#fff1f2', color: '#b91c1c' }}>Feshet</button>
                    <button className="secondary-btn" onClick={async () => { if (!confirm('Arşivlensin mi?')) return; await apiClient.put(`/contracts/${item.id}`, { ...item, status: 'Arşiv', type: item.type }); fetchList(); }} style={{ fontSize: '0.75rem', padding: '4px 8px', background: '#fef3c7', color: '#92400e' }}>Arşivle</button>
                    <button className="danger-btn" onClick={async () => { if (!confirm('Silinsin mi?')) return; await apiClient.delete(`/contracts/${item.id}`); fetchList(); }} style={{ fontSize: '0.75rem', padding: '4px 8px' }}>Sil</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* SAYFALAMA */}
      <div className="inv-pagination">
        <button className="secondary-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Önceki</button>
        <span>Sayfa {page} / {totalPages} ({total} kayıt)</span>
        <button className="secondary-btn" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Sonraki</button>
      </div>

      {/* DETAY MODALI */}
      {detail?.contract && (
        <div className="inv-modal-overlay" onClick={() => setDetail(null)}>
          <div className="inv-modal" onClick={(e) => e.stopPropagation()}>
            <div className="inv-modal-head">
              <h3 style={{ margin: 0 }}>{detail.contract.name}</h3>
              <button className="secondary-btn" onClick={() => setDetail(null)}>Kapat</button>
            </div>
            <div className="inv-tabs">
              {[
                ['genel', 'Genel bilgiler'], ['finans', 'Finans bağlantısı'], ['odeme', 'Ödeme planı'],
                ['belgeler', 'Belgeler'], ['projeler', 'Projeler'], ['aktivite', 'Aktivite'], ['notlar', 'Notlar'],
              ].map(([id, lbl]) => (
                <button key={id} className={`inv-tab ${detailTab === id ? 'active' : ''}`} onClick={() => setDetailTab(id)}>{lbl}</button>
              ))}
            </div>
            <div className="inv-modal-body">
              {detailTab === 'genel' && (
                <dl className="inv-dl">
                  <dt>Tip</dt><dd>{detail.contract.type || '—'}</dd>
                  <dt>Durum</dt><dd>{detail.contract.status}</dd>
                  <dt>Karşı taraf</dt><dd>{detail.contract.counterparty || '—'}</dd>
                  <dt>Yatırımcı</dt><dd>{detail.contract.investorName || '—'}</dd>
                  <dt>Marka</dt><dd>{detail.contract.brandName || '—'}</dd>
                  <dt>Proje</dt><dd>{detail.contract.projectName || '—'}</dd>
                  <dt>Lokasyon</dt><dd>{detail.contract.locationName || '—'}</dd>
                  <dt>İmza tarihi</dt><dd>{detail.contract.signDate || '—'}</dd>
                  <dt>Başlangıç</dt><dd>{detail.contract.startDate || '—'}</dd>
                  <dt>Bitiş</dt><dd>{detail.contract.endDate || '—'}</dd>
                  <dt>Yenileme</dt><dd>{detail.contract.renewalDate || '—'}</dd>
                  <dt>Danışman</dt><dd>{detail.contract.consultantName || '—'}</dd>
                  <dt>Hukuk</dt><dd>{detail.contract.legalPerson || '—'}</dd>
                  <dt>Finans</dt><dd>{detail.contract.financePerson || '—'}</dd>
                  <dt>Risk</dt><dd>{detail.contract.riskLevel || '—'} {detail.contract.riskNote ? `– ${detail.contract.riskNote}` : ''}</dd>
                </dl>
              )}
              {detailTab === 'finans' && (
                <div>
                  <dl className="inv-dl" style={{ marginBottom: 16 }}>
                    <dt>Toplam bedel</dt><dd>{fmt(detail.contract.amount)} {detail.contract.currency}</dd>
                    <dt>Danışmanlık</dt><dd>{fmt(detail.contract.consultingFee)} {detail.contract.currency}</dd>
                    <dt>Franchise kom.</dt><dd>{fmt(detail.contract.franchiseCommission)} {detail.contract.currency} ({detail.contract.franchiseCommissionPct || 0}%)</dd>
                    <dt>Lokasyon kom.</dt><dd>{fmt(detail.contract.locationCommission)} {detail.contract.currency}</dd>
                    <dt>Ek gelir</dt><dd>{detail.contract.extraIncome || '—'}</dd>
                  </dl>
                  <h4 style={{ marginBottom: 8 }}>Finans kayıtları</h4>
                  {(detail.financeRecords || []).length === 0 ? (
                    <p style={{ color: '#64748b' }}>Henüz finans kaydı yok.</p>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                      <thead><tr>{['Tür', 'Tutar', 'KDV', 'Net', 'Durum', 'Vade'].map((h) => <th key={h} style={{ textAlign: 'left', padding: '6px 8px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>{h}</th>)}</tr></thead>
                      <tbody>
                        {detail.financeRecords.map((fr) => (
                          <tr key={fr.id}>
                            <td style={{ padding: '6px 8px' }}>{fr.incomeType}</td>
                            <td style={{ padding: '6px 8px' }}>{fmt(fr.amount)}</td>
                            <td style={{ padding: '6px 8px' }}>%{fr.vatPct}</td>
                            <td style={{ padding: '6px 8px' }}>{fmt(fr.netAmount)}</td>
                            <td style={{ padding: '6px 8px' }}><span className="badge">{fr.status}</span></td>
                            <td style={{ padding: '6px 8px' }}>{fr.dueDate || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
              {detailTab === 'odeme' && (
                <p style={{ color: '#64748b' }}>Ödeme planı için Finans sayfasından ilgili kaydı görüntüleyin.</p>
              )}
              {detailTab === 'belgeler' && (
                <ul style={{ paddingLeft: 18 }}>
                  {(detail.contract.docsUrls || []).map((u, i) => (
                    <li key={u + i}><a href={u} target="_blank" rel="noreferrer">Belge {i + 1}</a></li>
                  ))}
                  {detail.contract.fileUrl && <li><a href={detail.contract.fileUrl} target="_blank" rel="noreferrer">Ana sözleşme belgesi</a></li>}
                  {!(detail.contract.docsUrls || []).length && !detail.contract.fileUrl && <li style={{ color: '#64748b' }}>Belge yok.</li>}
                </ul>
              )}
              {detailTab === 'projeler' && (
                <p style={{ color: '#64748b' }}>Proje: {detail.contract.projectName || 'Bağlı proje yok.'}</p>
              )}
              {detailTab === 'aktivite' && <p style={{ color: '#64748b' }}>Aktivite geçmişi log tablosunda tutulmaktadır.</p>}
              {detailTab === 'notlar' && <p style={{ whiteSpace: 'pre-wrap' }}>{detail.contract.notes || 'Not yok.'}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
