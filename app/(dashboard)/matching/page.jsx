'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/apiClient';

export default function MatchingPage() {
  const [investors, setInvestors] = useState([]);
  const [brands, setBrands] = useState([]);
  const [locations, setLocations] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [filters, setFilters] = useState({
    investorId: '',
    brandId: '',
    locationId: ''
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [i, b, l] = await Promise.all([
        apiClient.get('/investors'),
        apiClient.get('/brands'),
        apiClient.get('/locations')
      ]);
      setInvestors(i);
      setBrands(b);
      setLocations(l);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const calculateMatches = () => {
    let results = [];
    
    // Algorithm logic:
    // 1. If investor selected, find matching brands & locations
    // 2. If location selected, find matching brands & investors
    
    if (filters.investorId) {
      const inv = investors.find(i => i.id === Number(filters.investorId));
      if (!inv) return;

      results = brands.map(brand => {
        let score = 0;
        let reasons = [];

        // Budget match
        if (inv.budget >= brand.minBudget && inv.budget <= brand.maxBudget) {
          score += 40;
          reasons.push("Bütçe Uyumu");
        } else if (inv.budget > brand.maxBudget) {
          score += 20;
          reasons.push("Yüksek Bütçe Potansiyeli");
        }

        // Sector match
        if (inv.sector === brand.sector) {
          score += 40;
          reasons.push("Sektörel Uzmanlık");
        }

        // City match
        if (brand.targetLocations?.includes(inv.city)) {
          score += 20;
          reasons.push("Bölgesel Hedef Uyumu");
        }

        return { brand, score, reasons };
      }).filter(m => m.score > 0).sort((a,b) => b.score - a.score);
    }

    setMatches(results);
  };

  useEffect(() => { calculateMatches(); }, [filters, investors, brands, locations]);

  return (
    <section className="card page-section active">
      <div className="module-head">
        <h2>Akıllı Eşleştirme Motoru</h2>
        <p>Yatırımcı, Marka ve Lokasyon arasındaki en yüksek uyumu bulun.</p>
      </div>

      <div className="matching-controls card" style={{marginBottom: '20px', padding: '20px', background: '#f8fafc'}}>
        <div className="dashboard-grid">
          <div className="field">
            <label>Yatırımcıya Göre Ara</label>
            <select value={filters.investorId} onChange={e => setFilters({...filters, investorId: e.target.value})}>
              <option value="">-- Yatırımcı Seçin --</option>
              {investors.map(i => <option key={i.id} value={i.id}>{i.name} ({i.budget?.toLocaleString()} {i.currency})</option>)}
            </select>
          </div>
          <div className="field">
            <label>Lokasyona Göre Ara</label>
            <select value={filters.locationId} onChange={e => setFilters({...filters, locationId: e.target.value})}>
              <option value="">-- Lokasyon Seçin --</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name} ({l.sqm}m² - {l.city})</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="matches-grid" style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px'}}>
        {matches.map((m, idx) => (
          <article key={idx} className="card match-card" style={{borderLeft: `5px solid ${m.score > 70 ? '#10b981' : '#f59e0b'}`}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px'}}>
              <h3 style={{margin: 0}}>{m.brand.name}</h3>
              <span className="badge" style={{backgroundColor: m.score > 70 ? '#e2f4ee' : '#fff5e0', color: m.score > 70 ? '#10b981' : '#f59e0b', fontSize: '18px', fontWeight: 'bold'}}>
                %{m.score} Uyum
              </span>
            </div>
            <p><strong>Sektör:</strong> {m.brand.sector}</p>
            <div style={{marginTop: '10px'}}>
              {m.reasons.map((r, i) => (
                <span key={i} className="tag tag-success" style={{marginRight: '5px', marginBottom: '5px'}}>{r}</span>
              ))}
            </div>
            <button className="primary-btn" style={{width: '100%', marginTop: '15px'}} onClick={() => window.location.href='/templates'}>İletişime Geç</button>
          </article>
        ))}
        {matches.length === 0 && <p style={{textAlign: 'center', gridColumn: '1/-1', padding: '40px', color: '#64748b'}}>Eşleşme bulmak için bir yatırımcı veya lokasyon seçin.</p>}
      </div>
    </section>
  );
}
