'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/apiClient';
import citiesData from '@/lib/tr-cities-districts.json';

const LOCATION_TYPES = ['AVM', 'Cadde', 'Plaza', 'Sanayi', 'Turistik'];
const POTENTIALS = ['Düşük', 'Orta', 'Yüksek', 'Premium'];
const STATUSES = ['Boş', 'Dolu', 'Görüşmede', 'Kiralandı'];
const SEGMENTS = ['A+', 'A', 'B', 'C'];

const defaultFilters = () => ({
  name: '', city: '', district: '', region: '', type: '', sqmMin: '', sqmMax: '', rentMin: '', rentMax: '', potential: '', status: '', brandFit: '', footfall: '', segment: '',
});

const defaultForm = () => ({
  id: null, name: '', avenueName: '', city: '', district: '', address: '', mapsLink: '', type: 'Cadde', segment: 'A', sqm: '', storefrontLength: '', floorInfo: '', chimneyStatus: '', infrastructureStatus: '',
  rent: '', revenueRentPct: '', dues: '', deposit: '', footfallScore: '', competitorBrands: '', targetCustomerProfile: '', suitableSectors: '', recommendedBrands: [], potential: 'Orta', status: 'Boş',
  brandFitScore: '', traffic: '', streetClass: '', avmSegment: '', notes: '', files: [], currency: 'TRY',
});

