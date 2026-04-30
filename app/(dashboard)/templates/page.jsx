'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/apiClient';

export default function TemplatesPage() {
  const [templates, setTemplates] = useState([]);
  const [investors, setInvestors] = useState([]);
  const [selectedInvestorId, setSelectedInvestorId] = useState('');
  const [form, setForm] = useState({ title: '', body: '', channel: 'WhatsApp' });
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
      await apiClient.post('/templates', form);
      setForm({ title: '', body: '', channel: 'WhatsApp' });
      fetchData();
    } catch (err) {
      alert('Hata oluştu');
    }
  };

  const sendTemplate = (template, type) => {
    if (!selectedInvestorId) {
      alert('Lütfen önce bir kişi seçin.');
      return;
    }
    const investor = investors.find(i => i.id === Number(selectedInvestorId));
    if (!investor) return;

    const message = template.body.replace('{{name}}', investor.name);
    
    if (type === 'whatsapp') {
      const phone = investor.phone?.replace(/\D/g, '');
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
    } else {
      window.open(`mailto:${investor.email}?subject=${encodeURIComponent(template.title)}&body=${encodeURIComponent(message)}`, '_blank');
    }
  };

  return (
    <section className="card page-section active">
      <div className="module-head">
        <h2>Mesaj Şablonları & Hızlı Gönderim</h2>
      </div>

      <div className="dashboard-grid">
        <article className="card">
          <h3>Yeni Şablon Oluştur</h3>
          <form onSubmit={handleSubmit} className="entry-form" style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
            <div className="field">
              <label>Başlık</label>
              <input value={form.title} onChange={e => setForm({...form, title: e.target.value})} required placeholder="Örn: İlk Tanışma Mesajı" />
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
              <label>Mesaj (Kişi adı için {"{{name}}"} kullanın)</label>
              <textarea rows="5" value={form.body} onChange={e => setForm({...form, body: e.target.value})} required placeholder="Merhaba {{name}}, yatırım fırsatları hakkında..."></textarea>
            </div>
            <button type="submit" className="primary-btn">Şablonu Kaydet</button>
          </form>
        </article>

        <article className="card">
          <h3>Hızlı Gönderim Paneli</h3>
          <div className="field" style={{marginBottom: '20px'}}>
            <label>Mesaj Gönderilecek Kişi Seçin</label>
            <select value={selectedInvestorId} onChange={e => setSelectedInvestorId(e.target.value)} style={{fontSize: '16px', padding: '10px'}}>
              <option value="">-- Kişi Seçin --</option>
              {investors.map(i => <option key={i.id} value={i.id}>{i.name} ({i.phone})</option>)}
            </select>
          </div>

          <div className="template-list">
            {templates.map(t => (
              <div key={t.id} className="card" style={{marginBottom: '10px', border: '1px solid #eee'}}>
                <h4>{t.title} <small className="badge">{t.channel}</small></h4>
                <p style={{fontSize: '14px', color: '#666'}}>{t.body}</p>
                <div style={{display: 'flex', gap: '10px', marginTop: '10px'}}>
                  <button onClick={() => sendTemplate(t, 'whatsapp')} className="success-btn" style={{flex: 1, backgroundColor: '#25D366', color: 'white', border: 'none', padding: '8px', borderRadius: '5px', cursor: 'pointer'}}>WhatsApp ile Gönder</button>
                  <button onClick={() => sendTemplate(t, 'email')} className="primary-btn" style={{flex: 1, padding: '8px'}}>E-posta ile Gönder</button>
                </div>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
