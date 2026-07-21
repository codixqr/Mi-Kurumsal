'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/apiClient';
import { useAuth } from '@/lib/AuthContext';

const PRIORITIES = ['Çok Yüksek', 'Yüksek', 'Orta', 'Düşük'];
const STATUSES = ['Açık', 'Devam Ediyor', 'Tamamlandı', 'İptal'];
const MODULE_TYPES = ['Genel', 'Yatırımcı', 'Marka', 'Lokasyon', 'Proje', 'Sözleşme'];

const PRIORITY_COLOR = {
  'Çok Yüksek': '#dc2626', 'Yüksek': '#ea580c', 'Orta': '#d97706', 'Düşük': '#64748b'
};
const STATUS_COLOR = {
  'Açık': '#2563eb', 'Devam Ediyor': '#7c3aed', 'Tamamlandı': '#16a34a', 'İptal': '#9ca3af'
};

const emptyForm = () => ({
  id: null, title: '', description: '', status: 'Açık', priority: 'Orta',
  assigneeName: '', dueDate: '', moduleType: 'Genel',
  investorId: '', brandId: '', projectId: '', locationId: '', contractId: '',
  tags: '',
});

const fmt = (d) => d ? new Date(d).toLocaleDateString('tr-TR') : '-';
const isOverdue = (t) => t.status !== 'Tamamlandı' && t.dueDate && new Date(t.dueDate) < new Date(new Date().toISOString().split('T')[0]);

