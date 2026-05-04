'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/apiClient';

export default function TasksPage() {
  const [tasks, setTasks] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [memberForm, setMemberForm] = useState({
    name: '',
    email: '',
    phone: '',
    department: '',
    roleName: 'Temsilci',
    permissionsText: 'tasks,projects',
  });
  const [taskForm, setTaskForm] = useState({
    note: '',
    status: 'Açık',
    assigneeId: '',
    priority: 'Orta',
    dueDate: '',
  });

  const fetchTeamMembers = async () => {
    try {
      const members = await apiClient.get('/team-members');
      setTeamMembers(members);
    } catch (err) {}
  };
  const fetchTasks = async () => {
    try {
      const data = await apiClient.get('/tasks');
      setTasks(data);
    } catch (err) {}
  };

  useEffect(() => {
    fetchTeamMembers();
    fetchTasks();
  }, []);

  const handleAddMember = async (e) => {
    e.preventDefault();
    try {
      await apiClient.post('/team-members', {
        name: memberForm.name,
        email: memberForm.email,
        phone: memberForm.phone,
        department: memberForm.department,
        roleName: memberForm.roleName,
        permissions: memberForm.permissionsText.split(',').map((x) => x.trim()).filter(Boolean),
        active: true,
      });
      setMemberForm({
        name: '',
        email: '',
        phone: '',
        department: '',
        roleName: 'Temsilci',
        permissionsText: 'tasks,projects',
      });
      fetchTeamMembers();
    } catch (err) {}
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const assignee = teamMembers.find((m) => m.id === Number(taskForm.assigneeId));
      await apiClient.post('/tasks', {
        note: taskForm.note,
        status: taskForm.status,
        assigneeId: assignee?.id || null,
        assigneeName: assignee?.name || '',
        priority: taskForm.priority,
        dueDate: taskForm.dueDate || null,
      });
      setTaskForm({ note: '', status: 'Açık', assigneeId: '', priority: 'Orta', dueDate: '' });
      fetchTasks();
    } catch (err) {}
  };

  const handleStatusChange = async (task, newStatus) => {
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
    try { await apiClient.delete(`/tasks/${id}`); fetchTasks(); } catch (err) {}
  };

  return (
    <section className="card page-section active">
      <div className="module-head">
        <h2>Ekip & Görev Yönetimi</h2>
      </div>
      <div className="split">
        <article className="card">
          <h3>Ekip Bilgisi Gir</h3>
          <form onSubmit={handleAddMember} className="entry-form">
            <div className="field"><label>Ad Soyad</label><input value={memberForm.name} onChange={e => setMemberForm({...memberForm, name: e.target.value})} required /></div>
            <div className="field"><label>E-posta</label><input type="email" value={memberForm.email} onChange={e => setMemberForm({...memberForm, email: e.target.value})} /></div>
            <div className="field"><label>Telefon</label><input value={memberForm.phone} onChange={e => setMemberForm({...memberForm, phone: e.target.value})} /></div>
            <div className="field"><label>Departman</label><input value={memberForm.department} onChange={e => setMemberForm({...memberForm, department: e.target.value})} placeholder="Franchise / Satış / Operasyon" /></div>
            <div className="field">
              <label>CRM Rolü</label>
              <select value={memberForm.roleName} onChange={e => setMemberForm({...memberForm, roleName: e.target.value})}>
                <option>Yönetici</option>
                <option>Uzman</option>
                <option>Temsilci</option>
                <option>Destek</option>
              </select>
            </div>
            <div className="field field-wide"><label>Kullanım İzinleri (virgüllü)</label><input value={memberForm.permissionsText} onChange={e => setMemberForm({...memberForm, permissionsText: e.target.value})} placeholder="investors,brands,tasks,reports" /></div>
            <button type="submit">Ekip Üyesi Ekle</button>
          </form>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Ad</th><th>Rol</th><th>Departman</th><th>İzinler</th></tr></thead>
              <tbody>
                {teamMembers.map((m) => (
                  <tr key={m.id}>
                    <td>{m.name}</td>
                    <td>{m.roleName}</td>
                    <td>{m.department || '-'}</td>
                    <td>{(m.permissions || []).join(', ') || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="card">
          <h3>Görev Tanımla ve Atama Yap</h3>
          <form onSubmit={handleSubmit} className="entry-form">
            <div className="field field-wide"><label>Görev</label><input value={taskForm.note} onChange={e => setTaskForm({...taskForm, note: e.target.value})} required /></div>
            <div className="field">
              <label>Atanacak Kişi</label>
              <select value={taskForm.assigneeId} onChange={e => setTaskForm({...taskForm, assigneeId: e.target.value})}>
                <option value="">Seçiniz</option>
                {teamMembers.map((m) => <option key={m.id} value={m.id}>{m.name} - {m.roleName}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Öncelik</label>
              <select value={taskForm.priority} onChange={e => setTaskForm({...taskForm, priority: e.target.value})}>
                <option>Yüksek</option><option>Orta</option><option>Düşük</option>
              </select>
            </div>
            <div className="field">
              <label>Durum</label>
              <select value={taskForm.status} onChange={e => setTaskForm({...taskForm, status: e.target.value})}>
                <option>Açık</option><option>Devam Ediyor</option><option>Tamamlandı</option>
              </select>
            </div>
            <div className="field"><label>Son Tarih</label><input type="date" value={taskForm.dueDate} onChange={e => setTaskForm({...taskForm, dueDate: e.target.value})} /></div>
            <button type="submit">Görev Ekle</button>
          </form>
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
                  <select value={task.status} onChange={(e) => handleStatusChange(task, e.target.value)}>
                    <option>Açık</option><option>Devam Ediyor</option><option>Tamamlandı</option>
                  </select>
                  <button onClick={() => handleDelete(task.id)} className="danger-btn">Sil</button>
                </div>
              </li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}
