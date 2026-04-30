'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/apiClient';

export default function InvestorsPage() {
  const [investors, setInvestors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    name: '', budget: '', city: '', sector: '', type: 'Franchise', pipeline: 'Yeni Lead',
    currency: 'TRY', phone: '', email: '', district: '', goal: '',
    contactHistory: '', meetingNotes: '', followUpDate: ''
  });

  const fetchInvestors = async () => {
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

  useEffect(() => { fetchInvestors(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await apiClient.put(`/investors/${editingId}`, form);
      } else {
        await apiClient.post('/investors', form);
      }
      resetForm();
      fetchInvestors();
    } catch (err) {
      alert('Hata: ' + err.message);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setForm({
      name: '', budget: '', city: '', sector: '', type: 'Franchise', pipeline: 'Yeni Lead',
      currency: 'TRY', phone: '', email: '', district: '', goal: '',
      contactHistory: '', meetingNotes: '', followUpDate: ''
    });
  };

  const handleEdit = (inv) => {
    setEditingId(inv.id);
    setForm({
      name: inv.name, budget: inv.budget, city: inv.city, sector: inv.sector,
      type: inv.type, pipeline: inv.pipeline, currency: inv.currency,
      phone: inv.phone, email: inv.email, district: inv.district,
      goal: inv.goal, contactHistory: inv.contactHistory,
      meetingNotes: inv.meetingNotes, followUpDate: inv.followUpDate ? inv.followUpDate.split('T')[0] : ''
    });
  };

  const handleDelete = async (id) => {
    if (!confirm('Bu yatırımcıyı silmek istediğinize emin misiniz?')) return;
    try {
      await apiClient.delete(`/investors/${id}`);
      fetchInvestors();
    } catch (err) {
      alert('Silinemedi.');
    }
  };

  if (loading) return <div className="card">Yükleniyor...</div>;

  return (
    <section className="card page-section active">
      <div className="module-head">
        <h2>Yatırımcı Yönetimi</h2>
        <div>
          <button className="export-btn" type="button">Excel Dışa Aktar</button>
          <button className="pdf-export-btn" type="button">PDF Dışa Aktar</button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="entry-form">
        <div className="field"><label>Ad Soyad / Şirket</label><input value={form.name} onChange={e => setForm({...form, name: e.target.value})} required /></div>
        <div className="field"><label>Bütçe</label><input type="number" value={form.budget} onChange={e => setForm({...form, budget: e.target.value})} required /></div>
        <div className="field"><label>Şehir</label><input value={form.city} onChange={e => setForm({...form, city: e.target.value})} list="cityOptions" required /></div>
        <div className="field"><label>Sektör</label><input value={form.sector} onChange={e => setForm({...form, sector: e.target.value})} list="sectorOptions" required /></div>
        <div className="field">
          <label>Yatırım Tipi</label>
          <select value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
            <option>Franchise</option><option>Satın Alma</option><option>Ortaklık</option><option>Master Franchise</option>
          </select>
        </div>
        <div className="field">
          <label>Pipeline</label>
          <select value={form.pipeline} onChange={e => setForm({...form, pipeline: e.target.value})}>
            <option>Yeni Lead</option><option>İletişim Kuruldu</option><option>Analiz Yapıldı</option><option>Marka Önerildi</option><option>Sunum Yapıldı</option><option>Teklif Verildi</option><option>Sözleşme Süreci</option><option>Kapandı</option>
          </select>
        </div>
        <div className="field">
          <label>Para Birimi</label>
          <select value={form.currency} onChange={e => setForm({...form, currency: e.target.value})}><option value="TRY">TL</option><option value="USD">USD</option></select>
        </div>
        <div className="field"><label>Telefon</label><input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="+90 5xx..." /></div>
        <div className="field"><label>E-posta</label><input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} /></div>
        <div className="field"><label>İlçe</label><input value={form.district} onChange={e => setForm({...form, district: e.target.value})} /></div>
        <div className="field"><label>Hedef</label><input value={form.goal} onChange={e => setForm({...form, goal: e.target.value})} /></div>
        
        <div className="field field-wide"><label>İletişim Geçmişi</label><textarea value={form.contactHistory} onChange={e => setForm({...form, contactHistory: e.target.value})} rows="3"></textarea></div>
        <div className="field field-wide"><label>Görüşme Notu</label><textarea value={form.meetingNotes} onChange={e => setForm({...form, meetingNotes: e.target.value})} rows="3"></textarea></div>
        <div className="field"><label>Takip Tarihi</label><input type="date" value={form.followUpDate} onChange={e => setForm({...form, followUpDate: e.target.value})} /></div>
        
        <div className="field-wide">
          <button type="submit" className="primary-btn">{editingId ? 'Güncelle' : 'Yatırımcı Ekle'}</button>
          {editingId && <button type="button" onClick={resetForm} className="secondary-btn" style={{marginLeft: '10px'}}>Vazgeç</button>}
        </div>
      </form>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Yatırımcı</th><th>Bütçe</th><th>Şehir</th><th>Sektör</th><th>Tip</th><th>Pipeline</th><th>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {investors.map(inv => (
              <tr key={inv.id}>
                <td><strong>{inv.name}</strong></td>
                <td>{inv.budget.toLocaleString()} {inv.currency}</td>
                <td>{inv.city}</td>
                <td>{inv.sector}</td>
                <td>{inv.type}</td>
                <td><span className={`badge ${inv.pipeline.toLowerCase().replace(/ /g, '-')}`}>{inv.pipeline}</span></td>
                <td>
                  <button onClick={() => handleEdit(inv)} className="edit-btn">Düzenle</button>
                  <button onClick={() => handleDelete(inv.id)} className="danger-btn">Sil</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
