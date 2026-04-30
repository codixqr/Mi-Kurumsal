'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/apiClient';

export default function TasksPage() {
  const [tasks, setTasks] = useState([]);
  const [form, setForm] = useState({ note: '', status: 'Açık' });

  const fetchTasks = async () => {
    try { const data = await apiClient.get('/tasks'); setTasks(data); } catch (err) {}
  };

  useEffect(() => { fetchTasks(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await apiClient.post('/tasks', form);
      setForm({ note: '', status: 'Açık' });
      fetchTasks();
    } catch (err) {}
  };

  const handleStatusChange = async (task, newStatus) => {
    try {
      await apiClient.put(`/tasks/${task.id}`, { ...task, status: newStatus });
      fetchTasks();
    } catch (err) {}
  };

  const handleDelete = async (id) => {
    try { await apiClient.delete(`/tasks/${id}`); fetchTasks(); } catch (err) {}
  };

  return (
    <section className="card page-section active">
      <div className="module-head">
        <h2>Ekip & Görev Yönetimi</h2>
      </div>
      <form onSubmit={handleSubmit} className="entry-form compact-form">
        <div className="field"><label>Görev</label><input value={form.note} onChange={e => setForm({...form, note: e.target.value})} required /></div>
        <div className="field">
          <label>Durum</label>
          <select value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
            <option>Açık</option><option>Devam Ediyor</option><option>Tamamlandı</option>
          </select>
        </div>
        <button type="submit">Görev Ekle</button>
      </form>
      <ul className="list">
        {tasks.map(task => (
          <li key={task.id} className="list-item">
            <div className="list-item-info">
              <span className={task.status === 'Tamamlandı' ? 'strike' : ''}>{task.note}</span>
            </div>
            <div className="list-item-actions">
              <select value={task.status} onChange={(e) => handleStatusChange(task, e.target.value)}>
                <option>Açık</option><option>Devam Ediyor</option><option>Tamamlandı</option>
              </select>
              <button onClick={() => handleDelete(task.id)} className="danger-btn">Sil</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
