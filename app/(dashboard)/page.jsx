'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/apiClient';

const fmt = (n) => Number(n || 0).toLocaleString('tr-TR');
const fmtTL = (n) => fmt(n) + ' ₺';

const PRIO_COLORS = {
  'Çok Yüksek': { bg: '#fef2f2', text: '#dc2626', dot: '#dc2626' },
  'Yüksek':     { bg: '#fff7ed', text: '#ea580c', dot: '#ea580c' },
  'Orta':       { bg: '#eff6ff', text: '#2563eb', dot: '#2563eb' },
  'Düşük':      { bg: '#f0fdf4', text: '#16a34a', dot: '#16a34a' },
};

const STATUS_COLORS = {
  'Devam Ediyor': '#2563eb',
  'Açık':         '#64748b',
  'Tamamlandı':   '#16a34a',
  'Gecikti':      '#dc2626',
};

function PrioBadge({ p }) {
  const c = PRIO_COLORS[p] || PRIO_COLORS['Düşük'];
  return (
    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: c.text, background: c.bg, borderRadius: 5, padding: '2px 7px', whiteSpace: 'nowrap' }}>
      {p}
    </span>
  );
}

function KpiCard({ label, value, sub, accent }) {
  return (
    <div style={{
      background: '#fff',
      border: `1px solid ${accent ? accent + '33' : '#e2e8f0'}`,
      borderLeft: `4px solid ${accent || '#1a5c38'}`,
      borderRadius: 12,
      padding: '18px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    }}>
      <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: '1.8rem', fontWeight: 800, color: accent || '#1a5c38', lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{sub}</div>}
    </div>
  );
}

function SectionCard({ title, children, href, accent }) {
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e2e8f0',
      borderRadius: 14,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{
        padding: '14px 18px',
        borderBottom: '1px solid #f1f5f9',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: accent ? `${accent}08` : '#fafafa',
      }}>
        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: accent || '#1e293b' }}>{title}</span>
        {href && <a href={href} style={{ fontSize: '0.75rem', color: '#1a5c38', textDecoration: 'none', fontWeight: 600 }}>Tümü →</a>}
      </div>
      <div style={{ padding: '6px 0', flex: 1 }}>{children}</div>
    </div>
  );
}

function ListRow({ left, right, sub, badge, accent }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '10px 18px',
      borderBottom: '1px solid #f8fafc',
      gap: 8,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, color: '#334155', fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{left}</div>
        {sub && <div style={{ fontSize: '0.76rem', color: '#94a3b8', marginTop: 2 }}>{sub}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {badge && <PrioBadge p={badge} />}
        {right && <span style={{ fontSize: '0.8rem', color: accent || '#64748b', fontWeight: 500 }}>{right}</span>}
      </div>
    </div>
  );
}

function EmptyRow({ text }) {
  return <div style={{ padding: '20px 18px', color: '#94a3b8', fontSize: '0.85rem', textAlign: 'center' }}>{text}</div>;
}

