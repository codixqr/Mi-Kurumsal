'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/apiClient';

export default function LocationsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ name: '', type: '', sqm: '', rent: '', potential: '', recommendedBrands: '' });

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await apiClient.get('/locations');
      setItems(data);
    } catch (err) {
      setError('Veriler yüklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await apiClient.post('/locations', form);
      setForm({ name: '', type: '', sqm: '', rent: '', potential: '', recommendedBrands: '' });
      fetchData();
    } catch (err) {
      alert('Kaydedilemedi: ' + err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Emin misiniz?')) return;
    try {
      await apiClient.delete(`/locations/${id}`);
      fetchData();
    } catch (err) {
      alert('Silinemedi.');
    }
  };

  if (loading) return <div className="card">Yükleniyor...</div>;

  return (
    <section className="card page-section active">
      <div className="module-head">
        <h2>Lokasyon Yönetimi</h2>
      </div>
      
      <form onSubmit={handleSubmit} className="entry-form">
        <div className="field">
          <label>Lokasyon</label>
          <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} required />
        </div>
        <div className="field">
          <label>Tip</label>
          <input value={form.type} onChange={e => setForm({...form, type: e.target.value})} placeholder="AVM, Cadde..." required />
        </div>
        <div className="field">
          <label>m²</label>
          <input type="number" value={form.sqm} onChange={e => setForm({...form, sqm: e.target.value})} required />
        </div>
        <div className="field">
          <label>Kira</label>
          <input type="number" value={form.rent} onChange={e => setForm({...form, rent: e.target.value})} required />
        </div>
        <div className="field">
          <label>Potansiyel</label>
          <input value={form.potential} onChange={e => setForm({...form, potential: e.target.value})} required />
        </div>
        <div className="field">
          <label>Önerilen Markalar</label>
          <input value={form.recommendedBrands} onChange={e => setForm({...form, recommendedBrands: e.target.value})} required />
        </div>
        <button type="submit">Lokasyon Ekle</button>
      </form>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Lokasyon</th><th>Tip</th><th>m²</th><th>Kira</th><th>Potansiyel</th><th>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>{item.type}</td>
                <td>{item.sqm}</td>
                <td>{item.rent} {item.currency}</td>
                <td>{item.potential}</td>
                <td>
                  <button onClick={() => handleDelete(item.id)} className="danger-btn">Sil</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
