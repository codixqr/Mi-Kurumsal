'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { apiClient } from '@/lib/apiClient';

const PIPELINE_STAGES = [
  'Yeni Lead',
  'İletişim Kuruldu',
  'Görüşme Yapıldı',
  'Analiz Yapıldı',
  'Marka Önerildi',
  'Sunum Yapıldı',
  'Teklif Verildi',
  'Sözleşme Süreci',
  'Kazanıldı (Anlaşma Sağlandı)',
  'Kaybedildi',
];

const PLACEHOLDERS = [
  { tag: '{{name}}', label: 'Ad Soyad / Yetkili', desc: 'Alıcının adı veya yetkili kişi' },
  { tag: '{{phone}}', label: 'Telefon', desc: 'Alıcının telefon numarası' },
  { tag: '{{city}}', label: 'Şehir', desc: 'Alıcının şehri' },
  { tag: '{{sector}}', label: 'Sektör', desc: 'Alıcının sektörü' },
  { tag: '{{brand}}', label: 'Marka', desc: 'İlgili marka adı' },
];

export default function WhatsAppPage() {
  const [activeTab, setActiveTab] = useState('send'); // 'send' | 'connection' | 'logs'
  const [loading, setLoading] = useState(true);
  const [statusLoading, setStatusLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [qrKey, setQrKey] = useState(Date.now());

  // Ayarlar
  const [config, setConfig] = useState({
    apiUrl: 'https://waha.aifgenclik.at',
    apiKey: 'Erbakan1926FilistineOzgurluk',
    session: 'micore',
    countryCode: '90',
    enabled: true,
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState(null);
  const [savingSettings, setSavingSettings] = useState(false);

  // Veri Listeleri
  const [investors, setInvestors] = useState([]);
  const [brands, setBrands] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Gönderim Form State
  const [recipientType, setRecipientType] = useState('single_investor');
  const [targetId, setTargetId] = useState('');
  const [customPhone, setCustomPhone] = useState('');
  const [customName, setCustomName] = useState('');
  const [message, setMessage] = useState('Merhaba Sayın {{name}},\n\nMi Core CRM üzerinden sizinle iletişime geçiyoruz.');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);

  // Ek Dosya / Resim State
  const [attachedFile, setAttachedFile] = useState(null); // { name, size, type, dataUrl, isImage }
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);

  // İlk Veri Yükleme
  const loadInitialData = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsRes, statusRes, invRes, brandsRes, teamRes, templatesRes, logsRes] = await Promise.allSettled([
        apiClient.get('/whatsapp/settings'),
        apiClient.get('/whatsapp/status'),
        apiClient.get('/investors?pageSize=500&page=1'),
        apiClient.get('/brands?pageSize=500&page=1'),
        apiClient.get('/team-members'),
        apiClient.get('/templates'),
        apiClient.get('/whatsapp/logs?limit=40'),
      ]);

      if (settingsRes.status === 'fulfilled' && settingsRes.value?.config) {
        setConfig(prev => ({ ...prev, ...settingsRes.value.config }));
      }
      if (statusRes.status === 'fulfilled') {
        setStatus(statusRes.value);
      }
      if (invRes.status === 'fulfilled') {
        const invData = invRes.value;
        const list = Array.isArray(invData) ? invData : (invData?.items || []);
        setInvestors(list);
        if (list.length > 0 && !targetId) {
          setTargetId(String(list[0].id));
        }
      }
      if (brandsRes.status === 'fulfilled') {
        const bData = brandsRes.value;
        setBrands(Array.isArray(bData) ? bData : (bData?.items || []));
      }
      if (teamRes.status === 'fulfilled' && Array.isArray(teamRes.value)) {
        setTeamMembers(teamRes.value);
      }
      if (templatesRes.status === 'fulfilled' && Array.isArray(templatesRes.value)) {
        setTemplates(templatesRes.value.filter(t => t.channel === 'whatsapp' || !t.channel));
      }
      if (logsRes.status === 'fulfilled' && logsRes.value?.logs) {
        setLogs(logsRes.value.logs);
      }
    } catch (e) {
      console.error('WhatsApp veri yükleme hatası:', e);
    } finally {
      setLoading(false);
    }
  }, [targetId]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Durum Kontrolü
  const checkStatus = async () => {
    setStatusLoading(true);
    try {
      const res = await apiClient.get('/whatsapp/status');
      setStatus(res);
      setQrKey(Date.now());
    } catch (e) {
      setStatus({ connected: false, message: e.message || 'Durum kontrolü başarısız' });
    } finally {
      setStatusLoading(false);
    }
  };

  // Oturum Başlatma (QR)
  const startSession = async () => {
    setStatusLoading(true);
    try {
      const res = await apiClient.post('/whatsapp/start-session', {});
      setStatus(res);
      setQrKey(Date.now());
    } catch (e) {
      alert('Oturum başlatma hatası: ' + (e.message || 'Bilinmeyen hata'));
    } finally {
      setStatusLoading(false);
    }
  };

  // Ayarları Kaydet
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

  // Logları Yenile
  const refreshLogs = async () => {
    setLogsLoading(true);
    try {
      const res = await apiClient.get('/whatsapp/logs?limit=50');
      if (res.logs) setLogs(res.logs);
    } catch (e) {
      console.error('Log yenileme hatası:', e);
    } finally {
      setLogsLoading(false);
    }
  };

  // Placeholder Ekle
  const insertPlaceholder = (tag) => {
    const el = textareaRef.current;
    if (!el) {
      setMessage(prev => prev + ' ' + tag);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const newText = message.substring(0, start) + tag + message.substring(end);
    setMessage(newText);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + tag.length, start + tag.length);
    }, 50);
  };

  // Şablon Seçimi
  const handleTemplateSelect = (e) => {
    const tId = e.target.value;
    if (!tId) return;
    const found = templates.find(t => String(t.id) === String(tId));
    if (found && found.body) {
      setMessage(found.body);
    }
  };

  // Dosya Seçimi (Base64 Okuma)
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
      alert('Dosya boyutu en fazla 20 MB olabilir.');
      return;
    }

    const isImage = file.type.startsWith('image/');
    const reader = new FileReader();
    reader.onload = () => {
      setAttachedFile({
        name: file.name,
        size: (file.size / 1024).toFixed(1) + ' KB',
        type: file.type || 'application/octet-stream',
        dataUrl: reader.result,
        isImage,
      });
    };
    reader.readAsDataURL(file);
  };

  const removeAttachedFile = () => {
    setAttachedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Canlı Önizleme İçin Seçili Kişi Bilgisi
  const getSelectedPreviewContact = () => {
    if (recipientType === 'single_investor') {
      const inv = investors.find(i => String(i.id) === String(targetId)) || investors[0];
      return {
        name: inv?.name || 'Müşteri Adı',
        phone: inv?.whatsapp_phone || inv?.phone || '+90 5XX XXX XX XX',
        city: inv?.city || 'İstanbul',
        sector: inv?.sector || 'Gıda',
        brand: 'Örnek Marka',
      };
    }
    if (recipientType === 'single_brand') {
      const br = brands.find(b => String(b.id) === String(targetId)) || brands[0];
      return {
        name: br?.contact_person || br?.name || 'Marka Yetkilisi',
        phone: br?.whatsapp_phone || br?.contact_phone || '+90 5XX XXX XX XX',
        city: 'Türkiye Geneli',
        sector: br?.sector || 'Franchise',
        brand: br?.name || 'Marka',
      };
    }
    if (recipientType === 'single_team') {
      const tm = teamMembers.find(t => String(t.id) === String(targetId)) || teamMembers[0];
      return {
        name: tm?.name || 'Ekip Üyesi',
        phone: tm?.phone || '+90 5XX XXX XX XX',
        city: 'Merkez Ofis',
        sector: tm?.department || 'Operasyon',
        brand: 'Mi Core',
      };
    }
    if (recipientType === 'single_custom') {
      return {
        name: customName || 'Alıcı',
        phone: customPhone || '+90 5XX XXX XX XX',
        city: 'Şehir',
        sector: 'Sektör',
        brand: 'Marka',
      };
    }
    return {
      name: 'Örnek Müşteri',
      phone: '+90 532 000 00 00',
      city: 'İstanbul',
      sector: 'Perakende',
      brand: 'Mi Core Markası',
    };
  };

  const previewContact = getSelectedPreviewContact();
  const previewMessage = (message || '')
    .replace(/\{\{name\}\}/gi, previewContact.name)
    .replace(/\{\{ad_soyad\}\}/gi, previewContact.name)
    .replace(/\{\{phone\}\}/gi, previewContact.phone)
    .replace(/\{\{city\}\}/gi, previewContact.city)
    .replace(/\{\{sehir\}\}/gi, previewContact.city)
    .replace(/\{\{sector\}\}/gi, previewContact.sector)
    .replace(/\{\{sektor\}\}/gi, previewContact.sector)
    .replace(/\{\{brand\}\}/gi, previewContact.brand);

  // Alıcı Sayısını Hesapla
  const getRecipientSummary = () => {
    switch (recipientType) {
      case 'single_investor': {
        const inv = investors.find(i => String(i.id) === String(targetId));
        return inv ? `1 Kişi (${inv.name})` : '1 Yatırımcı';
      }
      case 'all_investors': {
        const count = investors.filter(i => i.phone || i.whatsapp_phone).length;
        return `Tüm Yatırımcılar (${count} Kişi)`;
      }
      case 'investors_stage': {
        const count = investors.filter(i => i.pipeline_stage === targetId && (i.phone || i.whatsapp_phone)).length;
        return `${targetId || 'Seçili Aşama'} (${count} Kişi)`;
      }
      case 'single_brand': {
        const br = brands.find(b => String(b.id) === String(targetId));
        return br ? `1 Marka Yetkilisi (${br.name})` : '1 Marka';
      }
      case 'all_brands': {
        const count = brands.filter(b => b.contact_phone || b.whatsapp_phone).length;
        return `Tüm Markalar (${count} Marka)`;
      }
      case 'single_team': {
        const tm = teamMembers.find(t => String(t.id) === String(targetId));
        return tm ? `1 Ekip Üyesi (${tm.name})` : '1 Ekip Üyesi';
      }
      case 'all_team': {
        const count = teamMembers.filter(t => t.phone).length;
        return `Tüm Ekip (${count} Kişi)`;
      }
      case 'single_custom': {
        return customPhone ? `Manuel Numara (${customPhone})` : 'Manuel Numara';
      }
      default:
        return 'Alıcı Seçimi';
    }
  };

  // Gönderim Fonksiyonu
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!message.trim() && !attachedFile) {
      alert('Lütfen mesaj metni yazın veya bir dosya ekleyin.');
      return;
    }

    if (recipientType === 'single_custom' && !customPhone.trim()) {
      alert('Lütfen geçerli bir telefon numarası girin.');
      return;
    }

    const recipientSummaryText = getRecipientSummary();
    if (!confirm(`${recipientSummaryText} adresine WhatsApp mesajı ${attachedFile ? 've ek dosya ' : ''}gönderilecek. Onaylıyor musunuz?`)) {
      return;
    }

    setSending(true);
    setSendResult(null);

    try {
      const payload = {
        targetType: recipientType,
        targetId: (recipientType === 'investors_stage') ? targetId : (targetId ? Number(targetId) : null),
        customPhone: customPhone.trim(),
        customName: customName.trim(),
        message: message.trim(),
        fileUrl: attachedFile?.dataUrl || null,
        filename: attachedFile?.name || null,
        delayMs: 300,
      };

      const res = await apiClient.post('/whatsapp/broadcast', payload);
      if (res.success) {
        setSendResult({
          type: 'success',
          text: res.message || 'WhatsApp mesajı başarıyla iletildi.',
          details: res,
        });
        refreshLogs();
      } else {
        setSendResult({
          type: 'error',
          text: res.error || res.message || 'Gönderim sırasında hata oluştu.',
        });
      }
    } catch (err) {
      setSendResult({
        type: 'error',
        text: err.message || 'Mesaj iletilemedi. Lütfen bağlantı durumunu kontrol edin.',
      });
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>WhatsApp modülü yükleniyor...</div>;
  }

  const isConnected = status?.connected === true;
  const isQrWaiting = status?.status === 'SCAN_QR_CODE';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ── Üst Başlık & Sekmeler ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.4rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '1.6rem', color: '#16a34a' }}>💬</span>
            WhatsApp Mesaj & Dosya Gönderme Merkezi
          </h2>
          <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '0.88rem' }}>
            Yatırımcılara, markalara veya ekibinize kişiselleştirilmiş WhatsApp mesajları, teklifler, sunumlar ve belgeler iletin.
          </p>
        </div>

        {/* Bağlantı Rozeti */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 14px',
              borderRadius: 20,
              fontSize: '0.85rem',
              fontWeight: 600,
              background: isConnected ? '#ecfdf5' : isQrWaiting ? '#fefce8' : '#fef2f2',
              color: isConnected ? '#15803d' : isQrWaiting ? '#a16207' : '#b91c1c',
              border: `1px solid ${isConnected ? '#bbf7d0' : isQrWaiting ? '#fef08a' : '#fecaca'}`,
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: isConnected ? '#22c55e' : isQrWaiting ? '#eab308' : '#ef4444' }} />
            {isConnected ? 'WAHA Bağlı (Aktif)' : isQrWaiting ? 'QR Kod Bekleniyor' : 'Bağlantı Yok'}
          </div>
        </div>
      </div>

      {/* ── Sekme Butonları ── */}
      <div style={{ display: 'flex', borderBottom: '2px solid #e2e8f0', gap: 6 }}>
        <button
          type="button"
          onClick={() => setActiveTab('send')}
          style={{
            padding: '10px 20px',
            border: 'none',
            borderBottom: activeTab === 'send' ? '3px solid #16a34a' : '3px solid transparent',
            background: 'none',
            fontWeight: activeTab === 'send' ? 700 : 500,
            color: activeTab === 'send' ? '#16a34a' : '#64748b',
            cursor: 'pointer',
            fontSize: '0.95rem',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          📨 Mesaj & Dosya Gönder
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('connection')}
          style={{
            padding: '10px 20px',
            border: 'none',
            borderBottom: activeTab === 'connection' ? '3px solid #16a34a' : '3px solid transparent',
            background: 'none',
            fontWeight: activeTab === 'connection' ? 700 : 500,
            color: activeTab === 'connection' ? '#16a34a' : '#64748b',
            cursor: 'pointer',
            fontSize: '0.95rem',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          📱 WAHA Bağlantısı & QR Kod
        </button>
        <button
          type="button"
          onClick={() => { setActiveTab('logs'); refreshLogs(); }}
          style={{
            padding: '10px 20px',
            border: 'none',
            borderBottom: activeTab === 'logs' ? '3px solid #16a34a' : '3px solid transparent',
            background: 'none',
            fontWeight: activeTab === 'logs' ? 700 : 500,
            color: activeTab === 'logs' ? '#16a34a' : '#64748b',
            cursor: 'pointer',
            fontSize: '0.95rem',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          📜 Gönderim Geçmişi ({logs.length})
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════════════════════════════════ */}
      {/* ── 1. SEKME: MESAJ & DOSYA GÖNDER ── */}
      {/* ══════════════════════════════════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'send' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: 24, alignItems: 'start' }}>
          
          {/* Sol Kolon: Gönderim Formu */}
          <form onSubmit={handleSendMessage} className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
            
            {/* Bildirim Sonucu */}
            {sendResult && (
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: 8,
                  fontSize: '0.9rem',
                  fontWeight: 500,
                  background: sendResult.type === 'success' ? '#ecfdf5' : '#fef2f2',
                  color: sendResult.type === 'success' ? '#065f46' : '#991b1b',
                  border: `1px solid ${sendResult.type === 'success' ? '#a7f3d0' : '#fecaca'}`,
                }}
              >
                {sendResult.type === 'success' ? '✅ ' : '❌ '} {sendResult.text}
              </div>
            )}

            {/* ADIM 1: Alıcı Seçimi */}
            <div>
              <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>
                1. Kime Gönderilecek? (Alıcı Seçimi)
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: '0.8rem', color: '#64748b', display: 'block', marginBottom: 4 }}>Hedef Grubu</label>
                  <select
                    value={recipientType}
                    onChange={(e) => {
                      const val = e.target.value;
                      setRecipientType(val);
                      if (val === 'single_investor' && investors.length > 0) setTargetId(String(investors[0].id));
                      else if (val === 'single_brand' && brands.length > 0) setTargetId(String(brands[0].id));
                      else if (val === 'single_team' && teamMembers.length > 0) setTargetId(String(teamMembers[0].id));
                      else if (val === 'investors_stage') setTargetId(PIPELINE_STAGES[0]);
                      else setTargetId('');
                    }}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                  >
                    <optgroup label="Tekil Kişi">
                      <option value="single_investor">👤 Tekil Yatırımcı / Müşteri</option>
                      <option value="single_brand">🏢 Tekil Marka Yetkilisi</option>
                      <option value="single_team">💼 Tekil Ekip Üyesi</option>
                      <option value="single_custom">✍️ Manuel Numara Girişi</option>
                    </optgroup>
                    <optgroup label="Toplu Gönderim">
                      <option value="all_investors">👥 Tüm Yatırımcılar ({investors.filter(i => i.phone || i.whatsapp_phone).length})</option>
                      <option value="investors_stage">🎯 Aşamadaki Yatırımcılar (Pipeline)</option>
                      <option value="all_brands">🏢 Tüm Markalar ({brands.filter(b => b.contact_phone || b.whatsapp_phone).length})</option>
                      <option value="all_team">👥 Tüm Ekip Üyeleri ({teamMembers.filter(t => t.phone).length})</option>
                    </optgroup>
                  </select>
                </div>

                {/* Dinamik Alt Seçici */}
                <div>
                  {recipientType === 'single_investor' && (
                    <>
                      <label style={{ fontSize: '0.8rem', color: '#64748b', display: 'block', marginBottom: 4 }}>Yatırımcı Seçin</label>
                      <select
                        value={targetId}
                        onChange={(e) => setTargetId(e.target.value)}
                        style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                      >
                        {investors.map(inv => (
                          <option key={inv.id} value={inv.id}>
                            {inv.name} ({inv.whatsapp_phone || inv.phone || 'Tel Yok'}) - {inv.city || ''}
                          </option>
                        ))}
                      </select>
                    </>
                  )}

                  {recipientType === 'single_brand' && (
                    <>
                      <label style={{ fontSize: '0.8rem', color: '#64748b', display: 'block', marginBottom: 4 }}>Marka Seçin</label>
                      <select
                        value={targetId}
                        onChange={(e) => setTargetId(e.target.value)}
                        style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                      >
                        {brands.map(br => (
                          <option key={br.id} value={br.id}>
                            {br.name} ({br.contact_person || 'Yetkili'} - {br.whatsapp_phone || br.contact_phone || 'Tel Yok'})
                          </option>
                        ))}
                      </select>
                    </>
                  )}

                  {recipientType === 'single_team' && (
                    <>
                      <label style={{ fontSize: '0.8rem', color: '#64748b', display: 'block', marginBottom: 4 }}>Ekip Üyesi Seçin</label>
                      <select
                        value={targetId}
                        onChange={(e) => setTargetId(e.target.value)}
                        style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                      >
                        {teamMembers.map(tm => (
                          <option key={tm.id} value={tm.id}>
                            {tm.name} ({tm.phone || 'Tel Yok'}) - {tm.department || tm.role_name}
                          </option>
                        ))}
                      </select>
                    </>
                  )}

                  {recipientType === 'investors_stage' && (
                    <>
                      <label style={{ fontSize: '0.8rem', color: '#64748b', display: 'block', marginBottom: 4 }}>Pipeline Aşaması</label>
                      <select
                        value={targetId}
                        onChange={(e) => setTargetId(e.target.value)}
                        style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                      >
                        {PIPELINE_STAGES.map(stage => {
                          const count = investors.filter(i => i.pipeline_stage === stage && (i.phone || i.whatsapp_phone)).length;
                          return (
                            <option key={stage} value={stage}>
                              {stage} ({count} kişi)
                            </option>
                          );
                        })}
                      </select>
                    </>
                  )}

                  {recipientType === 'single_custom' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      <div>
                        <label style={{ fontSize: '0.8rem', color: '#64748b', display: 'block', marginBottom: 4 }}>Telefon *</label>
                        <input
                          type="text"
                          required
                          placeholder="05XXXXXXXXX"
                          value={customPhone}
                          onChange={(e) => setCustomPhone(e.target.value)}
                          style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.8rem', color: '#64748b', display: 'block', marginBottom: 4 }}>İsim</label>
                        <input
                          type="text"
                          placeholder="Ahmet Bey"
                          value={customName}
                          onChange={(e) => setCustomName(e.target.value)}
                          style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                        />
                      </div>
                    </div>
                  )}

                  {['all_investors', 'all_brands', 'all_team'].includes(recipientType) && (
                    <div style={{ padding: '12px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.85rem', color: '#475569' }}>
                      ℹ️ Bu seçenek telefon numarası kayıtlı olan tüm alıcılara mesajı teker teker ve kişiselleştirilmiş olarak iletir.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ADIM 2: Hazır Şablon & Placeholder'lar */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
                <label style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1e293b' }}>
                  2. Mesaj Metni & Değişkenler (Placeholder)
                </label>

                {templates.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Hazır Şablon:</span>
                    <select
                      onChange={handleTemplateSelect}
                      defaultValue=""
                      style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.82rem', background: '#fff' }}
                    >
                      <option value="">Şablon Seç...</option>
                      {templates.map(t => (
                        <option key={t.id} value={t.id}>{t.title} ({t.event_name})</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Tıklanabilir Placeholder Butonları */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                <span style={{ fontSize: '0.78rem', color: '#64748b', alignSelf: 'center', marginRight: 4 }}>Değişken Ekle:</span>
                {PLACEHOLDERS.map(p => (
                  <button
                    key={p.tag}
                    type="button"
                    onClick={() => insertPlaceholder(p.tag)}
                    title={p.desc}
                    style={{
                      padding: '4px 9px',
                      borderRadius: 6,
                      border: '1px solid #cbd5e1',
                      background: '#f1f5f9',
                      color: '#0f172a',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <span>+</span> {p.tag} <span style={{ opacity: 0.6, fontSize: '0.72rem' }}>({p.label})</span>
                  </button>
                ))}
              </div>

              <textarea
                ref={textareaRef}
                rows={6}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="WhatsApp mesaj metninizi buraya yazın..."
                style={{
                  width: '100%',
                  padding: 12,
                  borderRadius: 8,
                  border: '1px solid #cbd5e1',
                  fontSize: '0.92rem',
                  fontFamily: 'inherit',
                  lineHeight: '1.5',
                  resize: 'vertical',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#64748b', marginTop: 4 }}>
                <span>💡 İpucu: Placeholder'lar alıcının gerçek ad/telefon bilgisiyle otomatik değişir.</span>
                <span>{message.length} karakter</span>
              </div>
            </div>

            {/* ADIM 3: Ek Dosya / Resim / Belge */}
            <div>
              <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>
                3. Ek Dosya / Resim / Belge (Opsiyonel)
              </label>

              {!attachedFile ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: '2px dashed #cbd5e1',
                    borderRadius: 8,
                    padding: '18px 20px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    background: '#f8fafc',
                    transition: 'border-color 0.2s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = '#16a34a'}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = '#cbd5e1'}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    style={{ display: 'none' }}
                    onChange={handleFileChange}
                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
                  />
                  <div style={{ fontSize: '1.8rem', marginBottom: 4 }}>📎</div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#334155' }}>
                    Dosya seçmek için tıklayın veya sürükleyip bırakın
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 2 }}>
                    Resim (PNG, JPG), PDF Sözleşme, Sunum veya Excel belgeleri (Maks. 20 MB)
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    borderRadius: 8,
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {attachedFile.isImage ? (
                      <img
                        src={attachedFile.dataUrl}
                        alt="Önizleme"
                        style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, border: '1px solid #86efac' }}
                      />
                    ) : (
                      <div style={{ width: 44, height: 44, borderRadius: 6, background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}>
                        📄
                      </div>
                    )}
                    <div>
                      <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#166534' }}>{attachedFile.name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#15803d' }}>{attachedFile.size} • {attachedFile.type}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={removeAttachedFile}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#dc2626',
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      padding: '4px 8px',
                    }}
                  >
                    ✕ Dosyayı Kaldır
                  </button>
                </div>
              )}
            </div>

            {/* ADIM 4: Gönder Butonu */}
            <div style={{ paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
              <button
                type="submit"
                disabled={sending || (!isConnected && !confirm)}
                style={{
                  width: '100%',
                  padding: '14px 24px',
                  borderRadius: 8,
                  border: 'none',
                  background: isConnected ? '#16a34a' : '#059669',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: '1rem',
                  cursor: sending ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  boxShadow: '0 2px 8px rgba(22, 163, 74, 0.25)',
                }}
              >
                {sending ? (
                  <>⏳ Mesaj Gönderiliyor...</>
                ) : (
                  <>🚀 WhatsApp ile Gönder ({getRecipientSummary()})</>
                )}
              </button>
            </div>
          </form>

          {/* Sağ Kolon: Canlı WhatsApp Telefon Önizlemesi */}
          <div style={{ position: 'sticky', top: 20 }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              📱 Canlı WhatsApp Önizlemesi (Müşteri Ekranı)
            </div>

            {/* Telefon Çerçevesi */}
            <div
              style={{
                borderRadius: 24,
                overflow: 'hidden',
                boxShadow: '0 12px 30px rgba(0,0,0,0.15)',
                border: '8px solid #1e293b',
                background: '#efeae2',
                display: 'flex',
                flexDirection: 'column',
                minHeight: 460,
              }}
            >
              {/* WhatsApp Başlığı */}
              <div
                style={{
                  background: '#075e54',
                  color: '#fff',
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: '#128c7e',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                  }}
                >
                  {previewContact.name.slice(0, 2).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.92rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {previewContact.name}
                  </div>
                  <div style={{ fontSize: '0.72rem', opacity: 0.85 }}>çevrimiçi</div>
                </div>
                <div style={{ fontSize: '1rem', opacity: 0.8 }}>⋮</div>
              </div>

              {/* Sohbet Alanı */}
              <div
                style={{
                  flex: 1,
                  padding: '16px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'flex-end',
                  backgroundImage: 'radial-gradient(#d1d5db 1px, transparent 1px)',
                  backgroundSize: '16px 16px',
                }}
              >
                {/* Gönderilen Mesaj Baloncuğu */}
                <div
                  style={{
                    alignSelf: 'flex-end',
                    maxWidth: '85%',
                    background: '#d9fdd3',
                    borderRadius: '8px 8px 2px 8px',
                    padding: '8px 10px',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.13)',
                    color: '#111b21',
                    fontSize: '0.88rem',
                    lineHeight: '1.4',
                  }}
                >
                  {/* Ek Dosya Önizlemesi */}
                  {attachedFile && (
                    <div style={{ marginBottom: 6 }}>
                      {attachedFile.isImage ? (
                        <img
                          src={attachedFile.dataUrl}
                          alt="Gönderilen Resim"
                          style={{ width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 6 }}
                        />
                      ) : (
                        <div
                          style={{
                            background: '#c5ebd4',
                            padding: '8px 10px',
                            borderRadius: 6,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                          }}
                        >
                          <span style={{ fontSize: '1.2rem' }}>📄</span>
                          <div style={{ fontSize: '0.8rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {attachedFile.name}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Mesaj Metni */}
                  <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {previewMessage || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Mesaj metni boş...</span>}
                  </div>

                  {/* Saat & Okundu İkonu */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 3, marginTop: 4 }}>
                    <span style={{ fontSize: '0.68rem', color: '#667781' }}>
                      {new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#53bdeb' }}>✓✓</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════════════════════════════════ */}
      {/* ── 2. SEKME: WAHA BAĞLANTISI & QR KOD ── */}
      {/* ══════════════════════════════════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'connection' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 24, alignItems: 'start' }}>
          
          {/* Canlı Durum & QR Kod */}
          <div className="card" style={{ padding: 24 }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', color: '#0f172a' }}>
              📱 WhatsApp Web QR Bağlantısı
            </h3>

            <div
              style={{
                padding: '16px',
                borderRadius: 10,
                background: isConnected ? '#ecfdf5' : '#fefce8',
                border: `1px solid ${isConnected ? '#bbf7d0' : '#fef08a'}`,
                marginBottom: 20,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: isConnected ? '#15803d' : '#a16207' }}>
                {isConnected ? '✅ WhatsApp Hesabınız Başarıyla Bağlı' : '⚠️ Telefonunuzdan QR Kodu Okutun'}
              </div>
              <p style={{ margin: '6px 0 0 0', fontSize: '0.85rem', color: isConnected ? '#166534' : '#854d0e' }}>
                {isConnected
                  ? `Oturum "${config.session}" aktif. Sistem üzerinden gelen tüm mesajlar bu numara üzerinden iletilmektedir.`
                  : 'WhatsApp uygulamasını telefonunuzda açın > Bağlı Cihazlar > Cihaz Bağla adımlarını takip edin.'}
              </p>
            </div>

            {/* Canlı QR Görseli */}
            {isQrWaiting && (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <img
                  key={qrKey}
                  src={`/api/whatsapp/qr?t=${qrKey}`}
                  alt="WhatsApp QR Kod"
                  style={{
                    width: 250,
                    height: 250,
                    border: '4px solid #16a34a',
                    borderRadius: 12,
                    boxShadow: '0 4px 14px rgba(0,0,0,0.1)',
                  }}
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
                <div style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    onClick={() => setQrKey(Date.now())}
                    className="secondary-btn"
                    style={{ fontSize: '0.82rem' }}
                  >
                    🔄 QR Kodu Yenile
                  </button>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button
                type="button"
                onClick={checkStatus}
                disabled={statusLoading}
                className="secondary-btn"
              >
                {statusLoading ? '⏳ Kontrol Ediliyor...' : '🔄 Durumu Yeniden Kontrol Et'}
              </button>
              <button
                type="button"
                onClick={startSession}
                disabled={statusLoading}
                className="primary-btn"
                style={{ background: '#16a34a' }}
              >
                📱 Oturumu Başlat (QR Üret)
              </button>
            </div>
          </div>

          {/* WAHA Sunucu Ayarları */}
          <div className="card" style={{ padding: 24 }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', color: '#0f172a' }}>
              ⚙️ WAHA Sunucu & API Bilgileri
            </h3>

            {settingsMsg && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: 6,
                  marginBottom: 16,
                  fontSize: '0.85rem',
                  background: settingsMsg.type === 'success' ? '#ecfdf5' : '#fef2f2',
                  color: settingsMsg.type === 'success' ? '#065f46' : '#991b1b',
                }}
              >
                {settingsMsg.text}
              </div>
            )}

            <form onSubmit={saveSettings} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: 4 }}>
                  WAHA API URL
                </label>
                <input
                  type="text"
                  required
                  value={config.apiUrl}
                  onChange={(e) => setConfig({ ...config, apiUrl: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: 4 }}>
                  API Key
                </label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={config.apiKey}
                    onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                    style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="secondary-btn"
                    style={{ fontSize: '0.82rem' }}
                  >
                    {showApiKey ? 'Gizle' : 'Göster'}
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: 4 }}>
                    Oturum Adı (Session)
                  </label>
                  <input
                    type="text"
                    required
                    value={config.session}
                    onChange={(e) => setConfig({ ...config, session: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: 4 }}>
                    Ülke Kodu
                  </label>
                  <input
                    type="text"
                    required
                    value={config.countryCode}
                    onChange={(e) => setConfig({ ...config, countryCode: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={savingSettings}
                className="primary-btn"
                style={{ marginTop: 6 }}
              >
                {savingSettings ? 'Kaydediliyor...' : 'Ayarları Kaydet'}
              </button>
            </form>
          </div>

        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════════════════════════════════ */}
      {/* ── 3. SEKME: GÖNDERİM GEÇMİŞİ (LOGLAR) ── */}
      {/* ══════════════════════════════════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'logs' && (
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a' }}>
              📜 Son Gönderilen WhatsApp Mesajları ({logs.length})
            </h3>
            <button
              type="button"
              onClick={refreshLogs}
              disabled={logsLoading}
              className="secondary-btn"
              style={{ fontSize: '0.82rem' }}
            >
              {logsLoading ? 'Yenileniyor...' : '🔄 Yenile'}
            </button>
          </div>

          {logs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px 0', color: '#94a3b8' }}>
              Henüz gönderilmiş bir WhatsApp mesajı bulunmuyor.
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Tarih</th>
                    <th>Alıcı / İsim</th>
                    <th>Telefon</th>
                    <th>Tür</th>
                    <th>İçerik Özeti</th>
                    <th>Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log.id}>
                      <td style={{ fontSize: '0.82rem', color: '#64748b', whiteSpace: 'nowrap' }}>
                        {new Date(log.created_at).toLocaleString('tr-TR')}
                      </td>
                      <td style={{ fontWeight: 600 }}>{log.recipient_name || '-'}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{log.phone}</td>
                      <td>
                        <span style={{ fontSize: '0.78rem', padding: '2px 8px', borderRadius: 4, background: '#f1f5f9' }}>
                          {log.message_type === 'file' ? '📎 Dosya' : '💬 Metin'}
                        </span>
                      </td>
                      <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.85rem' }}>
                        {log.content}
                      </td>
                      <td>
                        <span
                          style={{
                            padding: '3px 9px',
                            borderRadius: 12,
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            background: log.status === 'success' ? '#dcfce7' : '#fee2e2',
                            color: log.status === 'success' ? '#15803d' : '#b91c1c',
                          }}
                        >
                          {log.status === 'success' ? 'Başarılı' : 'Başarısız'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
