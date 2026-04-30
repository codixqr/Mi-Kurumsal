'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/apiClient';

export default function ProjectsPage() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    name: '', type: '', owner: '', assignees: '', priority: 'Orta', progress: '0', stage: '', dueDate: '', description: '', checklist: ''
  });

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const data = await apiClient.get('/projects');
      setProjects(data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchProjects(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      assignees: form.assignees.split(',').map(s => s.trim()).filter(s => s),
      checklist: form.checklist.split('\n').map(s => s.trim()).filter(s => s)
    };
    try {
      if (editingId) await apiClient.put(`/projects/${editingId}`, payload);
      else await apiClient.post('/projects', payload);
      resetForm();
      fetchProjects();
    } catch (err) { alert('Hata: ' + err.message); }
  };

  const resetForm = () => {
    setEditingId(null);
    setForm({ name: '', type: '', owner: '', assignees: '', priority: 'Orta', progress: '0', stage: '', dueDate: '', description: '', checklist: '' });
  };

  const handleEdit = (p) => {
    setEditingId(p.id);
    setForm({
      name: p.name, type: p.type, owner: p.owner, 
      assignees: (p.assignees || []).join(', '),
      priority: p.priority, progress: String(p.progress),
      stage: p.stage, 
      dueDate: p.dueDate ? p.dueDate.split('T')[0] : '',
      description: p.description || '',
      checklist: (p.checklist || []).join('\n')
    });
  };

  const handleDelete = async (id) => {
    if (!confirm('Projeyi silmek istediğinize emin misiniz?')) return;
    try {
      await apiClient.delete(`/projects/${id}`);
      fetchProjects();
    } catch (err) { alert('Hata'); }
  };

  if (loading) return <div className="card">Yükleniyor...</div>;

  return (
    <section className="card page-section active">
      <div className="module-head">
        <h2>Proje & Süreç Takibi</h2>
        <div>
          <button className="export-btn" type="button">Excel Dışa Aktar</button>
          <button className="pdf-export-btn" type="button">PDF Dışa Aktar</button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="entry-form">
        <div className="field"><label>Proje Adı</label><input value={form.name} onChange={e => setForm({...form, name: e.target.value})} required /></div>
        <div className="field"><label>Proje Tipi</label><input value={form.type} onChange={e => setForm({...form, type: e.target.value})} list="projectTypeOptions" required /></div>
        <div className="field"><label>Sorumlu Ekip</label><input value={form.owner} onChange={e => setForm({...form, owner: e.target.value})} required /></div>
        <div className="field"><label>Sorumlu Kişiler</label><input value={form.assignees} onChange={e => setForm({...form, assignees: e.target.value})} placeholder="Ali, Veli..." /></div>
        <div className="field">
          <label>Öncelik</label>
          <select value={form.priority} onChange={e => setForm({...form, priority: e.target.value})}>
            <option>Yüksek</option><option>Orta</option><option>Düşük</option>
          </select>
        </div>
        <div className="field"><label>İlerleme (%)</label><input type="number" value={form.progress} onChange={e => setForm({...form, progress: e.target.value})} min="0" max="100" /></div>
        <div className="field"><label>Aşama</label><input value={form.stage} onChange={e => setForm({...form, stage: e.target.value})} required /></div>
        <div className="field"><label>Son Tarih</label><input type="date" value={form.dueDate} onChange={e => setForm({...form, dueDate: e.target.value})} required /></div>
        <div className="field field-wide"><label>Açıklama</label><textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} rows="2"></textarea></div>
        <div className="field field-wide"><label>Checklist (Satır Satır)</label><textarea value={form.checklist} onChange={e => setForm({...form, checklist: e.target.value})} rows="3" placeholder="Görüşme yapıldı&#10;Teklif verildi..."></textarea></div>
        
        <div className="field-wide">
          <button type="submit" className="primary-btn">{editingId ? 'Güncelle' : 'Proje Ekle'}</button>
          {editingId && <button type="button" onClick={resetForm} className="secondary-btn" style={{marginLeft: '10px'}}>Vazgeç</button>}
        </div>
      </form>

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Proje</th><th>Tip</th><th>Sorumlu</th><th>İlerleme</th><th>Aşama</th><th>Son Tarih</th><th>İşlem</th></tr>
          </thead>
          <tbody>
            {projects.map(p => (
              <tr key={p.id}>
                <td><strong>{p.name}</strong></td>
                <td>{p.type}</td>
                <td>{p.owner}</td>
                <td>
                  <div className="progress-bar-wrap">
                    <div className="progress-bar" style={{width: `${p.progress}%`}}></div>
                    <span>%{p.progress}</span>
                  </div>
                </td>
                <td><span className="badge stage">{p.stage}</span></td>
                <td>{p.dueDate ? new Date(p.dueDate).toLocaleDateString('tr-TR') : '-'}</td>
                <td>
                  <button onClick={() => handleEdit(p)} className="edit-btn">Düzenle</button>
                  <button onClick={() => handleDelete(p.id)} className="danger-btn">Sil</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
