'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/apiClient';

const CITIES = [
  "Adana", "Adıyaman", "Afyonkarahisar", "Ağrı", "Amasya", "Ankara", "Antalya", "Artvin", "Aydın", "Balıkesir", "Bilecik", "Bingöl", "Bitlis", "Bolu", "Burdur", "Bursa", "Çanakkale", "Çankırı", "Çorum", "Denizli", "Diyarbakır", "Edirne", "Elazığ", "Erzincan", "Erzurum", "Eskişehir", "Gaziantep", "Giresun", "Gümüşhane", "Hakkari", "Hatay", "Isparta", "Mersin", "İstanbul", "İzmir", "Kars", "Kastamonu", "Kayseri", "Kırklareli", "Kırşehir", "Kocaeli", "Konya", "Kütahya", "Malatya", "Manisa", "Kahramanmaraş", "Mardin", "Muğla", "Muş", "Nevşehir", "Niğde", "Ordu", "Rize", "Sakarya", "Samsun", "Siirt", "Sinop", "Sivas", "Tekirdağ", "Tokat", "Trabzon", "Tunceli", "Şanlıurfa", "Uşak", "Van", "Yozgat", "Zonguldak", "Aksaray", "Bayburt", "Karaman", "Kırıkkale", "Batman", "Şırnak", "Bartın", "Ardahan", "Iğdır", "Yalova", "Karabük", "Kilis", "Osmaniye", "Düzce"
];

const SECTORS = ["Gıda", "Perakende", "Eğitim", "Hizmet", "Gayrimenkul", "Teknoloji", "Spor", "Sağlık", "Otomotiv", "Giyim"];

