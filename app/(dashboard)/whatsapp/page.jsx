'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiClient } from '@/lib/apiClient';

export default function WhatsAppPage() {
  const [loading, setLoading] = useState(true);
  const [statusLoading, setStatusLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [config, setConfig] = useState({
    apiUrl: '',
    apiKey: '',
    session: 'micore',
    countryCode: '90',
    enabled: false,
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState(null);
  const [savingSettings, setSavingSettings] = useState(false);

  // Test Mesajı State
  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState('Merhaba! Bu Mi Core CRM WhatsApp test mesajıdır.');
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState(null);

  // Toplu Duyuru State
  const [targetType, setTargetType] = useState('all');
  const [targetId, setTargetId] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('Sayın {{name}},\n\nMi Core CRM üzerinden önemli bir bilgilendirme paylaşmak istiyoruz.');
  const [sendingBroadcast, setSendingBroadcast] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState(null);

  // Loglar
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Yardımcı Veriler
  const [investors, setInvestors] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);

  const loadSettingsAndStatus = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsRes, statusRes, logsRes, invRes, teamRes] = await Promise.allSettled([
        apiClient.get('/whatsapp/settings'),
        apiClient.get('/whatsapp/status'),
        apiClient.get('/whatsapp/logs?limit=30'),
        apiClient.get('/investors?pageSize=500&page=1'),
        apiClient.get('/team-members'),
      ]);

      if (settingsRes.status === 'fulfilled' && settingsRes.value?.config) {
        setConfig(prev => ({ ...prev, ...settingsRes.value.config }));
      }
      if (statusRes.status === 'fulfilled') {
        setStatus(statusRes.value);
      }
      if (logsRes.status === 'fulfilled' && logsRes.value?.logs) {
        setLogs(logsRes.value.logs);
      }
      if (invRes.status === 'fulfilled') {
        const invData = invRes.value;
        setInvestors(Array.isArray(invData) ? invData : (invData?.items || []));
      }
      if (teamRes.status === 'fulfilled' && Array.isArray(teamRes.value)) {
        setTeamMembers(teamRes.value);
      }
    } catch (e) {
      console.error('WhatsApp verileri yüklenirken hata:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettingsAndStatus();
  }, [loadSettingsAndStatus]);

  const checkStatus = async () => {
    setStatusLoading(true);
    try {
      const res = await apiClient.get('/whatsapp/status');
      setStatus(res);
    } catch (e) {
      setStatus({ connected: false, message: e.message || 'Durum kontrolü başarısız' });
    } finally {
      setStatusLoading(false);
    }
  };

  const startSession = async () => {
    setStatusLoading(true);
    try {
      const res = await apiClient.post('/whatsapp/start-session', {});
      setStatus(res);
      if (res.status === 'SCAN_QR_CODE' && res.apiUrl) {
        const openUrl = `${res.apiUrl.replace(/\/+$/, '')}/dashboard/`;
        if (confirm('Oturum başlatıldı ve QR kod bekleniyor. WAHA panelini açmak ister misiniz?')) {
          window.open(openUrl, '_blank');
        }
      }
    } catch (e) {
      alert('Oturum başlatma hatası: ' + (e.message || 'Bilinmeyen hata'));
    } finally {
      setStatusLoading(false);
    }
  };

  const saveSettings = async (e) => {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsMsg(null);
    try {
      const res = await apiClient.put('/whatsapp/settings', config);
      setSettingsMsg({ type: 'success', text: res.message || 'Ayarlar kaydedildi.' });
      await checkStatus();
    } catch (e) {
      setSettingsMsg({ type: 'error', text: e.message || 'Ayarlar kaydedilemedi.' });
    } finally {
      setSavingSettings(false);
    }
  };

  const sendTestMessage = async (e) => {
    e.preventDefault();
    if (!testPhone.trim()) {
      alert('Lütfen telefon numarası girin.');
      return;
    }
    setSendingTest(true);
    setTestResult(null);
    try {
      const res = await apiClient.post('/whatsapp/send-test', {
        phone: testPhone,
        message: testMessage,
      });
      if (res.success) {
        setTestResult({ type: 'success', text: 'Mesaj başarıyla iletildi.' });
        loadLogs();
      } else {
        setTestResult({ type: 'error', text: res.error || 'Mesaj gönderilemedi.' });
      }
    } catch (e) {
      setTestResult({ type: 'error', text: e.message || 'Gönderim hatası.' });
    } finally {
      setSendingTest(false);
    }
  };

  const sendBroadcast = async (e) => {
    e.preventDefault();
    if (!broadcastMessage.trim()) {
      alert('Lütfen duyuru mesajı yazın.');
      return;
    }
    if (!confirm('Seçilen alıcılara WhatsApp duyurusu gönderilecek. Devam etmek istiyor musunuz?')) {
      return;
    }
    setSendingBroadcast(true);
    setBroadcastResult(null);
    try {
      const res = await apiClient.post('/whatsapp/broadcast', {
        targetType,
        targetId: targetId ? Number(targetId) : 0,
        message: broadcastMessage,
        delayMs: 200,
      });
      if (res.success) {
        setBroadcastResult({ type: 'success', text: res.message });
        loadLogs();
      } else {
        setBroadcastResult({ type: 'error', text: res.error || res.message || 'Duyuru gönderilemedi.' });
      }
    } catch (e) {
      setBroadcastResult({ type: 'error', text: e.message || 'Duyuru hatası.' });
    } finally {
      setSendingBroadcast(false);
    }
  };

  const loadLogs = async () => {
    setLogsLoading(true);
    try {
      const res = await apiClient.get('/whatsapp/logs?limit=40');
      if (res.logs) setLogs(res.logs);
    } catch (e) {
      console.error('Log yükleme hatası:', e);
    } finally {
      setLogsLoading(false);
    }
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>WhatsApp modülü yükleniyor...</div>;
  }

  const isConnected = status?.connected === true;
  const isQrWaiting = status?.status === 'SCAN_QR_CODE';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ── Üst Başlık ve Hızlı Eylemler ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.35rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '1.5rem', color: '#16a34a' }}>💬</span>
            WhatsApp (WAHA) Yönetimi
          </h2>
          <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '0.85rem' }}>
            WAHA HTTP API üzerinden tekil, otomatik ve toplu WhatsApp mesajlaşma merkezi
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={checkStatus}
            disabled={statusLoading}
            className="secondary-btn"
            style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {statusLoading ? '⏳ Kontrol Ediliyor...' : '🔄 Durumu Yenile'}
          </button>
          <button
            type="button"
            onClick={startSession}
            disabled={statusLoading}
            className="primary-btn"
            style={{ fontSize: '0.85rem', background: '#16a34a', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            📱 Oturumu Başlat (QR)
          </button>
          {config.apiUrl && (
            <a
              href={`${config.apiUrl.replace(/\/+$/, '')}/dashboard/`}
              target="_blank"
              rel="noreferrer"
              className="secondary-btn"
              style={{ fontSize: '0.85rem', textDecoration: 'none' }}
            >
              ↗ WAHA Dashboard
            </a>
          )}
        </div>
      </div>

      {/* ── Canlı Bağlantı Durumu Kartı ── */}
      <div style={{
        background: isConnected ? '#f0fdf4' : (isQrWaiting ? '#fefce8' : '#fef2f2'),
        border: `1px solid ${isConnected ? '#bbf7d0' : (isQrWaiting ? '#fef08a' : '#fecaca')}`,
        borderRadius: 12,
        padding: '16px 20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: isConnected ? '#22c55e' : (isQrWaiting ? '#eab308' : '#ef4444'),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: '1.25rem',
            boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
          }}>
            {isConnected ? '✓' : (isQrWaiting ? 'QR' : '✕')}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e293b' }}>
              WAHA Oturum Durumu: <span style={{ color: isConnected ? '#15803d' : (isQrWaiting ? '#a16207' : '#b91c1c') }}>
                {status?.message || (isConnected ? 'Bağlantı Aktif' : 'Bağlantı Yok')}
              </span>
            </div>
            <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 3 }}>
              {isConnected ? (
                status?.me?.id ? (
                  <span>Bağlı WhatsApp Hattı: <b style={{ color: '#166534' }}>+{status.me.id.split('@')[0]}</b> {status.me.pushName ? `(${status.me.pushName})` : ''}</span>
                ) : 'WhatsApp servisi aktif ve mesaj gönderimine hazır.'
              ) : isQrWaiting ? (
                'Oturum hazır, WhatsApp mobil uygulamasından QR kodu taratmanız bekleniyor.'
              ) : (
                'Mesaj gönderimi yapabilmek için aşağıdaki API ayarlarını kaydedip oturumu başlatın.'
              )}
            </div>
          </div>
        </div>

        <div>
          {isQrWaiting && (
            <button
              type="button"
              onClick={() => window.open(`${config.apiUrl.replace(/\/+$/, '')}/dashboard/`, '_blank')}
              style={{
                background: '#ca8a04',
                color: '#fff',
                border: 'none',
                padding: '8px 14px',
                borderRadius: 8,
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              📲 QR Kodu WAHA Panelinde Oku
            </button>
          )}
        </div>
      </div>

      {/* ── 2 Sütunlu Ana İçerik Grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20 }}>
        {/* ── Sol: API Ayarları Kartı ── */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 22 }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
            ⚙ API ve Oturum Ayarları
          </h3>

          {settingsMsg && (
            <div style={{
              padding: '10px 14px',
              borderRadius: 8,
              fontSize: '0.85rem',
              marginBottom: 16,
              background: settingsMsg.type === 'success' ? '#f0fdf4' : '#fef2f2',
              color: settingsMsg.type === 'success' ? '#166534' : '#991b1b',
              border: `1px solid ${settingsMsg.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
            }}>
              {settingsMsg.text}
            </div>
          )}

          <form onSubmit={saveSettings} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', color: '#334155' }}>
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={e => setConfig({ ...config, enabled: e.target.checked })}
                style={{ width: 18, height: 18, accentColor: '#16a34a' }}
              />
              WhatsApp Entegrasyonunu Aktif Et
            </label>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                WAHA API URL
              </label>
              <input
                type="url"
                value={config.apiUrl}
                onChange={e => setConfig({ ...config, apiUrl: e.target.value })}
                placeholder="https://waha.siteniz.com"
                required
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
              />
              <small style={{ color: '#94a3b8', fontSize: '0.75rem' }}>Örn: https://waha.alanadiniz.com veya http://localhost:3000</small>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                API Key
              </label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={config.apiKey}
                  onChange={e => setConfig({ ...config, apiKey: e.target.value })}
                  placeholder="Opsiyonel gizli anahtar"
                  style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="secondary-btn"
                  style={{ fontSize: '0.8rem', padding: '0 12px' }}
                >
                  {showApiKey ? 'Gizle' : 'Göster'}
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                  Oturum (Session)
                </label>
                <input
                  type="text"
                  value={config.session}
                  onChange={e => setConfig({ ...config, session: e.target.value })}
                  placeholder="default"
                  required
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                  Varsayılan Ülke Kodu
                </label>
                <input
                  type="text"
                  value={config.countryCode}
                  onChange={e => setConfig({ ...config, countryCode: e.target.value })}
                  placeholder="90"
                  required
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                />
              </div>
            </div>

            <div style={{ marginTop: 10, textAlign: 'right' }}>
              <button
                type="submit"
                disabled={savingSettings}
                className="primary-btn"
                style={{ background: '#16a34a', padding: '10px 24px', fontSize: '0.9rem' }}
              >
                {savingSettings ? 'Kaydediliyor...' : '💾 Ayarları Kaydet'}
              </button>
            </div>
          </form>
        </div>

        {/* ── Sağ: Hızlı Test & Toplu Duyuru ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Test Gönderimi */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 22 }}>
            <h3 style={{ margin: '0 0 14px 0', fontSize: '1.05rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
              🚀 Hızlı Test Mesajı Gönder
            </h3>

            {testResult && (
              <div style={{
                padding: '8px 12px',
                borderRadius: 8,
                fontSize: '0.85rem',
                marginBottom: 12,
                background: testResult.type === 'success' ? '#f0fdf4' : '#fef2f2',
                color: testResult.type === 'success' ? '#166534' : '#991b1b',
                border: `1px solid ${testResult.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
              }}>
                {testResult.text}
              </div>
            )}

            <form onSubmit={sendTestMessage} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input
                type="text"
                value={testPhone}
                onChange={e => setTestPhone(e.target.value)}
                placeholder="Telefon (Örn: +90 532 000 0000 veya 0532...)"
                required
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
              />
              <textarea
                rows={2}
                value={testMessage}
                onChange={e => setTestMessage(e.target.value)}
                placeholder="Test mesajı..."
                required
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.85rem', resize: 'vertical' }}
              />
              <button
                type="submit"
                disabled={sendingTest}
                className="secondary-btn"
                style={{ alignSelf: 'flex-end', fontSize: '0.85rem', padding: '6px 16px' }}
              >
                {sendingTest ? 'Gönderiliyor...' : '✉ Test Gönder'}
              </button>
            </form>
          </div>

          {/* Toplu Duyuru */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 22 }}>
            <h3 style={{ margin: '0 0 14px 0', fontSize: '1.05rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
              📢 Toplu Mesaj / Duyuru
            </h3>

            {broadcastResult && (
              <div style={{
                padding: '8px 12px',
                borderRadius: 8,
                fontSize: '0.85rem',
                marginBottom: 12,
                background: broadcastResult.type === 'success' ? '#f0fdf4' : '#fef2f2',
                color: broadcastResult.type === 'success' ? '#166534' : '#991b1b',
                border: `1px solid ${broadcastResult.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
              }}>
                {broadcastResult.text}
              </div>
            )}

            <form onSubmit={sendBroadcast} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <select
                  value={targetType}
                  onChange={e => { setTargetType(e.target.value); setTargetId(''); }}
                  style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                >
                  <option value="all">Tüm Kayıtlı Yatırımcılar ({investors.filter(i => i.phone || i.whatsappPhone).length})</option>
                  <option value="single_investor">Tekil Yatırımcı</option>
                  <option value="all_team">Ekip Üyeleri ({teamMembers.length})</option>
                </select>

                {targetType === 'single_investor' && (
                  <select
                    value={targetId}
                    onChange={e => setTargetId(e.target.value)}
                    required
                    style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                  >
                    <option value="">Yatırımcı Seçin...</option>
                    {investors.map(inv => (
                      <option key={inv.id} value={inv.id}>
                        {inv.name} ({inv.whatsappPhone || inv.phone || 'Telefonsuz'})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <textarea
                rows={3}
                value={broadcastMessage}
                onChange={e => setBroadcastMessage(e.target.value)}
                placeholder="Duyuru mesajı... (Örn: Sayın {{name}}, ...)"
                required
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.85rem', resize: 'vertical' }}
              />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Kullanılabilir Etiketler: <code>{'{{name}}'}</code>, <code>{'{{phone}}'}</code>, <code>{'{{city}}'}</code>
                </div>
                <button
                  type="submit"
                  disabled={sendingBroadcast}
                  className="primary-btn"
                  style={{ background: '#16a34a', fontSize: '0.85rem', padding: '6px 16px' }}
                >
                  {sendingBroadcast ? 'Duyuru İletiliyor...' : '🚀 Duyuruyu Gönder'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* ── Alt Kısım: Son Loglar ── */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#1e293b' }}>Son Gönderim Kayıtları (Loglar)</h3>
            <small style={{ color: '#64748b' }}>Sistem üzerinden iletilen son WhatsApp mesajları</small>
          </div>
          <button
            type="button"
            onClick={loadLogs}
            disabled={logsLoading}
            className="secondary-btn"
            style={{ fontSize: '0.8rem', padding: '4px 12px' }}
          >
            {logsLoading ? 'Yenileniyor...' : '↻ Yenile'}
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#f1f5f9', color: '#475569', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '10px 16px', fontWeight: 600 }}>Tarih</th>
                <th style={{ padding: '10px 16px', fontWeight: 600 }}>Alıcı</th>
                <th style={{ padding: '10px 16px', fontWeight: 600 }}>Telefon</th>
                <th style={{ padding: '10px 16px', fontWeight: 600 }}>Tür</th>
                <th style={{ padding: '10px 16px', fontWeight: 600 }}>Mesaj Özeti</th>
                <th style={{ padding: '10px 16px', fontWeight: 600 }}>Durum</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>
                    Henüz kayıtlı bir WhatsApp gönderim logu bulunmuyor.
                  </td>
                </tr>
              ) : (
                logs.map(log => {
                  const isOk = log.status === 'success' || log.status === 'OK' || log.durum === 1;
                  return (
                    <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 16px', color: '#64748b', whiteSpace: 'nowrap' }}>
                        {new Date(log.created_at).toLocaleString('tr-TR')}
                      </td>
                      <td style={{ padding: '10px 16px', fontWeight: 600, color: '#334155' }}>
                        {log.recipient_name || log.alici_ad || '-'}
                      </td>
                      <td style={{ padding: '10px 16px', color: '#475569' }}>
                        <code>{log.phone || log.telefon}</code>
                      </td>
                      <td style={{ padding: '10px 16px', color: '#64748b' }}>
                        {log.message_type || log.mesaj_turu || 'Metin'}
                      </td>
                      <td style={{ padding: '10px 16px', color: '#64748b', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {log.content || log.icerik || '-'}
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: 6,
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          background: isOk ? '#dcfce7' : '#fee2e2',
                          color: isOk ? '#15803d' : '#b91c1c',
                        }}>
                          {isOk ? 'Başarılı' : 'Hata'}
                        </span>
                        {log.error_message && (
                          <span style={{ marginLeft: 6, fontSize: '0.75rem', color: '#b91c1c' }} title={log.error_message}>
                            ({log.error_message.slice(0, 30)}...)
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
