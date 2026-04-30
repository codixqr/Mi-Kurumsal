'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/apiClient';

const CITIES = [
  "Adana", "Adıyaman", "Afyonkarahisar", "Ağrı", "Amasya", "Ankara", "Antalya", "Artvin", "Aydın", "Balıkesir", "Bilecik", "Bingöl", "Bitlis", "Bolu", "Burdur", "Bursa", "Çanakkale", "Çankırı", "Çorum", "Denizli", "Diyarbakır", "Edirne", "Elazığ", "Erzincan", "Erzurum", "Eskişehir", "Gaziantep", "Giresun", "Gümüşhane", "Hakkari", "Hatay", "Isparta", "Mersin", "İstanbul", "İzmir", "Kars", "Kastamonu", "Kayseri", "Kırklareli", "Kırşehir", "Kocaeli", "Konya", "Kütahya", "Malatya", "Manisa", "Kahramanmaraş", "Mardin", "Muğla", "Muş", "Nevşehir", "Niğde", "Ordu", "Rize", "Sakarya", "Samsun", "Siirt", "Sinop", "Sivas", "Tekirdağ", "Tokat", "Trabzon", "Tunceli", "Şanlıurfa", "Uşak", "Van", "Yozgat", "Zonguldak", "Aksaray", "Bayburt", "Karaman", "Kırıkkale", "Batman", "Şırnak", "Bartın", "Ardahan", "Iğdır", "Yalova", "Karabük", "Kilis", "Osmaniye", "Düzce"
];

const LOCATION_TYPES = ["Cadde Mağazası", "AVM Mağazası", "Köşe Dükkan", "Plaza Altı", "Sahil Bandı", "Benzin İstasyonu", "Hastane Yakını", "Okul Bölgesi"];
const POTENTIALS = ["Çok Yüksek", "Yüksek", "Orta", "Düşük", "Gelişmekte Olan"];

export default function LocationsPage() {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState([]);
  const [form, setForm] = useState({
    name: '', type: '', sqm: '', rent: '', currency: 'TRY',
    potential: 'Orta', recommendedBrands: '', address: '',
    traffic: 'Orta', owner: '', ownerPhone: '', notes: '',
    city: '', district: ''
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

  const resetForm = () => {
    setForm({ name: '', type: '', sqm: '', rent: '', currency: 'TRY', potential: 'Orta', recommendedBrands: '', address: '', traffic: 'Orta', owner: '', ownerPhone: '', notes: '', city: '', district: '' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        recommendedBrands: (form.recommendedBrands || '').split(',').map(x => x.trim()).filter(Boolean)
      };
      if (form.id) {
        await apiClient.put(`/locations/${form.id}`, payload);
      } else {
        await apiClient.post('/locations', payload);
      }
      resetForm();
      fetchData();
    } catch (err) {
      alert('Hata oluştu');
    }
  };

  const handleBulkDelete = async () => {
    if (!selectedIds.length) return;
    if (confirm(`${selectedIds.length} lokasyonu silmek istediğinize emin misiniz?`)) {
      try {
        for (const id of selectedIds) {
          await apiClient.delete(`/locations/${id}`);
        }
        setSelectedIds([]);
        fetchData();
      } catch (err) {
        alert('Bazı kayıtlar silinemedi.');
      }
    }
  };

  return (
    <section className="card page-section active">
      <div className="module-head">
        <h2>Lokasyon Yönetimi</h2>
        <div className="header-actions">
          {selectedIds.length > 0 && (
            <button className="danger-btn" onClick={handleBulkDelete}>Seçilenleri Sil ({selectedIds.length})</button>
          )}
          <button className="export-btn" type="button">Excel Dışa Aktar</button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="entry-form">
        <div className="field">
          <label>Lokasyon Adı</label>
          <div style={{display: 'flex', gap: '5px'}}>
            <input value={form.name || ''} onChange={e => setForm({...form, name: e.target.value})} required style={{flex: 1}} />
            {(form.id || form.name) && <button type="button" onClick={resetForm} style={{background: '#eee', color: '#333', padding: '0 10px'}}>✕</button>}
          </div>
        </div>

        <div className="field">
          <label>Şehir</label>
          <input list="city-list" value={form.city || ''} onChange={e => setForm({...form, city: e.target.value})} placeholder="Seçin veya yazın..." />
          <datalist id="city-list">
            {CITIES.map(c => <option key={c} value={c} />)}
          </datalist>
        </div>

        <div className="field">
          <label>İlçe</label>
          <input value={form.district || ''} onChange={e => setForm({...form, district: e.target.value})} />
        </div>

        <div className="field">
          <label>Tip</label>
          <select value={form.type || ''} onChange={e => setForm({...form, type: e.target.value})} required>
            <option value="">Seçiniz</option>
            {LOCATION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div className="field">
          <label>Potansiyel</label>
          <select value={form.potential || ''} onChange={e => setForm({...form, potential: e.target.value})}>
            {POTENTIALS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        <div className="field"><label>m²</label><input type="number" value={form.sqm || ''} onChange={e => setForm({...form, sqm: e.target.value})} required /></div>
        <div className="field"><label>Kira</label><input type="number" value={form.rent || ''} onChange={e => setForm({...form, rent: e.target.value})} required /></div>
        
        <div className="field field-wide">
          <label>Görsel / Harita / Ekspertiz Yükle</label>
          <input type="file" multiple onChange={() => alert('Dosya yükleme API entegrasyonu yapılıyor...')} />
        </div>

        <div className="field field-wide"><label>Açık Adres</label><input value={form.address || ''} onChange={e => setForm({...form, address: e.target.value})} /></div>
        
        <button type="submit" className="primary-btn">{form.id ? 'Güncelle' : 'Ekle'}</button>
      </form>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{width: '40px'}}><input type="checkbox" onChange={(e) => setSelectedIds(e.target.checked ? locations.map(l => l.id) : [])} /></th>
              <th>Lokasyon</th><th>Şehir / İlçe</th><th>Tip</th><th>m² / Kira</th><th>Potansiyel</th><th>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {locations.map(loc => (
              <tr key={loc.id} className={selectedIds.includes(loc.id) ? 'selected-row' : ''}>
                <td><input type="checkbox" checked={selectedIds.includes(loc.id)} onChange={() => setSelectedIds(prev => prev.includes(loc.id) ? prev.filter(i => i !== loc.id) : [...prev, loc.id])} /></td>
                <td><strong>{loc.name}</strong></td>
                <td>{loc.city} / {loc.district}</td>
                <td>{loc.type}</td>
                <td>{loc.sqm} m² / {loc.rent?.toLocaleString()} {loc.currency}</td>
                <td>{loc.potential}</td>
                <td>
                  <button onClick={() => setForm({...loc, recommendedBrands: (loc.recommendedBrands || []).join(', ')})} className="edit-btn">Düzenle</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
