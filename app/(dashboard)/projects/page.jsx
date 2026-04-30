'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/apiClient';

export default function ProjectsPage() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    name: '', type: '', owner: '', assignees: '',
    priority: 'Orta', progress: '0', stage: '',
    dueDate: '', description: '', checklist: ''
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await apiClient.get('/projects');
      setProjects(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        assignees: form.assignees.split(',').map(x => x.trim()).filter(Boolean),
        checklist: form.checklist.split('\n').map(x => x.trim()).filter(Boolean)
      };
      if (form.id) {
        await apiClient.put(`/projects/${form.id}`, payload);
      } else {
        await apiClient.post('/projects', payload);
      }
      setForm({ name: '', type: '', owner: '', assignees: '', priority: 'Orta', progress: '0', stage: '', dueDate: '', description: '', checklist: '' });
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
      progress: String(p.progress || 0)
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (loading) return <div className="card">Yükleniyor...</div>;

  return (
    <section className="card page-section active">
      <div className="module-head">
        <h2>Proje & Süreç Takibi</h2>
        <div className="header-actions">
          <button className="export-btn" type="button">Excel Dışa Aktar</button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="entry-form">
        <div className="field"><label>Proje Adı</label><input value={form.name} onChange={e => setForm({...form, name: e.target.value})} required /></div>
        <div className="field"><label>Proje Tipi</label><input value={form.type} onChange={e => setForm({...form, type: e.target.value})} placeholder="Franchise, Kiralama vb." required /></div>
        <div className="field"><label>Sorumlu Ekip</label><input value={form.owner} onChange={e => setForm({...form, owner: e.target.value})} placeholder="Operasyon, Satış vb." required /></div>
        <div className="field"><label>Sorumlu Kişiler</label><input value={form.assignees} onChange={e => setForm({...form, assignees: e.target.value})} placeholder="Ali, Veli (Virgülle)" /></div>
        <div className="field">
          <label>Öncelik</label>
          <select value={form.priority} onChange={e => setForm({...form, priority: e.target.value})}>
            <option value="Yüksek">Yüksek</option><option value="Orta">Orta</option><option value="Düşük">Düşük</option>
          </select>
        </div>
        <div className="field"><label>İlerleme (%)</label><input type="number" min="0" max="100" value={form.progress} onChange={e => setForm({...form, progress: e.target.value})} /></div>
        <div className="field"><label>Aşama</label><input value={form.stage} onChange={e => setForm({...form, stage: e.target.value})} placeholder="Sözleşme, İnşaat vb." required /></div>
        <div className="field"><label>Son Tarih</label><input type="date" value={form.dueDate} onChange={e => setForm({...form, dueDate: e.target.value})} required /></div>
        <div className="field field-wide"><label>Detay Açıklama</label><textarea rows="2" value={form.description} onChange={e => setForm({...form, description: e.target.value})}></textarea></div>
        <div className="field field-wide"><label>Checklist (Her satıra bir adım)</label><textarea rows="3" value={form.checklist} onChange={e => setForm({...form, checklist: e.target.value})} placeholder="Lokasyon onayı&#10;Mimari çizim&#10;Eleman alımı"></textarea></div>
        <button type="submit" className="primary-btn">{form.id ? 'Projeyi Güncelle' : 'Proje Ekle'}</button>
      </form>

      <div className="table-wrap" style={{ marginTop: '20px' }}>
        <table>
          <thead>
            <tr>
              <th>Proje</th><th>Tip</th><th>Sorumlu</th><th>Aşama</th><th>İlerleme</th><th>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {projects.map(p => (
              <tr key={p.id}>
                <td><strong>{p.name}</strong><br/><small>{p.dueDate ? new Date(p.dueDate).toLocaleDateString('tr-TR') : ''}</small></td>
                <td>{p.projectType}</td>
                <td>{p.ownerTeam}</td>
                <td>{p.stage}</td>
                <td>
                  <div style={{ width: '100%', backgroundColor: '#eee', borderRadius: '4px', height: '10px' }}>
                    <div style={{ width: `${p.progress}%`, backgroundColor: '#3b82f6', height: '100%', borderRadius: '4px' }}></div>
                  </div>
                  <small>%{p.progress}</small>
                </td>
                <td>
                  <button onClick={() => handleEdit(p)} className="edit-btn">Düzenle</button>
                  <button onClick={async () => { if(confirm('Sil?')) { await apiClient.delete(`/projects/${p.id}`); fetchData(); } }} className="danger-btn">Sil</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
