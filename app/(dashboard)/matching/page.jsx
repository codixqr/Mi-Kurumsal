'use client';

import { useState } from 'react';
import { apiClient } from '@/lib/apiClient';

export default function MatchingPage() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ investorName: '', budget: '', city: '', sector: '', sqm: '' });

  const handleSuggest = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await apiClient.post('/matching/suggest', form);
      setResults(data);
    } catch (err) { alert('Hata'); }
    finally { setLoading(false); }
  };

  return (
    <section className="card page-section active">
      <div className="section-head">
        <h2>Eşleştirme Motoru</h2>
        <p>Bütçe %30 • Şehir %25 • Sektör %25 • m² %20</p>
      </div>
      <form onSubmit={handleSuggest} className="matching-form">
        <div className="field"><label>Yatırımcı</label><input value={form.investorName} onChange={e => setForm({...form, investorName: e.target.value})} required /></div>
        <div className="field"><label>Bütçe (TL)</label><input type="number" value={form.budget} onChange={e => setForm({...form, budget: e.target.value})} required /></div>
        <div className="field"><label>Şehir</label><input value={form.city} onChange={e => setForm({...form, city: e.target.value})} required /></div>
        <div className="field"><label>Sektör</label><input value={form.sector} onChange={e => setForm({...form, sector: e.target.value})} required /></div>
        <div className="field"><label>Hedef m²</label><input type="number" value={form.sqm} onChange={e => setForm({...form, sqm: e.target.value})} required /></div>
        <button type="submit" disabled={loading}>{loading ? 'Hesaplanıyor...' : 'Eşleşme Öner'}</button>
      </form>

      {results.length > 0 && (
        <div className="table-wrap" style={{marginTop: '20px'}}>
          <table>
            <thead>
              <tr><th>Marka</th><th>Sektör</th><th>Eşleşme Skoru</th></tr>
            </thead>
            <tbody>
              {results.map((res, i) => (
                <tr key={i}>
                  <td><strong>{res.brand.name}</strong></td>
                  <td>{res.brand.sector}</td>
                  <td>
                    <div className="progress-bar-wrap">
                      <div className="progress-bar" style={{width: `${res.score}%`, backgroundColor: res.score > 70 ? '#10b981' : '#f59e0b'}}></div>
                      <span>%{res.score}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
