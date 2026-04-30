'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/apiClient';

export default function BrandsPage() {
  const [brands, setBrands] = useState([]);
  const [selectedBrand, setSelectedBrand] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Base Form State
  const [baseForm, setBaseForm] = useState({
    name: '', sector: '', minBudget: '', maxBudget: '', currency: 'TRY',
    minSqm: '', maxSqm: '', targetLocations: '', monthlyGrowth: '0', active: 'true'
  });

  // Profile Form State
  const [profileForm, setProfileForm] = useState({
    agreementStatus: '', franchiseFee: '', royaltyRate: '', contractTermMonths: '',
    initialInvestment: '', branchCount: '', contactPerson: '', contactPhone: '',
    businessPlan: '', operationPlan: '', onboardingSteps: '', kpiTargets: '', brandNotes: ''
  });

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('excelFile', file);
    try {
      await fetch('/api/brands/import', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` },
        body: formData
      });
      alert('Markalar başarıyla aktarıldı.');
      fetchData();
    } catch (err) {
      alert('İçe aktarma hatası');
    }
  };

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

  const handleBaseSubmit = async (e) => {
    e.preventDefault();
    try {
      if (baseForm.id) {
        await apiClient.put(`/brands/${baseForm.id}`, baseForm);
      } else {
        await apiClient.post('/brands', baseForm);
      }
      setBaseForm({ name: '', sector: '', minBudget: '', maxBudget: '', currency: 'TRY', minSqm: '', maxSqm: '', targetLocations: '', monthlyGrowth: '0', active: 'true' });
      fetchData();
    } catch (err) { alert('Hata oluştu'); }
  };

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    if (!selectedBrand) return alert('Lütfen önce listeden bir marka seçin');
    try {
      // API expectations: current implementation might need merging or specific fields
      await apiClient.put(`/brands/${selectedBrand.id}`, { ...baseForm, ...profileForm });
      alert('Marka profili başarıyla güncellendi.');
      fetchData();
    } catch (err) { alert('Profil güncellenirken hata oluştu'); }
  };

  const selectBrandForEdit = (brand) => {
    setSelectedBrand(brand);
    setBaseForm({
      id: brand.id,
      name: brand.name || '',
      sector: brand.sector || '',
      minBudget: brand.min_budget || '',
      maxBudget: brand.max_budget || '',
      currency: brand.currency || 'TRY',
      minSqm: brand.min_sqm || '',
      maxSqm: brand.max_sqm || '',
      targetLocations: brand.target_locations || '',
      monthlyGrowth: brand.monthly_growth || '0',
      active: String(brand.active)
    });
    setProfileForm({
      agreementStatus: brand.agreement_status || '',
      franchiseFee: brand.franchise_fee || '',
      royaltyRate: brand.royalty_rate || '',
      contractTermMonths: brand.contract_term_months || '',
      initialInvestment: brand.initial_investment || '',
      branchCount: brand.branch_count || '',
      contactPerson: brand.contact_person || '',
      contactPhone: brand.contact_phone || '',
      businessPlan: brand.business_plan || '',
      operationPlan: brand.operation_plan || '',
      onboardingSteps: (brand.onboarding_steps || []).join('\n'),
      kpiTargets: brand.kpi_targets || '',
      brandNotes: brand.brand_notes || ''
    });
  };

  if (loading) return <div className="card">Yükleniyor...</div>;

  return (
    <section className="card page-section active">
      <div className="module-head">
        <h2>Marka Portföy Yönetimi</h2>
        <div className="header-actions">
          <div className="inline-filter">
            <label className="secondary-btn" style={{cursor: 'pointer'}}>
              📁 Excel'den Akıllı Yükle
              <input type="file" onChange={handleImport} style={{display: 'none'}} accept=".xlsx,.xls" />
            </label>
          </div>
          <button className="export-btn" type="button">Excel Dışa Aktar</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* Temel Bilgiler Formu */}
        <form onSubmit={handleBaseSubmit} className="entry-form">
          <h3>Temel Bilgiler</h3>
          <div className="field"><label>Marka Adı</label><input value={baseForm.name} onChange={e => setBaseForm({...baseForm, name: e.target.value})} required /></div>
          <div className="field"><label>Sektör</label><input value={baseForm.sector} onChange={e => setBaseForm({...baseForm, sector: e.target.value})} required /></div>
          <div className="field"><label>Min Bütçe</label><input type="number" value={baseForm.minBudget} onChange={e => setBaseForm({...baseForm, minBudget: e.target.value})} required /></div>
          <div className="field"><label>Max Bütçe</label><input type="number" value={baseForm.maxBudget} onChange={e => setBaseForm({...baseForm, maxBudget: e.target.value})} required /></div>
          <div className="field">
            <label>Para Birimi</label>
            <select value={baseForm.currency} onChange={e => setBaseForm({...baseForm, currency: e.target.value})}>
              <option value="TRY">TL</option><option value="USD">USD</option>
            </select>
          </div>
          <div className="field"><label>Min m²</label><input type="number" value={baseForm.minSqm} onChange={e => setBaseForm({...baseForm, minSqm: e.target.value})} required /></div>
          <div className="field"><label>Max m²</label><input type="number" value={baseForm.maxSqm} onChange={e => setBaseForm({...baseForm, maxSqm: e.target.value})} required /></div>
          <div className="field"><label>Hedef Lokasyon</label><input value={baseForm.targetLocations} onChange={e => setBaseForm({...baseForm, targetLocations: e.target.value})} required /></div>
          <div className="field"><label>Aylık Büyüme</label><input type="number" value={baseForm.monthlyGrowth} onChange={e => setBaseForm({...baseForm, monthlyGrowth: e.target.value})} required /></div>
          <div className="field">
            <label>Durum</label>
            <select value={baseForm.active} onChange={e => setBaseForm({...baseForm, active: e.target.value})}>
              <option value="true">Aktif</option><option value="false">Pasif</option>
            </select>
          </div>
          <button type="submit" className="primary-btn">{baseForm.id ? 'Güncelle' : 'Marka Ekle'}</button>
        </form>

        {/* Detaylı Profil Formu */}
        <form onSubmit={handleProfileSubmit} className="entry-form">
          <h3>Marka Profili {selectedBrand ? `(${selectedBrand.name})` : ''}</h3>
          <div className="field"><label>Anlaşma Durumu</label><input value={profileForm.agreementStatus} onChange={e => setProfileForm({...profileForm, agreementStatus: e.target.value})} placeholder="Görüşmede / Müzakere / İmzalı" /></div>
          <div className="field"><label>Franchise Bedeli</label><input type="number" value={profileForm.franchiseFee} onChange={e => setProfileForm({...profileForm, franchiseFee: e.target.value})} /></div>
          <div className="field"><label>Royalty %</label><input type="number" step="0.1" value={profileForm.royaltyRate} onChange={e => setProfileForm({...profileForm, royaltyRate: e.target.value})} /></div>
          <div className="field"><label>Sözleşme Süresi (Ay)</label><input type="number" value={profileForm.contractTermMonths} onChange={e => setProfileForm({...profileForm, contractTermMonths: e.target.value})} /></div>
          <div className="field"><label>Toplam Yatırım</label><input type="number" value={profileForm.initialInvestment} onChange={e => setProfileForm({...profileForm, initialInvestment: e.target.value})} /></div>
          <div className="field"><label>Şube Sayısı</label><input type="number" value={profileForm.branchCount} onChange={e => setProfileForm({...profileForm, branchCount: e.target.value})} /></div>
          <div className="field"><label>Yetkili Kişi</label><input value={profileForm.contactPerson} onChange={e => setProfileForm({...profileForm, contactPerson: e.target.value})} /></div>
          <div className="field"><label>Yetkili Telefon</label><input value={profileForm.contactPhone} onChange={e => setProfileForm({...profileForm, contactPhone: e.target.value})} /></div>
          <div className="field field-wide"><label>İş Planı</label><textarea rows="2" value={profileForm.businessPlan} onChange={e => setProfileForm({...profileForm, businessPlan: e.target.value})}></textarea></div>
          <div className="field field-wide"><label>Onboarding Adımları</label><textarea rows="3" value={profileForm.onboardingSteps} onChange={e => setProfileForm({...profileForm, onboardingSteps: e.target.value})} placeholder="Her satıra bir adım..."></textarea></div>
          <button type="submit" disabled={!selectedBrand} className="secondary-btn">Profil Bilgilerini Kaydet</button>
        </form>
      </div>

      <div className="table-wrap" style={{ marginTop: '20px' }}>
        <table>
          <thead>
            <tr>
              <th>Marka</th><th>Sektör</th><th>Bütçe Aralığı</th><th>m² Aralığı</th><th>Durum</th><th>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {brands.map(brand => (
              <tr key={brand.id} className={selectedBrand?.id === brand.id ? 'selected-row' : ''}>
                <td><strong>{brand.name}</strong></td>
                <td>{brand.sector}</td>
                <td>{brand.minBudget?.toLocaleString()} - {brand.maxBudget?.toLocaleString()} {brand.currency}</td>
                <td>{brand.minSqm} - {brand.maxSqm} m²</td>
                <td><span className={`badge ${brand.active ? 'success' : 'danger'}`}>{brand.active ? 'Aktif' : 'Pasif'}</span></td>
                <td>
                  <button onClick={() => selectBrandForEdit(brand)} className="edit-btn">Seç / Düzenle</button>
                  <button onClick={async () => { if(confirm('Sil?')) { await apiClient.delete(`/brands/${brand.id}`); fetchData(); } }} className="danger-btn">Sil</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
