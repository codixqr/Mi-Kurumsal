'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { apiClient } from '@/lib/apiClient';

const SETTINGS_TABS = [
  { id: 'system', label: 'Sistem Ayarları' },
  { id: 'team', label: 'Ekip Yönetimi' },
  { id: 'tasks', label: 'Görev Tanımlama' },
  { id: 'timeline', label: 'Aktivite Kaydı' },
];

const CRM_PERMISSION_OPTIONS = [
  { key: 'investors', label: 'Yatırımcı Yönetimi' },
  { key: 'brands', label: 'Marka Yönetimi' },
  { key: 'locations', label: 'Lokasyon Yönetimi' },
  { key: 'projects', label: 'Proje Yönetimi' },
  { key: 'contracts', label: 'Sözleşme & Finans' },
  { key: 'tasks', label: 'Görev Yönetimi' },
  { key: 'reports', label: 'Raporlar' },
  { key: 'templates', label: 'Mesaj Şablonları' },
  { key: 'matching', label: 'Eşleştirme Motoru' },
  { key: 'pnl', label: 'Kar / Zarar' },
  { key: 'timeline', label: 'Activity Timeline' },
];

export default function SettingsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('system');
  const [teamMembers, setTeamMembers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [taskForm, setTaskForm] = useState({
    note: '',
    assigneeId: '',
    priority: 'Orta',
    status: 'Açık',
    dueDate: '',
  });
  const [settingsForm, setSettingsForm] = useState({
    companyName: 'Mi Core Yönetim Paneli',
    defaultCurrency: 'TRY',
    notifyEmail: '',
    smtpHost: '',
  });
  const [memberForm, setMemberForm] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    department: '',
    roleName: 'Temsilci',
    permissions: ['tasks', 'projects'],
  });

  const isAdmin = user?.role === 'admin';

  const loadData = async () => {
    if (!isAdmin) return;
    const [members, appSettings, taskRows] = await Promise.all([
      apiClient.get('/team-members'),
      apiClient.get('/settings'),
      apiClient.get('/tasks'),
    ]);
    setTeamMembers(members);
    setTasks(taskRows || []);
    setSettingsForm((prev) => ({
      ...prev,
      ...(appSettings.company_profile || {}),
      ...(appSettings.system_defaults || {}),
      ...(appSettings.notifications || {}),
    }));
  };

  const loadLogs = async () => {
    if (logsLoading) return;
    setLogsLoading(true);
    try {
      const data = await apiClient.get('/activity');
      setLogs(data || []);
    } catch {}
    finally { setLogsLoading(false); }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  useEffect(() => {
    if (activeTab === 'timeline') loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  if (!isAdmin) {
    return (
      <section className="card page-section active">
        <h2>Ayarlar</h2>
        <p>Bu bölüm sadece yönetici kullanıcıya açıktır.</p>
      </section>
    );
  }

  const saveSettings = async (e) => {
    e.preventDefault();
    await apiClient.put('/settings', {
      company_profile: { companyName: settingsForm.companyName },
      system_defaults: { defaultCurrency: settingsForm.defaultCurrency },
      notifications: { notifyEmail: settingsForm.notifyEmail, smtpHost: settingsForm.smtpHost },
    });
    alert('Ayarlar kaydedildi.');
  };

  const addMember = async (e) => {
    e.preventDefault();
    await apiClient.post('/team-members', memberForm);
    setMemberForm({
      name: '',
      email: '',
      password: '',
      phone: '',
      department: '',
      roleName: 'Temsilci',
      permissions: ['tasks', 'projects'],
    });
    await loadData();
  };

  const createTask = async (e) => {
    e.preventDefault();
    const assignee = teamMembers.find((m) => m.id === Number(taskForm.assigneeId));
    await apiClient.post('/tasks', {
      note: taskForm.note,
      assigneeId: assignee?.id || null,
      assigneeName: assignee?.name || '',
      priority: taskForm.priority,
      status: taskForm.status,
      dueDate: taskForm.dueDate || null,
    });
    setTaskForm({ note: '', assigneeId: '', priority: 'Orta', status: 'Açık', dueDate: '' });
    await loadData();
  };

  const tabStyle = (id) => ({
    padding: '8px 18px',
    borderRadius: '8px 8px 0 0',
    border: 'none',
    cursor: 'pointer',
    fontWeight: activeTab === id ? 700 : 400,
    background: activeTab === id ? 'var(--color-primary, #16a34a)' : '#f1f5f9',
    color: activeTab === id ? '#fff' : '#374151',
    fontSize: '14px',
    marginRight: '4px',
  });

  return (
    <section className="card page-section active">
      <div className="module-head">
        <h2>Ayarlar (Yönetici)</h2>
      </div>

      <div style={{ display: 'flex', borderBottom: '2px solid #e2e8f0', marginBottom: '20px' }}>
        {SETTINGS_TABS.map(t => (
          <button key={t.id} style={tabStyle(t.id)} onClick={() => setActiveTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {activeTab === 'system' && (
        <article className="card">
          <h3>Sistem Ayarları</h3>
          <form onSubmit={saveSettings} className="entry-form">
            <div className="field"><label>Panel Adı</label><input value={settingsForm.companyName} onChange={(e) => setSettingsForm({ ...settingsForm, companyName: e.target.value })} /></div>
            <div className="field">
              <label>Varsayılan Para Birimi</label>
              <select value={settingsForm.defaultCurrency} onChange={(e) => setSettingsForm({ ...settingsForm, defaultCurrency: e.target.value })}>
                <option value="TRY">TL</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <div className="field"><label>Bildirim E-postası</label><input value={settingsForm.notifyEmail} onChange={(e) => setSettingsForm({ ...settingsForm, notifyEmail: e.target.value })} /></div>
            <div className="field"><label>SMTP Host</label><input value={settingsForm.smtpHost} onChange={(e) => setSettingsForm({ ...settingsForm, smtpHost: e.target.value })} /></div>
            <button type="submit">Ayarları Kaydet</button>
          </form>
        </article>
      )}

      {activeTab === 'team' && (
        <article className="card">
          <h3>Ekip Üyesi Ekle ve Kullanıcı Oluştur</h3>
          <form onSubmit={addMember} className="entry-form">
            <div className="field"><label>Ad Soyad</label><input required value={memberForm.name} onChange={(e) => setMemberForm({ ...memberForm, name: e.target.value })} /></div>
            <div className="field"><label>E-posta (giriş hesabı)</label><input type="email" required value={memberForm.email} onChange={(e) => setMemberForm({ ...memberForm, email: e.target.value })} /></div>
            <div className="field"><label>Parola (ilk giriş)</label><input type="password" required value={memberForm.password} onChange={(e) => setMemberForm({ ...memberForm, password: e.target.value })} /></div>
            <div className="field"><label>Telefon</label><input value={memberForm.phone} onChange={(e) => setMemberForm({ ...memberForm, phone: e.target.value })} /></div>
            <div className="field"><label>Departman</label><input value={memberForm.department} onChange={(e) => setMemberForm({ ...memberForm, department: e.target.value })} /></div>
            <div className="field">
              <label>CRM Rolü</label>
              <select value={memberForm.roleName} onChange={(e) => setMemberForm({ ...memberForm, roleName: e.target.value })}>
                <option>Yönetici</option><option>Uzman</option><option>Temsilci</option><option>Destek</option>
              </select>
            </div>
            <div className="field field-wide">
              <label>Kullanım İzinleri</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px' }}>
                {CRM_PERMISSION_OPTIONS.map((perm) => (
                  <label key={perm.key} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px' }}>
                    <input
                      type="checkbox"
                      checked={memberForm.permissions.includes(perm.key)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setMemberForm({ ...memberForm, permissions: [...memberForm.permissions, perm.key] });
                        } else {
                          setMemberForm({ ...memberForm, permissions: memberForm.permissions.filter((x) => x !== perm.key) });
                        }
                      }}
                    />
                    {perm.label}
                  </label>
                ))}
              </div>
            </div>
            <button type="submit">Ekip Üyesi + Kullanıcı Oluştur</button>
          </form>
          <div className="table-wrap" style={{ marginTop: 16 }}>
            <table>
              <thead><tr><th>Ad</th><th>E-posta</th><th>Departman</th><th>Rol</th><th>İzinler</th></tr></thead>
              <tbody>
                {teamMembers.map((m) => (
                  <tr key={m.id}>
                    <td>{m.name}</td>
                    <td>{m.email || '-'}</td>
                    <td>{m.department || '-'}</td>
                    <td>{m.roleName}</td>
                    <td style={{ fontSize: '12px' }}>{(m.permissions || []).join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      )}

      {activeTab === 'tasks' && (
        <article className="card">
          <h3>Görev Tanımlama (Yönetici)</h3>
          <form onSubmit={createTask} className="entry-form">
            <div className="field field-wide"><label>Görev</label><input required value={taskForm.note} onChange={(e) => setTaskForm({ ...taskForm, note: e.target.value })} /></div>
            <div className="field">
              <label>Atanacak Kişi</label>
              <select value={taskForm.assigneeId} onChange={(e) => setTaskForm({ ...taskForm, assigneeId: e.target.value })}>
                <option value="">Seçiniz</option>
                {teamMembers.map((m) => <option key={m.id} value={m.id}>{m.name} - {m.roleName}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Öncelik</label>
              <select value={taskForm.priority} onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}>
                <option>Yüksek</option><option>Orta</option><option>Düşük</option>
              </select>
            </div>
            <div className="field">
              <label>Durum</label>
              <select value={taskForm.status} onChange={(e) => setTaskForm({ ...taskForm, status: e.target.value })}>
                <option>Açık</option><option>Devam Ediyor</option><option>Tamamlandı</option>
              </select>
            </div>
            <div className="field"><label>Son Tarih</label><input type="date" value={taskForm.dueDate} onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })} /></div>
            <button type="submit">Görev Tanımla</button>
          </form>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Görev</th><th>Atanan</th><th>Öncelik</th><th>Durum</th><th>Tarih</th></tr></thead>
              <tbody>
                {tasks.map((t) => (
                  <tr key={t.id}>
                    <td>{t.note}</td>
                    <td>{t.assigneeName || '-'}</td>
                    <td>{t.priority || 'Orta'}</td>
                    <td>{t.status}</td>
                    <td>{t.dueDate ? new Date(t.dueDate).toLocaleDateString('tr-TR') : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      )}

      {activeTab === 'timeline' && (
        <article className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>Aktivite Kaydı (Timeline)</h3>
            <button className="secondary-btn" onClick={loadLogs} disabled={logsLoading}>{logsLoading ? 'Yükleniyor...' : 'Yenile'}</button>
          </div>
          {logsLoading ? (
            <p>Yükleniyor...</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Zaman</th><th>Kullanıcı</th><th>Modül</th><th>Aksiyon</th><th>Özet</th></tr>
                </thead>
                <tbody>
                  {logs.length === 0 ? (
                    <tr><td colSpan={5} style={{ textAlign: 'center', color: '#888' }}>Kayıt bulunamadı.</td></tr>
                  ) : logs.map(log => (
                    <tr key={log.id}>
                      <td style={{ fontSize: '0.82em', whiteSpace: 'nowrap' }}>{new Date(log.created_at).toLocaleString('tr-TR')}</td>
                      <td>{log.user_name}</td>
                      <td><span className="badge">{log.module_name}</span></td>
                      <td>{log.action_type}</td>
                      <td>{log.summary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>
      )}
    </section>
  );
}

