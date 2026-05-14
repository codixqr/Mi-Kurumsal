'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/apiClient';

const fmt = (n) => Number(n || 0).toLocaleString('tr-TR');
const fmtTL = (n) => fmt(n) + ' ₺';

export default function ReportsPage() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dates, setDates] = useState({ from: '', to: '' });

  const fetchReport = async () => {
    setLoading(true);
    const query = dates.from && dates.to ? `?from=${dates.from}&to=${dates.to}` : '';
    try {
      const data = await apiClient.get(`/reports/summary${query}`);
      setReport(data);
    } catch (err) {
      console.error('Rapor yüklenemedi:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchReport(); }, []);

  return (
    <section className="inv-page">
      <div className="module-head" style={{ flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ margin: 0 }}>Raporlama & KPI Özeti</h2>
        <form onSubmit={(e) => { e.preventDefault(); fetchReport(); }} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="date" value={dates.from} onChange={e => setDates({ ...dates, from: e.target.value })} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '0.875rem' }} />
          <input type="date" value={dates.to} onChange={e => setDates({ ...dates, to: e.target.value })} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '0.875rem' }} />
          <button type="submit" className="primary-btn">Filtrele</button>
          {(dates.from || dates.to) && <button type="button" className="secondary-btn" onClick={() => { setDates({ from: '', to: '' }); setTimeout(fetchReport, 50); }}>Sıfırla</button>}
        </form>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Rapor yükleniyor...</div>
      ) : (
        <>
          {/* ── Ana KPI'lar ── */}
          <section className="inv-kpi-grid" style={{ marginTop: 20 }}>
            <article className="inv-kpi-card">
              <div className="inv-kpi-label">Toplam Yatırımcı</div>
              <div className="inv-kpi-value">{report?.leads ?? 0}</div>
            </article>
            <article className="inv-kpi-card">
              <div className="inv-kpi-label">Kazanılan (Pipeline Kapandı)</div>
              <div className="inv-kpi-value">{report?.wins ?? 0}</div>
            </article>
            <article className="inv-kpi-card">
              <div className="inv-kpi-label">Dönüşüm Oranı</div>
              <div className="inv-kpi-value">%{report?.conversionRate ?? 0}</div>
            </article>
            <article className="inv-kpi-card">
              <div className="inv-kpi-label">Aktif Projeler</div>
              <div className="inv-kpi-value">{report?.activeProjects ?? 0}</div>
            </article>
            <article className="inv-kpi-card">
              <div className="inv-kpi-label">Aktif Sözleşmeler</div>
              <div className="inv-kpi-value">{report?.activeContracts ?? 0}</div>
            </article>
            <article className="inv-kpi-card">
              <div className="inv-kpi-label">Açık Görevler</div>
              <div className="inv-kpi-value">{report?.openTasks ?? 0}</div>
            </article>
          </section>

          {/* ── Portföy Özeti ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16, marginTop: 24 }}>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20 }}>
              <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Marka Portföyü</div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: '#1a5c38' }}>{report?.totalBrands ?? 0}</div>
              <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: 4 }}>Aktif marka sayısı</div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20 }}>
              <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Lokasyon Portföyü</div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: '#1a5c38' }}>{report?.totalLocations ?? 0}</div>
              <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: 4 }}>Kayıtlı lokasyon sayısı</div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20 }}>
              <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>CRM Geliri (Dönem)</div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: '#1a5c38' }}>{fmtTL(report?.totalRevenue)}</div>
              <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: 4 }}>Finans kayıtları toplamı</div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20 }}>
              <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>En Çok İlgi - Sektör</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#1a5c38' }}>{report?.topSector || '-'}</div>
              <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: 4 }}>Yatırımcı talebi sırasına göre</div>
            </div>
          </div>

          {/* ── Pipeline Dönüşüm Görseli ── */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 24, marginTop: 20 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '1rem', color: '#1e293b' }}>Pipeline Dönüşüm Analizi</h3>
            <div style={{ display: 'flex', gap: 0, alignItems: 'stretch' }}>
              {[
                { label: 'Toplam Yatırımcı', value: report?.leads ?? 0, bg: '#f1f5f9', color: '#475569' },
                { label: 'Aktif Süreç', value: Math.max(0, (report?.leads ?? 0) - (report?.wins ?? 0)), bg: '#dbeafe', color: '#1d4ed8' },
                { label: 'Sözleşme Aşaması', value: report?.activeContracts ?? 0, bg: '#d1fae5', color: '#065f46' },
                { label: 'Kazanılan', value: report?.wins ?? 0, bg: '#dcfce7', color: '#166534' },
              ].map((s, i) => (
                <div key={i} style={{ flex: 1, background: s.bg, padding: '16px 12px', textAlign: 'center', borderLeft: i > 0 ? '2px solid #fff' : 'none' }}>
                  <div style={{ fontSize: '1.6rem', fontWeight: 700, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 4 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Hızlı Yönlendirme ── */}
          <div style={{ marginTop: 20, background: '#f8fdf9', border: '1px solid #d1e7dd', borderRadius: 14, padding: 20 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '0.95rem', color: '#1a5c38' }}>Detaylı Analiz İçin</h3>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {[
                { label: 'Yatırımcı Yönetimi', href: '/investors' },
                { label: 'Marka Portföyü', href: '/brands' },
                { label: 'Sözleşmeler', href: '/contracts' },
                { label: 'Finans & Kar/Zarar', href: '/pnl' },
                { label: 'Görev Yönetimi', href: '/tasks' },
              ].map(l => (
                <a key={l.href} href={l.href} className="secondary-btn" style={{ fontSize: '0.85rem', textDecoration: 'none' }}>{l.label}</a>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
