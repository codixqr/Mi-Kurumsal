'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiClient } from '@/lib/apiClient';

// ── Sabit veriler ─────────────────────────────────────────────────────────────
const LOC_TYPES  = ['', 'AVM', 'Cadde', 'Karma', 'Sanayi', 'Ofis'];
const SECTORS    = ['', 'Kahve', 'Fast Food', 'Fast Casual', 'Seafood', 'Sağlıklı Yaşam', 'Pastane', 'Coffee'];
const POTENTIALS = ['Çok Yüksek', 'Yüksek', 'Orta', 'Düşük'];
const SORT_OPTS  = [
  { v: 'scoreDesc', l: 'Skora Göre (Yüksek→Düşük)' },
  { v: 'scoreAsc',  l: 'Skora Göre (Düşük→Yüksek)' },
  { v: 'priceAsc',  l: 'Fiyat (Ucuz→Pahalı)' },
  { v: 'priceDesc', l: 'Fiyat (Pahalı→Ucuz)' },
  { v: 'name',      l: 'İsme Göre' },
];

// ── Skor renkleri ─────────────────────────────────────────────────────────────
const scoreColor = (s) =>
  s >= 80 ? '#16a34a' : s >= 60 ? '#d97706' : s >= 40 ? '#2563eb' : '#94a3b8';
const scoreLabel = (s) =>
  s >= 80 ? 'Mükemmel' : s >= 60 ? 'İyi Uyum' : s >= 40 ? 'Orta' : 'Zayıf';

// ── Marka Eşleştirme Algoritması ──────────────────────────────────────────────
function scoreBrand(inv, brand, f) {
  const budget = f.budget ? Number(f.budget) : (inv.budget || 0);
  const sector = f.sector || inv.sector || '';
  const city   = f.city   || inv.city   || '';
  const locT   = f.locationType || inv.target_location_type || inv.targetLocationType || '';

  const bMin = brand.min_budget || brand.minBudget || 0;
  const bMax = brand.max_budget || brand.maxBudget || Infinity;

  const bd = {}; const rs = [];

  // Bütçe (30 puan)
  if (budget >= bMin && budget <= bMax) {
    bd.budget = 30; rs.push({ k: 'Bütçe Uyumu', pts: 30, max: 30, color: '#16a34a' });
  } else if (budget > bMax) {
    bd.budget = 22; rs.push({ k: 'Üst Bütçe', pts: 22, max: 30, color: '#16a34a' });
  } else if (budget >= bMin * 0.75) {
    bd.budget = 14; rs.push({ k: 'Yakın Bütçe', pts: 14, max: 30, color: '#d97706' });
  } else if (budget >= bMin * 0.5) {
    bd.budget = 6; rs.push({ k: 'Düşük Bütçe', pts: 6, max: 30, color: '#dc2626' });
  } else { bd.budget = 0; }

  // Sektör (25 puan)
  const invS = sector.toLowerCase(); const brS = (brand.sector || '').toLowerCase();
  if (invS && brS && invS === brS) {
    bd.sector = 25; rs.push({ k: 'Tam Sektör Eşleşmesi', pts: 25, max: 25, color: '#2563eb' });
  } else if (invS && brS && (invS.includes(brS) || brS.includes(invS))) {
    bd.sector = 15; rs.push({ k: 'Yakın Sektör', pts: 15, max: 25, color: '#2563eb' });
  } else { bd.sector = 0; }

  // Şehir / Bölge (20 puan)
  const invC = city.toLowerCase();
  const bTargets = (brand.target_locations || brand.targetLocations || '').toLowerCase();
  if (invC && bTargets.includes(invC)) {
    bd.city = 20; rs.push({ k: 'Hedef Bölge Uyumu', pts: 20, max: 20, color: '#7c3aed' });
  } else if (bTargets.includes('her bölge') || bTargets.includes('türkiye')) {
    bd.city = 14; rs.push({ k: 'Esnek Bölge', pts: 14, max: 20, color: '#7c3aed' });
  } else { bd.city = 0; }

  // Lokasyon Tipi (15 puan)
  const invLT = locT.toLowerCase(); const bLT = (brand.location_type || brand.locationType || '').toLowerCase();
  if (invLT && bLT) {
    if (invLT === bLT || invLT.includes(bLT) || bLT.includes(invLT)) {
      bd.locType = 15; rs.push({ k: 'Lokasyon Tipi Uyumu', pts: 15, max: 15, color: '#0891b2' });
    } else if (bLT.includes('karma')) {
      bd.locType = 8; rs.push({ k: 'Karma Lokasyon', pts: 8, max: 15, color: '#0891b2' });
    } else { bd.locType = 0; }
  } else { bd.locType = 0; }

  // Anlaşma + Franchise (10 puan)
  let misc = 0;
  if (brand.agreement_status === 'Anlaşmalı' || brand.agreementStatus === 'Anlaşmalı') {
    misc += 5; rs.push({ k: 'Aktif Anlaşma', pts: 5, max: 5, color: '#059669' });
  }
  const invIT = (inv.investment_type || inv.investmentType || '').toLowerCase();
  const bGives = brand.gives_franchise !== false;
  if (invIT.includes('franchise') && bGives) {
    misc += 5; rs.push({ k: 'Franchise Uyumu', pts: 5, max: 5, color: '#059669' });
  }
  bd.misc = misc;

  const total = Object.values(bd).reduce((a, b) => a + b, 0);
  return { score: Math.min(100, total), reasons: rs, breakdown: bd };
}

