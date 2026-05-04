'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/apiClient';

export default function TemplatesPage() {
  const [templates, setTemplates] = useState([]);
  const [investors, setInvestors] = useState([]);
  const [selectedInvestorId, setSelectedInvestorId] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [form, setForm] = useState({ title: '', body: '', channel: 'WhatsApp' });
  const [templateImageFile, setTemplateImageFile] = useState(null);
  const [editingTemplateId, setEditingTemplateId] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [tData, iData] = await Promise.all([
        apiClient.get('/templates'),
        apiClient.get('/investors?pageSize=500&page=1'),
      ]);
      setTemplates(tData);
      setInvestors(Array.isArray(iData) ? iData : iData.items || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const uploadTemplateImage = async (file) => {
    if (!file) return '';
    const formData = new FormData();
    formData.append('file', file);
    formData.append('moduleName', 'templates');
    const token = localStorage.getItem('access_token');
    const response = await fetch('/api/uploads', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });
    if (!response.ok) {
      throw new Error('Görsel yüklenemedi');
    }
    const uploaded = await response.json();
    return uploaded.file_url || '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const imageUrl = await uploadTemplateImage(templateImageFile);
      const payload = {
        ...form,
        eventName: form.title,
        active: true,
        imageUrl,
      };

      if (editingTemplateId) {
        const existing = templates.find((t) => t.id === editingTemplateId);
        await apiClient.put(`/templates/${editingTemplateId}`, {
          ...payload,
          imageUrl: imageUrl || existing?.image_url || '',
        });
      } else {
        await apiClient.post('/templates', payload);
      }
      setForm({ title: '', body: '', channel: 'WhatsApp' });
      setTemplateImageFile(null);
      setEditingTemplateId(null);
      await fetchData();
    } catch (err) {
      alert(err.message || 'Hata oluştu');
    }
  };

  const getPreviewMessage = (body) => {
    if (!selectedInvestorId) return body;
    const investor = investors.find(i => i.id === Number(selectedInvestorId));
    if (!investor) return body;
    return body.replace(/\{\{name\}\}/g, investor.name);
  };

  const selectedTemplate = templates.find((t) => t.id === Number(selectedTemplateId));

  const sendTemplate = (template, type) => {
    if (!selectedInvestorId) {
      alert('Lütfen önce bir kişi seçin.');
      return;
    }
    const investor = investors.find(i => i.id === Number(selectedInvestorId));
    if (!investor) return;

    const message = getPreviewMessage(template.body);
    
    if (type === 'whatsapp') {
      const phone = investor.phone?.replace(/\D/g, '');
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
    } else if (type === 'email') {
      window.open(`mailto:${investor.email}?subject=${encodeURIComponent(template.title)}&body=${encodeURIComponent(message)}`, '_blank');
    } else if (type === 'sms') {
      const phone = investor.phone?.replace(/\D/g, '');
      window.open(`sms:${phone}?body=${encodeURIComponent(message)}`, '_blank');
    }
  };

  const addSampleTemplates = async () => {
    const sampleTemplates = [
      {
        title: 'Merhaba Hoşgeldiniz',
        eventName: 'Merhaba Hoşgeldiniz',
        channel: 'WhatsApp',
        body: 'Sayın {{name}}, başvurunuz alınmıştır. En kısa sürede dönüş sağlayacağız.',
        active: true,
        imageUrl: '',
      },
      {
        title: 'Sözleşme Süreci Hakkında',
        eventName: 'Sözleşme Süreci Hakkında',
        channel: 'Email',
        body: 'Merhaba {{name}}, sözleşmeniz onay aşamasındadır. Son durumu sizinle gün içinde paylaşacağız.',
        active: true,
        imageUrl: '',
      },
      {
        title: 'Toplantı Hatırlatma',
        eventName: 'Toplantı Hatırlatma',
        channel: 'SMS',
        body: '{{name}}, yarın saat 14:00 toplantımız için hatırlatma: Mi Core ofisinde görüşeceğiz.',
        active: true,
        imageUrl: '',
      },
    ];
    for (const sample of sampleTemplates) {
      await apiClient.post('/templates', sample);
    }
    await fetchData();
  };

  const startEditTemplate = (template) => {
    setEditingTemplateId(template.id);
    setForm({
      title: template.title || '',
      body: template.body || '',
      channel: template.channel || 'WhatsApp',
    });
    setSelectedTemplateId(String(template.id));
  };

  const deleteTemplate = async (templateId) => {
    const ok = window.confirm('Bu şablon silinsin mi?');
    if (!ok) return;
    await apiClient.delete(`/templates/${templateId}`);
    if (editingTemplateId === templateId) {
      setEditingTemplateId(null);
      setForm({ title: '', body: '', channel: 'WhatsApp' });
      setTemplateImageFile(null);
    }
    if (Number(selectedTemplateId) === templateId) {
      setSelectedTemplateId('');
    }
    await fetchData();
  };

  return (
    <section className="card page-section active">
      <div className="module-head">
        <h2>Mesaj Şablonları & Akıllı Gönderim</h2>
      </div>

      <div className="dashboard-grid">
        <article className="card">
          <h3>Kişiler</h3>
          <div className="field">
            <label>Gönderilecek Kişiyi Seçin</label>
            <select value={selectedInvestorId} onChange={e => setSelectedInvestorId(e.target.value)}>
              <option value="">-- Kişi Seçin --</option>
              {investors.map(i => <option key={i.id} value={i.id}>{i.name} ({i.phone || '-'})</option>)}
            </select>
          </div>
        </article>

        <article className="card">
          <div className="module-head" style={{marginBottom: 8}}>
            <h3 style={{margin: 0}}>Şablonlar</h3>
            <button type="button" className="secondary-btn" onClick={addSampleTemplates}>Örnek Şablon Ekle</button>
          </div>
          <div className="field" style={{marginBottom: 12}}>
            <label>Şablon Seç</label>
            <select value={selectedTemplateId} onChange={e => setSelectedTemplateId(e.target.value)}>
              <option value="">-- Şablon Seçin --</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </div>

          {selectedTemplate ? (
            <div className="card" style={{border: '1px solid #e2e8f0', background: 'white'}}>
              {selectedTemplate.image_url && (
                <img
                  src={selectedTemplate.image_url}
                  alt="Template"
                  style={{width: '100%', height: '130px', objectFit: 'cover', borderRadius: '8px', marginBottom: '10px'}}
                />
              )}
              <h4 style={{margin: '0 0 8px'}}>{selectedTemplate.title}</h4>
              <div style={{background: '#f8fafc', padding: '10px', borderRadius: '6px', fontSize: '14px', marginBottom: '12px', border: '1px dashed #cbd5e1'}}>
                {getPreviewMessage(selectedTemplate.body)}
              </div>
              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: 8}}>
                <button onClick={() => sendTemplate(selectedTemplate, 'whatsapp')} className="success-btn">WhatsApp</button>
                <button onClick={() => sendTemplate(selectedTemplate, 'email')} className="primary-btn">E-posta</button>
                <button onClick={() => sendTemplate(selectedTemplate, 'sms')} className="secondary-btn">SMS</button>
              </div>
              <div style={{display: 'flex', gap: 8, flexWrap: 'wrap'}}>
                <button type="button" className="table-btn" onClick={() => startEditTemplate(selectedTemplate)}>Düzenle</button>
                <button type="button" className="table-btn danger" onClick={() => deleteTemplate(selectedTemplate.id)}>Sil</button>
              </div>
            </div>
          ) : (
            <p>Gönderim ve düzenleme için bir şablon seçin.</p>
          )}
        </article>
      </div>

      <article className="card" style={{marginTop: 16}}>
        <h3>{editingTemplateId ? 'Şablon Güncelle' : 'Yeni Şablon Oluştur'}</h3>
        <form onSubmit={handleSubmit} className="entry-form" style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
          <div className="field">
            <label>Başlık</label>
            <input value={form.title} onChange={e => setForm({...form, title: e.target.value})} required placeholder="Örn: İlk Tanışma" />
          </div>
          <div className="field">
            <label>Kanal</label>
            <select value={form.channel} onChange={e => setForm({...form, channel: e.target.value})}>
              <option value="WhatsApp">WhatsApp</option>
              <option value="Email">Email</option>
              <option value="SMS">SMS</option>
            </select>
          </div>
          <div className="field">
            <label>Görsel Yükle (İsteğe Bağlı)</label>
            <input type="file" accept="image/*" onChange={e => setTemplateImageFile(e.target.files?.[0] || null)} />
          </div>
          <div className="field">
            <label>Mesaj (Kişi adı için {"{{name}}"} kullanın)</label>
            <textarea rows="5" value={form.body} onChange={e => setForm({...form, body: e.target.value})} required placeholder="Merhaba {{name}}, Mi Core'a hoş geldiniz..."></textarea>
          </div>
          <div style={{display: 'flex', gap: 8, flexWrap: 'wrap'}}>
            <button type="submit" className="primary-btn">{editingTemplateId ? 'Şablonu Güncelle' : 'Şablonu Kaydet'}</button>
            {editingTemplateId && (
              <button
                type="button"
                className="secondary-btn"
                onClick={() => {
                  setEditingTemplateId(null);
                  setForm({ title: '', body: '', channel: 'WhatsApp' });
                  setTemplateImageFile(null);
                }}
              >
                İptal
              </button>
            )}
          </div>
        </form>
      </article>
    </section>
  );
}