export default function InvestorsPage() {
  const [investors, setInvestors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState([]);
  const [form, setForm] = useState({
    name: '', budget: '', city: '', sector: '', investment_type: 'Franchise',
    pipeline_stage: 'Yeni Lead', currency: 'TRY', phone: '', email: '',
    district: '', goal: '', contact_history: '', meeting_notes: '',
    follow_up_date: '', documents: []
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await apiClient.get('/investors');
      setInvestors(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const resetForm = () => {
    setForm({ name: '', budget: '', city: '', sector: '', investment_type: 'Franchise', pipeline_stage: 'Yeni Lead', currency: 'TRY', phone: '', email: '', district: '', goal: '', contact_history: '', meeting_notes: '', follow_up_date: '', documents: [] });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (form.id) {
        await apiClient.put(`/investors/${form.id}`, form);
      } else {
        await apiClient.post('/investors', form);
      }
      resetForm();
      fetchData();
    } catch (err) {
      alert('Hata oluştu');
    }
  };

  const handleBulkDelete = async () => {
    if (!selectedIds.length) return;
    if (confirm(`${selectedIds.length} kaydı silmek istediğinize emin misiniz?`)) {
      try {
        for (const id of selectedIds) {
          await apiClient.delete(`/investors/${id}`);
        }
        setSelectedIds([]);
        fetchData();
      } catch (err) {
        alert('Bazı kayıtlar silinemedi.');
      }
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  return (
    <section className="card page-section active">
      <div className="module-head">
        <h2>Yatırımcı Yönetimi</h2>
        <div className="header-actions">
          {selectedIds.length > 0 && (
            <button className="danger-btn" onClick={handleBulkDelete}>Seçilenleri Sil ({selectedIds.length})</button>
          )}
          <button className="export-btn" type="button">Excel Dışa Aktar</button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="entry-form">
        <div className="field">
          <label>Ad Soyad / Şirket</label>
          <div style={{display: 'flex', gap: '5px'}}>
            <input value={form.name || ''} onChange={e => setForm({...form, name: e.target.value})} required style={{flex: 1}} />
            {form.id && <button type="button" onClick={resetForm} style={{background: '#eee', color: '#333', padding: '0 10px'}}>✕</button>}
          </div>
        </div>
        
        <div className="field">
          <label>Şehir (Seçin veya Yazın)</label>
          <input 
            list="city-list" 
            value={form.city || ''} 
            onChange={e => setForm({...form, city: e.target.value})} 
            placeholder="Şehir adı..."
          />
          <datalist id="city-list">
            {CITIES.map(c => <option key={c} value={c} />)}
          </datalist>
        </div>

        <div className="field">
          <label>İlçe</label>
          <input value={form.district || ''} onChange={e => setForm({...form, district: e.target.value})} />
        </div>

        <div className="field">
          <label>Sektör</label>
          <select value={form.sector || ''} onChange={e => setForm({...form, sector: e.target.value})}>
            <option value="">Seçiniz</option>
            {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className="field"><label>Bütçe</label><input type="number" value={form.budget || ''} onChange={e => setForm({...form, budget: e.target.value})} required /></div>
        
        <div className="field">
          <label>Para Birimi</label>
          <select value={form.currency || 'TRY'} onChange={e => setForm({...form, currency: e.target.value})}>
            <option value="TRY">TL</option><option value="USD">USD</option><option value="EUR">EUR</option>
          </select>
        </div>

        <div className="field">
          <label>Pipeline</label>
          <select value={form.pipeline_stage || ''} onChange={e => setForm({...form, pipeline_stage: e.target.value})}>
            <option value="Yeni Lead">Yeni Lead</option>
            <option value="İletişim Kuruldu">İletişim Kuruldu</option>
            <option value="Sunum Yapıldı">Sunum Yapıldı</option>
            <option value="Teklif Verildi">Teklif Verildi</option>
            <option value="Anlaşıldı">Anlaşıldı</option>
            <option value="Kaybedildi">Kaybedildi</option>
          </select>
        </div>

        <div className="field"><label>Telefon</label><input value={form.phone || ''} onChange={e => setForm({...form, phone: e.target.value})} /></div>
        <div className="field"><label>E-posta</label><input type="email" value={form.email || ''} onChange={e => setForm({...form, email: e.target.value})} /></div>
        <div className="field"><label>Takip Tarihi</label><input type="date" value={form.follow_up_date || ''} onChange={e => setForm({...form, follow_up_date: e.target.value})} /></div>
        
        <div className="field field-wide">
          <label>Görsel / Dosya Yükle</label>
          <input type="file" multiple onChange={() => alert('Dosya yükleme API entegrasyonu yapılıyor...')} />
        </div>

        <div className="field field-wide"><label>Notlar</label><textarea rows="2" value={form.meeting_notes || ''} onChange={e => setForm({...form, meeting_notes: e.target.value})}></textarea></div>
        
        <button type="submit" className="primary-btn">{form.id ? 'Güncelle' : 'Ekle'}</button>
      </form>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{width: '40px'}}><input type="checkbox" onChange={(e) => setSelectedIds(e.target.checked ? investors.map(i => i.id) : [])} /></th>
              <th>Yatırımcı</th><th>Bütçe</th><th>Şehir</th><th>Sektör</th><th>Pipeline</th><th>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {investors.map(inv => (
              <tr key={inv.id} className={selectedIds.includes(inv.id) ? 'selected-row' : ''}>
                <td><input type="checkbox" checked={selectedIds.includes(inv.id)} onChange={() => toggleSelect(inv.id)} /></td>
                <td><strong>{inv.name}</strong><br/><small>{inv.phone}</small></td>
                <td>{inv.budget?.toLocaleString()} {inv.currency}</td>
                <td>{inv.city} / {inv.district}</td>
                <td>{inv.sector}</td>
                <td><span className="badge warning">{inv.pipelineStage}</span></td>
                <td>
                  <button onClick={() => setForm({...inv, id: inv.id})} className="edit-btn">Düzenle</button>
                  <button onClick={() => window.open(`https://wa.me/${inv.phone?.replace(/\D/g,'')}`, '_blank')} className="success-btn" style={{marginLeft: '5px'}}>WhatsApp</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