export default function TasksPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'manager';

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [kpis, setKpis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState('table'); // 'table' | 'board'
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const [filters, setFilters] = useState({ q: '', status: '', priority: '', moduleType: '', assigneeName: '', dateFrom: '', dateTo: '', overdue: '' });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState([]);
  const [detailTask, setDetailTask] = useState(null);

  // Linked data for dropdowns
  const [investors, setInvestors] = useState([]);
  const [brands, setBrands] = useState([]);
  const [projects, setProjects] = useState([]);
  const [locations, setLocations] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);

  const loadLinkedData = useCallback(async () => {
    try {
      const [i, b, p, l, c, tm] = await Promise.all([
        apiClient.get('/investors?pageSize=200').catch(() => ({ items: [] })),
        apiClient.get('/brands?pageSize=200').catch(() => ({ items: [] })),
        apiClient.get('/projects?pageSize=200').catch(() => ({ items: [] })),
        apiClient.get('/locations?pageSize=200').catch(() => ({ items: [] })),
        apiClient.get('/contracts?pageSize=200').catch(() => ({ items: [] })),
        apiClient.get('/team').catch(() => []),
      ]);
      setInvestors(Array.isArray(i) ? i : i.items || []);
      setBrands(Array.isArray(b) ? b : b.items || []);
      setProjects(Array.isArray(p) ? p : p.items || []);
      setLocations(Array.isArray(l) ? l : l.items || []);
      setContracts(Array.isArray(c) ? c : c.items || []);
      setTeamMembers(Array.isArray(tm) ? tm : []);
    } catch (_) {}
  }, []);

  const buildQuery = useCallback(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    Object.entries(filters).forEach(([k, v]) => { if (v) p.set(k, v); });
    return p.toString();
  }, [filters, page]);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const [data, kpiData] = await Promise.all([
        apiClient.get(`/tasks?${buildQuery()}`),
        apiClient.get('/tasks/kpis').catch(() => null),
      ]);
      setItems(data.items || []);
      setTotal(data.total || 0);
      if (kpiData) setKpis(kpiData);
    } catch (e) {
      console.error(e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => { fetchList(); }, [fetchList]);
  useEffect(() => { loadLinkedData(); }, [loadLinkedData]);

  const openNew = () => { setForm(emptyForm()); setShowForm(true); };
  const openEdit = (t) => {
    setForm({
      id: t.id, title: t.title || t.note || '', description: t.description || '',
      status: t.status, priority: t.priority, assigneeName: t.assigneeName || '',
      dueDate: t.dueDate || '', moduleType: t.moduleType || 'Genel',
      investorId: t.investorId || '', brandId: t.brandId || '',
      projectId: t.projectId || '', locationId: t.locationId || '', contractId: t.contractId || '',
      tags: (t.tags || []).join(', '),
    });
    setShowForm(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const payload = {
        title: form.title, description: form.description, status: form.status,
        priority: form.priority, assigneeName: form.assigneeName, dueDate: form.dueDate || null,
        moduleType: form.moduleType,
        investorId: form.investorId ? Number(form.investorId) : null,
        brandId: form.brandId ? Number(form.brandId) : null,
        projectId: form.projectId ? Number(form.projectId) : null,
        locationId: form.locationId ? Number(form.locationId) : null,
        contractId: form.contractId ? Number(form.contractId) : null,
        tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      };
      if (form.id) await apiClient.put(`/tasks/${form.id}`, payload);
      else await apiClient.post('/tasks', payload);
      setShowForm(false);
      fetchList();
    } finally { setSaving(false); }
  };

  const handleQuickStatus = async (task, newStatus) => {
    try {
      await apiClient.put(`/tasks/${task.id}`, { ...task, title: task.title, status: newStatus });
      fetchList();
    } catch (_) {}
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Bu görevi silmek istediğinizden emin misiniz?')) return;
    try { await apiClient.delete(`/tasks/${id}`); fetchList(); } catch (_) {}
  };

  const handleBulkStatus = async (newStatus) => {
    if (!selected.length) return;
    await Promise.all(selected.map(id => {
      const t = items.find(x => x.id === id);
      if (!t) return Promise.resolve();
      return apiClient.put(`/tasks/${id}`, { ...t, title: t.title, status: newStatus }).catch(() => {});
    }));
    setSelected([]);
    fetchList();
  };

  const toggleSelect = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const toggleAll = () => setSelected(selected.length === items.length ? [] : items.map(x => x.id));

  const applyFilters = () => { setPage(1); fetchList(); };
  const resetFilters = () => { setFilters({ q: '', status: '', priority: '', moduleType: '', assigneeName: '', dateFrom: '', dateTo: '', overdue: '' }); setPage(1); };

  // Board columns
  const boardCols = [
    { key: 'Açık', label: 'Açık', color: '#2563eb' },
    { key: 'Devam Ediyor', label: 'Devam Ediyor', color: '#7c3aed' },
    { key: 'Tamamlandı', label: 'Tamamlandı', color: '#16a34a' },
    { key: 'İptal', label: 'İptal', color: '#9ca3af' },
  ];

  const getLinkedName = (task) => {
    if (task.projectName) return `Proje: ${task.projectName}`;
    if (task.investorName) return `Yatırımcı: ${task.investorName}`;
    if (task.contractName) return `Sözleşme: ${task.contractName}`;
    if (task.locationName) return `Lokasyon: ${task.locationName}`;
    if (task.brandName) return `Marka: ${task.brandName}`;
    return task.moduleType !== 'Genel' ? task.moduleType : '';
  };

  return (
    <section className="card page-section active">
      <div className="module-head">
        <div>
          <h2>Görev Yönetimi</h2>
          <p>Ekip görevlerini oluştur, takip et ve yönet. Modüllere bağlı görevler ile süreç kontrolü sağla.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={`secondary-btn${view === 'table' ? ' active' : ''}`} onClick={() => setView('table')}>Tablo</button>
          <button className={`secondary-btn${view === 'board' ? ' active' : ''}`} onClick={() => setView('board')}>Tahta</button>
          <button className="primary-btn" onClick={openNew}>+ Yeni Görev</button>
        </div>
      </div>

      {/* KPI Cards */}
      {kpis && (
        <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 16 }}>
          <div className="kpi-card">
            <div className="kpi-value">{kpis.total}</div>
            <div className="kpi-label">Toplam Görev</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-value" style={{ color: '#2563eb' }}>{kpis.open}</div>
            <div className="kpi-label">Açık</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-value" style={{ color: '#7c3aed' }}>{kpis.inProgress}</div>
            <div className="kpi-label">Devam Ediyor</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-value" style={{ color: '#16a34a' }}>{kpis.done}</div>
            <div className="kpi-label">Tamamlandı</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-value" style={{ color: '#dc2626' }}>{kpis.overdue}</div>
            <div className="kpi-label">Gecikmiş</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-value" style={{ color: '#d97706' }}>{kpis.thisWeek}</div>
            <div className="kpi-label">Bu Hafta</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-value" style={{ color: '#dc2626' }}>{kpis.critical}</div>
            <div className="kpi-label">Kritik</div>
          </div>
        </div>
      )}

      {/* Overdue warning */}
      {kpis?.overdue > 0 && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 16px', marginBottom: 14, color: '#dc2626', fontWeight: 600 }}>
          {kpis.overdue} gecikmiş görev bulunuyor. Son tarihi geçmiş görevleri kontrol edin.
        </div>
      )}

      {/* Filters */}
      <div className="filter-bar" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'flex-end' }}>
        <div className="field" style={{ minWidth: 180 }}>
          <label>Ara</label>
          <input placeholder="Görev başlığı, açıklama..." value={filters.q} onChange={e => setFilters(f => ({ ...f, q: e.target.value }))} />
        </div>
        <div className="field">
          <label>Durum</label>
          <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
            <option value="">Tümü</option>
            {STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Öncelik</label>
          <select value={filters.priority} onChange={e => setFilters(f => ({ ...f, priority: e.target.value }))}>
            <option value="">Tümü</option>
            {PRIORITIES.map(p => <option key={p}>{p}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Modül</label>
          <select value={filters.moduleType} onChange={e => setFilters(f => ({ ...f, moduleType: e.target.value }))}>
            <option value="">Tümü</option>
            {MODULE_TYPES.map(m => <option key={m}>{m}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Atanan</label>
          <input placeholder="Kişi adı" value={filters.assigneeName} onChange={e => setFilters(f => ({ ...f, assigneeName: e.target.value }))} />
        </div>
        <div className="field">
          <label>Başlangıç Tarihi</label>
          <input type="date" value={filters.dateFrom} onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))} />
        </div>
        <div className="field">
          <label>Bitiş Tarihi</label>
          <input type="date" value={filters.dateTo} onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))} />
        </div>
        <div className="field">
          <label>Gecikmiş</label>
          <select value={filters.overdue} onChange={e => setFilters(f => ({ ...f, overdue: e.target.value }))}>
            <option value="">Hepsi</option>
            <option value="true">Sadece Gecikmiş</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: 6, alignSelf: 'flex-end' }}>
          <button className="primary-btn" onClick={applyFilters}>Ara</button>
          <button className="secondary-btn" onClick={resetFilters}>Sıfırla</button>
        </div>
      </div>

      {/* Bulk actions */}
      {selected.length > 0 && (
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 16px', marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontWeight: 600, color: '#1d4ed8' }}>{selected.length} görev seçildi</span>
          <button className="secondary-btn" onClick={() => handleBulkStatus('Devam Ediyor')}>Devam Ediyora Al</button>
          <button className="secondary-btn" style={{ color: '#16a34a' }} onClick={() => handleBulkStatus('Tamamlandı')}>Tamamlandı Yap</button>
          <button className="danger-btn" onClick={() => setSelected([])}>Seçimi Kaldır</button>
        </div>
      )}

      {/* TABLE VIEW */}
      {view === 'table' && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input type="checkbox" checked={selected.length === items.length && items.length > 0} onChange={toggleAll} />
                </th>
                <th>Görev Başlığı</th>
                <th>Modül / Bağlantı</th>
                <th>Öncelik</th>
                <th>Durum</th>
                <th>Atanan</th>
                <th>Son Tarih</th>
                <th>İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32, color: '#94a3b8' }}>Yükleniyor...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32, color: '#94a3b8' }}>Görev bulunamadı.</td></tr>
              ) : items.map(task => (
                <tr key={task.id} style={{ background: isOverdue(task) ? '#fff1f2' : undefined }}>
                  <td>
                    <input type="checkbox" checked={selected.includes(task.id)} onChange={() => toggleSelect(task.id)} />
                  </td>
                  <td>
                    <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: 2 }}>
                      {isOverdue(task) && <span style={{ color: '#dc2626', marginRight: 4, fontSize: '0.8rem' }}>GECİKMİŞ</span>}
                      {task.title || task.note}
                    </div>
                    {task.description && <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{task.description.substring(0, 60)}{task.description.length > 60 ? '...' : ''}</div>}
                    {task.tags?.length > 0 && (
                      <div style={{ marginTop: 2 }}>
                        {task.tags.map(tag => <span key={tag} style={{ background: '#e0f2fe', color: '#0369a1', borderRadius: 4, padding: '1px 6px', fontSize: '0.75rem', marginRight: 4 }}>{tag}</span>)}
                      </div>
                    )}
                  </td>
                  <td>
                    {getLinkedName(task) ? (
                      <span style={{ background: '#f1f5f9', borderRadius: 4, padding: '2px 8px', fontSize: '0.82rem' }}>{getLinkedName(task)}</span>
                    ) : (
                      <span style={{ color: '#94a3b8', fontSize: '0.82rem' }}>Genel</span>
                    )}
                  </td>
                  <td>
                    <span style={{ background: PRIORITY_COLOR[task.priority] + '22', color: PRIORITY_COLOR[task.priority], borderRadius: 4, padding: '2px 10px', fontWeight: 700, fontSize: '0.82rem' }}>
                      {task.priority}
                    </span>
                  </td>
                  <td>
                    <select
                      value={task.status}
                      onChange={e => handleQuickStatus(task, e.target.value)}
                      style={{ border: `1.5px solid ${STATUS_COLOR[task.status]}`, borderRadius: 4, color: STATUS_COLOR[task.status], fontWeight: 600, fontSize: '0.82rem', padding: '2px 6px', background: 'white' }}
                    >
                      {STATUSES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                  <td style={{ color: '#374151', fontSize: '0.9rem' }}>{task.assigneeName || '-'}</td>
                  <td style={{ color: isOverdue(task) ? '#dc2626' : '#374151', fontWeight: isOverdue(task) ? 700 : 400, fontSize: '0.9rem' }}>
                    {fmt(task.dueDate)}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="secondary-btn" style={{ fontSize: '0.78rem', padding: '3px 10px' }} onClick={() => setDetailTask(task)}>Detay</button>
                      <button className="secondary-btn" style={{ fontSize: '0.78rem', padding: '3px 10px' }} onClick={() => openEdit(task)}>Düzenle</button>
                      {isAdmin && <button className="danger-btn" style={{ fontSize: '0.78rem', padding: '3px 10px' }} onClick={() => handleDelete(task.id)}>Sil</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {total > pageSize && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12 }}>
              <button className="secondary-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Önceki</button>
              <span style={{ lineHeight: '32px', fontSize: '0.9rem', color: '#64748b' }}>{page} / {Math.ceil(total / pageSize)}</span>
              <button className="secondary-btn" disabled={page >= Math.ceil(total / pageSize)} onClick={() => setPage(p => p + 1)}>Sonraki</button>
            </div>
          )}
        </div>
      )}

      {/* BOARD VIEW */}
      {view === 'board' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {boardCols.map(col => {
            const colItems = items.filter(t => t.status === col.key);
            return (
              <div key={col.key} style={{ background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', minHeight: 200 }}>
                <div style={{ padding: '10px 14px', borderBottom: '3px solid ' + col.color, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, color: col.color }}>{col.label}</span>
                  <span style={{ background: col.color + '22', color: col.color, borderRadius: 12, padding: '1px 10px', fontSize: '0.8rem', fontWeight: 700 }}>{colItems.length}</span>
                </div>
                <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {colItems.map(task => (
                    <div key={task.id} style={{ background: 'white', borderRadius: 8, border: `1px solid ${isOverdue(task) ? '#fca5a5' : '#e2e8f0'}`, padding: '10px 12px', cursor: 'pointer' }} onClick={() => setDetailTask(task)}>
                      <div style={{ fontWeight: 600, fontSize: '0.87rem', marginBottom: 4, color: '#1e293b' }}>{task.title || task.note}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
                        <span style={{ background: PRIORITY_COLOR[task.priority] + '22', color: PRIORITY_COLOR[task.priority], borderRadius: 3, padding: '1px 6px', fontSize: '0.72rem', fontWeight: 700 }}>{task.priority}</span>
                        <span style={{ fontSize: '0.75rem', color: isOverdue(task) ? '#dc2626' : '#64748b' }}>{fmt(task.dueDate)}</span>
                      </div>
                      {task.assigneeName && <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 4 }}>{task.assigneeName}</div>}
                      {getLinkedName(task) && <div style={{ fontSize: '0.72rem', color: '#0369a1', marginTop: 4, background: '#e0f2fe', borderRadius: 3, padding: '1px 6px', display: 'inline-block' }}>{getLinkedName(task)}</div>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE/EDIT FORM DRAWER */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" style={{ maxWidth: 680, width: '95%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{form.id ? 'Görevi Düzenle' : 'Yeni Görev Oluştur'}</h3>
              <button onClick={() => setShowForm(false)} className="modal-close">X</button>
            </div>
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <div className="modal-body">
                <div className="form-grid">
                  <div className="field full-width">
                    <label>Görev Başlığı *</label>
                    <input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Görev başlığını yazın..." />
                  </div>
                  <div className="field full-width">
                    <label>Açıklama</label>
                    <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} placeholder="Görev detaylarını yazın..." />
                  </div>
                  <div className="field">
                    <label>Durum</label>
                    <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                      {STATUSES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Öncelik</label>
                    <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                      {PRIORITIES.map(p => <option key={p}>{p}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Atanan Kişi</label>
                    {teamMembers.length > 0 ? (
                      <select value={form.assigneeName} onChange={e => setForm(f => ({ ...f, assigneeName: e.target.value }))}>
                        <option value="">-- Seçin --</option>
                        {teamMembers.map(m => <option key={m.id} value={m.name}>{m.name} ({m.roleName})</option>)}
                      </select>
                    ) : (
                      <input value={form.assigneeName} onChange={e => setForm(f => ({ ...f, assigneeName: e.target.value }))} placeholder="Kişi adı..." />
                    )}
                  </div>
                  <div className="field">
                    <label>Son Tarih</label>
                    <input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
                  </div>
                  <div className="field">
                    <label>Modül Türü</label>
                    <select value={form.moduleType} onChange={e => setForm(f => ({ ...f, moduleType: e.target.value }))}>
                      {MODULE_TYPES.map(m => <option key={m}>{m}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Etiketler (virgülle ayır)</label>
                    <input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} placeholder="takip, acil, hukuk..." />
                  </div>
                  {(form.moduleType === 'Yatırımcı' || form.moduleType === 'Genel') && (
                    <div className="field">
                      <label>Yatırımcı Bağlantısı</label>
                      <select value={form.investorId} onChange={e => setForm(f => ({ ...f, investorId: e.target.value }))}>
                        <option value="">-- Seçin --</option>
                        {investors.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                      </select>
                    </div>
                  )}
                  {(form.moduleType === 'Marka' || form.moduleType === 'Genel') && (
                    <div className="field">
                      <label>Marka Bağlantısı</label>
                      <select value={form.brandId} onChange={e => setForm(f => ({ ...f, brandId: e.target.value }))}>
                        <option value="">-- Seçin --</option>
                        {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    </div>
                  )}
                  {(form.moduleType === 'Proje' || form.moduleType === 'Genel') && (
                    <div className="field">
                      <label>Proje Bağlantısı</label>
                      <select value={form.projectId} onChange={e => setForm(f => ({ ...f, projectId: e.target.value }))}>
                        <option value="">-- Seçin --</option>
                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                  )}
                  {(form.moduleType === 'Lokasyon' || form.moduleType === 'Genel') && (
                    <div className="field">
                      <label>Lokasyon Bağlantısı</label>
                      <select value={form.locationId} onChange={e => setForm(f => ({ ...f, locationId: e.target.value }))}>
                        <option value="">-- Seçin --</option>
                        {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                      </select>
                    </div>
                  )}
                  {(form.moduleType === 'Sözleşme' || form.moduleType === 'Genel') && (
                    <div className="field">
                      <label>Sözleşme Bağlantısı</label>
                      <select value={form.contractId} onChange={e => setForm(f => ({ ...f, contractId: e.target.value }))}>
                        <option value="">-- Seçin --</option>
                        {contracts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="secondary-btn" onClick={() => setShowForm(false)}>İptal</button>
                <button type="submit" className="primary-btn" disabled={saving}>{saving ? 'Kaydediliyor...' : form.id ? 'Güncelle' : 'Oluştur'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DETAIL MODAL */}
      {detailTask && (
        <div className="modal-overlay" onClick={() => setDetailTask(null)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Görev Detayı</h3>
              <button onClick={() => setDetailTask(null)} className="modal-close">X</button>
            </div>
            <div className="modal-body">
              <h4 style={{ margin: '0 0 12px', color: '#1e293b', fontSize: '1.1rem' }}>{detailTask.title || detailTask.note}</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div><span style={{ color: '#64748b', fontSize: '0.82rem' }}>DURUM</span>
                  <div><span style={{ background: STATUS_COLOR[detailTask.status] + '22', color: STATUS_COLOR[detailTask.status], borderRadius: 4, padding: '2px 10px', fontWeight: 700, fontSize: '0.85rem' }}>{detailTask.status}</span></div>
                </div>
                <div><span style={{ color: '#64748b', fontSize: '0.82rem' }}>ÖNCELİK</span>
                  <div><span style={{ background: PRIORITY_COLOR[detailTask.priority] + '22', color: PRIORITY_COLOR[detailTask.priority], borderRadius: 4, padding: '2px 10px', fontWeight: 700, fontSize: '0.85rem' }}>{detailTask.priority}</span></div>
                </div>
                <div><span style={{ color: '#64748b', fontSize: '0.82rem' }}>ATANAN</span>
                  <div style={{ fontWeight: 600 }}>{detailTask.assigneeName || '-'}</div>
                </div>
                <div><span style={{ color: '#64748b', fontSize: '0.82rem' }}>SON TARİH</span>
                  <div style={{ fontWeight: 600, color: isOverdue(detailTask) ? '#dc2626' : '#1e293b' }}>{fmt(detailTask.dueDate)}</div>
                </div>
                <div><span style={{ color: '#64748b', fontSize: '0.82rem' }}>MODÜL</span>
                  <div style={{ fontWeight: 600 }}>{detailTask.moduleType}</div>
                </div>
                <div><span style={{ color: '#64748b', fontSize: '0.82rem' }}>OLUŞTURULMA</span>
                  <div style={{ fontWeight: 600 }}>{fmt(detailTask.createdAt)}</div>
                </div>
              </div>
              {detailTask.description && (
                <div style={{ background: '#f8fafc', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                  <div style={{ color: '#64748b', fontSize: '0.82rem', marginBottom: 4 }}>AÇIKLAMA</div>
                  <div style={{ color: '#334155' }}>{detailTask.description}</div>
                </div>
              )}
              {getLinkedName(detailTask) && (
                <div style={{ background: '#eff6ff', borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>
                  <span style={{ color: '#1d4ed8', fontWeight: 600, fontSize: '0.85rem' }}>{getLinkedName(detailTask)}</span>
                </div>
              )}
              {detailTask.tags?.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ color: '#64748b', fontSize: '0.82rem', marginBottom: 4 }}>ETİKETLER</div>
                  <div>{detailTask.tags.map(tag => <span key={tag} style={{ background: '#e0f2fe', color: '#0369a1', borderRadius: 4, padding: '2px 8px', fontSize: '0.8rem', marginRight: 6 }}>{tag}</span>)}</div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="secondary-btn" onClick={() => { openEdit(detailTask); setDetailTask(null); }}>Düzenle</button>
              {isAdmin && <button className="danger-btn" onClick={() => { handleDelete(detailTask.id); setDetailTask(null); }}>Sil</button>}
              <button className="primary-btn" onClick={() => setDetailTask(null)}>Kapat</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
