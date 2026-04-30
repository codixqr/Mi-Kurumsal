'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/apiClient';

export default function LocationsPage() {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    name: '', type: '', sqm: '', rent: '', currency: 'TRY',
    potential: 'Orta', recommendedBrands: '', address: '',
    traffic: 'Orta', owner: '', ownerPhone: '', notes: ''
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await apiClient.get('/locations');
      setLocations(data);
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
      const payload = {
        ...form,
        recommendedBrands: form.recommendedBrands.split(',').map(x => x.trim()).filter(Boolean)
      };
      if (form.id) {
        await apiClient.put(`/locations/${form.id}`, payload);
      } else {
        await apiClient.post('/locations', payload);
      }
      setForm({ name: '', type: '', sqm: '', rent: '', currency: 'TRY', potential: 'Orta', recommendedBrands: '', address: '', traffic: 'Orta', owner: '', ownerPhone: '', notes: '' });
      fetchData();
    } catch (err) {
      alert('Hata oluştu');
    }
  };

  const handleEdit = (loc) => {
    setForm({
      ...loc,
      recommendedBrands: (loc.recommended_brands || []).join(', ')
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (loading) return <div className="card">Yükleniyor...</div>;

  return (
    <section className="card page-section active">
      <div className="module-head">
        <h2>Lokasyon Yönetimi</h2>
        <div className="header-actions">
          <button className="export-btn" type="button">Excel Dışa Aktar</button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="entry-form">
        <div className="field"><label>Lokasyon Adı</label><input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Örn: Nişantaşı City's Karşısı" required /></div>
        <div className="field">
          <label>Tip</label>
          <select value={form.type} onChange={e => setForm({...form, type: e.target.value})} required>
            <option value="">Seçiniz</option>
            <option value="AVM">AVM</option><option value="Cadde">Cadde</option>
            <option value="Sahil">Sahil</option><option value="Plaza">Plaza</option>
          </select>
        </div>
        <div className="field"><label>m²</label><input type="number" value={form.sqm} onChange={e => setForm({...form, sqm: e.target.value})} required /></div>
        <div className="field"><label>Kira</label><input type="number" value={form.rent} onChange={e => setForm({...form, rent: e.target.value})} required /></div>
        <div className="field">
          <label>Para Birimi</label>
          <select value={form.currency} onChange={e => setForm({...form, currency: e.target.value})}>
            <option value="TRY">TL</option><option value="USD">USD</option>
          </select>
        </div>
        <div className="field"><label>Potansiyel</label><input value={form.potential} onChange={e => setForm({...form, potential: e.target.value})} /></div>
        <div className="field"><label>Yaya Trafiği</label><input value={form.traffic} onChange={e => setForm({...form, traffic: e.target.value})} /></div>
        <div className="field"><label>Mülk Sahibi</label><input value={form.owner} onChange={e => setForm({...form, owner: e.target.value})} /></div>
        <div className="field"><label>Sahibi Tel</label><input value={form.ownerPhone} onChange={e => setForm({...form, ownerPhone: e.target.value})} /></div>
        <div className="field field-wide"><label>Önerilen Markalar (Virgülle)</label><input value={form.recommendedBrands} onChange={e => setForm({...form, recommendedBrands: e.target.value})} placeholder="Marka 1, Marka 2..." /></div>
        <div className="field field-wide"><label>Açık Adres</label><input value={form.address} onChange={e => setForm({...form, address: e.target.value})} /></div>
        <div className="field field-wide"><label>Lokasyon Notu</label><textarea rows="2" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})}></textarea></div>
        <button type="submit" className="primary-btn">{form.id ? 'Lokasyonu Güncelle' : 'Lokasyon Ekle'}</button>
      </form>

      <div className="table-wrap" style={{ marginTop: '20px' }}>
        <table>
          <thead>
            <tr>
              <th>Lokasyon</th><th>Tip</th><th>m² / Kira</th><th>Potansiyel</th><th>Önerilen</th><th>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {locations.map(loc => (
              <tr key={loc.id}>
                <td><strong>{loc.name}</strong><br/><small>{loc.address}</small></td>
                <td>{loc.type}</td>
                <td>{loc.sqm} m² / {loc.rent?.toLocaleString()} {loc.currency}</td>
                <td>{loc.potential}</td>
                <td><small>{(loc.recommendedBrands || []).join(', ')}</small></td>
                <td>
                  <button onClick={() => handleEdit(loc)} className="edit-btn">Düzenle</button>
                  <button onClick={async () => { if(confirm('Sil?')) { await apiClient.delete(`/locations/${loc.id}`); fetchData(); } }} className="danger-btn">Sil</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