// ── Lokasyon Eşleştirme Algoritması ───────────────────────────────────────────
function scoreLocation(inv, loc, f) {
  const budget  = f.budget    ? Number(f.budget)    : (inv.budget || 0);
  const city    = f.city      || inv.city            || '';
  const locT    = f.locationType || inv.target_location_type || inv.targetLocationType || '';
  const maxRent = f.maxRent   ? Number(f.maxRent)   : 0;
  const minSqm  = f.minSqm    ? Number(f.minSqm)    : 0;
  const maxSqm  = f.maxSqm    ? Number(f.maxSqm)    : 0;

  const bd = {}; const rs = [];
  const rent = loc.rent || 0;

  // Kira filtresini geç
  if (maxRent && rent > maxRent) return { score: 0, reasons: [], breakdown: {} };

  // Kira/Bütçe (30 puan)
  if (budget > 0) {
    const ratio = (rent * 12) / budget;
    if (ratio <= 0.20) { bd.rent = 30; rs.push({ k: 'Mükemmel Kira/Bütçe', pts: 30, max: 30, color: '#16a34a' }); }
    else if (ratio <= 0.30) { bd.rent = 22; rs.push({ k: 'İyi Kira/Bütçe', pts: 22, max: 30, color: '#16a34a' }); }
    else if (ratio <= 0.45) { bd.rent = 12; rs.push({ k: 'Orta Kira/Bütçe', pts: 12, max: 30, color: '#d97706' }); }
    else if (ratio <= 0.60) { bd.rent = 5;  rs.push({ k: 'Yüksek Kira', pts: 5, max: 30, color: '#dc2626' }); }
    else { bd.rent = 0; }
  } else { bd.rent = 0; }

  // Şehir (25 puan)
  const invC = city.toLowerCase(); const locC = (loc.city || '').toLowerCase();
  if (invC && locC === invC) {
    bd.city = 25; rs.push({ k: 'Aynı Şehir', pts: 25, max: 25, color: '#2563eb' });
  } else if (invC && (locC.includes(invC) || invC.includes(locC))) {
    bd.city = 16; rs.push({ k: 'Yakın Şehir', pts: 16, max: 25, color: '#2563eb' });
  } else { bd.city = 0; }

  // Lokasyon Tipi (20 puan)
  const invLT = locT.toLowerCase(); const lLT = (loc.location_type || loc.locationType || '').toLowerCase();
  if (invLT && lLT) {
    if (invLT === lLT || invLT.includes(lLT) || lLT.includes(invLT)) {
      bd.locType = 20; rs.push({ k: 'Lokasyon Tipi Uyumu', pts: 20, max: 20, color: '#7c3aed' });
    } else if (invLT.includes('karma') || lLT.includes('karma')) {
      bd.locType = 10; rs.push({ k: 'Karma Uyum', pts: 10, max: 20, color: '#7c3aed' });
    } else { bd.locType = 0; }
  } else { bd.locType = 0; }

  // Alan (m²) (15 puan)
  const sqm = loc.sqm || 0;
  if (minSqm > 0 && maxSqm > 0) {
    if (sqm >= minSqm && sqm <= maxSqm) { bd.sqm = 15; rs.push({ k: 'Alan Uyumu', pts: 15, max: 15, color: '#0891b2' }); }
    else if (sqm >= minSqm * 0.8)       { bd.sqm = 8;  rs.push({ k: 'Yakın Alan', pts: 8, max: 15, color: '#0891b2' }); }
    else                                 { bd.sqm = 0; }
  } else if (minSqm > 0 && sqm >= minSqm) {
    bd.sqm = 10; rs.push({ k: 'Yeterli Alan', pts: 10, max: 15, color: '#0891b2' });
  } else { bd.sqm = 0; }

  // Potansiyel (10 puan)
  const pot = (loc.potential || '').toLowerCase();
  const potMap = { 'çok yüksek': 10, 'premium': 10, 'yüksek': 7, 'orta': 4, 'düşük': 1 };
  const potScore = potMap[pot] || 0;
  if (potScore > 0) { bd.potential = potScore; rs.push({ k: `${loc.potential} Potansiyel`, pts: potScore, max: 10, color: '#059669' }); }
  else { bd.potential = 0; }

  const total = Object.values(bd).reduce((a, b) => a + b, 0);
  return { score: Math.min(100, total), reasons: rs, breakdown: bd };
}

