'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/apiClient';

const CITIES = [
  "Adana", "Adıyaman", "Afyonkarahisar", "Ağrı", "Amasya", "Ankara", "Antalya", "Artvin", "Aydın", "Balıkesir", "Bilecik", "Bingöl", "Bitlis", "Bolu", "Burdur", "Bursa", "Çanakkale", "Çankırı", "Çorum", "Denizli", "Diyarbakır", "Edirne", "Elazığ", "Erzincan", "Erzurum", "Eskişehir", "Gaziantep", "Giresun", "Gümüşhane", "Hakkari", "Hatay", "Isparta", "Mersin", "İstanbul", "İzmir", "Kars", "Kastamonu", "Kayseri", "Kırklareli", "Kırşehir", "Kocaeli", "Konya", "Kütahya", "Malatya", "Manisa", "Kahramanmaraş", "Mardin", "Muğla", "Muş", "Nevşehir", "Niğde", "Ordu", "Rize", "Sakarya", "Samsun", "Siirt", "Sinop", "Sivas", "Tekirdağ", "Tokat", "Trabzon", "Tunceli", "Şanlıurfa", "Uşak", "Van", "Yozgat", "Zonguldak", "Aksaray", "Bayburt", "Karaman", "Kırıkkale", "Batman", "Şırnak", "Bartın", "Ardahan", "Iğdır", "Yalova", "Karabük", "Kilis", "Osmaniye", "Düzce"
];

const SECTORS = ["Hızlı Tüketim", "Lüks Giyim", "Kafe/Restoran", "Eğitim Kurumu", "Spor Salonu", "Güzellik Merkezi", "Mobilya", "Teknoloji Market", "Eczane/Sağlık", "Süpermarket"];

