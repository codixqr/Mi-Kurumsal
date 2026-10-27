'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { apiClient } from '@/lib/apiClient';

const SETTINGS_TABS = [
  { id: 'system', label: 'Sistem Ayarları' },
  { id: 'team', label: 'Kullanıcı & Ekip Yönetimi' },
  { id: 'profile', label: 'Şifre & Profil' },
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
  { key: 'whatsapp', label: 'WhatsApp (WAHA)' },
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
    id: null,
    name: '',
    email: '',
    password: '',
    phone: '',
    department: '',
    roleName: 'Temsilci',
    permissions: ['tasks', 'projects'],
    active: true,
  });

  // Password modal & change password states
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [selectedMemberForPassword, setSelectedMemberForPassword] = useState(null);
  const [newPasswordForMember, setNewPasswordForMember] = useState('');

  const [selfPasswordForm, setSelfPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [selfPasswordMessage, setSelfPasswordMessage] = useState({ type: '', text: '' });

  const [cleaningDemo, setCleaningDemo] = useState(false);

  const cleanDemoData = async () => {
    if (!confirm('DİKKAT: Sistemdeki tüm demo marka, yatırımcı, lokasyon, proje, sözleşme, görev ve demo finans kayıtları silinecektir. Gerçek kayıtlarınız ve kullanıcılarınız kesinlikle korunacaktır. Devam etmek istiyor musunuz?')) {
      return;
    }
    setCleaningDemo(true);
    try {
      const res = await apiClient.post('/admin/clean-demo-data', {});
      alert(res.message || 'Demo veriler başarıyla temizlendi.');
      window.location.reload();
    } catch (err) {
      alert('Hata: ' + (err.message || 'Demo veriler temizlenirken bir sorun oluştu.'));
    } finally {
      setCleaningDemo(false);
    }
  };

  const loadData = async () => {
    try {
      const [members, settings, taskList] = await Promise.all([
        apiClient.get('/team-members'),
        apiClient.get('/settings'),
        apiClient.get('/tasks'),
      ]);
      setTeamMembers(members || []);
      setSettingsForm((prev) => ({ ...prev, ...(settings || {}) }));
      setTasks(taskList || []);
    } catch (e) {
      console.error(e);
    }
  };

  const loadLogs = async () => {
    setLogsLoading(true);
    try {
      const res = await apiClient.get('/activity');
      setLogs(res || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (activeTab === 'timeline') {
      loadLogs();
    }
  }, [activeTab]);

  if (user?.role !== 'admin') {
    return (
      <section className="card page-section active">
        <div className="module-head">
          <h2>Ayarlar</h2>
        </div>
        <p>Bu bölüm sadece yönetici kullanıcıya açıktır.</p>
      </section>
    );
  }

  const saveSettings = async (e) => {
    e.preventDefault();
    await apiClient.put('/settings', settingsForm);
    alert('Ayarlar kaydedildi.');
  };

  const handleMemberSubmit = async (e) => {
    e.preventDefault();
    try {
      if (memberForm.id) {
        await apiClient.put(`/team-members/${memberForm.id}`, memberForm);
        alert('Kullanıcı / Ekip üyesi güncellendi.');
      } else {
        await apiClient.post('/team-members', memberForm);
        alert('Ekip üyesi ve kullanıcı hesabı oluşturuldu.');
      }
      setMemberForm({
        id: null,
        name: '',
        email: '',
        password: '',
        phone: '',
        department: '',
        roleName: 'Temsilci',
        permissions: ['tasks', 'projects'],
        active: true,
      });
      await loadData();
    } catch (err) {
      alert(err.message || 'İşlem başarısız.');
    }
  };

  const editMember = (m) => {
    setMemberForm({
      id: m.id,
      name: m.name,
      email: m.email || '',
      password: '',
      phone: m.phone || '',
      department: m.department || '',
      roleName: m.roleName || 'Temsilci',
      permissions: m.permissions || [],
      active: m.active !== false,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deleteMember = async (id, name) => {
    if (!confirm(`"${name}" kullanıcısını silmek istediğinize emin misiniz?`)) return;
    try {
      await apiClient.delete(`/team-members/${id}`);
      await loadData();
    } catch (err) {
      alert(err.message || 'Silme işlemi başarısız.');
    }
  };

  const handleAdminResetPassword = async (e) => {
    e.preventDefault();
    if (!newPasswordForMember || newPasswordForMember.length < 6) {
      alert('Şifre en az 6 karakter olmalıdır.');
      return;
    }
    try {
      await apiClient.post(`/team-members/${selectedMemberForPassword.id}/reset-password`, {
        newPassword: newPasswordForMember,
      });
      alert(`${selectedMemberForPassword.name} kullanıcısının şifresi başarıyla değiştirildi.`);
      setPasswordModalOpen(false);
      setSelectedMemberForPassword(null);
      setNewPasswordForMember('');
    } catch (err) {
      alert(err.message || 'Şifre güncellenemedi.');
    }
  };

  const handleSelfPasswordChange = async (e) => {
    e.preventDefault();
    setSelfPasswordMessage({ type: '', text: '' });
    if (selfPasswordForm.newPassword !== selfPasswordForm.confirmPassword) {
      setSelfPasswordMessage({ type: 'error', text: 'Yeni şifreler birbiriyle eşleşmiyor.' });
      return;
    }
    if (selfPasswordForm.newPassword.length < 6) {
      setSelfPasswordMessage({ type: 'error', text: 'Yeni şifre en az 6 karakter olmalıdır.' });
      return;
    }
    try {
      await apiClient.post('/auth/change-password', {
        currentPassword: selfPasswordForm.currentPassword,
        newPassword: selfPasswordForm.newPassword,
      });
      setSelfPasswordMessage({ type: 'success', text: 'Şifreniz başarıyla değiştirildi.' });
      setSelfPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      setSelfPasswordMessage({ type: 'error', text: err.message || 'Şifre değiştirilemedi.' });
    }
  };

  const createTask = async (e) => {
    e.preventDefault();
    const assignee = teamMembers.find((m) => String(m.id) === String(taskForm.assigneeId));
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
        <h2>Ayarlar & Kullanıcı Yönetimi</h2>
      </div>

      <div style={{ display: 'flex', borderBottom: '2px solid #e2e8f0', marginBottom: '20px', flexWrap: 'wrap', gap: '4px' }}>
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
                <option value="TRY">TRY</option><option value="USD">USD</option><option value="EUR">EUR</option>
              </select>
            </div>
            <div className="field"><label>Bildirim E-postası</label><input type="email" value={settingsForm.notifyEmail} onChange={(e) => setSettingsForm({ ...settingsForm, notifyEmail: e.target.value })} /></div>
            <div className="field"><label>SMTP Sunucusu</label><input value={settingsForm.smtpHost} onChange={(e) => setSettingsForm({ ...settingsForm, smtpHost: e.target.value })} /></div>
            <button type="submit">Ayarları Kaydet</button>
          </form>

          <hr style={{ margin: '24px 0', borderColor: '#e2e8f0' }} />

          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '16px' }}>
            <h4 style={{ color: '#991b1b', marginTop: 0, marginBottom: '8px' }}>Demo Verileri Sıfırla (Canlıya Geçiş)</h4>
            <p style={{ fontSize: '13px', color: '#7f1d1d', margin: '0 0 12px 0', lineHeight: 1.5 }}>
              Sistemi ilk kez kurarken yüklenen örnek demo markaları, yatırımcıları, lokasyonları ve sahte finans hareketlerini tek tıkla güvenle temizler.
              İşletmenizin girdiği <strong>gerçek verilere ve kullanıcı hesaplarına kesinlikle dokunulmaz</strong>.
            </p>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={cleanDemoData}
                disabled={cleaningDemo}
                style={{
                  background: '#dc2626',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '10px 16px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: cleaningDemo ? 'not-allowed' : 'pointer',
                  opacity: cleaningDemo ? 0.7 : 1
                }}
              >
                {cleaningDemo ? 'Temizleniyor...' : 'Demo Verileri Temizle'}
              </button>
            </div>
          </div>
        </article>
      )}

      {activeTab === 'team' && (
        <article className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>{memberForm.id ? `Kullanıcıyı Düzenle: ${memberForm.name}` : 'Yeni Ekip Üyesi & Kullanıcı Ekle'}</h3>
            {memberForm.id && (
              <button
                type="button"
                className="secondary-btn"
                style={{ fontSize: '12px' }}
                onClick={() => setMemberForm({
                  id: null,
                  name: '',
                  email: '',
                  password: '',
                  phone: '',
                  department: '',
                  roleName: 'Temsilci',
                  permissions: ['tasks', 'projects'],
                  active: true,
                })}
              >
                Yeni Ekleme Moduna Geç
              </button>
            )}
          </div>
          <form onSubmit={handleMemberSubmit} className="entry-form">
            <div className="field"><label>Ad Soyad *</label><input required value={memberForm.name} onChange={(e) => setMemberForm({ ...memberForm, name: e.target.value })} /></div>
            <div className="field"><label>E-posta *</label><input type="email" required value={memberForm.email} onChange={(e) => setMemberForm({ ...memberForm, email: e.target.value })} /></div>
            {!memberForm.id && (
              <div className="field"><label>Parola (İlk giriş) *</label><input type="password" required value={memberForm.password} onChange={(e) => setMemberForm({ ...memberForm, password: e.target.value })} /></div>
            )}
            <div className="field"><label>Telefon</label><input value={memberForm.phone} onChange={(e) => setMemberForm({ ...memberForm, phone: e.target.value })} /></div>
            <div className="field"><label>Departman</label><input value={memberForm.department} onChange={(e) => setMemberForm({ ...memberForm, department: e.target.value })} /></div>
            <div className="field">
              <label>CRM Rolü</label>
              <select value={memberForm.roleName} onChange={(e) => setMemberForm({ ...memberForm, roleName: e.target.value })}>
                <option>Yönetici</option><option>Uzman</option><option>Temsilci</option><option>Destek</option>
              </select>
            </div>
            <div className="field field-wide">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ margin: 0 }}>Kullanım İzinleri</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    style={{ fontSize: '0.75rem', padding: '2px 8px', background: '#e0e7ff', color: '#3730a3', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
                    onClick={() => setMemberForm({ ...memberForm, permissions: CRM_PERMISSION_OPTIONS.map((p) => p.key) })}
                  >
                    Tümünü Seç
                  </button>
                  <button
                    type="button"
                    style={{ fontSize: '0.75rem', padding: '2px 8px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                    onClick={() => setMemberForm({ ...memberForm, permissions: [] })}
                  >
                    Temizle
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px' }}>
                {CRM_PERMISSION_OPTIONS.map((perm) => (
                  <label key={perm.key} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', cursor: 'pointer' }}>
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
            <button type="submit" className="primary-btn">{memberForm.id ? 'Kullanıcıyı Güncelle' : 'Ekip Üyesi + Kullanıcı Oluştur'}</button>
          </form>

          <div className="table-wrap" style={{ marginTop: 24 }}>
            <h4 style={{ margin: '0 0 12px' }}>Kayıtlı Kullanıcılar ve Ekip Üyeleri ({teamMembers.length})</h4>
            <table>
              <thead>
                <tr>
                  <th>Ad Soyad</th>
                  <th>E-posta</th>
                  <th>Departman</th>
                  <th>Rol</th>
                  <th>İzin Sayısı</th>
                  <th>Durum</th>
                  <th style={{ textAlign: 'center' }}>İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {teamMembers.map((m) => (
                  <tr key={m.id}>
                    <td><strong>{m.name}</strong></td>
                    <td>{m.email || '—'}</td>
                    <td>{m.department || '—'}</td>
                    <td><span className="badge" style={{ background: m.roleName === 'Yönetici' ? '#dbeafe' : '#f1f5f9', color: m.roleName === 'Yönetici' ? '#1d4ed8' : '#334155' }}>{m.roleName}</span></td>
                    <td style={{ fontSize: '12px' }}>{(m.permissions || []).length} modül izni</td>
                    <td>{m.active !== false ? <span style={{ color: '#16a34a', fontWeight: 600 }}>Aktif</span> : <span style={{ color: '#dc2626' }}>Pasif</span>}</td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                        <button
                          type="button"
                          className="secondary-btn"
                          style={{ padding: '4px 8px', fontSize: '12px' }}
                          onClick={() => editMember(m)}
                          title="Bilgileri ve İzinleri Düzenle"
                        >
                          Düzenle
                        </button>
                        <button
                          type="button"
                          style={{ padding: '4px 8px', fontSize: '12px', background: '#e0e7ff', color: '#3730a3', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
                          onClick={() => {
                            setSelectedMemberForPassword(m);
                            setNewPasswordForMember('');
                            setPasswordModalOpen(true);
                          }}
                          title="Bu Kullanıcının Şifresini Değiştir"
                        >
                          Şifre Sıfırla
                        </button>
                        <button
                          type="button"
                          className="danger-btn"
                          style={{ padding: '4px 8px', fontSize: '12px' }}
                          onClick={() => deleteMember(m.id, m.name)}
                          title="Kullanıcıyı Sil"
                        >
                          Sil
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      )}

      {activeTab === 'profile' && (
        <article className="card" style={{ maxWidth: 500 }}>
          <h3>Kendi Şifremi Değiştir</h3>
          <p style={{ fontSize: '13px', color: '#64748b', marginBottom: 16 }}>
            Şu an giriş yapmış olduğunuz <strong>{user?.email}</strong> hesabının şifresini güvenle güncelleyin.
          </p>

          {selfPasswordMessage.text && (
            <div style={{
              padding: '10px 14px',
              borderRadius: 6,
              marginBottom: 16,
              fontSize: '13px',
              background: selfPasswordMessage.type === 'error' ? '#fef2f2' : '#f0fdf4',
              color: selfPasswordMessage.type === 'error' ? '#b91c1c' : '#15803d',
              border: `1px solid ${selfPasswordMessage.type === 'error' ? '#fecaca' : '#bbf7d0'}`,
            }}>
              {selfPasswordMessage.text}
            </div>
          )}

          <form onSubmit={handleSelfPasswordChange} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="field">
              <label>Mevcut Şifreniz *</label>
              <input
                type="password"
                required
                value={selfPasswordForm.currentPassword}
                onChange={(e) => setSelfPasswordForm({ ...selfPasswordForm, currentPassword: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Yeni Şifre (En az 6 karakter) *</label>
              <input
                type="password"
                required
                value={selfPasswordForm.newPassword}
                onChange={(e) => setSelfPasswordForm({ ...selfPasswordForm, newPassword: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Yeni Şifre Tekrar *</label>
              <input
                type="password"
                required
                value={selfPasswordForm.confirmPassword}
                onChange={(e) => setSelfPasswordForm({ ...selfPasswordForm, confirmPassword: e.target.value })}
              />
            </div>
            <button type="submit" className="primary-btn" style={{ alignSelf: 'flex-start', marginTop: 6 }}>
              Şifremi Güncelle
            </button>
          </form>
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
                    <td>{t.priority}</td>
                    <td>{t.status}</td>
                    <td>{t.dueDate ? String(t.dueDate).split('T')[0] : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      )}

      {activeTab === 'timeline' && (
        <article className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3>Aktivite Kayıtları (Audit Log)</h3>
            <button type="button" className="secondary-btn" onClick={loadLogs} disabled={logsLoading}>
              {logsLoading ? 'Yenileniyor...' : 'Yenile'}
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Zaman</th><th>Kullanıcı</th><th>Modül</th><th>Aksiyon</th><th>Özet</th></tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td style={{ fontSize: '12px' }}>{new Date(log.created_at).toLocaleString('tr-TR')}</td>
                    <td>{log.user_name || log.userName || `Kullanıcı #${log.user_id}`}</td>
                    <td><span className="badge">{log.module_name || log.moduleName}</span></td>
                    <td>{log.action_type || log.actionType}</td>
                    <td>{log.summary}</td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: 20 }}>Henüz aktivite kaydı bulunmuyor.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      )}

      {/* Admin Reset Password Modal */}
      {passwordModalOpen && selectedMemberForPassword && (
        <div className="inv-modal-overlay" onClick={() => setPasswordModalOpen(false)}>
          <div className="inv-modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="inv-modal-head">
              <strong>Şifre Sıfırla: {selectedMemberForPassword.name}</strong>
              <button type="button" className="secondary-btn" onClick={() => setPasswordModalOpen(false)}>✕</button>
            </div>
            <div className="inv-modal-body" style={{ padding: '20px' }}>
              <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 16px' }}>
                Kullanıcı: <strong>{selectedMemberForPassword.email || selectedMemberForPassword.name}</strong> için yeni şifre belirleyin.
              </p>
              <form onSubmit={handleAdminResetPassword}>
                <div className="field" style={{ marginBottom: 16 }}>
                  <label>Yeni Şifre (En az 6 karakter) *</label>
                  <input
                    type="password"
                    required
                    placeholder="Yeni güçlü şifre"
                    value={newPasswordForMember}
                    onChange={(e) => setNewPasswordForMember(e.target.value)}
                  />
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button type="button" className="secondary-btn" onClick={() => setPasswordModalOpen(false)}>İptal</button>
                  <button type="submit" className="primary-btn">Şifreyi Kaydet</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
