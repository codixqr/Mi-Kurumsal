'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/apiClient';
import { useAuth } from '@/lib/AuthContext';

export default function TasksPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [tasks, setTasks] = useState([]);

  const fetchTasks = async () => {
    try { setTasks(await apiClient.get('/tasks')); } catch (err) {}
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  const handleStatusChange = async (task, newStatus) => {
    if (!isAdmin) return;
    try {
      await apiClient.put(`/tasks/${task.id}`, {
        note: task.note,
        status: newStatus,
        assigneeId: task.assigneeId || null,
        assigneeName: task.assigneeName || '',
        priority: task.priority || 'Orta',
        dueDate: task.dueDate || null,
      });
      fetchTasks();
    } catch (err) {}
  };

  const handleDelete = async (id) => {
    if (!isAdmin) return;
    try { await apiClient.delete(`/tasks/${id}`); fetchTasks(); } catch (err) {}
  };

  return (
    <section className="card page-section active">
      <div className="module-head">
        <h2>Ekip & Görev Yönetimi</h2>
      </div>

      <article className="card" style={{ marginTop: 12 }}>
        <h3>Görev Listesi</h3>
        <ul className="list">
          {tasks.map(task => (
            <li key={task.id} className="list-item">
              <div className="list-item-info">
                <span className={task.status === 'Tamamlandı' ? 'strike' : ''}>
                  {task.note}
                  <br />
                  <small>
                    {task.assigneeName || 'Atama yok'} | {task.priority || 'Orta'} | {task.dueDate ? new Date(task.dueDate).toLocaleDateString('tr-TR') : 'Tarih yok'}
                  </small>
                </span>
              </div>
              <div className="list-item-actions">
                <select value={task.status} onChange={(e) => handleStatusChange(task, e.target.value)} disabled={!isAdmin}>
                  <option>Açık</option><option>Devam Ediyor</option><option>Tamamlandı</option>
                </select>
                {isAdmin && <button onClick={() => handleDelete(task.id)} className="danger-btn">Sil</button>}
              </div>
            </li>
          ))}
        </ul>
      </article>

      {!isAdmin && (
        <article className="card" style={{ marginTop: 12 }}>
          <p>Görev tanımlama ve ekip yönetimi sadece yönetici tarafından `Ayarlar` bölümünden yapılır.</p>
        </article>
      )}
      {isAdmin && (
        <article className="card" style={{ marginTop: 12 }}>
          <p>Görev tanımlama ve ekip ataması için `Ayarlar` bölümünü kullanın.</p>
        </article>
      )}
    </section>
  );
}

