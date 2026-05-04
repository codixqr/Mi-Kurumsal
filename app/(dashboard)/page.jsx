'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/apiClient';

export default function DashboardPage() {
  const [stats, setStats] = useState({
    activeInvestors: 0,
    activeProjects: 0,
    openTasks: 0,
    strongMatches: 0
  });
  const [followUps, setFollowUps] = useState([]);
  const [staleHot, setStaleHot] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [brands, setBrands] = useState([]);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const s = await apiClient.get('/dashboard/stats');
        setStats(s);
        const rawFollow = s.investorFollowUps || [];
        setFollowUps(
          rawFollow.slice(0, 5).map((r) => ({
            id: r.id,
            name: r.name,
            followUpDate: r.follow_up_date,
            priority: r.priority,
          })),
        );
        setStaleHot((s.investorStaleHot || []).slice(0, 5));

        const t = await apiClient.get('/tasks');
        setTasks(t.filter(task => task.status !== 'Tamamlandı').slice(0, 5));
        
        const b = await apiClient.get('/brands?pageSize=50&page=1');
        const brandList = Array.isArray(b) ? b : b.items || [];
        setBrands(brandList.filter((brand) => brand.active).slice(0, 5));
      } catch (err) {
        console.error('Dashboard veri çekme hatası:', err);
      }
    };
    fetchDashboardData();
  }, []);

  return (
    <div className="dashboard-content">
      <section className="stats-grid">
        <article className="card stat-card">
          <h3>Aktif Yatırımcı</h3>
          <p>{stats.activeInvestors}</p>
        </article>
        <article className="card stat-card">
          <h3>Aktif Proje</h3>
          <p>{stats.activeProjects}</p>
        </article>
        <article className="card stat-card">
          <h3>Açık Görev</h3>
          <p>{stats.openTasks}</p>
        </article>
        <article className="card stat-card">
          <h3>Güçlü Eşleşme</h3>
          <p>{stats.strongMatches}</p>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="card dashboard-card">
          <h3>Hızlı Erişim</h3>
          <div className="quick-links">
            <button type="button" className="quick-link-btn" onClick={() => window.location.href='/investors'}>Yeni Yatırımcı Kaydı</button>
            <button type="button" className="quick-link-btn" onClick={() => window.location.href='/projects'}>Proje Aç / Güncelle</button>
            <button type="button" className="quick-link-btn" onClick={() => window.location.href='/matching'}>Eşleştirme Çalıştır</button>
            <button type="button" className="quick-link-btn" onClick={() => window.location.href='/reports'}>Raporları İncele</button>
          </div>
        </article>

        <article className="card dashboard-card">
          <h3>Yaklaşan Takipler</h3>
          <ul className="dashboard-list">
            {followUps.map((inv) => (
              <li key={inv.id}>
                <strong>{inv.name}</strong> — {inv.followUpDate ? new Date(inv.followUpDate).toLocaleDateString('tr-TR') : '—'}
                {inv.priority ? ` (${inv.priority})` : ''}
              </li>
            ))}
            {followUps.length === 0 && <li>Yakın zamanda takip yok.</li>}
          </ul>
        </article>

        <article className="card dashboard-card">
          <h3>Sıcak yatırımcı uyarıları</h3>
          <p className="dashboard-muted" style={{ fontSize: '0.85rem', color: '#64748b', marginTop: 0 }}>
            7 gündür işlem yapılmayan yüksek öncelikli kayıtlar
          </p>
          <ul className="dashboard-list">
            {staleHot.map((inv) => (
              <li key={inv.id}>
                <strong>{inv.name}</strong>
                {inv.priority ? ` — ${inv.priority}` : ''}
              </li>
            ))}
            {staleHot.length === 0 && <li>Uyarı gerektiren kayıt yok.</li>}
          </ul>
        </article>

        <article className="card dashboard-card">
          <h3>Açık Görevler</h3>
          <ul className="dashboard-list">
            {tasks.map(task => (
              <li key={task.id}>{task.note}</li>
            ))}
            {tasks.length === 0 && <li>Açık görev bulunmuyor.</li>}
          </ul>
        </article>

        <article className="card dashboard-card">
          <h3>Öne Çıkan Markalar</h3>
          <ul className="dashboard-list">
            {brands.map(brand => (
              <li key={brand.id}>
                <strong>{brand.name}</strong> - {brand.sector}
              </li>
            ))}
          </ul>
        </article>
      </section>
    </div>
  );
}
