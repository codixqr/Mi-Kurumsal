'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/apiClient';

export default function ContractsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ note: '', type: '', status: 'Taslak', counterparty: '', startDate: '', endDate: '', amount: '', currency: 'TRY' });

  const fetchData = async () => {
    setLoading(true);
    try { const data = await apiClient.get('/contracts'); setItems(data); } catch (err) {}
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await apiClient.post('/contracts', form);
      setForm({ note: '', type: '', status: 'Taslak', counterparty: '', startDate: '', endDate: '', amount: '', currency: 'TRY' });
      fetchData();
    } catch (err) { alert('Hata'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Silmek istiyor musunuz?')) return;
    try { await apiClient.delete(`/contracts/${id}`); fetchData(); } catch (err) {}
  };

  if (loading) return <div className="card">Yükleniyor...</div>;

  return (
    <section className="card page-section active">
      <div className="module-head">
        <h2>Sözleşme & Finans</h2>
        <div>
          <button className="export-btn" type="button">Excel Dışa Aktar</button>
        </div>
      </div>
      <form onSubmit={handleSubmit} className="entry-form">
        <div className="field"><label>Sözleşme Notu</label><input value={form.note} onChange={e => setForm({...form, note: e.target.value})} required /></div>
        <div className="field"><label>Tip</label><input value={form.type} onChange={e => setForm({...form, type: e.target.value})} list="contractTypeOptions" /></div>
        <div className="field"><label>Durum</label><input value={form.status} onChange={e => setForm({...form, status: e.target.value})} list="contractStatusOptions" /></div>
        <div className="field"><label>Karşı Taraf</label><input value={form.counterparty} onChange={e => setForm({...form, counterparty: e.target.value})} /></div>
        <div className="field"><label>Tutar</label><input type="number" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} /></div>
        <div className="field"><label>Para Birimi</label><select value={form.currency} onChange={e => setForm({...form, currency: e.target.value})}><option value="TRY">TL</option><option value="USD">USD</option></select></div>
        <button type="submit">Kayıt Ekle</button>
      </form>
      <ul className="list">
        {items.map(item => (
          <li key={item.id} className="list-item">
            <div className="list-item-info">
              <strong>{item.note}</strong>
              <span>{item.counterparty} | {item.amount?.toLocaleString()} {item.currency}</span>
            </div>
            <div className="list-item-actions">
              <span className="badge">{item.status}</span>
              <button onClick={() => handleDelete(item.id)} className="danger-btn">Sil</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