export default function BrandsPage() {
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectedBrand, setSelectedBrand] = useState(null);
  
  const [form, setForm] = useState({
    name: '', sector: '', minBudget: '', maxBudget: '', currency: 'TRY',
    minSqm: '', maxSqm: '', targetLocations: '', active: true,
    monthlyGrowth: '0', agreementStatus: 'Görüşülüyor', franchiseFee: '',
    royaltyRate: '', contractTermMonths: '', initialInvestment: '',
    branchCount: '', contactPerson: '', contactPhone: '',
    businessPlan: '', operationPlan: '', onboardingSteps: '',
    kpiTargets: '', brandNotes: ''
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await apiClient.get('/brands');
      setBrands(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const resetForm = () => {
    setForm({
      name: '', sector: '', minBudget: '', maxBudget: '', currency: 'TRY',
      minSqm: '', maxSqm: '', targetLocations: '', active: true,
      monthlyGrowth: '0', agreementStatus: 'Görüşülüyor', franchiseFee: '',
      royaltyRate: '', contractTermMonths: '', initialInvestment: '',
      branchCount: '', contactPerson: '', contactPhone: '',
      businessPlan: '', operationPlan: '', onboardingSteps: '',
      kpiTargets: '', brandNotes: ''
    });
    setSelectedBrand(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (selectedBrand?.id) {
        await apiClient.put(`/brands/${selectedBrand.id}`, form);
      } else {
        await apiClient.post('/brands', form);
      }
      resetForm();
      fetchData();
    } catch (err) {
      alert('Hata oluştu');
    }
  };

  const handleBulkDelete = async () => {
    if (!selectedIds.length) return;
    if (confirm(`${selectedIds.length} markayı silmek istediğinize emin misiniz?`)) {
      try {
        for (const id of selectedIds) {
          await apiClient.delete(`/brands/${id}`);
        }
        setSelectedIds([]);
        fetchData();
      } catch (err) {
        alert('Bazı kayıtlar silinemedi.');
      }
    }
  };

  const selectBrandForEdit = (brand) => {
    setSelectedBrand(brand);
    setForm({
      ...brand,
      minBudget: brand.minBudget || '',
      maxBudget: brand.maxBudget || '',
      minSqm: brand.minSqm || '',
      maxSqm: brand.maxSqm || '',
      franchiseFee: brand.franchiseFee || '',
      royaltyRate: brand.royaltyRate || '',
      contractTermMonths: brand.contractTermMonths || '',
      initialInvestment: brand.initialInvestment || '',
      branchCount: brand.branchCount || '',
      onboardingSteps: (brand.onboardingSteps || []).join('\n')
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <section className="card page-section active">
      <div className="module-head">
        <h2>Marka Portföy Yönetimi</h2>
        <div className="header-actions">
          {selectedIds.length > 0 && (
            <button className="danger-btn" onClick={handleBulkDelete}>Seçilenleri Sil ({selectedIds.length})</button>
          )}
          <button className="export-btn" type="button">Excel Dışa Aktar</button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="entry-form">
        <div className="field">
          <label>Marka Adı</label>
          <div style={{display: 'flex', gap: '5px'}}>
            <input value={form.name || ''} onChange={e => setForm({...form, name: e.target.value})} required style={{flex: 1}} />
            {(selectedBrand || form.name) && <button type="button" onClick={resetForm} style={{background: '#eee', color: '#333', padding: '0 10px'}}>✕</button>}
          </div>
        </div>

        <div className="field">
          <label>Sektör</label>
          <select value={form.sector || ''} onChange={e => setForm({...form, sector: e.target.value})} required>
            <option value="">Seçiniz</option>
            {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className="field">
          <label>Hedef Şehirler</label>
          <input list="city-list" value={form.targetLocations || ''} onChange={e => setForm({...form, targetLocations: e.target.value})} placeholder="Şehir seçin veya yazın..." />
          <datalist id="city-list">
            {CITIES.map(c => <option key={c} value={c} />)}
          </datalist>
        </div>

        <div className="field"><label>Min Bütçe</label><input type="number" value={form.minBudget || ''} onChange={e => setForm({...form, minBudget: e.target.value})} /></div>
        <div className="field"><label>Max Bütçe</label><input type="number" value={form.maxBudget || ''} onChange={e => setForm({...form, maxBudget: e.target.value})} /></div>
        
        <div className="field">
          <label>Anlaşma Durumu</label>
          <select value={form.agreementStatus || ''} onChange={e => setForm({...form, agreementStatus: e.target.value})}>
            <option value="Görüşülüyor">Görüşülüyor</option>
            <option value="Anlaşıldı">Anlaşıldı</option>
            <option value="Protokol İmzalandı">Protokol İmzalandı</option>
            <option value="Pasif">Pasif</option>
          </select>
        </div>

        <div className="field field-wide">
          <label>Görsel / Logo / Sunum Yükle</label>
          <input type="file" multiple onChange={() => alert('Dosya yükleme API entegrasyonu yapılıyor...')} />
        </div>

        <button type="submit" className="primary-btn">{selectedBrand ? 'Markayı Güncelle' : 'Marka Ekle'}</button>
      </form>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{width: '40px'}}><input type="checkbox" onChange={(e) => setSelectedIds(e.target.checked ? brands.map(b => b.id) : [])} /></th>
              <th>Marka</th><th>Sektör</th><th>Bütçe Aralığı</th><th>Hedef</th><th>Durum</th><th>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {brands.map(brand => (
              <tr key={brand.id} className={selectedIds.includes(brand.id) ? 'selected-row' : ''}>
                <td><input type="checkbox" checked={selectedIds.includes(brand.id)} onChange={() => setSelectedIds(prev => prev.includes(brand.id) ? prev.filter(i => i !== brand.id) : [...prev, brand.id])} /></td>
                <td><strong>{brand.name}</strong></td>
                <td>{brand.sector}</td>
                <td>{brand.minBudget?.toLocaleString()} - {brand.maxBudget?.toLocaleString()} {brand.currency}</td>
                <td>{brand.targetLocations}</td>
                <td><span className="badge success">{brand.agreementStatus}</span></td>
                <td>
                  <button onClick={() => selectBrandForEdit(brand)} className="edit-btn">Düzenle</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
