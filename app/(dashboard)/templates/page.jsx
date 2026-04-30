'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/apiClient';

export default function TemplatesPage() {
  const [templates, setTemplates] = useState([]);
  const [investors, setInvestors] = useState([]);
  const [selectedInvestorId, setSelectedInvestorId] = useState('');
  const [form, setForm] = useState({ title: '', body: '', channel: 'WhatsApp', imageUrl: '' });
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [tData, iData] = await Promise.all([
        apiClient.get('/templates'),
        apiClient.get('/investors')
      ]);
      setTemplates(tData);
      setInvestors(iData);
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
      await apiClient.post('/templates', {
        ...form,
        image_url: form.imageUrl
      });
      setForm({ title: '', body: '', channel: 'WhatsApp', imageUrl: '' });
      fetchData();
    } catch (err) {
      alert('Hata oluştu');
    }
  };

  const getPreviewMessage = (body) => {
    if (!selectedInvestorId) return body;
    const investor = investors.find(i => i.id === Number(selectedInvestorId));
    if (!investor) return body;
    return body.replace(/\{\{name\}\}/g, investor.name);
  };

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

  return (
    <section className="card page-section active">
      <div className="module-head">
        <h2>Mesaj Şablonları & Akıllı Gönderim</h2>
        <p>Kişiye özel mesajları görsellerle birlikte hızlıca gönderin.</p>
      </div>

      <div className="dashboard-grid">
        <article className="card">
          <h3>Yeni Şablon Oluştur</h3>
          <form onSubmit={handleSubmit} className="entry-form" style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
            <div className="field">
              <label>Başlık</label>
              <input value={form.title} onChange={e => setForm({...form, title: e.target.value})} required placeholder="Örn: İlk Tanışma" />
            </div>
            <div className="field">
              <label>Kanal (Varsayılan)</label>
              <select value={form.channel} onChange={e => setForm({...form, channel: e.target.value})}>
                <option value="WhatsApp">WhatsApp</option>
                <option value="Email">Email</option>
                <option value="SMS">SMS</option>
              </select>
            </div>
            <div className="field">
              <label>Görsel URL (İsteğe Bağlı)</label>
              <input value={form.imageUrl} onChange={e => setForm({...form, imageUrl: e.target.value})} placeholder="https://resim-linki.com/foto.jpg" />
            </div>
            <div className="field">
              <label>Mesaj (Kişi adı için {"{{name}}"} kullanın)</label>
              <textarea rows="6" value={form.body} onChange={e => setForm({...form, body: e.target.value})} required placeholder="Merhaba {{name}}, Mi Kurumsal'a hoş geldiniz..."></textarea>
            </div>
            <button type="submit" className="primary-btn">Şablonu Kaydet</button>
          </form>
        </article>

        <article className="card">
          <div style={{background: '#f1f5f9', padding: '15px', borderRadius: '10px', marginBottom: '20px'}}>
            <label style={{fontWeight: 'bold', display: 'block', marginBottom: '10px'}}>1. Gönderilecek Kişiyi Seçin</label>
            <select value={selectedInvestorId} onChange={e => setSelectedInvestorId(e.target.value)} style={{width: '100%', padding: '12px', fontSize: '16px', borderRadius: '8px', border: '1px solid #cbd5e1'}}>
              <option value="">-- Kişi Seçin --</option>
              {investors.map(i => <option key={i.id} value={i.id}>{i.name} ({i.phone})</option>)}
            </select>
          </div>

          <label style={{fontWeight: 'bold', display: 'block', marginBottom: '10px'}}>2. Şablon Seçin ve Gönderin</label>
          <div className="template-list" style={{display: 'grid', gap: '15px'}}>
            {templates.map(t => (
              <div key={t.id} className="card" style={{border: '1px solid #e2e8f0', background: 'white'}}>
                {t.image_url && <img src={t.image_url} alt="Template" style={{width: '100%', height: '120px', objectFit: 'cover', borderRadius: '8px', marginBottom: '10px'}} />}
                <h4 style={{margin: '0 0 10px'}}>{t.title}</h4>
                <div style={{background: '#f8fafc', padding: '10px', borderRadius: '6px', fontSize: '14px', marginBottom: '15px', border: '1px dashed #cbd5e1'}}>
                  {getPreviewMessage(t.body)}
                </div>
                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px'}}>
                  <button onClick={() => sendTemplate(t, 'whatsapp')} className="success-btn" style={{fontSize: '12px', padding: '8px 5px'}}>WhatsApp</button>
                  <button onClick={() => sendTemplate(t, 'email')} className="primary-btn" style={{fontSize: '12px', padding: '8px 5px'}}>E-posta</button>
                  <button onClick={() => sendTemplate(t, 'sms')} className="secondary-btn" style={{fontSize: '12px', padding: '8px 5px', color: '#064e3b', border: '1px solid #064e3b'}}>SMS</button>
                </div>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
