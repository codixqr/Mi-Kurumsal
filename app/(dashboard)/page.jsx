'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/apiClient';

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.get('/dashboard/stats');
      setStats(data);
    } catch (err) {
      setError('İstatistikler yüklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  if (loading) return <div className="card">İstatistikler yükleniyor...</div>;
  if (error) return (
    <div className="card">
      <p className="error">{error}</p>
      <button onClick={fetchStats}>Tekrar Dene</button>
    </div>
  );

  return (
    <div className="dashboard-content">
      <section className="stats-grid">
        <article className="card stat-card">
          <h3>Aktif Yatırımcı</h3>
          <p>{stats?.activeInvestors || 0}</p>
        </article>
        <article className="card stat-card">
          <h3>Aktif Proje</h3>
          <p>{stats?.activeProjects || 0}</p>
        </article>
        <article className="card stat-card">
          <h3>Açık Görev</h3>
          <p>{stats?.openTasks || 0}</p>
        </article>
        <article className="card stat-card">
          <h3>Güçlü Eşleşme</h3>
          <p>{stats?.strongMatches || 0}</p>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="card dashboard-card">
          <h3>Hızlı Erişim</h3>
          <div className="quick-links">
            <button type="button" className="quick-link-btn">Yeni Yatırımcı Kaydı</button>
            <button type="button" className="quick-link-btn">Proje Aç / Güncelle</button>
            <button type="button" className="quick-link-btn">Eşleştirme Çalıştır</button>
            <button type="button" className="quick-link-btn">Raporları İncele</button>
          </div>
        </article>
        <article className="card dashboard-card">
          <h3>Özet Bilgi</h3>
          <p>CRM sistemi Next.js altyapısına başarıyla taşınmıştır. Tüm veriler canlı API üzerinden çekilmektedir.</p>
          <div className="kpi-mini">
            <span>Dönüşüm Oranı: <strong>%{stats?.conversionRate || 0}</strong></span>
          </div>
        </article>
      </section>
    </div>
  );
}
