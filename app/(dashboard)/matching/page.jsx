'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/apiClient';

const SCORE_COLORS = (s) => s >= 80 ? '#16a34a' : s >= 60 ? '#d97706' : s >= 40 ? '#2563eb' : '#94a3b8';
const SCORE_LABEL = (s) => s >= 80 ? 'Mükemmel Uyum' : s >= 60 ? 'İyi Uyum' : s >= 40 ? 'Orta Uyum' : 'Zayıf Uyum';
const fmt = (n) => Number(n || 0).toLocaleString('tr-TR');

function scoreBrandForInvestor(inv, brand) {
  let score = 0;
  const reasons = [];

  const invMin = inv.budgetMin ?? inv.budget_min ?? inv.budget ?? 0;
  const invMax = inv.budgetMax ?? inv.budget_max ?? inv.budget ?? invMin;
  const bMin = brand.minBudget ?? brand.min_budget ?? 0;
  const bMax = brand.maxBudget ?? brand.max_budget ?? Infinity;

  if (invMax >= bMin && invMin <= bMax) {
    score += 35;
    reasons.push('Bütçe Uyumu');
  } else if (invMin > bMax) {
    score += 15;
    reasons.push('Yüksek Bütçe Potansiyeli');
  } else if (invMax < bMin) {
    score += 5;
    reasons.push('Bütçe Yetersiz (Yakın)');
  }

  const invSector = (inv.sector || '').toLowerCase();
  const bSector = (brand.sector || '').toLowerCase();
  if (invSector && bSector && (invSector === bSector || invSector.includes(bSector) || bSector.includes(invSector))) {
    score += 30;
    reasons.push('Sektörel Uzmanlık');
  }

  const invCity = (inv.city || '').toLowerCase();
  const bTargets = (brand.targetLocations || brand.target_locations || '').toLowerCase();
  if (invCity && bTargets && bTargets.includes(invCity)) {
    score += 20;
    reasons.push('Hedef Bölge Uyumu');
  }

  if (brand.agreementStatus === 'Anlaşmalı' || brand.agreement_status === 'Anlaşmalı') {
    score += 10;
    reasons.push('Aktif Anlaşma');
  }

  const invType = (inv.investmentType || inv.investment_type || '').toLowerCase();
  const bType = (brand.brandType || brand.brand_type || '').toLowerCase();
  if (invType && bType && (invType.includes('franchise') && bType.includes('franchise'))) {
    score += 5;
    reasons.push('Franchise Uyumu');
  }

  return { score: Math.min(100, score), reasons };
}

function scoreLocationForInvestor(inv, loc) {
  let score = 0;
  const reasons = [];

  const invMin = inv.budgetMin ?? inv.budget_min ?? inv.budget ?? 0;
  const locRent = loc.rent ?? 0;
  const monthly12 = locRent * 12;
  if (invMin > 0 && monthly12 <= invMin * 0.35) {
    score += 30;
    reasons.push('Kira/Bütçe Dengesi');
  } else if (invMin > 0 && monthly12 <= invMin * 0.5) {
    score += 15;
    reasons.push('Makul Kira');
  }

  const invCity = (inv.city || '').toLowerCase();
  const locCity = (loc.city || '').toLowerCase();
  if (invCity && locCity && (locCity === invCity || locCity.includes(invCity) || invCity.includes(locCity))) {
    score += 30;
    reasons.push('Şehir Eşleşmesi');
  }

  const invLocType = (inv.targetLocationType || inv.target_location_type || '').toLowerCase();
  const locType = (loc.locationType || loc.location_type || '').toLowerCase();
  if (invLocType && locType && (invLocType.includes(locType) || locType.includes(invLocType) || invLocType === locType)) {
    score += 20;
    reasons.push('Lokasyon Tipi Uyumu');
  }

  const potential = (loc.potential || '').toLowerCase();
  if (potential === 'yüksek' || potential === 'çok yüksek' || potential === 'premium') {
    score += 15;
    reasons.push('Yüksek Potansiyel');
  } else if (potential === 'orta') {
    score += 8;
    reasons.push('Orta Potansiyel');
  }

  const status = (loc.status || '').toLowerCase();
  if (status === 'boş') {
    score += 5;
    reasons.push('Boş Lokasyon');
  }

  return { score: Math.min(100, score), reasons };
}

