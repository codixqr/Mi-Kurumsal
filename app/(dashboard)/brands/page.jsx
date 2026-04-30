'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/apiClient';

export default function BrandsPage() {
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    name: '', sector: '', minBudget: '', maxBudget: '', currency: 'TRY',
    minSqm: '', maxSqm: '', targetLocations: '', monthlyGrowth: '', active: 'true'
  });

  const fetchBrands = async () => {
    setLoading(true);
    try {
      const data = await apiClient.get('/brands');
      setBrands(data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchBrands(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) await apiClient.put(`/brands/${editingId}`, form);
      else await apiClient.post('/brands', form);
      resetForm();
      fetchBrands();
    } catch (err) { alert('Hata: ' + err.message); }
  };

  const resetForm = () => {
    setEditingId(null);
    setForm({ name: '', sector: '', minBudget: '', maxBudget: '', currency: 'TRY', minSqm: '', maxSqm: '', targetLocations: '', monthlyGrowth: '', active: 'true' });
  };

  const handleEdit = (brand) => {
    setEditingId(brand.id);
    setForm({
      name: brand.name, sector: brand.sector, minBudget: brand.minBudget, maxBudget: brand.maxBudget,
      currency: brand.currency || 'TRY', minSqm: brand.minSqm, maxSqm: brand.maxSqm,
      targetLocations: brand.targetLocations, monthlyGrowth: brand.monthlyGrowth, active: String(brand.active)
    });
  };

  const handleDelete = async (id) => {
    if (!confirm('Silmek istediğinize emin misiniz?')) return;
    try {
      await apiClient.delete(`/brands/${id}`);
      fetchBrands();
    } catch (err) { alert('Hata'); }
  };

  if (loading) return <div className="card">Yükleniyor...</div>;

  return (
    <section className="card page-section active">
      <div className="module-head">
        <h2>Marka Yönetimi</h2>
        <div>
          <button className="export-btn" type="button">Excel Dışa Aktar</button>
          <button className="pdf-export-btn" type="button">PDF Dışa Aktar</button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="entry-form">
        <div className="field"><label>Marka Adı</label><input value={form.name} onChange={e => setForm({...form, name: e.target.value})} required /></div>
        <div className="field"><label>Sektör</label><input value={form.sector} onChange={e => setForm({...form, sector: e.target.value})} list="sectorOptions" required /></div>
        <div className="field"><label>Min Bütçe</label><input type="number" value={form.minBudget} onChange={e => setForm({...form, minBudget: e.target.value})} required /></div>
        <div className="field"><label>Max Bütçe</label><input type="number" value={form.maxBudget} onChange={e => setForm({...form, maxBudget: e.target.value})} required /></div>
        <div className="field"><label>Para Birimi</label><select value={form.currency} onChange={e => setForm({...form, currency: e.target.value})}><option value="TRY">TL</option><option value="USD">USD</option></select></div>
        <div className="field"><label>Min m²</label><input type="number" value={form.minSqm} onChange={e => setForm({...form, minSqm: e.target.value})} required /></div>
        <div className="field"><label>Max m²</label><input type="number" value={form.maxSqm} onChange={e => setForm({...form, maxSqm: e.target.value})} required /></div>
        <div className="field"><label>Hedef Lokasyon</label><input value={form.targetLocations} onChange={e => setForm({...form, targetLocations: e.target.value})} required /></div>
        <div className="field"><label>Aylık Büyüme</label><input type="number" value={form.monthlyGrowth} onChange={e => setForm({...form, monthlyGrowth: e.target.value})} required /></div>
        <div className="field"><label>Durum</label><select value={form.active} onChange={e => setForm({...form, active: e.target.value})}><option value="true">Aktif</option><option value="false">Pasif</option></select></div>
        <div className="field-wide">
          <button type="submit" className="primary-btn">{editingId ? 'Güncelle' : 'Marka Ekle'}</button>
          {editingId && <button type="button" onClick={resetForm} className="secondary-btn" style={{marginLeft: '10px'}}>Vazgeç</button>}
        </div>
      </form>

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Marka</th><th>Sektör</th><th>Bütçe Aralığı</th><th>m² Aralığı</th><th>Lokasyon</th><th>Durum</th><th>İşlem</th></tr>
          </thead>
          <tbody>
            {brands.map(brand => (
              <tr key={brand.id}>
                <td><strong>{brand.name}</strong></td>
                <td>{brand.sector}</td>
                <td>{brand.minBudget.toLocaleString()} - {brand.maxBudget.toLocaleString()} {brand.currency}</td>
                <td>{brand.minSqm} - {brand.maxSqm} m²</td>
                <td>{brand.targetLocations}</td>
                <td><span className={`badge ${brand.active ? 'active' : 'passive'}`}>{brand.active ? 'Aktif' : 'Pasif'}</span></td>
                <td>
                  <button onClick={() => handleEdit(brand)} className="edit-btn">Düzenle</button>
                  <button onClick={() => handleDelete(brand.id)} className="danger-btn">Sil</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
