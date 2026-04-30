'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/apiClient';

export default function InvestorsPage() {
  const [investors, setInvestors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    name: '', budget: '', city: '', sector: '', investment_type: 'Franchise',
    pipeline_stage: 'Yeni Lead', currency: 'TRY', phone: '', email: '',
    district: '', goal: '', contact_history: '', meeting_notes: '',
    follow_up_date: ''
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (form.id) {
        await apiClient.put(`/investors/${form.id}`, form);
      } else {
        await apiClient.post('/investors', form);
      }
      setForm({ name: '', budget: '', city: '', sector: '', investment_type: 'Franchise', pipeline_stage: 'Yeni Lead', currency: 'TRY', phone: '', email: '', district: '', goal: '', contact_history: '', meeting_notes: '', follow_up_date: '' });
      fetchData();
    } catch (err) {
      alert('Hata oluştu');
    }
  };

  const handleEdit = (inv) => {
    setForm({
      ...inv,
      budget: inv.budget || '',
      follow_up_date: inv.follow_up_date ? inv.follow_up_date.split('T')[0] : ''
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (loading) return <div className="card">Yükleniyor...</div>;

  return (
    <section className="card page-section active">
      <div className="module-head">
        <h2>Yatırımcı Yönetimi</h2>
        <div className="header-actions">
          <button className="export-btn" type="button">Excel Dışa Aktar</button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="entry-form">
        <div className="field"><label>Ad Soyad / Şirket</label><input value={form.name} onChange={e => setForm({...form, name: e.target.value})} required /></div>
        <div className="field"><label>Bütçe</label><input type="number" value={form.budget} onChange={e => setForm({...form, budget: e.target.value})} required /></div>
        <div className="field">
          <label>Para Birimi</label>
          <select value={form.currency} onChange={e => setForm({...form, currency: e.target.value})}>
            <option value="TRY">TL</option><option value="USD">USD</option>
          </select>
        </div>
        <div className="field"><label>Şehir</label><input value={form.city} onChange={e => setForm({...form, city: e.target.value})} required /></div>
        <div className="field"><label>İlçe / Bölge</label><input value={form.district} onChange={e => setForm({...form, district: e.target.value})} /></div>
        <div className="field"><label>Sektör</label><input value={form.sector} onChange={e => setForm({...form, sector: e.target.value})} required /></div>
        <div className="field"><label>Yatırım Tipi</label><input value={form.investment_type} onChange={e => setForm({...form, investment_type: e.target.value})} required /></div>
        <div className="field"><label>Pipeline</label><input value={form.pipeline_stage} onChange={e => setForm({...form, pipeline_stage: e.target.value})} required /></div>
        <div className="field"><label>Telefon</label><input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} /></div>
        <div className="field"><label>E-posta</label><input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} /></div>
        <div className="field"><label>Takip Tarihi</label><input type="date" value={form.follow_up_date} onChange={e => setForm({...form, follow_up_date: e.target.value})} /></div>
        <div className="field field-wide"><label>İletişim Geçmişi</label><textarea rows="2" value={form.contact_history} onChange={e => setForm({...form, contact_history: e.target.value})} placeholder="Daha önce yapılan görüşmelerin özeti..."></textarea></div>
        <div className="field field-wide"><label>Görüşme Notları</label><textarea rows="3" value={form.meeting_notes} onChange={e => setForm({...form, meeting_notes: e.target.value})} placeholder="Detaylı analiz ve toplantı notları..."></textarea></div>
        <button type="submit" className="primary-btn">{form.id ? 'Yatırımcıyı Güncelle' : 'Yatırımcı Ekle'}</button>
      </form>

      <div className="table-wrap" style={{ marginTop: '20px' }}>
        <table>
          <thead>
            <tr>
              <th>Yatırımcı</th><th>Bütçe</th><th>Şehir</th><th>Sektör</th><th>Pipeline</th><th>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {investors.map(inv => (
              <tr key={inv.id}>
                <td><strong>{inv.name}</strong><br/><small>{inv.phone}</small></td>
                <td>{inv.budget?.toLocaleString()} {inv.currency}</td>
                <td>{inv.city}</td>
                <td>{inv.sector}</td>
                <td><span className="badge warning">{inv.pipeline_stage}</span></td>
                <td>
                  <button onClick={() => handleEdit(inv)} className="edit-btn">Düzenle</button>
                  <button onClick={async () => { if(confirm('Sil?')) { await apiClient.delete(`/investors/${inv.id}`); fetchData(); } }} className="danger-btn">Sil</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