export default function DashboardPage() {
  const [stats, setStats]           = useState({});
  const [tasks, setTasks]           = useState([]);
  const [brands, setBrands]         = useState([]);
  const [locations, setLocations]   = useState([]);
  const [contracts, setContracts]   = useState([]);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    const load = async () => {
      const results = await Promise.allSettled([
        apiClient.get('/dashboard/stats'),
        apiClient.get('/tasks?pageSize=8&page=1'),
        apiClient.get('/brands?pageSize=6&page=1'),
        apiClient.get('/locations?page=1&pageSize=6'),
        apiClient.get('/contracts?pageSize=5&status=Aktif'),
      ]);

      const val = (r, fallback) => r.status === 'fulfilled' ? r.value : fallback;

      setStats(val(results[0], {}));
      const tRaw = val(results[1], {});
      const tItems = Array.isArray(tRaw) ? tRaw : (tRaw.items || []);
      setTasks(tItems.filter(t => t.status !== 'Tamamlandı').slice(0, 7));
      const bRaw = val(results[2], {});
      setBrands(Array.isArray(bRaw) ? bRaw : (bRaw.items || []));
      const lRaw = val(results[3], {});
      setLocations(Array.isArray(lRaw) ? lRaw : (lRaw.items || []));
      const cRaw = val(results[4], {});
      setContracts(Array.isArray(cRaw) ? cRaw : (cRaw.items || []));
      setLoading(false);
    };
    load();
  }, []);

  const followUps = (stats.investorFollowUps || []).slice(0, 6);
  const staleHot  = (stats.investorStaleHot  || []).slice(0, 5);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
        <div style={{ textAlign: 'center', color: '#64748b' }}>
          <div style={{ width: 36, height: 36, border: '3px solid #d1fae5', borderTop: '3px solid #1a5c38', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <div style={{ fontSize: '0.9rem' }}>Panel yükleniyor...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── KPI Şeridi ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
        <KpiCard label="Yatırımcı" value={stats.activeInvestors ?? 0} sub="Toplam kayıt" accent="#1a5c38" />
        <KpiCard label="Aktif Proje" value={stats.activeProjects ?? 0} sub="Devam eden" accent="#2563eb" />
        <KpiCard label="Açık Görev" value={stats.openTasks ?? 0} sub="Tamamlanmadı" accent="#d97706" />
        <KpiCard label="Aktif Sözleşme" value={stats.financeCount ?? 0} sub="Aktif kontrat" accent="#7c3aed" />
        <KpiCard label="Marka" value={stats.totalBrands ?? 0} sub="Portföyde" accent="#0891b2" />
        <KpiCard label="Lokasyon" value={stats.totalLocations ?? 0} sub="Kayıtlı" accent="#059669" />
      </div>

      {/* ── Hızlı Erişim ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '4px 0' }}>
        {[
          { label: '+ Yeni Yatırımcı', href: '/investors', color: '#1a5c38' },
          { label: '+ Yeni Sözleşme',  href: '/contracts', color: '#7c3aed' },
          { label: '+ Yeni Görev',     href: '/tasks',     color: '#d97706' },
          { label: 'Akıllı Eşleştirme', href: '/matching', color: '#0891b2' },
          { label: 'Raporlar',         href: '/reports',   color: '#64748b' },
        ].map(b => (
          <a key={b.href} href={b.href} style={{
            textDecoration: 'none', padding: '8px 16px', borderRadius: 8, fontSize: '0.85rem',
            fontWeight: 600, background: b.color, color: '#fff', whiteSpace: 'nowrap',
            transition: 'opacity .15s',
          }}>
            {b.label}
          </a>
        ))}
      </div>

      {/* ── Kart Izgarası ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>

        {/* Yaklaşan Takipler */}
        <SectionCard title="📅 Yaklaşan Takipler" href="/investors">
          {followUps.length === 0 ? <EmptyRow text="Yaklaşan takip yok." /> : followUps.map(inv => (
            <ListRow key={inv.id}
              left={inv.name}
              right={inv.follow_up_date ? new Date(inv.follow_up_date).toLocaleDateString('tr-TR') : '—'}
              badge={inv.priority}
            />
          ))}
        </SectionCard>

        {/* Açık Görevler */}
        <SectionCard title="✅ Açık Görevler" href="/tasks">
          {tasks.length === 0 ? <EmptyRow text="Açık görev yok." /> : tasks.map(t => (
            <ListRow key={t.id}
              left={t.title || t.note}
              right={t.dueDate ? new Date(t.dueDate).toLocaleDateString('tr-TR') : ''}
              badge={t.priority}
              sub={t.assigneeName ? `→ ${t.assigneeName}` : undefined}
            />
          ))}
        </SectionCard>

        {/* Aktif Sözleşmeler */}
        <SectionCard title="📄 Aktif Sözleşmeler" href="/contracts" accent="#7c3aed">
          {contracts.length === 0 ? <EmptyRow text="Aktif sözleşme yok." /> : contracts.map(c => (
            <ListRow key={c.id}
              left={c.name}
              right={fmtTL(c.amount)}
              sub={c.contractType || c.contract_type}
              accent="#7c3aed"
            />
          ))}
        </SectionCard>

        {/* Marka Portföyü */}
        <SectionCard title="🏷️ Marka Portföyü" href="/brands" accent="#0891b2">
          {brands.length === 0 ? <EmptyRow text="Marka kaydı yok." /> : brands.map(b => (
            <ListRow key={b.id}
              left={b.name}
              right={b.agreementStatus || b.agreement_status || '—'}
              sub={`${b.sector || ''} · ${fmt(b.minBudget || b.min_budget)} ₺ başlangıç`}
              accent="#0891b2"
            />
          ))}
        </SectionCard>

        {/* Lokasyon Portföyü */}
        <SectionCard title="📍 Lokasyon Portföyü" href="/locations" accent="#059669">
          {locations.length === 0 ? <EmptyRow text="Lokasyon kaydı yok." /> : locations.map(l => (
            <ListRow key={l.id}
              left={l.name}
              right={fmtTL(l.rent) + '/ay'}
              sub={`${l.city || ''} · ${l.locationType || l.location_type || '—'} · ${l.potential || '—'}`}
              accent="#059669"
            />
          ))}
        </SectionCard>

        {/* Sıcak Uyarılar */}
        <SectionCard title="🔥 Sıcak Yatırımcı Uyarıları" href="/investors" accent="#dc2626">
          <div style={{ padding: '8px 18px 6px', fontSize: '0.76rem', color: '#b91c1c', fontStyle: 'italic' }}>
            7+ gündür işlem yapılmayan yüksek öncelikli kayıtlar
          </div>
          {staleHot.length === 0 ? <EmptyRow text="Uyarı gerektiren kayıt yok." /> : staleHot.map(inv => (
            <ListRow key={inv.id}
              left={inv.name}
              badge={inv.priority}
              accent="#dc2626"
            />
          ))}
        </SectionCard>

      </div>
    </div>
  );
}
