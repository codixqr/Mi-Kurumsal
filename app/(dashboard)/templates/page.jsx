'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/apiClient';

export default function TemplatesPage() {
  const [templates, setTemplates] = useState([]);
  const [form, setForm] = useState({ channel: 'whatsapp', eventName: '', title: '', body: '', active: 'true' });

  const fetchTemplates = async () => {
    try { const data = await apiClient.get('/templates'); setTemplates(data); } catch (err) {}
  };

  useEffect(() => { fetchTemplates(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await apiClient.post('/templates', form);
      setForm({ channel: 'whatsapp', eventName: '', title: '', body: '', active: 'true' });
      fetchTemplates();
    } catch (err) {}
  };

  return (
    <section className="card page-section active">
      <h2>Şablon Yönetimi</h2>
      <form onSubmit={handleSubmit} className="entry-form">
        <div className="field">
          <label>Kanal</label>
          <select value={form.channel} onChange={e => setForm({...form, channel: e.target.value})}>
            <option value="whatsapp">WhatsApp</option>
            <option value="mail">Mail</option>
          </select>
        </div>
        <div className="field"><label>Event</label><input value={form.eventName} onChange={e => setForm({...form, eventName: e.target.value})} placeholder="Yeni Lead vb." required /></div>
        <div className="field"><label>Başlık</label><input value={form.title} onChange={e => setForm({...form, title: e.target.value})} required /></div>
        <div className="field field-wide"><label>Mesaj İçeriği</label><textarea value={form.body} onChange={e => setForm({...form, body: e.target.value})} rows="3"></textarea></div>
        <button type="submit">Şablon Kaydet</button>
      </form>

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Kanal</th><th>Event</th><th>Başlık</th><th>Durum</th><th>İşlem</th></tr>
          </thead>
          <tbody>
            {templates.map(t => (
              <tr key={t.id}>
                <td>{t.channel}</td>
                <td>{t.event_name}</td>
                <td>{t.title}</td>
                <td>{t.active ? 'Aktif' : 'Pasif'}</td>
                <td><button onClick={async () => { await apiClient.delete(`/templates/${t.id}`); fetchTemplates(); }} className="danger-btn">Sil</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