export default function MatchingPage() {
  const [investors, setInvestors] = useState([]);
  const [brands, setBrands] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  const [selectedInvestorId, setSelectedInvestorId] = useState('');
  const [minScore, setMinScore] = useState(30);
  const [activeTab, setActiveTab] = useState('brands'); // 'brands' | 'locations'

  const [brandMatches, setBrandMatches] = useState([]);
  const [locationMatches, setLocationMatches] = useState([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [i, b, l] = await Promise.all([
        apiClient.get('/investors?pageSize=500').catch(() => ({ items: [] })),
        apiClient.get('/brands?pageSize=500').catch(() => ({ items: [] })),
        apiClient.get('/locations?pageSize=500').catch(() => ({ items: [] })),
      ]);
      setInvestors(Array.isArray(i) ? i : i.items || []);
      setBrands(Array.isArray(b) ? b : b.items || []);
      setLocations(Array.isArray(l) ? l : l.items || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const calculateMatches = useCallback(() => {
    if (!selectedInvestorId) {
      setBrandMatches([]);
      setLocationMatches([]);
      return;
    }
    const inv = investors.find(i => String(i.id) === String(selectedInvestorId));
    if (!inv) return;

    const bResults = brands.map(brand => {
      const { score, reasons } = scoreBrandForInvestor(inv, brand);
      return { brand, score, reasons };
    }).filter(m => m.score >= minScore).sort((a, b) => b.score - a.score);

    const lResults = locations.map(loc => {
      const { score, reasons } = scoreLocationForInvestor(inv, loc);
      return { location: loc, score, reasons };
    }).filter(m => m.score >= minScore).sort((a, b) => b.score - a.score);

    setBrandMatches(bResults);
    setLocationMatches(lResults);
  }, [selectedInvestorId, investors, brands, locations, minScore]);

  useEffect(() => { calculateMatches(); }, [calculateMatches]);

  const handleSaveMatch = async (brandId) => {
    if (!selectedInvestorId || !brandId) return;
    const match = brandMatches.find(m => m.brand.id === brandId);
    if (!match) return;
    setSaving(true);
    try {
      await apiClient.post('/investor-brand-matches', {
        investorId: Number(selectedInvestorId),
        brandId: Number(brandId),
        score: match.score,
        notes: `Otomatik eşleşme: ${match.reasons.join(', ')}`,
      });
      setSavedMsg(`${match.brand.name} eşleşmesi kaydedildi.`);
      setTimeout(() => setSavedMsg(''), 3000);
    } catch (e) {
      setSavedMsg('Hata: ' + (e.message || 'Kaydedilemedi'));
      setTimeout(() => setSavedMsg(''), 3000);
    } finally { setSaving(false); }
  };

  const selectedInvestor = investors.find(i => String(i.id) === String(selectedInvestorId));

  return (
    <section className="card page-section active">
      <div className="module-head">
        <div>
          <h2>Akıllı Eşleştirme Motoru</h2>
          <p>Yatırımcı özelliklerine göre en uygun marka ve lokasyon önerilerini otomatik hesapla, kaydet ve süreci başlat.</p>
        </div>
      </div>

      {/* Controls */}
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 16, alignItems: 'flex-end' }}>
          <div className="field">
            <label style={{ fontWeight: 700 }}>Yatırımcı Seç *</label>
            <select value={selectedInvestorId} onChange={e => setSelectedInvestorId(e.target.value)} style={{ fontWeight: selectedInvestorId ? 600 : 400 }}>
              <option value="">-- Yatırımcı seçin, öneriler otomatik hesaplanır --</option>
              {investors.map(inv => (
                <option key={inv.id} value={inv.id}>
                  {inv.name} — {(inv.city || '')}, {(inv.sector || '')} — {Number(inv.budget || 0).toLocaleString('tr-TR')} ₺
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Minimum Uyum Skoru: {minScore}%</label>
            <input type="range" min={0} max={90} step={10} value={minScore} onChange={e => setMinScore(Number(e.target.value))} style={{ width: '100%' }} />
          </div>
          <button className="primary-btn" onClick={calculateMatches}>Yenile</button>
        </div>

        {selectedInvestor && (
          <div style={{ marginTop: 16, padding: 14, background: 'white', borderRadius: 8, border: '1px solid #e2e8f0', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
            <div><span style={{ fontSize: '0.75rem', color: '#64748b' }}>YATIRIMCI</span><div style={{ fontWeight: 700 }}>{selectedInvestor.name}</div></div>
            <div><span style={{ fontSize: '0.75rem', color: '#64748b' }}>BÜTÇE</span><div style={{ fontWeight: 700 }}>{fmt(selectedInvestor.budget)} ₺</div></div>
            <div><span style={{ fontSize: '0.75rem', color: '#64748b' }}>ŞEHİR</span><div style={{ fontWeight: 700 }}>{selectedInvestor.city || '-'}</div></div>
            <div><span style={{ fontSize: '0.75rem', color: '#64748b' }}>SEKTÖR</span><div style={{ fontWeight: 700 }}>{selectedInvestor.sector || '-'}</div></div>
            <div><span style={{ fontSize: '0.75rem', color: '#64748b' }}>YATIRIM TİPİ</span><div style={{ fontWeight: 700 }}>{selectedInvestor.investmentType || selectedInvestor.investment_type || '-'}</div></div>
          </div>
        )}
      </div>

      {savedMsg && (
        <div style={{ background: savedMsg.startsWith('Hata') ? '#fee2e2' : '#dcfce7', border: `1px solid ${savedMsg.startsWith('Hata') ? '#fca5a5' : '#86efac'}`, borderRadius: 8, padding: '10px 16px', marginBottom: 12, fontWeight: 600, color: savedMsg.startsWith('Hata') ? '#dc2626' : '#16a34a' }}>
          {savedMsg}
        </div>
      )}

      {!selectedInvestorId ? (
        <div style={{ textAlign: 'center', padding: '60px 40px', background: '#f8fafc', borderRadius: 12, border: '1px dashed #e2e8f0' }}>
          <div style={{ fontSize: '2rem', marginBottom: 12 }}>🔍</div>
          <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '1.1rem', marginBottom: 8 }}>Eşleştirme Motoru Hazır</div>
          <div style={{ color: '#64748b' }}>Yukarıdan bir yatırımcı seçin. Sistem, bütçe, şehir, sektör ve yatırım tipine göre en uygun marka ve lokasyon önerilerini otomatik hesaplar.</div>
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '2px solid #e2e8f0' }}>
            <button
              onClick={() => setActiveTab('brands')}
              style={{ padding: '10px 20px', border: 'none', background: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.95rem', color: activeTab === 'brands' ? '#16a34a' : '#64748b', borderBottom: activeTab === 'brands' ? '3px solid #16a34a' : '3px solid transparent', marginBottom: -2 }}
            >
              Marka Önerileri ({brandMatches.length})
            </button>
            <button
              onClick={() => setActiveTab('locations')}
              style={{ padding: '10px 20px', border: 'none', background: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.95rem', color: activeTab === 'locations' ? '#16a34a' : '#64748b', borderBottom: activeTab === 'locations' ? '3px solid #16a34a' : '3px solid transparent', marginBottom: -2 }}
            >
              Lokasyon Önerileri ({locationMatches.length})
            </button>
          </div>

          {/* Brand Matches */}
          {activeTab === 'brands' && (
            <div>
              {brandMatches.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', background: '#f8fafc', borderRadius: 12, border: '1px dashed #e2e8f0' }}>
                  Minimum {minScore}% uyum skoru ile marka eşleşmesi bulunamadı. Skoru düşürmeyi deneyin.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
                  {brandMatches.map(m => (
                    <div key={m.brand.id} style={{ background: 'white', borderRadius: 12, border: `2px solid ${SCORE_COLORS(m.score)}33`, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', padding: 20, position: 'relative' }}>
                      <div style={{ position: 'absolute', top: 16, right: 16, width: 56, height: 56, borderRadius: '50%', background: SCORE_COLORS(m.score) + '22', border: `3px solid ${SCORE_COLORS(m.score)}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontWeight: 900, fontSize: '1rem', color: SCORE_COLORS(m.score), lineHeight: 1 }}>%{m.score}</span>
                      </div>
                      <div style={{ marginRight: 64 }}>
                        <h4 style={{ margin: '0 0 4px', color: '#1e293b' }}>{m.brand.name}</h4>
                        <div style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: 8 }}>
                          {m.brand.sector} • {m.brand.agreementStatus || m.brand.agreement_status || '-'}
                        </div>
                        <div style={{ fontSize: '0.82rem', color: '#475569', marginBottom: 6 }}>
                          <strong>Bütçe Aralığı:</strong> {fmt(m.brand.minBudget || m.brand.min_budget)} – {fmt(m.brand.maxBudget || m.brand.max_budget)} ₺
                        </div>
                        <div style={{ fontSize: '0.82rem', color: '#475569', marginBottom: 12 }}>
                          <strong>Hedef:</strong> {m.brand.targetLocations || m.brand.target_locations || '-'}
                        </div>
                        <div style={{ fontWeight: 700, fontSize: '0.82rem', color: SCORE_COLORS(m.score), marginBottom: 8 }}>{SCORE_LABEL(m.score)}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
                          {m.reasons.map(r => (
                            <span key={r} style={{ background: SCORE_COLORS(m.score) + '22', color: SCORE_COLORS(m.score), borderRadius: 4, padding: '2px 8px', fontSize: '0.75rem', fontWeight: 600 }}>{r}</span>
                          ))}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="primary-btn" style={{ flex: 1, fontSize: '0.82rem' }} onClick={() => handleSaveMatch(m.brand.id)} disabled={saving}>
                          {saving ? 'Kaydediliyor...' : 'Eşleşme Kaydet'}
                        </button>
                        <button className="secondary-btn" style={{ fontSize: '0.82rem' }} onClick={() => window.location.href = `/brands`}>Markaya Git</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Location Matches */}
          {activeTab === 'locations' && (
            <div>
              {locationMatches.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', background: '#f8fafc', borderRadius: 12, border: '1px dashed #e2e8f0' }}>
                  Minimum {minScore}% uyum skoru ile lokasyon eşleşmesi bulunamadı. Skoru düşürmeyi deneyin.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
                  {locationMatches.map(m => (
                    <div key={m.location.id} style={{ background: 'white', borderRadius: 12, border: `2px solid ${SCORE_COLORS(m.score)}33`, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', padding: 20, position: 'relative' }}>
                      <div style={{ position: 'absolute', top: 16, right: 16, width: 56, height: 56, borderRadius: '50%', background: SCORE_COLORS(m.score) + '22', border: `3px solid ${SCORE_COLORS(m.score)}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontWeight: 900, fontSize: '1rem', color: SCORE_COLORS(m.score), lineHeight: 1 }}>%{m.score}</span>
                      </div>
                      <div style={{ marginRight: 64 }}>
                        <h4 style={{ margin: '0 0 4px', color: '#1e293b' }}>{m.location.name}</h4>
                        <div style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: 8 }}>
                          {m.location.locationType || m.location.location_type} • {m.location.city || '-'} • {m.location.sqm || 0} m²
                        </div>
                        <div style={{ fontSize: '0.82rem', color: '#475569', marginBottom: 6 }}>
                          <strong>Kira:</strong> {fmt(m.location.rent)} ₺/ay
                        </div>
                        <div style={{ fontSize: '0.82rem', color: '#475569', marginBottom: 6 }}>
                          <strong>Potansiyel:</strong> {m.location.potential || '-'} • <strong>Durum:</strong> {m.location.status || '-'}
                        </div>
                        {m.location.recommendedBrands?.length > 0 && (
                          <div style={{ fontSize: '0.82rem', color: '#475569', marginBottom: 12 }}>
                            <strong>Önerilen Markalar:</strong> {(m.location.recommendedBrands || m.location.recommended_brands || []).join(', ')}
                          </div>
                        )}
                        <div style={{ fontWeight: 700, fontSize: '0.82rem', color: SCORE_COLORS(m.score), marginBottom: 8 }}>{SCORE_LABEL(m.score)}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
                          {m.reasons.map(r => (
                            <span key={r} style={{ background: SCORE_COLORS(m.score) + '22', color: SCORE_COLORS(m.score), borderRadius: 4, padding: '2px 8px', fontSize: '0.75rem', fontWeight: 600 }}>{r}</span>
                          ))}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="primary-btn" style={{ flex: 1, fontSize: '0.82rem' }} onClick={() => window.location.href = `/projects`}>
                          Proje Oluştur
                        </button>
                        <button className="secondary-btn" style={{ fontSize: '0.82rem' }} onClick={() => window.location.href = `/locations`}>Lokasyona Git</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Scoring legend */}
      <div style={{ marginTop: 24, padding: 16, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
        <div style={{ fontWeight: 700, marginBottom: 10, color: '#374151' }}>Puanlama Kriterleri</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 600, color: '#374151', marginBottom: 4, fontSize: '0.9rem' }}>Marka Eşleştirme</div>
            <div style={{ fontSize: '0.82rem', color: '#64748b' }}>• Bütçe Uyumu: 35 puan</div>
            <div style={{ fontSize: '0.82rem', color: '#64748b' }}>• Sektör Eşleşmesi: 30 puan</div>
            <div style={{ fontSize: '0.82rem', color: '#64748b' }}>• Hedef Bölge Uyumu: 20 puan</div>
            <div style={{ fontSize: '0.82rem', color: '#64748b' }}>• Aktif Anlaşma: 10 puan</div>
            <div style={{ fontSize: '0.82rem', color: '#64748b' }}>• Franchise Uyumu: 5 puan</div>
          </div>
          <div>
            <div style={{ fontWeight: 600, color: '#374151', marginBottom: 4, fontSize: '0.9rem' }}>Lokasyon Eşleştirme</div>
            <div style={{ fontSize: '0.82rem', color: '#64748b' }}>• Kira/Bütçe Dengesi: 30 puan</div>
            <div style={{ fontSize: '0.82rem', color: '#64748b' }}>• Şehir Eşleşmesi: 30 puan</div>
            <div style={{ fontSize: '0.82rem', color: '#64748b' }}>• Lokasyon Tipi: 20 puan</div>
            <div style={{ fontSize: '0.82rem', color: '#64748b' }}>• Potansiyel Skoru: 15 puan</div>
            <div style={{ fontSize: '0.82rem', color: '#64748b' }}>• Boş Lokasyon: 5 puan</div>
          </div>
        </div>
      </div>
    </section>
  );
}
