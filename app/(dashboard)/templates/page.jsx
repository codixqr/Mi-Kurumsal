'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/apiClient';

const CHANNELS = ['WhatsApp', 'Email', 'SMS'];
const CHANNEL_COLORS = { WhatsApp: '#16a34a', Email: '#2563eb', SMS: '#d97706' };

export default function TemplatesPage() {
  const [templates, setTemplates]           = useState([]);
  const [investors, setInvestors]           = useState([]);
  const [loading, setLoading]               = useState(true);
  const [activeTemplate, setActiveTemplate] = useState(null);
  const [showForm, setShowForm]             = useState(false);
  const [form, setForm]                     = useState({ id: null, title: '', body: '', channel: 'WhatsApp', imageFile: null });
  const [saving, setSaving]                 = useState(false);

  // Toplu gönderim
  const [bulkMode, setBulkMode]             = useState(false);
  const [selectedInvIds, setSelectedInvIds] = useState(new Set());
  const [invSearch, setInvSearch]           = useState('');
  const [sendChannel, setSendChannel]       = useState('WhatsApp');
  const [sending, setSending]               = useState(false);
  const [sendLog, setSendLog]               = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tData, iData] = await Promise.all([
        apiClient.get('/templates'),
        apiClient.get('/investors?pageSize=500&page=1'),
      ]);
      setTemplates(Array.isArray(tData) ? tData : []);
      setInvestors(Array.isArray(iData) ? iData : (iData.items || []));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const uploadImage = async (file) => {
    if (!file) return '';
    const fd = new FormData();
    fd.append('file', file);
    fd.append('moduleName', 'templates');
    const token = localStorage.getItem('access_token');
    const r = await fetch('/api/uploads', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
    if (!r.ok) return '';
    const j = await r.json();
    return j.file_url || '';
  };

  const saveTemplate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const imageUrl = form.imageFile ? await uploadImage(form.imageFile) : '';
      const payload = { title: form.title, eventName: form.title, body: form.body, channel: form.channel, active: true, imageUrl };
      if (form.id) await apiClient.put(`/templates/${form.id}`, payload);
      else         await apiClient.post('/templates', payload);
      setShowForm(false);
      setForm({ id: null, title: '', body: '', channel: 'WhatsApp', imageFile: null });
      await load();
    } catch (err) { alert(err.message || 'Hata oluştu'); }
    finally { setSaving(false); }
  };

  const editTemplate = (t) => {
    setForm({ id: t.id, title: t.title || '', body: t.body || '', channel: t.channel || 'WhatsApp', imageFile: null });
    setShowForm(true);
    setActiveTemplate(null);
  };

  const deleteTemplate = async (id) => {
    if (!confirm('Bu şablon silinsin mi?')) return;
    await apiClient.delete(`/templates/${id}`);
    if (activeTemplate?.id === id) setActiveTemplate(null);
    await load();
  };

  const preview = (body, investorName) => body?.replace(/\{\{name\}\}/g, investorName || 'Müşteri');

  // ── Toplu Gönderim ──
  const filteredInvestors = investors.filter(i =>
    !invSearch || i.name?.toLowerCase().includes(invSearch.toLowerCase()) || i.phone?.includes(invSearch)
  );

  const toggleInv = (id) => {
    setSelectedInvIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedInvIds.size === filteredInvestors.length) setSelectedInvIds(new Set());
    else setSelectedInvIds(new Set(filteredInvestors.map(i => i.id)));
  };

  const sendBulk = async () => {
    if (!activeTemplate)          { alert('Önce bir şablon seçin.'); return; }
    if (selectedInvIds.size === 0){ alert('En az bir kişi seçin.');  return; }
    setSending(true);
    setSendLog([]);
    const targets = investors.filter(i => selectedInvIds.has(i.id));
    const log = [];
    for (const inv of targets) {
      const msg = preview(activeTemplate.body, inv.name);
      const phone = (inv.phone || '').replace(/\D/g, '');
      let url = '';
      if (sendChannel === 'WhatsApp') url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
      else if (sendChannel === 'Email') url = `mailto:${inv.email}?subject=${encodeURIComponent(activeTemplate.title)}&body=${encodeURIComponent(msg)}`;
      else if (sendChannel === 'SMS') url = `sms:${phone}?body=${encodeURIComponent(msg)}`;

      if (url) window.open(url, '_blank');
      log.push({ name: inv.name, channel: sendChannel, status: '✓ Açıldı' });
      await new Promise(r => setTimeout(r, 400));
    }
    setSendLog(log);
    setSending(false);
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Yükleniyor...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Başlık ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#1e293b' }}>Mesaj Şablonları & Toplu Gönderim</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { setBulkMode(!bulkMode); setSendLog([]); }}
            style={{ padding: '8px 16px', borderRadius: 8, border: 'none', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', background: bulkMode ? '#1a5c38' : '#f1f5f9', color: bulkMode ? '#fff' : '#475569' }}>
            {bulkMode ? '× Toplu Modu Kapat' : '✉ Toplu Gönderim'}
          </button>
          <button onClick={() => { setShowForm(true); setForm({ id: null, title: '', body: '', channel: 'WhatsApp', imageFile: null }); }}
            className="primary-btn">+ Yeni Şablon</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: bulkMode ? 'minmax(280px, 320px) 1fr' : 'minmax(240px, 280px) 1fr', gap: 16, alignItems: 'start' }} className="templates-layout">

        {/* ── Sol: Şablon Listesi ── */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', background: '#f8fdf9', borderBottom: '1px solid #e2e8f0', fontWeight: 700, fontSize: '0.9rem', color: '#1a5c38' }}>
            Şablonlar ({templates.length})
          </div>
          {templates.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>Henüz şablon yok.</div>
          )}
          {templates.map(t => (
            <div key={t.id}
              onClick={() => setActiveTemplate(t)}
              style={{
                padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9',
                background: activeTemplate?.id === t.id ? '#f0fdf4' : '#fff',
                borderLeft: activeTemplate?.id === t.id ? '3px solid #1a5c38' : '3px solid transparent',
              }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                <span style={{ fontWeight: 600, fontSize: '0.875rem', color: '#334155' }}>{t.title}</span>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 6px', borderRadius: 5, background: `${CHANNEL_COLORS[t.channel]}18`, color: CHANNEL_COLORS[t.channel] || '#64748b' }}>
                  {t.channel}
                </span>
              </div>
              <div style={{ fontSize: '0.76rem', color: '#94a3b8', marginTop: 4, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                {t.body?.substring(0, 55)}...
              </div>
            </div>
          ))}
        </div>

        {/* ── Sağ: İçerik ── */}
        {!bulkMode ? (
          /* Tekil görüntüleme */
          <div>
            {activeTemplate ? (
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', background: '#f8fdf9', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1e293b' }}>{activeTemplate.title}</div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 2 }}>
                      Kanal: <b>{activeTemplate.channel}</b>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => editTemplate(activeTemplate)} className="secondary-btn" style={{ fontSize: '0.8rem' }}>Düzenle</button>
                    <button onClick={() => deleteTemplate(activeTemplate.id)} className="danger-btn" style={{ fontSize: '0.8rem' }}>Sil</button>
                  </div>
                </div>
                {activeTemplate.image_url && (
                  <img src={activeTemplate.image_url} alt="" style={{ width: '100%', maxHeight: 160, objectFit: 'cover' }} />
                )}
                <div style={{ padding: 20 }}>
                  <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 10, padding: 16, fontSize: '0.9rem', color: '#334155', lineHeight: 1.6, whiteSpace: 'pre-wrap', marginBottom: 20 }}>
                    {preview(activeTemplate.body, 'Ahmet Bey')}
                  </div>
                  {/* Tekil gönderim */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#475569' }}>Kişiye Gönder</div>
                    <select style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '0.875rem' }}
                      onChange={e => {
                        const inv = investors.find(i => i.id === Number(e.target.value));
                        if (!inv) return;
                        const msg = preview(activeTemplate.body, inv.name);
                        const ch  = activeTemplate.channel;
                        const ph  = (inv.phone || '').replace(/\D/g, '');
                        if (ch === 'WhatsApp') window.open(`https://wa.me/${ph}?text=${encodeURIComponent(msg)}`, '_blank');
                        else if (ch === 'Email') window.open(`mailto:${inv.email}?subject=${encodeURIComponent(activeTemplate.title)}&body=${encodeURIComponent(msg)}`, '_blank');
                        else if (ch === 'SMS') window.open(`sms:${ph}?body=${encodeURIComponent(msg)}`, '_blank');
                        e.target.value = '';
                      }}>
                      <option value="">— Kişi seçerek gönder —</option>
                      {investors.map(i => <option key={i.id} value={i.id}>{i.name} · {i.phone || 'tel yok'}</option>)}
                    </select>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {['WhatsApp', 'Email', 'SMS'].map(ch => (
                        <button key={ch} onClick={() => setBulkMode(true)}
                          style={{ padding: '7px 16px', borderRadius: 8, border: 'none', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer', background: CHANNEL_COLORS[ch], color: '#fff' }}>
                          Toplu {ch} Gönder
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ background: '#fff', border: '2px dashed #d1d5db', borderRadius: 14, padding: 48, textAlign: 'center', color: '#94a3b8' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>✉</div>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Şablon seçin</div>
                <div style={{ fontSize: '0.85rem' }}>Sol listeden bir şablon seçerek önizleme yapın ve gönderin.</div>
              </div>
            )}
          </div>
        ) : (
          /* Toplu Gönderim Modu */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Şablon + Kanal seçimi */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20 }}>
              <div style={{ fontWeight: 700, marginBottom: 12, color: '#1e293b' }}>1. Şablon ve Kanal Seç</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Şablon</label>
                  <select value={activeTemplate?.id || ''} onChange={e => setActiveTemplate(templates.find(t => t.id === Number(e.target.value)) || null)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '0.875rem' }}>
                    <option value="">— Şablon Seçin —</option>
                    {templates.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Gönderim Kanalı</label>
                  <select value={sendChannel} onChange={e => setSendChannel(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '0.875rem' }}>
                    {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              {activeTemplate && (
                <div style={{ marginTop: 12, background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 8, padding: 12, fontSize: '0.85rem', color: '#475569', whiteSpace: 'pre-wrap' }}>
                  {preview(activeTemplate.body, 'Ahmet Bey')}
                </div>
              )}
            </div>

            {/* Kişi seçimi */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontWeight: 700, color: '#1e293b' }}>2. Kişileri Seç ({selectedInvIds.size} seçili)</div>
                <button onClick={toggleAll} style={{ fontSize: '0.8rem', padding: '5px 12px', borderRadius: 6, border: '1px solid #d1d5db', background: '#f8fafc', cursor: 'pointer', fontWeight: 600 }}>
                  {selectedInvIds.size === filteredInvestors.length ? 'Seçimi Kaldır' : 'Tümünü Seç'}
                </button>
              </div>
              <input value={invSearch} onChange={e => setInvSearch(e.target.value)}
                placeholder="İsim veya telefon ara..."
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '0.875rem', marginBottom: 10, boxSizing: 'border-box' }} />
              <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid #f1f5f9', borderRadius: 8 }}>
                {filteredInvestors.map(inv => (
                  <label key={inv.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px',
                    cursor: 'pointer', borderBottom: '1px solid #f8fafc',
                    background: selectedInvIds.has(inv.id) ? '#f0fdf4' : '#fff',
                  }}>
                    <input type="checkbox" checked={selectedInvIds.has(inv.id)} onChange={() => toggleInv(inv.id)} style={{ width: 16, height: 16 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#334155' }}>{inv.name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{inv.phone || '—'} · {inv.email || '—'}</div>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{inv.pipelineStage || inv.pipeline_stage || '—'}</span>
                  </label>
                ))}
                {filteredInvestors.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>Sonuç yok.</div>}
              </div>
            </div>

            {/* Gönder */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20 }}>
              <div style={{ fontWeight: 700, color: '#1e293b', marginBottom: 12 }}>3. Gönder</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <button onClick={sendBulk} disabled={sending || selectedInvIds.size === 0 || !activeTemplate}
                  style={{
                    padding: '10px 24px', borderRadius: 10, border: 'none', fontWeight: 700,
                    fontSize: '0.9rem', cursor: 'pointer',
                    background: selectedInvIds.size > 0 && activeTemplate ? CHANNEL_COLORS[sendChannel] : '#d1d5db',
                    color: '#fff', opacity: sending ? 0.6 : 1,
                  }}>
                  {sending ? `Gönderiliyor... (${sendLog.length}/${selectedInvIds.size})` : `${sendChannel} ile ${selectedInvIds.size} Kişiye Gönder`}
                </button>
                {sendLog.length > 0 && (
                  <button onClick={() => setSendLog([])} style={{ fontSize: '0.8rem', padding: '8px 14px', borderRadius: 8, border: '1px solid #d1d5db', background: '#f8fafc', cursor: 'pointer' }}>
                    Logu Temizle
                  </button>
                )}
              </div>
              {sendLog.length > 0 && (
                <div style={{ marginTop: 14, maxHeight: 200, overflowY: 'auto', border: '1px solid #d1fae5', borderRadius: 8, background: '#f0fdf4' }}>
                  {sendLog.map((l, i) => (
                    <div key={i} style={{ padding: '7px 14px', fontSize: '0.8rem', color: '#166534', borderBottom: '1px solid #d1fae5', display: 'flex', justifyContent: 'space-between' }}>
                      <span>{l.name}</span>
                      <span style={{ color: '#16a34a', fontWeight: 700 }}>{l.status} — {l.channel}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Yeni / Düzenle Modal ── */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{form.id ? 'Şablonu Düzenle' : 'Yeni Şablon Ekle'}</h3>
              <button className="modal-close" onClick={() => setShowForm(false)}>X</button>
            </div>
            <form onSubmit={saveTemplate} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Başlık *</label>
                <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required
                  placeholder="Örn: İlk Tanışma Mesajı"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '0.875rem', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Kanal</label>
                <select value={form.channel} onChange={e => setForm({ ...form, channel: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '0.875rem' }}>
                  {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>
                  Mesaj İçeriği * <span style={{ fontWeight: 400, color: '#94a3b8' }}>(müşteri adı için {'{{name}}'} yazın)</span>
                </label>
                <textarea value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} required rows={6}
                  placeholder="Merhaba {{name}}, Mi Core olarak..."
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '0.875rem', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Görsel (İsteğe Bağlı)</label>
                <input type="file" accept="image/*" onChange={e => setForm({ ...form, imageFile: e.target.files?.[0] || null })}
                  style={{ fontSize: '0.875rem' }} />
              </div>
              <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
                <button type="submit" disabled={saving} className="primary-btn">
                  {saving ? 'Kaydediliyor...' : form.id ? 'Güncelle' : 'Kaydet'}
                </button>
                <button type="button" className="secondary-btn" onClick={() => setShowForm(false)}>İptal</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
