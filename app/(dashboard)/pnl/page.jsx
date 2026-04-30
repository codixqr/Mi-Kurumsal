'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/apiClient';

export default function PnlPage() {
  const [reports, setReports] = useState([]);
  const [form, setForm] = useState({ monthName: '', yearValue: '2023', revenue: '', expense: '', profit: '', note: '' });

  const fetchData = async () => {
    try { const data = await apiClient.get('/pnl'); setReports(data); } catch (err) {}
  };

  useEffect(() => { fetchData(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await apiClient.post('/pnl', form);
      setForm({ monthName: '', yearValue: '2023', revenue: '', expense: '', profit: '', note: '' });
      fetchData();
    } catch (err) {}
  };

  return (
    <section className="card page-section active">
      <div className="module-head">
        <h2>Aylık Kar / Zarar Yönetimi</h2>
      </div>
      <form onSubmit={handleSubmit} className="entry-form">
        <div className="field"><label>Ay</label><input value={form.monthName} onChange={e => setForm({...form, monthName: e.target.value})} placeholder="OCAK, ŞUBAT..." required /></div>
        <div className="field"><label>Yıl</label><input type="number" value={form.yearValue} onChange={e => setForm({...form, yearValue: e.target.value})} required /></div>
        <div className="field"><label>Ciro</label><input type="number" value={form.revenue} onChange={e => setForm({...form, revenue: e.target.value})} required /></div>
        <div className="field"><label>Gider</label><input type="number" value={form.expense} onChange={e => setForm({...form, expense: e.target.value})} required /></div>
        <div className="field"><label>Kar/Zarar</label><input type="number" value={form.profit} onChange={e => setForm({...form, profit: e.target.value})} required /></div>
        <div className="field field-wide"><label>Not</label><input value={form.note} onChange={e => setForm({...form, note: e.target.value})} /></div>
        <button type="submit">Kayıt Ekle</button>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Ay</th><th>Yıl</th><th>Ciro</th><th>Gider</th><th>Kar/Zarar</th><th>İşlem</th></tr>
          </thead>
          <tbody>
            {reports.map(r => (
              <tr key={r.id}>
                <td>{r.month_name}</td>
                <td>{r.year_value}</td>
                <td>{r.revenue.toLocaleString()} TL</td>
                <td>{r.expense.toLocaleString()} TL</td>
                <td className={r.profit >= 0 ? 'text-success' : 'text-danger'}>{r.profit.toLocaleString()} TL</td>
                <td><button onClick={async () => { await apiClient.delete(`/pnl/${r.id}`); fetchData(); }} className="danger-btn">Sil</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