export default function LocationsPage() {
  const [items, setItems] = useState([]);
  const [kpis, setKpis] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(12);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(defaultFilters);
  const [filterDraft, setFilterDraft] = useState(defaultFilters);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkPotential, setBulkPotential] = useState('');
  const [form, setForm] = useState(defaultForm());
  const [formOpen, setFormOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailTab, setDetailTab] = useState('genel');
  const [listMode, setListMode] = useState('list');

  const buildQuery = useCallback(() => {
    const p = new URLSearchParams();
    p.set('page', String(page));
    p.set('pageSize', String(pageSize));
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== '' && v !== null && v !== undefined) p.set(k, String(v));
    });
    return p.toString();
  }, [filters, page, pageSize]);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient.get(`/locations?${buildQuery()}`);
      setItems(data.items || []);
      setTotal(data.total || 0);
      setKpis(data.kpis || null);
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);
  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const saveForm = async (e) => {
    e.preventDefault();
    if (form.id) await apiClient.put(`/locations/${form.id}`, form);
    else await apiClient.post('/locations', form);
    setForm(defaultForm());
    setFormOpen(false);
    fetchList();
  };
  const openDetail = async (loc) => {
    const d = await apiClient.get(`/locations/${loc.id}/detail`);
    setDetail(d);
    setDetailTab('genel');
  };
  const runBulk = async () => {
    if (!selectedIds.length) return;
    await apiClient.post('/locations/bulk', { ids: selectedIds, status: bulkStatus || undefined, potential: bulkPotential || undefined });
    setSelectedIds([]);
    setBulkStatus('');
    setBulkPotential('');
    fetchList();
  };
  const exportExcel = async () => {
    const token = localStorage.getItem('access_token');
    const res = await fetch('/api/export/locations', { headers: { Authorization: `Bearer ${token}` } });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lokasyonlar.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  };
  const uploadFiles = async (fileList) => {
    const token = localStorage.getItem('access_token');
    const urls = [];
    for (const file of fileList) {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('moduleName', 'locations');
      const res = await fetch('/api/uploads', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
      if (!res.ok) continue;
      const j = await res.json();
      if (j.file_url) urls.push(j.file_url);
    }
    return urls;
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="inv-page">
      <div className="module-head">
        <h2>Lokasyon Yönetimi</h2>
        <div className="header-actions">
          <button className="secondary-btn" onClick={() => setListMode((m) => (m === 'list' ? 'map' : 'list'))}>Harita + Liste: {listMode === 'list' ? 'Liste' : 'Harita'}</button>
          <button className="secondary-btn" onClick={exportExcel}>Excel dışa aktar</button>
          <button className="primary-btn" onClick={() => { setForm(defaultForm()); setFormOpen(true); }}>+ Yeni lokasyon</button>
        </div>
      </div>

      <section className="inv-kpi-grid">
        <article className="inv-kpi-card"><div className="inv-kpi-label">Toplam</div><div className="inv-kpi-value">{kpis?.total ?? '—'}</div></article>
        <article className="inv-kpi-card"><div className="inv-kpi-label">Aktif</div><div className="inv-kpi-value">{kpis?.active ?? '—'}</div></article>
        <article className="inv-kpi-card"><div className="inv-kpi-label">Boş</div><div className="inv-kpi-value">{kpis?.empty ?? '—'}</div></article>
        <article className="inv-kpi-card"><div className="inv-kpi-label">Yüksek potansiyel</div><div className="inv-kpi-value">{kpis?.highPotential ?? '—'}</div></article>
        <article className="inv-kpi-card"><div className="inv-kpi-label">Ortalama kira</div><div className="inv-kpi-value">{Number(kpis?.avgRent || 0).toLocaleString('tr-TR')} ₺</div></article>
        <article className="inv-kpi-card"><div className="inv-kpi-label">Bu ay eklenen</div><div className="inv-kpi-value">{kpis?.newThisMonth ?? '—'}</div></article>
      </section>

      <div className="inv-filters">
        <div className="field" style={{ margin: 0 }}>
          <label>Lokasyon adı</label>
          <input value={filterDraft.name} onChange={(e) => setFilterDraft({ ...filterDraft, name: e.target.value })} placeholder="Ara…" />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Şehir</label>
          <input value={filterDraft.city} onChange={(e) => setFilterDraft({ ...filterDraft, city: e.target.value })} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>İlçe</label>
          <input value={filterDraft.district} onChange={(e) => setFilterDraft({ ...filterDraft, district: e.target.value })} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Bölge</label>
          <input value={filterDraft.region} onChange={(e) => setFilterDraft({ ...filterDraft, region: e.target.value })} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Lokasyon tipi</label>
          <select value={filterDraft.type} onChange={(e) => setFilterDraft({ ...filterDraft, type: e.target.value })}>
            <option value="">Tümü</option>
            {LOCATION_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Durum</label>
          <select value={filterDraft.status} onChange={(e) => setFilterDraft({ ...filterDraft, status: e.target.value })}>
            <option value="">Tümü</option>
            {STATUSES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Potansiyel</label>
          <select value={filterDraft.potential} onChange={(e) => setFilterDraft({ ...filterDraft, potential: e.target.value })}>
            <option value="">Tümü</option>
            {POTENTIALS.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Segment</label>
          <select value={filterDraft.segment} onChange={(e) => setFilterDraft({ ...filterDraft, segment: e.target.value })}>
            <option value="">Tümü</option>
            {SEGMENTS.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>m² (min)</label>
          <input type="number" value={filterDraft.sqmMin} onChange={(e) => setFilterDraft({ ...filterDraft, sqmMin: e.target.value })} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>m² (max)</label>
          <input type="number" value={filterDraft.sqmMax} onChange={(e) => setFilterDraft({ ...filterDraft, sqmMax: e.target.value })} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Kira (min)</label>
          <input type="number" value={filterDraft.rentMin} onChange={(e) => setFilterDraft({ ...filterDraft, rentMin: e.target.value })} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Kira (max)</label>
          <input type="number" value={filterDraft.rentMax} onChange={(e) => setFilterDraft({ ...filterDraft, rentMax: e.target.value })} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Marka uyumu (min)</label>
          <input type="number" min={0} max={100} value={filterDraft.brandFit} onChange={(e) => setFilterDraft({ ...filterDraft, brandFit: e.target.value })} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Yoğunluk (min)</label>
          <input type="number" min={1} max={10} value={filterDraft.footfall} onChange={(e) => setFilterDraft({ ...filterDraft, footfall: e.target.value })} />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <button className="primary-btn" onClick={() => { setFilters({ ...filterDraft }); setPage(1); }}>Ara</button>
          <button className="secondary-btn" onClick={() => { const d = defaultFilters(); setFilters(d); setFilterDraft(d); setPage(1); }}>Sıfırla</button>
        </div>
      </div>

      {selectedIds.length > 0 && (
        <div className="inv-bulk-bar">
          <span>{selectedIds.length} seçili</span>
          <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}><option value="">Durum</option>{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
          <select value={bulkPotential} onChange={(e) => setBulkPotential(e.target.value)}><option value="">Potansiyel</option>{POTENTIALS.map((s) => <option key={s} value={s}>{s}</option>)}</select>
          <button className="primary-btn" onClick={runBulk}>Toplu güncelle</button>
        </div>
      )}

      {formOpen && (
        <div className="inv-drawer">
          <h3>{form.id ? 'Lokasyon düzenle' : 'Yeni lokasyon'}</h3>
          <form className="inv-form-grid" onSubmit={saveForm}>
            <div className="field"><label>Lokasyon adı</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
            <div className="field"><label>AVM/Cadde adı</label><input value={form.avenueName} onChange={(e) => setForm({ ...form, avenueName: e.target.value })} /></div>
            <div className="field">
              <label>Şehir</label>
              <select value={form.city ? form.city.toUpperCase() : ''} onChange={(e) => setForm({ ...form, city: e.target.value, district: '' })}>
                <option value="">Seçin</option>
                {citiesData.city.map((c) => (
                  <option key={c.name} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>İlçe</label>
              <select value={form.district ? form.district.toUpperCase() : ''} onChange={(e) => setForm({ ...form, district: e.target.value })} disabled={!form.city}>
                <option value="">{form.city ? 'Seçin' : 'Önce il seçin'}</option>
                {citiesData.city.find((c) => c.name.toLowerCase() === (form.city || '').toLowerCase())?.discrits.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}><label>Açık adres</label><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <div className="field"><label>Google Maps</label><input value={form.mapsLink} onChange={(e) => setForm({ ...form, mapsLink: e.target.value })} /></div>
            <div className="field"><label>Tip</label><select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{LOCATION_TYPES.map((s) => <option key={s}>{s}</option>)}</select></div>
            <div className="field"><label>Segment</label><select value={form.segment} onChange={(e) => setForm({ ...form, segment: e.target.value })}>{SEGMENTS.map((s) => <option key={s}>{s}</option>)}</select></div>
            <div className="field"><label>m²</label><input type="number" value={form.sqm} onChange={(e) => setForm({ ...form, sqm: e.target.value })} /></div>
            <div className="field"><label>Kira</label><input type="number" value={form.rent} onChange={(e) => setForm({ ...form, rent: e.target.value })} /></div>
            <div className="field"><label>Footfall (1-10)</label><input type="number" min={1} max={10} value={form.footfallScore} onChange={(e) => setForm({ ...form, footfallScore: e.target.value })} /></div>
            <div className="field"><label>Potansiyel</label><select value={form.potential} onChange={(e) => setForm({ ...form, potential: e.target.value })}>{POTENTIALS.map((s) => <option key={s}>{s}</option>)}</select></div>
            <div className="field"><label>Durum</label><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></div>
            <div className="field"><label>Uygun markalar</label><input value={(form.recommendedBrands || []).join(',')} onChange={(e) => setForm({ ...form, recommendedBrands: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} /></div>
            <div className="field" style={{ gridColumn: '1 / -1' }}><label>Notlar</label><textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Görsel / PDF / Ekspertiz belgesi yükle</label>
              <input type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" onChange={async (e) => { const urls = await uploadFiles(e.target.files); setForm((f) => ({ ...f, files: [...(f.files || []), ...urls] })); }} />
              {(form.files || []).length > 0 && (
                <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {form.files.map((u, i) => (
                    <span key={u + i} style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#f1f5f9', padding: '3px 8px', borderRadius: 6, fontSize: '0.78rem' }}>
                      <a href={u} target="_blank" rel="noreferrer" style={{ color: '#166534' }}>
                        {u.match(/\.(jpg|jpeg|png|webp|gif)$/i) ? 'Görsel' : 'Belge'} {i + 1}
                      </a>
                      <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c', fontSize: '0.8rem', padding: 0 }} onClick={() => setForm((f) => ({ ...f, files: f.files.filter((_, idx) => idx !== i) }))}>×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8 }}>
              <button className="primary-btn" type="submit">Kaydet</button>
              <button className="secondary-btn" type="button" onClick={() => { setFormOpen(false); setForm(defaultForm()); }}>Kapat</button>
            </div>
          </form>
        </div>
      )}

      {listMode === 'map' && (
        <div className="inv-alert">
          <strong>Harita entegrasyonu:</strong> Bu kayıt için <a href={(detail?.location?.mapsLink || items[0]?.mapsLink || 'https://maps.google.com')} target="_blank" rel="noreferrer">Google Maps'te aç</a>. Pinleme ve yakındaki rakipler, maps linki üzerinden kullanılabilir.
        </div>
      )}

      <div className="inv-table-wrap">
        <table className="inv-table">
          <thead><tr><th><input type="checkbox" checked={items.length > 0 && selectedIds.length === items.length} onChange={(e) => setSelectedIds(e.target.checked ? items.map((x) => x.id) : [])} /></th><th>Lokasyon</th><th>Şehir/İlçe</th><th>Tip</th><th>m²</th><th>Kira</th><th>Segment</th><th>Potansiyel</th><th>Durum</th><th>Uygun marka</th><th>İşlem</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={11}>Yükleniyor...</td></tr>}
            {!loading && items.map((loc) => (
              <tr key={loc.id}>
                <td><input type="checkbox" checked={selectedIds.includes(loc.id)} onChange={() => setSelectedIds((p) => p.includes(loc.id) ? p.filter((x) => x !== loc.id) : [...p, loc.id])} /></td>
                <td>{loc.name}</td><td>{loc.city || '-'} / {loc.district || '-'}</td><td>{loc.type}</td><td>{loc.sqm}</td><td>{Number(loc.rent || 0).toLocaleString('tr-TR')} {loc.currency}</td><td>{loc.segment || '-'}</td><td>{loc.potential}</td><td>{loc.status}</td><td>{(loc.recommendedBrands || []).length}</td>
                <td>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    <button className="edit-btn" onClick={() => { setForm({ ...defaultForm(), ...loc, files: loc.files || [] }); setFormOpen(true); }}>Düzenle</button>
                    <button className="secondary-btn" onClick={() => openDetail(loc)}>Detay</button>
                    {loc.mapsLink && <a className="secondary-btn" href={loc.mapsLink} target="_blank" rel="noreferrer" style={{ fontSize: '0.75rem', padding: '4px 8px' }}>Harita</a>}
                    <button className="secondary-btn" style={{ fontSize: '0.75rem', padding: '4px 8px' }} onClick={() => { window.location.href = '/matching'; }}>Eşleştir</button>
                    <button className="secondary-btn" style={{ fontSize: '0.75rem', padding: '4px 8px' }} onClick={async () => { await apiClient.post('/projects', { name: `${loc.name} projesi`, type: 'Kiralama', owner: 'Saha', stage: 'Lead', dueDate: new Date(Date.now() + 864000000).toISOString().split('T')[0], locationId: loc.id, progress: 0, assignees: [], checklist: [] }); fetchList(); }}>Proje oluştur</button>
                    <button className="secondary-btn" style={{ fontSize: '0.75rem', padding: '4px 8px', background: '#fef3c7', color: '#92400e' }} onClick={async () => { if (!confirm('Arşivlensin mi?')) return; await apiClient.put(`/locations/${loc.id}`, { ...loc, status: 'Arşiv' }); fetchList(); }}>Arşivle</button>
                    <button className="danger-btn" style={{ fontSize: '0.75rem', padding: '4px 8px' }} onClick={async () => { if (!confirm('Silinsin mi?')) return; await apiClient.delete(`/locations/${loc.id}`); fetchList(); }}>Sil</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="inv-pagination"><button className="secondary-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Önceki</button><span>Sayfa {page}/{totalPages} ({total})</span><button className="secondary-btn" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Sonraki</button></div>

      {detail?.location && (
        <div className="inv-modal-overlay" onClick={() => setDetail(null)}>
          <div className="inv-modal" onClick={(e) => e.stopPropagation()}>
            <div className="inv-modal-head"><h3>{detail.location.name}</h3><button className="secondary-btn" onClick={() => setDetail(null)}>Kapat</button></div>
            <div className="inv-tabs">{[['genel', 'Genel bilgiler'], ['teknik', 'Teknik bilgiler'], ['finans', 'Finansal bilgiler'], ['gorsel', 'Görseller'], ['marka', 'Uygun markalar'], ['yatirimci', 'Eşleşen yatırımcılar'], ['proje', 'Aktif projeler'], ['gorusme', 'Görüşme geçmişi'], ['not', 'Notlar']].map(([id, l]) => <button key={id} className={`inv-tab ${detailTab === id ? 'active' : ''}`} onClick={() => setDetailTab(id)}>{l}</button>)}</div>
            <div className="inv-modal-body">
              {detailTab === 'genel' && <dl className="inv-dl"><dt>Adres</dt><dd>{detail.location.address || '-'}</dd><dt>Şehir</dt><dd>{detail.location.city || '-'}</dd><dt>Tip</dt><dd>{detail.location.type}</dd><dt>Durum</dt><dd>{detail.location.status}</dd></dl>}
              {detailTab === 'teknik' && <dl className="inv-dl"><dt>m²</dt><dd>{detail.location.sqm}</dd><dt>Cephe</dt><dd>{detail.location.storefrontLength || '-'}</dd><dt>Kat</dt><dd>{detail.location.floorInfo || '-'}</dd><dt>Baca</dt><dd>{detail.location.chimneyStatus || '-'}</dd><dt>Altyapı</dt><dd>{detail.location.infrastructureStatus || '-'}</dd></dl>}
              {detailTab === 'finans' && <dl className="inv-dl"><dt>Kira</dt><dd>{detail.location.rent}</dd><dt>Ciro kirası %</dt><dd>{detail.location.revenueRentPct || '-'}</dd><dt>Aidat</dt><dd>{detail.location.dues || '-'}</dd><dt>Depozito</dt><dd>{detail.location.deposit || '-'}</dd></dl>}
              {detailTab === 'gorsel' && <ul>{(detail.location.files || []).map((f) => <li key={f}><a href={f} target="_blank" rel="noreferrer">{f}</a></li>)}</ul>}
              {detailTab === 'marka' && <ul>{(detail.location.recommendedBrands || []).map((b) => <li key={b}>{b}</li>)}</ul>}
              {detailTab === 'yatirimci' && <ul>{(detail.investors || []).map((i) => <li key={i.id}>{i.name}</li>)}</ul>}
              {detailTab === 'proje' && <ul>{(detail.projects || []).map((p) => <li key={p.id}>{p.name} - {p.stage}</li>)}</ul>}
              {detailTab === 'gorusme' && <p>Lokasyon görüşme geçmişi için Timeline modülü ile entegre edilebilir.</p>}
              {detailTab === 'not' && <p>{detail.location.notes || 'Not yok.'}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