// ── Skor çubuk bileşeni ───────────────────────────────────────────────────────
function ScoreBar({ score, reasons }) {
  return (
    <div>
      <div style={{ display: 'flex', height: 8, borderRadius: 6, overflow: 'hidden', gap: 1, marginBottom: 6 }}>
        {reasons.map((r, i) => (
          <div key={i} title={`${r.k}: ${r.pts} puan`}
            style={{ width: `${r.pts}%`, background: r.color, borderRadius: i === 0 ? '6px 0 0 6px' : i === reasons.length - 1 ? '0 6px 6px 0' : 0, minWidth: 4 }} />
        ))}
        <div style={{ flex: 1, background: '#f1f5f9' }} />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {reasons.map((r, i) => (
          <span key={i} style={{ background: r.color + '18', color: r.color, fontSize: '0.7rem', fontWeight: 700, padding: '2px 6px', borderRadius: 4 }}>
            {r.k} +{r.pts}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Ana bileşen ───────────────────────────────────────────────────────────────
export default function MatchingPage() {
  const [investors,  setInvestors]  = useState([]);
  const [brands,     setBrands]     = useState([]);
  const [locations,  setLocations]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [savedMsg,   setSavedMsg]   = useState('');
  const [view,       setView]       = useState('card');   // card | table
  const [tab,        setTab]        = useState('brands'); // brands | locations
  const [sortBy,     setSortBy]     = useState('scoreDesc');
  const [selected,   setSelected]   = useState(new Set()); // selected brand ids for bulk save
  const [filtersOpen,setFiltersOpen]= useState(true);

  // ── Filtreler ──
  const [invId,      setInvId]      = useState('');
  const [minScore,   setMinScore]   = useState(30);
  const [fCity,      setFCity]      = useState('');
  const [fSector,    setFSector]    = useState('');
  const [fLocType,   setFLocType]   = useState('');
  const [fBudget,    setFBudget]    = useState('');
  const [fMaxRent,   setFMaxRent]   = useState('');
  const [fMinSqm,    setFMinSqm]    = useState('');
  const [fMaxSqm,    setFMaxSqm]    = useState('');

  // ── Veri yükle ────────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      apiClient.get('/investors?pageSize=500').catch(() => ({})),
      apiClient.get('/brands?pageSize=500').catch(() => ({})),
      apiClient.get('/locations?pageSize=500').catch(() => ({})),
    ]).then(([i, b, l]) => {
      setInvestors(Array.isArray(i) ? i : i.items || []);
      setBrands(   Array.isArray(b) ? b : b.items || []);
      setLocations(Array.isArray(l) ? l : l.items || []);
    }).finally(() => setLoading(false));
  }, []);

  const inv = investors.find(i => String(i.id) === String(invId));
  const filters = { city: fCity, sector: fSector, locationType: fLocType, budget: fBudget, maxRent: fMaxRent, minSqm: fMinSqm, maxSqm: fMaxSqm };

  // ── Hesapla & sırala ──────────────────────────────────────────────────────
  const brandMatches = useMemo(() => {
    if (!inv) return [];
    return brands
      .map(b => ({ brand: b, ...scoreBrand(inv, b, filters) }))
      .filter(m => m.score >= minScore)
      .sort((a, b) => {
        if (sortBy === 'scoreDesc') return b.score - a.score;
        if (sortBy === 'scoreAsc')  return a.score - b.score;
        if (sortBy === 'priceAsc')  return (a.brand.min_budget||0) - (b.brand.min_budget||0);
        if (sortBy === 'priceDesc') return (b.brand.min_budget||0) - (a.brand.min_budget||0);
        if (sortBy === 'name')      return (a.brand.name||'').localeCompare(b.brand.name||'', 'tr');
        return 0;
      });
  }, [inv, brands, filters, minScore, sortBy]);

  const locMatches = useMemo(() => {
    if (!inv) return [];
    return locations
      .map(l => ({ location: l, ...scoreLocation(inv, l, filters) }))
      .filter(m => m.score >= minScore)
      .sort((a, b) => {
        if (sortBy === 'scoreDesc') return b.score - a.score;
        if (sortBy === 'scoreAsc')  return a.score - b.score;
        if (sortBy === 'priceAsc')  return (a.location.rent||0) - (b.location.rent||0);
        if (sortBy === 'priceDesc') return (b.location.rent||0) - (a.location.rent||0);
        if (sortBy === 'name')      return (a.location.name||'').localeCompare(b.location.name||'', 'tr');
        return 0;
      });
  }, [inv, locations, filters, minScore, sortBy]);

  const activeMatches = tab === 'brands' ? brandMatches : locMatches;

  // Skor dağılımı
  const dist = (list) => ({
    excellent: list.filter(m => m.score >= 80).length,
    good:      list.filter(m => m.score >= 60 && m.score < 80).length,
    medium:    list.filter(m => m.score >= 40 && m.score < 60).length,
    weak:      list.filter(m => m.score < 40).length,
  });

  // ── Kaydet ────────────────────────────────────────────────────────────────
  const saveMatch = async (brandId, score, reasons) => {
    setSaving(true);
    try {
      await apiClient.post('/investor-brand-matches', {
        investorId: Number(invId), brandId, score,
        notes: `Akıllı Eşleştirme: ${reasons.map(r => r.k).join(', ')}`,
      });
      setSavedMsg('Eşleşme kaydedildi.');
    } catch (e) { setSavedMsg('Hata: ' + (e.message || 'Kaydedilemedi')); }
    finally { setSaving(false); setTimeout(() => setSavedMsg(''), 3000); }
  };

  const saveBulk = async () => {
    setSaving(true);
    let ok = 0;
    for (const brandId of selected) {
      const m = brandMatches.find(m => m.brand.id === brandId);
      if (!m) continue;
      try {
        await apiClient.post('/investor-brand-matches', {
          investorId: Number(invId), brandId, score: m.score,
          notes: `Toplu kayıt: ${m.reasons.map(r => r.k).join(', ')}`,
        });
        ok++;
      } catch (_) {}
    }
    setSaving(false);
    setSavedMsg(`${ok} eşleşme toplu kaydedildi.`);
    setTimeout(() => setSavedMsg(''), 4000);
    setSelected(new Set());
  };

  const toggleSelect = (id) => setSelected(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });
  const selectAll = () => setSelected(new Set(brandMatches.map(m => m.brand.id)));

  const clearFilters = () => { setFCity(''); setFSector(''); setFLocType(''); setFBudget(''); setFMaxRent(''); setFMinSqm(''); setFMaxSqm(''); setMinScore(30); };
  const hasFilters = fCity || fSector || fLocType || fBudget || fMaxRent || fMinSqm || fMaxSqm || minScore !== 30;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Başlık ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#1e293b' }}>Akıllı Eşleştirme Motoru</h2>
          <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: '#64748b' }}>
            Yatırımcı özelliklerine + tercihlerinize göre en uygun marka ve lokasyonları anlık hesaplar.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <ViewBtn active={view === 'card'}  onClick={() => setView('card')}>Kart Görünümü</ViewBtn>
          <ViewBtn active={view === 'table'} onClick={() => setView('table')}>Tablo Görünümü</ViewBtn>
        </div>
      </div>

      {/* ── Filtre Paneli ── */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14 }}>
        <div style={{ padding: '14px 18px', borderBottom: filtersOpen ? '1px solid #f1f5f9' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
          onClick={() => setFiltersOpen(!filtersOpen)}>
          <span style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.95rem' }}>
            Yatırımcı & Filtreler
            {hasFilters && <span style={{ marginLeft: 8, background: '#1a5c38', color: '#fff', fontSize: '0.7rem', padding: '2px 7px', borderRadius: 10, fontWeight: 700 }}>Filtre Aktif</span>}
          </span>
          <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>{filtersOpen ? '▲ Gizle' : '▼ Göster'}</span>
        </div>

        {filtersOpen && (
          <div style={{ padding: '16px 18px' }}>
            {/* Yatırımcı seçimi */}
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Yatırımcı Seç *</label>
              <select value={invId} onChange={e => { setInvId(e.target.value); setSelected(new Set()); }}
                style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid #d1d5db', fontSize: '0.875rem', fontWeight: invId ? 600 : 400 }}>
                <option value="">— Yatırımcı seçin, sistem anlık hesaplar —</option>
                {investors.map(i => (
                  <option key={i.id} value={i.id}>
                    {i.name}  |  {i.city || '—'}  |  {i.sector || '—'}  |  {Number(i.budget || 0).toLocaleString('tr-TR')} ₺
                  </option>
                ))}
              </select>
            </div>

            {/* Yatırımcı profil çipleri */}
            {inv && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '10px 14px', background: '#f0fdf4', borderRadius: 10, marginBottom: 14 }}>
                <Chip color="#1a5c38" label="Yatırımcı"    val={inv.name} />
                <Chip color="#2563eb" label="Bütçe"        val={`${Number(inv.budget||0).toLocaleString('tr-TR')} ₺`} />
                <Chip color="#7c3aed" label="Şehir"        val={inv.city || '—'} />
                <Chip color="#d97706" label="Sektör"       val={inv.sector || '—'} />
                <Chip color="#0891b2" label="Yatırım Tipi" val={inv.investment_type || inv.investmentType || '—'} />
                <Chip color="#dc2626" label="Lokasyon Tercihi" val={inv.target_location_type || inv.targetLocationType || '—'} />
              </div>
            )}

            {/* Gelişmiş Filtreler Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={lbl}>Şehir Tercihi (Override)</label>
                <input value={fCity} onChange={e => setFCity(e.target.value)} placeholder="Örn: İstanbul"
                  style={inp} />
              </div>
              <div>
                <label style={lbl}>Sektör (Override)</label>
                <select value={fSector} onChange={e => setFSector(e.target.value)} style={inp}>
                  {SECTORS.map(s => <option key={s} value={s}>{s || 'Tüm Sektörler'}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Lokasyon Tipi</label>
                <select value={fLocType} onChange={e => setFLocType(e.target.value)} style={inp}>
                  {LOC_TYPES.map(t => <option key={t} value={t}>{t || 'Tüm Tipler'}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Bütçe Override (₺)</label>
                <input type="number" value={fBudget} onChange={e => setFBudget(e.target.value)} placeholder="Ör: 2500000"
                  style={inp} />
              </div>
              <div>
                <label style={lbl}>Max Kira (₺/ay)</label>
                <input type="number" value={fMaxRent} onChange={e => setFMaxRent(e.target.value)} placeholder="Ör: 50000"
                  style={inp} />
              </div>
              <div>
                <label style={lbl}>Min Alan (m²)</label>
                <input type="number" value={fMinSqm} onChange={e => setFMinSqm(e.target.value)} placeholder="Ör: 80"
                  style={inp} />
              </div>
              <div>
                <label style={lbl}>Max Alan (m²)</label>
                <input type="number" value={fMaxSqm} onChange={e => setFMaxSqm(e.target.value)} placeholder="Ör: 200"
                  style={inp} />
              </div>
              <div>
                <label style={lbl}>Min Uyum Skoru: <b>%{minScore}</b></label>
                <input type="range" min={0} max={90} step={5} value={minScore} onChange={e => setMinScore(Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#1a5c38' }} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {hasFilters && (
                <button onClick={clearFilters} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', fontSize: '0.82rem', color: '#64748b', fontWeight: 600 }}>
                  Filtreleri Temizle
                </button>
              )}
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ ...lbl, margin: 0 }}>Sırala:</label>
                <select value={sortBy} onChange={e => setSortBy(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '0.82rem' }}>
                  {SORT_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Başarı / Hata Mesajı ── */}
      {savedMsg && (
        <div style={{ background: savedMsg.startsWith('Hata') ? '#fef2f2' : '#f0fdf4', border: `1px solid ${savedMsg.startsWith('Hata') ? '#fca5a5' : '#86efac'}`, borderRadius: 9, padding: '10px 16px', fontWeight: 600, color: savedMsg.startsWith('Hata') ? '#dc2626' : '#16a34a' }}>
          {savedMsg}
        </div>
      )}

      {/* ── Boş Durum ── */}
      {!invId && (
        <div style={{ textAlign: 'center', padding: '60px 40px', background: '#fff', borderRadius: 14, border: '2px dashed #d1d5db', color: '#94a3b8' }}>
          <div style={{ fontSize: '3rem', marginBottom: 14 }}>🎯</div>
          <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '1.1rem', marginBottom: 8 }}>Akıllı Eşleştirme Motoru Hazır</div>
          <div style={{ fontSize: '0.9rem' }}>Yukarıdan bir yatırımcı seçin. Sistem bütçe, şehir, sektör, lokasyon tipi ve daha fazlasına göre anlık puanlar.</div>
        </div>
      )}

      {invId && loading && <div style={{ textAlign: 'center', padding: 32, color: '#64748b' }}>Hesaplanıyor...</div>}

      {invId && !loading && (
        <>
          {/* ── Skor Dağılımı ── */}
          {(() => {
            const d = dist(tab === 'brands' ? brandMatches : locMatches);
            return (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <StatChip label="Mükemmel" count={d.excellent} color="#16a34a" sub="80-100%" />
                <StatChip label="İyi Uyum" count={d.good}      color="#d97706" sub="60-79%" />
                <StatChip label="Orta"     count={d.medium}    color="#2563eb" sub="40-59%" />
                <StatChip label="Zayıf"    count={d.weak}      color="#94a3b8" sub="<40%" />
                <StatChip label="Toplam"   count={tab==='brands'?brandMatches.length:locMatches.length} color="#1e293b" sub="eşleşme" />
              </div>
            );
          })()}

          {/* ── Sekmeler + Toplu İşlem ── */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 10, padding: 4, gap: 4 }}>
              <TabBtn active={tab === 'brands'}    onClick={() => { setTab('brands');    setSelected(new Set()); }}>Marka Önerileri ({brandMatches.length})</TabBtn>
              <TabBtn active={tab === 'locations'} onClick={() => { setTab('locations'); setSelected(new Set()); }}>Lokasyon Önerileri ({locMatches.length})</TabBtn>
            </div>
            {tab === 'brands' && brandMatches.length > 0 && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{selected.size} seçili</span>
                <button onClick={selectAll} style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid #d1d5db', background: '#f8fafc', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600 }}>
                  Tümünü Seç
                </button>
                {selected.size > 0 && (
                  <button onClick={saveBulk} disabled={saving} style={{ padding: '5px 14px', borderRadius: 7, border: 'none', background: '#1a5c38', color: '#fff', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 700 }}>
                    {saving ? 'Kaydediliyor...' : `${selected.size} Eşleşmeyi Kaydet`}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── Eşleşme bulunamadı ── */}
          {activeMatches.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 24px', background: '#fff', borderRadius: 14, border: '1px dashed #e2e8f0', color: '#94a3b8' }}>
              <div style={{ fontSize: '2rem', marginBottom: 10 }}>🔍</div>
              <div style={{ fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Eşleşme bulunamadı</div>
              <div style={{ fontSize: '0.85rem' }}>Minimum uyum skorunu düşürün veya filtreleri değiştirin.</div>
            </div>
          )}

          {/* ── KART GÖRÜNÜMÜ ── */}
          {view === 'card' && activeMatches.length > 0 && tab === 'brands' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 16 }}>
              {brandMatches.map(m => (
                <div key={m.brand.id} style={{ background: '#fff', borderRadius: 14, border: `2px solid ${scoreColor(m.score)}33`, padding: 18, display: 'flex', flexDirection: 'column', gap: 10, position: 'relative' }}>
                  {/* Seçim checkbox */}
                  <div style={{ position: 'absolute', top: 12, left: 12 }}>
                    <input type="checkbox" checked={selected.has(m.brand.id)} onChange={() => toggleSelect(m.brand.id)}
                      style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#1a5c38' }} />
                  </div>
                  {/* Skor rozeti */}
                  <div style={{ position: 'absolute', top: 12, right: 14, textAlign: 'center' }}>
                    <div style={{ width: 54, height: 54, borderRadius: '50%', border: `3px solid ${scoreColor(m.score)}`, background: scoreColor(m.score) + '15', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontWeight: 900, fontSize: '1rem', color: scoreColor(m.score), lineHeight: 1 }}>%{m.score}</span>
                    </div>
                    <div style={{ fontSize: '0.65rem', fontWeight: 700, color: scoreColor(m.score), marginTop: 2 }}>{scoreLabel(m.score)}</div>
                  </div>
                  {/* İçerik */}
                  <div style={{ paddingLeft: 22, paddingRight: 60 }}>
                    <div style={{ fontWeight: 800, fontSize: '1rem', color: '#1e293b', marginBottom: 3 }}>{m.brand.name}</div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                      {m.brand.sector} · {m.brand.agreement_status || m.brand.agreementStatus || '—'}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <InfoRow k="Bütçe Aralığı" v={`${Number(m.brand.min_budget||m.brand.minBudget||0).toLocaleString('tr-TR')} – ${Number(m.brand.max_budget||m.brand.maxBudget||0).toLocaleString('tr-TR')} ₺`} />
                    <InfoRow k="Hedef Bölge" v={m.brand.target_locations||m.brand.targetLocations||'—'} />
                    <InfoRow k="Lokasyon Tipi" v={m.brand.location_type||m.brand.locationType||'—'} />
                    <InfoRow k="Franchise" v={m.brand.gives_franchise !== false ? 'Veriyor' : 'Vermiyor'} />
                  </div>
                  <ScoreBar score={m.score} reasons={m.reasons} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <button onClick={() => saveMatch(m.brand.id, m.score, m.reasons)} disabled={saving} className="primary-btn" style={{ flex: 1, fontSize: '0.82rem' }}>
                      Eşleşme Kaydet
                    </button>
                    <button onClick={() => window.location.href = '/brands'} className="secondary-btn" style={{ fontSize: '0.82rem' }}>Markaya Git</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {view === 'card' && activeMatches.length > 0 && tab === 'locations' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 16 }}>
              {locMatches.map(m => (
                <div key={m.location.id} style={{ background: '#fff', borderRadius: 14, border: `2px solid ${scoreColor(m.score)}33`, padding: 18, display: 'flex', flexDirection: 'column', gap: 10, position: 'relative' }}>
                  <div style={{ position: 'absolute', top: 12, right: 14, textAlign: 'center' }}>
                    <div style={{ width: 54, height: 54, borderRadius: '50%', border: `3px solid ${scoreColor(m.score)}`, background: scoreColor(m.score) + '15', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontWeight: 900, fontSize: '1rem', color: scoreColor(m.score), lineHeight: 1 }}>%{m.score}</span>
                    </div>
                    <div style={{ fontSize: '0.65rem', fontWeight: 700, color: scoreColor(m.score), marginTop: 2 }}>{scoreLabel(m.score)}</div>
                  </div>
                  <div style={{ paddingRight: 60 }}>
                    <div style={{ fontWeight: 800, fontSize: '1rem', color: '#1e293b', marginBottom: 3 }}>{m.location.name}</div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                      {m.location.location_type || m.location.locationType} · {m.location.city} · {m.location.sqm || 0} m²
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <InfoRow k="Kira" v={`${Number(m.location.rent||0).toLocaleString('tr-TR')} ₺/ay`} />
                    <InfoRow k="Potansiyel" v={m.location.potential || '—'} />
                    <InfoRow k="Durum" v={m.location.status || '—'} />
                    <InfoRow k="Segment" v={m.location.segment || '—'} />
                  </div>
                  {(m.location.recommended_brands||m.location.recommendedBrands||[]).length > 0 && (
                    <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                      <b>Önerilen Markalar:</b> {(m.location.recommended_brands||m.location.recommendedBrands||[]).join(', ')}
                    </div>
                  )}
                  <ScoreBar score={m.score} reasons={m.reasons} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <button onClick={() => window.location.href = '/projects'} className="primary-btn" style={{ flex: 1, fontSize: '0.82rem' }}>Proje Oluştur</button>
                    <button onClick={() => window.location.href = '/locations'} className="secondary-btn" style={{ fontSize: '0.82rem' }}>Lokasyona Git</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── TABLO GÖRÜNÜMÜ ── */}
          {view === 'table' && activeMatches.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: '#1a5c38' }}>
                      {tab === 'brands' && <th style={th}><input type="checkbox" onChange={e => e.target.checked ? selectAll() : setSelected(new Set())} style={{ cursor: 'pointer' }} /></th>}
                      <th style={{ ...th, textAlign: 'left', paddingLeft: 14 }}>Ad</th>
                      {tab === 'brands' ? (
                        <>
                          <th style={th}>Sektör</th>
                          <th style={th}>Bütçe Aralığı</th>
                          <th style={th}>Hedef Bölge</th>
                          <th style={th}>Lokasyon Tipi</th>
                        </>
                      ) : (
                        <>
                          <th style={th}>Şehir</th>
                          <th style={th}>Tip</th>
                          <th style={th}>m²</th>
                          <th style={th}>Kira/ay</th>
                          <th style={th}>Potansiyel</th>
                        </>
                      )}
                      <th style={th}>Uyum Skoru</th>
                      <th style={th}>Nedenler</th>
                      <th style={th}>İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeMatches.map((m, i) => {
                      const id = tab === 'brands' ? m.brand.id : m.location.id;
                      const name = tab === 'brands' ? m.brand.name : m.location.name;
                      return (
                        <tr key={id} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                          {tab === 'brands' && (
                            <td style={{ padding: '9px 8px', textAlign: 'center' }}>
                              <input type="checkbox" checked={selected.has(id)} onChange={() => toggleSelect(id)} style={{ cursor: 'pointer', accentColor: '#1a5c38' }} />
                            </td>
                          )}
                          <td style={{ padding: '9px 14px', fontWeight: 700, color: '#1e293b', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</td>
                          {tab === 'brands' ? (
                            <>
                              <td style={td}>{m.brand.sector||'—'}</td>
                              <td style={td}>{Number(m.brand.min_budget||0).toLocaleString('tr-TR')} – {Number(m.brand.max_budget||0).toLocaleString('tr-TR')} ₺</td>
                              <td style={td}>{m.brand.target_locations||m.brand.targetLocations||'—'}</td>
                              <td style={td}>{m.brand.location_type||m.brand.locationType||'—'}</td>
                            </>
                          ) : (
                            <>
                              <td style={td}>{m.location.city||'—'}</td>
                              <td style={td}>{m.location.location_type||m.location.locationType||'—'}</td>
                              <td style={td}>{m.location.sqm||'—'} m²</td>
                              <td style={td}>{Number(m.location.rent||0).toLocaleString('tr-TR')} ₺</td>
                              <td style={td}>{m.location.potential||'—'}</td>
                            </>
                          )}
                          <td style={{ padding: '9px 10px', textAlign: 'center' }}>
                            <span style={{ fontWeight: 800, fontSize: '1rem', color: scoreColor(m.score) }}>%{m.score}</span>
                            <div style={{ fontSize: '0.68rem', color: scoreColor(m.score), fontWeight: 600 }}>{scoreLabel(m.score)}</div>
                          </td>
                          <td style={{ padding: '9px 10px', maxWidth: 220 }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                              {m.reasons.slice(0, 3).map((r, ri) => (
                                <span key={ri} style={{ background: r.color + '15', color: r.color, fontSize: '0.68rem', fontWeight: 700, padding: '1px 5px', borderRadius: 4, whiteSpace: 'nowrap' }}>
                                  {r.k}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td style={{ padding: '9px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                            {tab === 'brands' ? (
                              <button onClick={() => saveMatch(id, m.score, m.reasons)} disabled={saving} className="primary-btn" style={{ fontSize: '0.75rem', padding: '4px 10px' }}>Kaydet</button>
                            ) : (
                              <button onClick={() => window.location.href = '/projects'} className="primary-btn" style={{ fontSize: '0.75rem', padding: '4px 10px' }}>Proje</button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Puanlama Rehberi ── */}
          <details style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12 }}>
            <summary style={{ padding: '12px 16px', cursor: 'pointer', fontWeight: 700, color: '#475569', fontSize: '0.88rem' }}>
              Puanlama Kriterleri ve Ağırlıklar
            </summary>
            <div style={{ padding: '0 16px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div>
                <div style={{ fontWeight: 700, color: '#1a5c38', marginBottom: 8 }}>Marka Eşleştirme (100 puan)</div>
                {[['Bütçe Uyumu', 30, '#16a34a'], ['Sektör Eşleşmesi', 25, '#2563eb'], ['Hedef Bölge', 20, '#7c3aed'], ['Lokasyon Tipi', 15, '#0891b2'], ['Anlaşma + Franchise', 10, '#059669']].map(([k, v, c]) => (
                  <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                    <div style={{ width: `${v * 2}px`, height: 6, borderRadius: 3, background: c }} />
                    <span style={{ fontSize: '0.8rem', color: '#475569' }}>{k}: <b>{v} puan</b></span>
                  </div>
                ))}
              </div>
              <div>
                <div style={{ fontWeight: 700, color: '#1a5c38', marginBottom: 8 }}>Lokasyon Eşleştirme (100 puan)</div>
                {[['Kira/Bütçe Oranı', 30, '#16a34a'], ['Şehir Eşleşmesi', 25, '#2563eb'], ['Lokasyon Tipi', 20, '#7c3aed'], ['Alan (m²)', 15, '#0891b2'], ['Potansiyel Skoru', 10, '#059669']].map(([k, v, c]) => (
                  <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                    <div style={{ width: `${v * 2}px`, height: 6, borderRadius: 3, background: c }} />
                    <span style={{ fontSize: '0.8rem', color: '#475569' }}>{k}: <b>{v} puan</b></span>
                  </div>
                ))}
              </div>
            </div>
          </details>
        </>
      )}
    </div>
  );
}

// ── Küçük Yardımcı Bileşenler ─────────────────────────────────────────────────
function Chip({ label, val, color }) {
  return (
    <div style={{ background: color + '15', borderRadius: 8, padding: '4px 10px', display: 'flex', gap: 4, alignItems: 'center' }}>
      <span style={{ fontSize: '0.68rem', color, fontWeight: 700, textTransform: 'uppercase' }}>{label}:</span>
      <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1e293b' }}>{val}</span>
    </div>
  );
}

function StatChip({ label, count, color, sub }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${color}33`, borderLeft: `4px solid ${color}`, borderRadius: 10, padding: '8px 14px', display: 'flex', gap: 8, alignItems: 'center' }}>
      <span style={{ fontSize: '1.4rem', fontWeight: 800, color }}>{count}</span>
      <div>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color }}>{label}</div>
        <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{sub}</div>
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{ padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700, background: active ? '#1a5c38' : 'transparent', color: active ? '#fff' : '#64748b', transition: 'all 0.15s', whiteSpace: 'nowrap' }}>
      {children}
    </button>
  );
}

function ViewBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{ padding: '6px 13px', borderRadius: 8, border: '1px solid #e2e8f0', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, background: active ? '#1a5c38' : '#f8fafc', color: active ? '#fff' : '#64748b' }}>
      {children}
    </button>
  );
}

function InfoRow({ k, v }) {
  return (
    <div style={{ background: '#f8fafc', borderRadius: 7, padding: '5px 8px' }}>
      <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{k}</div>
      <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginTop: 1 }}>{v}</div>
    </div>
  );
}

const lbl = { display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#64748b', marginBottom: 4 };
const inp = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '0.875rem', boxSizing: 'border-box', background: '#fff' };
const th  = { padding: '10px 10px', color: '#fff', fontWeight: 700, textAlign: 'center', whiteSpace: 'nowrap', borderBottom: '1px solid #15522f' };
const td  = { padding: '9px 10px', color: '#475569', textAlign: 'center', borderBottom: '1px solid #f1f5f9', fontSize: '0.82rem' };
