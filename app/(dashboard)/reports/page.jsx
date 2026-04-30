'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/apiClient';

export default function ReportsPage() {
  const [report, setReport] = useState(null);
  const [dates, setDates] = useState({ from: '', to: '' });

  const fetchReport = async () => {
    const query = dates.from && dates.to ? `?from=${dates.from}&to=${dates.to}` : '';
    try {
      const data = await apiClient.get(`/reports/summary${query}`);
      setReport(data);
    } catch (err) {}
  };

  useEffect(() => { fetchReport(); }, []);

  return (
    <section className="card page-section active">
      <div className="module-head">
        <h2>Raporlama (KPI)</h2>
        <form onSubmit={(e) => { e.preventDefault(); fetchReport(); }} className="inline-filter">
          <input type="date" value={dates.from} onChange={e => setDates({...dates, from: e.target.value})} />
          <input type="date" value={dates.to} onChange={e => setDates({...dates, to: e.target.value})} />
          <button type="submit">Filtrele</button>
        </form>
      </div>

      <div className="kpi-grid">
        <article className="card stat-card"><h3>Leads</h3><p>{report?.leads || 0}</p></article>
        <article className="card stat-card"><h3>Kazanılan</h3><p>{report?.wins || 0}</p></article>
        <article className="card stat-card"><h3>Dönüşüm Oranı</h3><p>%{report?.conversionRate || 0}</p></article>
        <article className="card stat-card"><h3>Aktif Projeler</h3><p>{report?.activeProjects || 0}</p></article>
      </div>

      <div className="card" style={{marginTop: '20px'}}>
        <h3>Sektörel Dağılım ve Ekip Performansı</h3>
        <p>En Çok İlgi Gören Sektör: <strong>{report?.topSector || '-'}</strong></p>
        <p>En Aktif Ekip: <strong>{report?.topTeam || '-'}</strong></p>
      </div>
    </section>
  );
}
