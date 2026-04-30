'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/apiClient';

export default function PnlPage() {
  const [reports, setReports] = useState([]);
  const [details, setDetails] = useState([]);
  const [selectedPnlId, setSelectedPnlId] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const [form, setForm] = useState({ 
    monthName: '', yearValue: '2024', 
    revenue: '', expense: '', profit: '', note: '' 
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await apiClient.get('/pnl');
      setReports(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchDetails = async (id) => {
    setSelectedPnlId(id);
    try {
      const data = await apiClient.get(`/pnl/${id}/details`);
      setDetails(data);
    } catch (err) {
      setDetails([]);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...form, profit: Number(form.revenue) - Number(form.expense) };
      await apiClient.post('/pnl', payload);
      setForm({ monthName: '', yearValue: '2024', revenue: '', expense: '', profit: '', note: '' });
      fetchData();
    } catch (err) {
      alert('Hata oluştu');
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('excelFile', file);
    try {
      // apiClient helper might need adjustment for FormData, using fetch directly if needed
      await fetch('/api/pnl/import', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` },
        body: formData
      });
      alert('5 aylık veri başarıyla içe aktarıldı.');
      fetchData();
    } catch (err) {
      alert('İçe aktarma hatası');
    }
  };

  if (loading) return <div className="card">Yükleniyor...</div>;

  return (
    <section className="card page-section active">
      <div className="module-head">
        <h2>Aylık Kar / Zarar Yönetimi</h2>
        <div className="header-actions">
          <button className="export-btn" type="button">Excel Dışa Aktar</button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="entry-form">
        <div className="field"><label>Ay</label><input value={form.monthName} onChange={e => setForm({...form, monthName: e.target.value})} placeholder="OCAK, ŞUBAT..." required /></div>
        <div className="field"><label>Yıl</label><input type="number" value={form.yearValue} onChange={e => setForm({...form, yearValue: e.target.value})} required /></div>
        <div className="field"><label>Ciro</label><input type="number" value={form.revenue} onChange={e => setForm({...form, revenue: e.target.value})} required /></div>
        <div className="field"><label>Gider</label><input type="number" value={form.expense} onChange={e => setForm({...form, expense: e.target.value})} required /></div>
        <div className="field"><label>Net Kar (Otomatik)</label><input type="number" value={Number(form.revenue) - Number(form.expense)} readOnly style={{backgroundColor: '#f9f9f9'}} /></div>
        <div className="field field-wide"><label>Not</label><input value={form.note} onChange={e => setForm({...form, note: e.target.value})} /></div>
        <button type="submit" className="primary-btn">Kar/Zarar Kaydı Ekle</button>
      </form>

      <div className="inline-filter" style={{ marginTop: '15px', padding: '10px', border: '1px dashed #ccc' }}>
        <label style={{ marginRight: '10px' }}>Excel İçe Aktar (5 Ay):</label>
        <input type="file" onChange={handleImport} accept=".xlsx,.xls" />
      </div>

      <div className="table-wrap" style={{ marginTop: '20px' }}>
        <h3>Genel Özet</h3>
        <table>
          <thead>
            <tr><th>Ay</th><th>Yıl</th><th>Ciro</th><th>Gider</th><th>Net Kar</th><th>İşlem</th></tr>
          </thead>
          <tbody>
            {reports.map(r => (
              <tr key={r.id} onClick={() => fetchDetails(r.id)} style={{ cursor: 'pointer' }} className={selectedPnlId === r.id ? 'selected-row' : ''}>
                <td><strong>{r.month_name}</strong></td>
                <td>{r.year_value}</td>
                <td>{r.revenue?.toLocaleString()} TL</td>
                <td>{r.expense?.toLocaleString()} TL</td>
                <td className={r.profit >= 0 ? 'text-success' : 'text-danger'}>
                  {r.profit?.toLocaleString()} TL
                </td>
                <td>
                  <button onClick={(e) => { e.stopPropagation(); fetchDetails(r.id); }} className="edit-btn">Detay</button>
                  <button onClick={async (e) => { e.stopPropagation(); if(confirm('Sil?')) { await apiClient.delete(`/pnl/${r.id}`); fetchData(); } }} className="danger-btn">Sil</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedPnlId && (
        <div className="table-wrap" style={{ marginTop: '20px', borderTop: '2px solid #3b82f6', paddingTop: '15px' }}>
          <h3>Aylık Gider/Gelir Detayları</h3>
          <table>
            <thead>
              <tr><th>Kategori</th><th>Kalem</th><th>Tutar</th><th>Oran (%)</th></tr>
            </thead>
            <tbody>
              {details.length > 0 ? details.map((d, i) => (
                <tr key={i}>
                  <td>{d.category}</td>
                  <td>{d.item}</td>
                  <td>{d.amount?.toLocaleString()} TL</td>
                  <td>%{d.ratio}</td>
                </tr>
              )) : (
                <tr><td colSpan="4">Bu aya ait detay kaydı bulunamadı.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
