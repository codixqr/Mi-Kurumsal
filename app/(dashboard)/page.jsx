'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/apiClient';

const fmt = (n) => Number(n || 0).toLocaleString('tr-TR');
const fmtTL = (n) => fmt(n) + ' ₺';

const prioBadge = (p) => {
  const map = { 'Çok Yüksek': '#b91c1c', 'Yüksek': '#d97706', 'Orta': '#2563eb', 'Düşük': '#64748b' };
  return <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#fff', background: map[p] || '#64748b', borderRadius: 4, padding: '1px 6px' }}>{p}</span>;
};

export default function DashboardPage() {
  const [stats, setStats] = useState({ activeInvestors: 0, activeProjects: 0, openTasks: 0, strongMatches: 0, financeCount: 0, investorFollowUps: [], investorStaleHot: [] });
  const [tasks, setTasks] = useState([]);
  const [brands, setBrands] = useState([]);
  const [hotLocations, setHotLocations] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [s, t, b, l, c] = await Promise.all([
          apiClient.get('/dashboard/stats'),
          apiClient.get('/tasks?pageSize=6&status=Açık'),
          apiClient.get('/brands?pageSize=6&page=1'),
          apiClient.get('/locations?page=1&pageSize=6'),
          apiClient.get('/contracts?pageSize=5&status=Aktif'),
        ]);
        setStats(s || {});
        const taskItems = Array.isArray(t) ? t : (t.items || []);
        setTasks(taskItems.filter(tk => tk.status !== 'Tamamlandı').slice(0, 6));
        const brandList = Array.isArray(b) ? b : (b.items || []);
        setBrands(brandList.slice(0, 6));
        const locList = Array.isArray(l) ? l : (l.items || []);
        setHotLocations(locList.slice(0, 6));
        const contrList = Array.isArray(c) ? c : (c.items || []);
        setContracts(contrList.slice(0, 5));
      } catch (err) {
        console.error('Dashboard yükleme hatası:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const followUps = (stats.investorFollowUps || []).slice(0, 5).map(r => ({
    id: r.id, name: r.name, followUpDate: r.follow_up_date, priority: r.priority,
  }));
  const staleHot = (stats.investorStaleHot || []).slice(0, 5);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Panel yükleniyor...</div>;

  return (
    <div className="dashboard-content">

      {/* ── KPI Kartları ── */}
      <section className="inv-kpi-grid">
        <article className="inv-kpi-card">
          <div className="inv-kpi-label">Toplam Yatırımcı</div>
          <div className="inv-kpi-value">{stats.activeInvestors ?? 0}</div>
        </article>
        <article className="inv-kpi-card">
          <div className="inv-kpi-label">Aktif Proje</div>
          <div className="inv-kpi-value">{stats.activeProjects ?? 0}</div>
        </article>
        <article className="inv-kpi-card">
          <div className="inv-kpi-label">Açık Görev</div>
          <div className="inv-kpi-value">{stats.openTasks ?? 0}</div>
        </article>
        <article className="inv-kpi-card">
          <div className="inv-kpi-label">Aktif Sözleşme</div>
          <div className="inv-kpi-value">{stats.financeCount ?? 0}</div>
        </article>
        <article className="inv-kpi-card">
          <div className="inv-kpi-label">Güçlü Eşleşme</div>
          <div className="inv-kpi-value">{stats.strongMatches ?? 0}</div>
        </article>
        <article className="inv-kpi-card">
          <div className="inv-kpi-label">Yaklaşan Takip</div>
          <div className="inv-kpi-value">{followUps.length}</div>
        </article>
      </section>

      {/* ── Hızlı Erişim ── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '20px 0' }}>
        {[
          { label: '+ Yeni Yatırımcı', href: '/investors' },
          { label: '+ Yeni Sözleşme', href: '/contracts' },
          { label: '+ Yeni Görev', href: '/tasks' },
          { label: 'Akıllı Eşleştirme', href: '/matching' },
          { label: 'Raporlar', href: '/reports' },
        ].map(btn => (
          <a key={btn.href} href={btn.href} className="primary-btn" style={{ textDecoration: 'none', fontSize: '0.85rem' }}>{btn.label}</a>
        ))}
      </div>

      {/* ── Orta Panel ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>

        {/* Yaklaşan Takipler */}
        <article style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: '0.95rem', color: '#1e293b', borderBottom: '1px solid #f1f5f9', paddingBottom: 10 }}>Yaklaşan Takipler</h3>
          {followUps.length === 0 ? <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Yakın takip kaydı yok.</p> : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {followUps.map(inv => (
                <li key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #f8fafc', fontSize: '0.875rem' }}>
                  <span style={{ fontWeight: 600, color: '#334155' }}>{inv.name}</span>
                  <span style={{ color: '#64748b', fontSize: '0.8rem' }}>{inv.followUpDate ? new Date(inv.followUpDate).toLocaleDateString('tr-TR') : '—'}</span>
                </li>
              ))}
            </ul>
          )}
        </article>

        {/* Açık Görevler */}
        <article style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: '0.95rem', color: '#1e293b', borderBottom: '1px solid #f1f5f9', paddingBottom: 10 }}>Açık Görevler</h3>
          {tasks.length === 0 ? <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Açık görev bulunmuyor.</p> : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {tasks.map(task => (
                <li key={task.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #f8fafc', fontSize: '0.875rem' }}>
                  <span style={{ color: '#334155', flex: 1, marginRight: 8 }}>{task.title || task.note}</span>
                  {task.priority && prioBadge(task.priority)}
                </li>
              ))}
            </ul>
          )}
        </article>

        {/* Aktif Sözleşmeler */}
        <article style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: '0.95rem', color: '#1e293b', borderBottom: '1px solid #f1f5f9', paddingBottom: 10 }}>Aktif Sözleşmeler</h3>
          {contracts.length === 0 ? <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Aktif sözleşme yok.</p> : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {contracts.map(c => (
                <li key={c.id} style={{ padding: '7px 0', borderBottom: '1px solid #f8fafc', fontSize: '0.875rem' }}>
                  <div style={{ fontWeight: 600, color: '#334155' }}>{c.name}</div>
                  <div style={{ color: '#64748b', fontSize: '0.8rem' }}>{c.contractType} — {fmtTL(c.amount)}</div>
                </li>
              ))}
            </ul>
          )}
        </article>

        {/* Marka Portföyü */}
        <article style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: '0.95rem', color: '#1e293b', borderBottom: '1px solid #f1f5f9', paddingBottom: 10 }}>Marka Portföyü</h3>
          {brands.length === 0 ? <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Marka kaydı yok.</p> : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {brands.map(b => (
                <li key={b.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f8fafc', fontSize: '0.875rem' }}>
                  <span style={{ fontWeight: 600, color: '#334155' }}>{b.name}</span>
                  <span style={{ fontSize: '0.78rem', color: '#64748b' }}>{b.sector} — {b.agreementStatus || b.agreement_status || '—'}</span>
                </li>
              ))}
            </ul>
          )}
        </article>

        {/* Lokasyon Portföyü */}
        <article style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: '0.95rem', color: '#1e293b', borderBottom: '1px solid #f1f5f9', paddingBottom: 10 }}>Lokasyon Portföyü</h3>
          {hotLocations.length === 0 ? <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Lokasyon kaydı yok.</p> : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {hotLocations.map(loc => (
                <li key={loc.id} style={{ padding: '7px 0', borderBottom: '1px solid #f8fafc', fontSize: '0.875rem' }}>
                  <div style={{ fontWeight: 600, color: '#334155' }}>{loc.name}</div>
                  <div style={{ color: '#64748b', fontSize: '0.8rem' }}>{loc.city} — {loc.locationType || loc.location_type || '—'} — {fmtTL(loc.rent)}/ay</div>
                </li>
              ))}
            </ul>
          )}
        </article>

        {/* Sıcak Uyarılar */}
        <article style={{ background: '#fff', border: '1px solid #fef3c7', borderRadius: 14, padding: 20 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: '0.95rem', color: '#b45309', borderBottom: '1px solid #fef3c7', paddingBottom: 10 }}>Sıcak Yatırımcı Uyarıları</h3>
          <p style={{ fontSize: '0.78rem', color: '#92400e', margin: '0 0 10px', fontStyle: 'italic' }}>7+ gündür işlem yapılmayan yüksek öncelikli kayıtlar</p>
          {staleHot.length === 0 ? <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Uyarı gerektiren kayıt yok.</p> : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {staleHot.map(inv => (
                <li key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #fef9c3', fontSize: '0.875rem' }}>
                  <span style={{ fontWeight: 600, color: '#78350f' }}>{inv.name}</span>
                  {inv.priority && prioBadge(inv.priority)}
                </li>
              ))}
            </ul>
          )}
        </article>

      </div>
    </div>
  );
}
