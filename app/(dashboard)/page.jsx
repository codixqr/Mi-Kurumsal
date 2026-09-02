'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/apiClient';
import { KpiCard, SectionCard, ListRow } from '@/components/ui';

const fmt = (n) => Number(n || 0).toLocaleString('tr-TR');
const fmtTL = (n) => fmt(n) + ' ₺';

const STATUS_COLORS = {
  'Devam Ediyor': '#2563eb',
  'Açık':         '#64748b',
  'Tamamlandı':   '#16a34a',
  'Gecikti':      '#dc2626',
};

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
    // KPI verileri
    apiClient.get('/dashboard/stats').then(res => {
      setStats(res || {});
      setLoading(false); // KPI'lar gelince en azından üst kısmı ve iskeleti göster
    }).catch(() => setLoading(false));

    // Listeleri bağımsız yükle (birbiri ardına bekleme yapmasın)
    apiClient.get('/tasks?pageSize=8&page=1').then(res => {
      const items = Array.isArray(res) ? res : (res?.items || []);
      setTasks(items.filter(t => t.status !== 'Tamamlandı').slice(0, 7));
    });
    
    apiClient.get('/brands?pageSize=6&page=1').then(res => {
      setBrands(Array.isArray(res) ? res : (res?.items || []));
    });
    
    apiClient.get('/locations?page=1&pageSize=6').then(res => {
      setLocations(Array.isArray(res) ? res : (res?.items || []));
    });
    
    apiClient.get('/contracts?pageSize=5&status=Aktif').then(res => {
      setContracts(Array.isArray(res) ? res : (res?.items || []));
    });
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
        <KpiCard label="Yatırımcı" value={stats.activeInvestors ?? 0} sub="Toplam kayıt" accent="#1a5c38" href="/investors" />
        <KpiCard label="Aktif Proje" value={stats.activeProjects ?? 0} sub="Devam eden" accent="#2563eb" href="/projects" />
        <KpiCard label="Açık Görev" value={stats.openTasks ?? 0} sub="Tamamlanmadı" accent="#d97706" href="/tasks" />
        <KpiCard label="Aktif Sözleşme" value={stats.financeCount ?? 0} sub="Aktif kontrat" accent="#7c3aed" href="/contracts" />
        <KpiCard label="Marka" value={stats.totalBrands ?? 0} sub="Portföyde" accent="#0891b2" href="/brands" />
        <KpiCard label="Lokasyon" value={stats.totalLocations ?? 0} sub="Kayıtlı" accent="#059669" href="/locations" />
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
              href={`/investors?detailId=${inv.id}`}
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
              href={`/tasks?detailId=${t.id}`}
              onAction={async () => {
                try {
                  await apiClient.put(`/tasks/${t.id}`, { ...t, status: 'Tamamlandı' });
                  setTasks(prev => prev.filter(x => x.id !== t.id));
                } catch (err) { alert('Hata oluştu'); }
              }}
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
              href={`/contracts?detailId=${c.id}`}
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
              href={`/brands?detailId=${b.id}`}
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
              href={`/locations?detailId=${l.id}`}
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
              href={`/investors?detailId=${inv.id}`}
            />
          ))}
        </SectionCard>

      </div>
    </div>
  );
}
