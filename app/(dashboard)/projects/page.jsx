'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/apiClient';

const PIPELINES = ['Lead', 'Analiz', 'Marka eşleşmesi', 'Lokasyon çalışması', 'Teklif', 'Sözleşme', 'İnşaat / kurulum', 'Açılış', 'Kapanış'];
const PRIORITIES = ['Düşük', 'Orta', 'Yüksek', 'Kritik'];

export default function ProjectsPage() {
  const [projects, setProjects] = useState([]);
  const [kpis, setKpis] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(12);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list');
  const [kanban, setKanban] = useState({});
  const [detail, setDetail] = useState(null);
  const [detailTab, setDetailTab] = useState('genel');
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkStage, setBulkStage] = useState('');
  const [bulkPriority, setBulkPriority] = useState('');
  const [lookups, setLookups] = useState({ investors: [], brands: [], locations: [] });
  const [filters, setFilters] = useState({ name: '', investorId: '', brandId: '', locationId: '', type: '', stage: '', priority: '', startFrom: '', closeTo: '' });
  const [form, setForm] = useState({
    id: null,
    name: '', type: 'Franchise', investorId: '', brandId: '', locationId: '', estimatedInvestment: '', estimatedRevenue: '',
    owner: '', ownerPerson: '', assignees: '', priority: 'Orta', stage: 'Lead', dueDate: '', startDate: '', closeDate: '', progress: '0',
    riskLevel: 'Orta', description: '', checklist: '', files: []
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      p.set('page', String(page));
      p.set('pageSize', String(pageSize));
      Object.entries(filters).forEach(([k, v]) => { if (v) p.set(k, v); });
      const data = await apiClient.get(`/projects?${p.toString()}`);
      setProjects(data.items || []);
      setTotal(data.total || 0);
      setKpis(data.kpis || null);
      const kb = await apiClient.get('/projects/kanban');
      setKanban(kb || {});
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [filters, page, pageSize]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    Promise.all([
      apiClient.get('/investors?page=1&pageSize=200'),
      apiClient.get('/brands?page=1&pageSize=200'),
      apiClient.get('/locations?page=1&pageSize=200'),
    ]).then(([i, b, l]) => {
      setLookups({
        investors: Array.isArray(i) ? i : i.items || [],
        brands: Array.isArray(b) ? b : b.items || [],
        locations: Array.isArray(l) ? l : l.items || [],
      });
    }).catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        assignees: form.assignees.split(',').map(x => x.trim()).filter(Boolean),
        checklist: form.checklist.split('\n').map(x => x.trim()).filter(Boolean),
        files: form.files || [],
      };
      if (form.id) {
        await apiClient.put(`/projects/${form.id}`, payload);
      } else {
        await apiClient.post('/projects', payload);
      }
      setForm({ id: null, name: '', type: 'Franchise', investorId: '', brandId: '', locationId: '', estimatedInvestment: '', estimatedRevenue: '', owner: '', ownerPerson: '', assignees: '', priority: 'Orta', stage: 'Lead', dueDate: '', startDate: '', closeDate: '', progress: '0', riskLevel: 'Orta', description: '', checklist: '', files: [] });
      fetchData();
    } catch (err) {
      alert('Hata oluştu');
    }
  };

  const handleEdit = (p) => {
    setForm({
      ...p,
      type: p.project_type || p.type || '',
      owner: p.owner_team || p.owner || '',
      assignees: (p.assignees || []).join(', '),
      checklist: (p.checklist || []).join('\n'),
      dueDate: p.due_date ? p.due_date.split('T')[0] : '',
      progress: String(p.progress || 0),
      investorId: p.investorId ? String(p.investorId) : '',
      brandId: p.brandId ? String(p.brandId) : '',
      locationId: p.locationId ? String(p.locationId) : '',
      ownerPerson: p.ownerPerson || '',
      startDate: p.startDate ? String(p.startDate).split('T')[0] : '',
      closeDate: p.closeDate ? String(p.closeDate).split('T')[0] : '',
      estimatedInvestment: p.estimatedInvestment || '',
      estimatedRevenue: p.estimatedRevenue || '',
      riskLevel: p.riskLevel || 'Orta',
      files: p.files || [],
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const runBulk = async () => {
    if (!selectedIds.length) return;
    await apiClient.post('/projects/bulk', { ids: selectedIds, stage: bulkStage || undefined, priority: bulkPriority || undefined });
    setSelectedIds([]);
    setBulkStage('');
    setBulkPriority('');
    fetchData();
  };
  const openDetail = async (p) => {
    const d = await apiClient.get(`/projects/${p.id}/detail`);
    setDetail(d);
    setDetailTab('genel');
  };
  const uploadFiles = async (fileList) => {
    const token = localStorage.getItem('access_token');
    const urls = [];
    for (const file of fileList) {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('moduleName', 'projects');
      const res = await fetch('/api/uploads', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
      if (!res.ok) continue;
      const j = await res.json();
      if (j.file_url) urls.push(j.file_url);
    }
    return urls;
  };
  const exportExcel = async () => {
    const token = localStorage.getItem('access_token');
    const res = await fetch('/api/export/projects', { headers: { Authorization: `Bearer ${token}` } });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'projeler.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="card">Yükleniyor...</div>;

  return (
    <section className="card page-section active inv-page">
      <div className="module-head">
        <h2>Proje & Süreç Takibi</h2>
        <div className="header-actions">
          <button className="secondary-btn" type="button" onClick={() => setView((v) => (v === 'list' ? 'kanban' : 'list'))}>
            {view === 'list' ? 'Kanban görünümü' : 'Liste görünümü'}
          </button>
          <button className="secondary-btn" type="button" onClick={exportExcel}>Excel Dışa Aktar</button>
        </div>
      </div>
      <section className="inv-kpi-grid">
        <article className="inv-kpi-card"><div className="inv-kpi-label">Toplam proje</div><div className="inv-kpi-value">{kpis?.total ?? '—'}</div></article>
        <article className="inv-kpi-card"><div className="inv-kpi-label">Aktif</div><div className="inv-kpi-value">{kpis?.active ?? '—'}</div></article>
        <article className="inv-kpi-card"><div className="inv-kpi-label">Kapanan</div><div className="inv-kpi-value">{kpis?.closed ?? '—'}</div></article>
        <article className="inv-kpi-card"><div className="inv-kpi-label">Bekleyen</div><div className="inv-kpi-value">{kpis?.waiting ?? '—'}</div></article>
        <article className="inv-kpi-card"><div className="inv-kpi-label">Ort. kapanış süresi</div><div className="inv-kpi-value">{Math.round(kpis?.avgCloseDays || 0)} gün</div></article>
        <article className="inv-kpi-card"><div className="inv-kpi-label">Bu ay açılan</div><div className="inv-kpi-value">{kpis?.newThisMonth ?? '—'}</div></article>
      </section>

      <div className="inv-filters">
        {Object.entries(filters).map(([k, v]) => (
          <div className="field" key={k} style={{ margin: 0 }}>
            <label>{k}</label>
            <input value={v} onChange={(e) => setFilters({ ...filters, [k]: e.target.value })} />
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="entry-form">
        <div className="field"><label>Proje Adı</label><input value={form.name} onChange={e => setForm({...form, name: e.target.value})} required /></div>
        <div className="field"><label>Proje Tipi</label><input value={form.type} onChange={e => setForm({...form, type: e.target.value})} placeholder="Franchise, Kiralama vb." required /></div>
        <div className="field"><label>Yatırımcı</label><select value={form.investorId} onChange={(e) => setForm({ ...form, investorId: e.target.value })}><option value="">Seçiniz</option>{lookups.investors.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
        <div className="field"><label>Marka</label><select value={form.brandId} onChange={(e) => setForm({ ...form, brandId: e.target.value })}><option value="">Seçiniz</option>{lookups.brands.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
        <div className="field"><label>Lokasyon</label><select value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })}><option value="">Seçiniz</option>{lookups.locations.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
        <div className="field"><label>Tahmini yatırım</label><input type="number" value={form.estimatedInvestment} onChange={(e) => setForm({ ...form, estimatedInvestment: e.target.value })} /></div>
        <div className="field"><label>Tahmini gelir</label><input type="number" value={form.estimatedRevenue} onChange={(e) => setForm({ ...form, estimatedRevenue: e.target.value })} /></div>
        <div className="field"><label>Sorumlu Ekip</label><input value={form.owner} onChange={e => setForm({...form, owner: e.target.value})} placeholder="Operasyon, Satış vb." required /></div>
        <div className="field"><label>Sorumlu kişi</label><input value={form.ownerPerson} onChange={(e) => setForm({ ...form, ownerPerson: e.target.value })} /></div>
        <div className="field"><label>Sorumlu Kişiler</label><input value={form.assignees} onChange={e => setForm({...form, assignees: e.target.value})} placeholder="Ali, Veli (Virgülle)" /></div>
        <div className="field">
          <label>Öncelik</label>
          <select value={form.priority} onChange={e => setForm({...form, priority: e.target.value})}>{PRIORITIES.map((x) => <option key={x}>{x}</option>)}</select>
        </div>
        <div className="field"><label>İlerleme (%)</label><input type="number" min="0" max="100" value={form.progress} onChange={e => setForm({...form, progress: e.target.value})} /></div>
        <div className="field"><label>Aşama</label><select value={form.stage} onChange={e => setForm({...form, stage: e.target.value})}>{PIPELINES.map((x) => <option key={x}>{x}</option>)}</select></div>
        <div className="field"><label>Başlangıç</label><input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></div>
        <div className="field"><label>Son Tarih</label><input type="date" value={form.dueDate} onChange={e => setForm({...form, dueDate: e.target.value})} required /></div>
        <div className="field"><label>Kapanış</label><input type="date" value={form.closeDate} onChange={(e) => setForm({ ...form, closeDate: e.target.value })} /></div>
        <div className="field"><label>Risk seviyesi</label><input value={form.riskLevel} onChange={(e) => setForm({ ...form, riskLevel: e.target.value })} /></div>
        <div className="field field-wide"><label>Detay Açıklama</label><textarea rows="2" value={form.description} onChange={e => setForm({...form, description: e.target.value})}></textarea></div>
        <div className="field field-wide"><label>Checklist (Her satıra bir adım)</label><textarea rows="3" value={form.checklist} onChange={e => setForm({...form, checklist: e.target.value})} placeholder="Lokasyon onayı&#10;Mimari çizim&#10;Eleman alımı"></textarea></div>
        <div className="field field-wide"><label>Dosya yükleme</label><input type="file" multiple onChange={async (e) => { const urls = await uploadFiles(e.target.files); setForm((f) => ({ ...f, files: [...(f.files || []), ...urls] })); }} /></div>
        <button type="submit" className="primary-btn">{form.id ? 'Projeyi Güncelle' : 'Proje Ekle'}</button>
      </form>

      {selectedIds.length > 0 && (
        <div className="inv-bulk-bar">
          <span>{selectedIds.length} seçili</span>
          <select value={bulkStage} onChange={(e) => setBulkStage(e.target.value)}><option value="">Aşama</option>{PIPELINES.map((x) => <option key={x}>{x}</option>)}</select>
          <select value={bulkPriority} onChange={(e) => setBulkPriority(e.target.value)}><option value="">Öncelik</option>{PRIORITIES.map((x) => <option key={x}>{x}</option>)}</select>
          <button className="primary-btn" onClick={runBulk}>Toplu güncelle</button>
        </div>
      )}

      {view === 'list' && <div className="table-wrap" style={{ marginTop: '20px' }}>
        <table>
          <thead>
            <tr>
              <th><input type="checkbox" checked={projects.length > 0 && selectedIds.length === projects.length} onChange={(e) => setSelectedIds(e.target.checked ? projects.map((x) => x.id) : [])} /></th>
              <th>Proje adı</th><th>Yatırımcı</th><th>Marka</th><th>Lokasyon</th><th>Tip</th><th>Sorumlu</th><th>Aşama</th><th>İlerleme</th><th>Öncelik</th><th>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {projects.map(p => (
              <tr key={p.id}>
                <td><input type="checkbox" checked={selectedIds.includes(p.id)} onChange={() => setSelectedIds((prev) => prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id])} /></td>
                <td><strong>{p.name}</strong><br/><small>{p.dueDate ? new Date(p.dueDate).toLocaleDateString('tr-TR') : ''}</small></td>
                <td>{p.investorName || '-'}</td>
                <td>{p.brandName || '-'}</td>
                <td>{p.locationName || '-'}</td>
                <td>{p.type}</td>
                <td>{p.owner}</td>
                <td>{p.stage}</td>
                <td>
                  <div style={{ width: '100%', backgroundColor: '#eee', borderRadius: '4px', height: '10px' }}>
                    <div style={{ width: `${p.progress}%`, backgroundColor: '#3b82f6', height: '100%', borderRadius: '4px' }}></div>
                  </div>
                  <small>%{p.progress}</small>
                </td>
                <td>{p.priority}</td>
                <td>
                  <button onClick={() => handleEdit(p)} className="edit-btn">Düzenle</button>
                  <button onClick={() => openDetail(p)} className="secondary-btn">Detay</button>
                  <button onClick={async () => { await apiClient.post('/tasks', { note: `Proje görevi: ${p.name}`, status: 'Açık', priority: p.priority || 'Orta', dueDate: p.dueDate || null }); alert('Görev eklendi'); }} className="secondary-btn">Görev ekle</button>
                  <button onClick={async () => { await apiClient.post('/contracts', { note: `Sözleşme kaydı: ${p.name}`, type: 'Proje', status: 'Taslak', brandId: p.brandId || null, investorId: p.investorId || null }); alert('Sözleşme oluşturuldu'); }} className="secondary-btn">Sözleşme</button>
                  <button onClick={async () => { await apiClient.post('/contracts', { note: `Finans kaydı: ${p.name}`, type: 'Finans', status: 'Açık', amount: p.estimatedInvestment || 0, brandId: p.brandId || null, investorId: p.investorId || null }); alert('Finans kaydı oluşturuldu'); }} className="secondary-btn">Finans</button>
                  <button onClick={() => document.getElementById(`project-file-${p.id}`)?.click()} className="secondary-btn">Dosya yükle</button>
                  <input id={`project-file-${p.id}`} type="file" style={{ display: 'none' }} onChange={async (e) => { const urls = await uploadFiles(e.target.files); const updated = [...(p.files || []), ...urls]; await apiClient.put(`/projects/${p.id}`, { ...p, files: updated, type: p.type, owner: p.owner, dueDate: p.dueDate }); fetchData(); }} />
                  <button onClick={async () => { if(confirm('Sil?')) { await apiClient.delete(`/projects/${p.id}`); fetchData(); } }} className="danger-btn">Sil</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>}

      {view === 'kanban' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12, marginTop: 20 }}>
          {PIPELINES.map((stage) => (
            <article key={stage} className="card" style={{ padding: 10 }}>
              <h4 style={{ marginTop: 0 }}>{stage}</h4>
              <p style={{ fontSize: 12, color: '#64748b' }}>{(kanban[stage] || []).length} proje</p>
              <div style={{ display: 'grid', gap: 8 }}>
                {(kanban[stage] || []).map((p) => (
                  <div key={p.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 8 }}>
                    <strong>{p.name}</strong>
                    <div style={{ fontSize: 12, color: '#64748b' }}>%{p.progress} • {p.priority}</div>
                    <div style={{ marginTop: 6, display: 'flex', gap: 4 }}>
                      <button className="secondary-btn" onClick={() => handleEdit(p)}>Düzenle</button>
                      <button className="secondary-btn" onClick={async () => { const idx = PIPELINES.indexOf(stage); if (idx < PIPELINES.length - 1) { await apiClient.put(`/projects/${p.id}`, { ...p, type: p.type, owner: p.owner, dueDate: p.dueDate, stage: PIPELINES[idx + 1] }); fetchData(); } }}>İleri</button>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="inv-pagination"><button className="secondary-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Önceki</button><span>Sayfa {page}/{Math.max(1, Math.ceil(total / pageSize))} ({total})</span><button className="secondary-btn" disabled={page >= Math.max(1, Math.ceil(total / pageSize))} onClick={() => setPage((p) => p + 1)}>Sonraki</button></div>

      {detail?.project && (
        <div className="inv-modal-overlay" onClick={() => setDetail(null)}>
          <div className="inv-modal" onClick={(e) => e.stopPropagation()}>
            <div className="inv-modal-head"><h3>{detail.project.name}</h3><button className="secondary-btn" onClick={() => setDetail(null)}>Kapat</button></div>
            <div className="inv-tabs">{[['genel', 'Genel bilgiler'], ['surec', 'Süreç / pipeline'], ['gorev', 'Görevler'], ['soz', 'Sözleşmeler'], ['finans', 'Finans'], ['dosya', 'Dosyalar'], ['aktivite', 'Aktivite geçmişi'], ['risk', 'Riskler']].map(([id, l]) => <button key={id} className={`inv-tab ${detailTab === id ? 'active' : ''}`} onClick={() => setDetailTab(id)}>{l}</button>)}</div>
            <div className="inv-modal-body">
              {detailTab === 'genel' && <dl className="inv-dl"><dt>Tip</dt><dd>{detail.project.type}</dd><dt>Sorumlu ekip</dt><dd>{detail.project.owner}</dd><dt>Sorumlu kişi</dt><dd>{detail.project.ownerPerson || '-'}</dd><dt>Yatırım</dt><dd>{detail.project.estimatedInvestment || '-'}</dd><dt>Gelir</dt><dd>{detail.project.estimatedRevenue || '-'}</dd></dl>}
              {detailTab === 'surec' && <dl className="inv-dl"><dt>Aşama</dt><dd>{detail.project.stage}</dd><dt>İlerleme</dt><dd>%{detail.project.progress}</dd><dt>Başlangıç</dt><dd>{detail.project.startDate || '-'}</dd><dt>Hedef kapanış</dt><dd>{detail.project.dueDate || '-'}</dd><dt>Kapanış</dt><dd>{detail.project.closeDate || '-'}</dd></dl>}
              {detailTab === 'gorev' && <ul>{(detail.tasks || []).map((t) => <li key={t.id}>{t.note} - {t.status} ({t.dueDate || '-'})</li>)}</ul>}
              {detailTab === 'soz' && <ul>{(detail.contracts || []).map((c) => <li key={c.id}>{c.note} - {c.status}</li>)}</ul>}
              {detailTab === 'finans' && <p>Tahmini yatırım: {detail.project.estimatedInvestment || 0} / Tahmini gelir: {detail.project.estimatedRevenue || 0}</p>}
              {detailTab === 'dosya' && <ul>{(detail.project.files || []).map((f) => <li key={f}><a href={f} target="_blank" rel="noreferrer">{f}</a></li>)}</ul>}
              {detailTab === 'aktivite' && <p>Aktivite geçmişi bu kaydın loglarıyla entegrelenebilir.</p>}
              {detailTab === 'risk' && <p>Risk seviyesi: {detail.project.riskLevel || '-'}</p>}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
