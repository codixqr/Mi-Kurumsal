'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '@/lib/apiClient';

const MONTHS = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
const YEARS  = ['2024','2025','2026','2027'];
const REV_CATS = ['Ciro','Komisyon Geliri','Kira Geliri','Danışmanlık Geliri','Diğer Gelir'];
const EXP_CATS = ['Gıda','Personel','Kira','Elektrik','Su','Doğalgaz','POS Komisyon','Paket Servis','Vergi','Stok/Devir','Diğer'];

const fmt   = (n) => Number(n||0).toLocaleString('tr-TR', { minimumFractionDigits: 2 });
const fmtTL = (n) => fmt(n) + ' ₺';
const fmtN  = (n) => Number(n||0).toLocaleString('tr-TR');
const today = () => new Date().toISOString().split('T')[0];
const curYear  = () => String(new Date().getFullYear());
const curMonth = () => MONTHS[new Date().getMonth()];

const emptyRev = () => ({ entryDate: today(), monthName: curMonth(), yearValue: curYear(), category: 'Ciro', description: '', amount: '', note: '' });
const emptyExp = () => ({ entryDate: today(), monthName: curMonth(), yearValue: curYear(), category: 'Gıda', subCategory: '', description: '', amount: '', note: '' });

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  lbl: { display:'block', fontSize:'0.78rem', fontWeight:600, color:'#64748b', marginBottom:4 },
  inp: { width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid #d1d5db', fontSize:'0.875rem', boxSizing:'border-box' },
  sel: { width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid #d1d5db', fontSize:'0.875rem', background:'#fff' },
  grid2: { display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))', gap:12 },
};

function authFetch(url, opts={}) {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : '';
  return fetch(url, { ...opts, headers: { Authorization:`Bearer ${token}`, ...(opts.headers||{}) } });
}

export default function CustomerPnl() {
  const [investors,  setInvestors]  = useState([]);
  const [selId,      setSelId]      = useState('');
  const [fMonth,     setFMonth]     = useState('');
  const [fYear,      setFYear]      = useState(curYear());
  const [tab,        setTab]        = useState('ozet');   // ozet|gelirler|giderler|import
  const [summary,    setSummary]    = useState(null);
  const [monthly,    setMonthly]    = useState([]);
  const [revenues,   setRevenues]   = useState([]);
  const [expenses,   setExpenses]   = useState([]);
  const [loading,    setLoading]    = useState(false);

  // Modals
  const [revModal,   setRevModal]   = useState(null);  // null | { data, id }
  const [expModal,   setExpModal]   = useState(null);
  const [saving,     setSaving]     = useState(false);

  // Import
  const fileRef      = useRef(null);
  const [importing,  setImporting]  = useState(false);
  const [preview,    setPreview]    = useState(null);   // { revenues, expenses }
  const [importDone, setImportDone] = useState(null);   // { insertedRevenues, insertedExpenses }

  // ── Load investors ───────────────────────────────────────────────────────
  useEffect(() => {
    apiClient.get('/investors?pageSize=500&page=1')
      .then(d => setInvestors(Array.isArray(d) ? d : (d.items||[])))
      .catch(()=>{});
  }, []);

  const qs = () => { const p=new URLSearchParams(); if(fMonth)p.set('month',fMonth); if(fYear)p.set('year',fYear); return p.toString(); };

  const loadAll = useCallback(async () => {
    if (!selId) return;
    setLoading(true);
    const q = qs() ? '?'+qs() : '';
    const yq = fYear ? `?year=${fYear}` : '';
    const [s,m,r,e] = await Promise.allSettled([
      apiClient.get(`/pnl/customer/${selId}/summary${q}`),
      apiClient.get(`/pnl/customer/${selId}/monthly-summary${yq}`),
      apiClient.get(`/pnl/customer/${selId}/revenues${q}`),
      apiClient.get(`/pnl/customer/${selId}/expenses${q}`),
    ]);
    setSummary(s.value || null);
    setMonthly(Array.isArray(m.value) ? m.value : []);
    setRevenues(Array.isArray(r.value) ? r.value : []);
    setExpenses(Array.isArray(e.value) ? e.value : []);
    setLoading(false);
  }, [selId, fMonth, fYear]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── CRUD Revenue ─────────────────────────────────────────────────────────
  const saveRev = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      if (revModal.id) await apiClient.put(`/pnl/customer/${selId}/revenues/${revModal.id}`, revModal.data);
      else             await apiClient.post(`/pnl/customer/${selId}/revenues`, revModal.data);
      setRevModal(null); await loadAll();
    } catch(err){ alert(err.message||'Hata'); } finally { setSaving(false); }
  };
  const deleteRev = async (id) => {
    if (!confirm('Bu gelir kaydını silmek istiyor musunuz?')) return;
    await apiClient.delete(`/pnl/customer/${selId}/revenues/${id}`); await loadAll();
  };

  // ── CRUD Expense ─────────────────────────────────────────────────────────
  const saveExp = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      if (expModal.id) await apiClient.put(`/pnl/customer/${selId}/expenses/${expModal.id}`, expModal.data);
      else             await apiClient.post(`/pnl/customer/${selId}/expenses`, expModal.data);
      setExpModal(null); await loadAll();
    } catch(err){ alert(err.message||'Hata'); } finally { setSaving(false); }
  };
  const deleteExp = async (id) => {
    if (!confirm('Bu gider kaydını silmek istiyor musunuz?')) return;
    await apiClient.delete(`/pnl/customer/${selId}/expenses/${id}`); await loadAll();
  };

  // ── Export / Print ───────────────────────────────────────────────────────
  const exportFile = (type) => {
    const q = qs() ? '?'+qs() : '';
    authFetch(`/api/pnl/customer/${selId}/export-${type}${q}`)
      .then(r => r.blob())
      .then(blob => {
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = `kar-zarar-${inv.name||selId}.${type==='pdf'?'pdf':'xlsx'}`; a.click();
      }).catch(()=>alert('Dışa aktarma hatası'));
  };

  const downloadTemplate = () => {
    authFetch('/api/pnl/customer/excel-template')
      .then(r=>r.blob()).then(blob=>{ const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='musteri-pnl-sablon.xlsx'; a.click(); })
      .catch(()=>alert('Şablon indirme hatası'));
  };

  // ── Import ───────────────────────────────────────────────────────────────
  const handleFileSelect = async (file) => {
    if (!file) return; if (!selId){ alert('Önce müşteri seçin.'); return; }
    setImporting(true); setPreview(null); setImportDone(null);
    try {
      const fd = new FormData(); fd.append('file', file);
      const r = await authFetch(`/api/pnl/customer/${selId}/import-excel`, { method:'POST', body:fd });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message||'Hata');
      setPreview(data);
    } catch(err){ alert(err.message||'İçe aktarma hatası'); }
    finally { setImporting(false); if(fileRef.current) fileRef.current.value=''; }
  };

  const confirmImport = async () => {
    if (!preview) return; setImporting(true);
    try {
      const r = await apiClient.post(`/pnl/customer/${selId}/confirm-import`, { revenues: preview.revenues, expenses: preview.expenses });
      setImportDone(r); setPreview(null); await loadAll();
    } catch(err){ alert(err.message||'Aktarma hatası'); }
    finally { setImporting(false); }
  };

  // ── Helpers ──────────────────────────────────────────────────────────────
  const investor = investors.find(i=>String(i.id)===String(selId));
  const inv      = summary?.investor || investor || {};
  const totalRev = Number(summary?.totalRevenue||0);
  const totalExp = Number(summary?.totalExpense||0);
  const net      = Number(summary?.netProfit||0);
  const margin   = summary?.margin||'0.0';
  const hasData  = selId && !loading;
  const periodLabel = fMonth&&fYear ? `${fMonth} ${fYear}` : fYear ? `${fYear} Yılı` : 'Tüm Dönem';

  // Aylık özet → hangi ayların verisi var?
  const monthlyWithData = monthly.filter(m=>m.revenue>0||m.expense>0);

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:18 }}>

      {/* ── Araç Çubuğu ── */}
      <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:14, padding:'14px 18px', display:'flex', gap:12, flexWrap:'wrap', alignItems:'flex-end' }}>
        <div style={{ flex:'1 1 200px', minWidth:180 }}>
          <label style={S.lbl}>Müşteri</label>
          <select value={selId} onChange={e=>{ setSelId(e.target.value); setSummary(null); setRevenues([]); setExpenses([]); setMonthly([]); }} style={S.sel}>
            <option value="">— Müşteri Seçin —</option>
            {investors.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </div>
        <div style={{ flex:'0 0 130px' }}>
          <label style={S.lbl}>Ay</label>
          <select value={fMonth} onChange={e=>setFMonth(e.target.value)} style={S.sel}>
            <option value="">Tüm Aylar</option>
            {MONTHS.map(m=><option key={m}>{m}</option>)}
          </select>
        </div>
        <div style={{ flex:'0 0 100px' }}>
          <label style={S.lbl}>Yıl</label>
          <select value={fYear} onChange={e=>setFYear(e.target.value)} style={S.sel}>
            {YEARS.map(y=><option key={y}>{y}</option>)}
          </select>
        </div>
        {/* Eylemler */}
        {selId && (
          <div style={{ display:'flex', gap:7, flexWrap:'wrap', alignItems:'center', marginLeft:'auto' }}>
            <ActionBtn color="#1a5c38" onClick={()=>{ setRevModal({ data:emptyRev(), id:null }); setTab('gelirler'); }}>+ Gelir Ekle</ActionBtn>
            <ActionBtn color="#dc2626" onClick={()=>{ setExpModal({ data:emptyExp(), id:null }); setTab('giderler'); }}>+ Gider Ekle</ActionBtn>
            <ActionBtn color="#7c3aed" onClick={()=>exportFile('pdf')}>PDF İndir</ActionBtn>
            <ActionBtn color="#059669" onClick={()=>exportFile('excel')}>Excel İndir</ActionBtn>
            <ActionBtn color="#0891b2" onClick={()=>{ setTab('import'); }}>Dosya İçe Aktar</ActionBtn>
            <ActionBtn color="#64748b" onClick={()=>window.print()}>🖨 Yazdır</ActionBtn>
          </div>
        )}
      </div>

      {/* ── Boş Durum ── */}
      {!selId && (
        <div style={{ background:'#fff', border:'2px dashed #d1d5db', borderRadius:14, padding:'52px 24px', textAlign:'center', color:'#94a3b8' }}>
          <div style={{ fontSize:'3rem', marginBottom:12 }}>📊</div>
          <div style={{ fontWeight:700, fontSize:'1.05rem', marginBottom:6 }}>Müşteri seçin</div>
          <div style={{ fontSize:'0.85rem' }}>Yukarıdan bir müşteri seçerek kar/zarar tablolarına ulaşabilirsiniz.</div>
          <div style={{ fontSize:'0.8rem', marginTop:8, color:'#cbd5e1' }}>Örnek: Ahmet Kılıç veya Yaman Holding</div>
        </div>
      )}

      {selId && loading && <div style={{ padding:32, textAlign:'center', color:'#64748b' }}>Yükleniyor...</div>}

      {/* ── İçerik ── */}
      {hasData && summary && (
        <>
          {/* KPI Şeridi */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(150px, 1fr))', gap:12 }}>
            <KpiCard label="Toplam Gelir"    value={fmtTL(totalRev)} color="#16a34a" />
            <KpiCard label="Toplam Gider"    value={fmtTL(totalExp)} color="#dc2626" />
            <KpiCard label="Net Kar/Zarar"   value={fmtTL(net)}      color={net>=0?'#16a34a':'#dc2626'} />
            <KpiCard label="Kar Marjı"       value={`%${margin}`}    color="#2563eb" />
            <KpiCard label="Gelir Kayıt"     value={fmtN(revenues.length)} color="#7c3aed" />
            <KpiCard label="Gider Kayıt"     value={fmtN(expenses.length)} color="#d97706" />
          </div>

          {/* Müşteri bilgi şeridi */}
          <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:12, padding:'12px 18px', display:'flex', gap:20, flexWrap:'wrap', alignItems:'center' }}>
            <div>
              <span style={{ fontWeight:800, color:'#1a5c38', fontSize:'1.05rem' }}>{inv.name||'—'}</span>
              <span style={{ color:'#64748b', fontSize:'0.82rem', marginLeft:12 }}>{inv.sector||''} · {inv.city||''}</span>
            </div>
            <div style={{ color:'#64748b', fontSize:'0.82rem' }}>{inv.phone||''}</div>
            <div style={{ color:'#64748b', fontSize:'0.82rem' }}>Dönem: <b>{periodLabel}</b></div>
          </div>

          {/* Tab Başlıkları */}
          <div style={{ display:'flex', gap:4, background:'#f1f5f9', borderRadius:10, padding:4, flexWrap:'wrap' }}>
            {[['ozet','Aylık Özet'],['gelirler',`Gelirler (${revenues.length})`],['giderler',`Giderler (${expenses.length})`],['import','İçe Aktar']].map(([id,label])=>(
              <button key={id} onClick={()=>setTab(id)} style={{
                padding:'7px 16px', borderRadius:8, border:'none', cursor:'pointer', fontSize:'0.85rem', fontWeight:600,
                background:tab===id?'#1a5c38':'transparent', color:tab===id?'#fff':'#64748b', transition:'all 0.15s',
              }}>{label}</button>
            ))}
          </div>

          {/* ── Tab: Özet ── */}
          {tab==='ozet' && (
            <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:14, overflow:'hidden' }}>
              <div style={{ padding:'14px 18px', background:'#fafafa', borderBottom:'1px solid #e2e8f0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontWeight:700, color:'#1e293b' }}>Aylık Kar/Zarar Tablosu — {fYear}</span>
                <span style={{ fontSize:'0.8rem', color:'#94a3b8' }}>
                  {monthlyWithData.length > 0 ? `${monthlyWithData.length} ay veri mevcut` : 'Bu yıl için veri yok'}
                </span>
              </div>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.855rem' }}>
                  <thead>
                    <tr style={{ background:'#1a5c38' }}>
                      {['Ay','Gelir','Gider','Net Kar/Zarar','Marj (%)','Durum'].map(h=>(
                        <th key={h} style={{ padding:'10px 14px', color:'#fff', fontWeight:700, textAlign:h==='Ay'?'left':'right', whiteSpace:'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {monthly.map((m,i)=>{
                      const hasRow = m.revenue>0||m.expense>0;
                      const mMarj  = m.revenue>0 ? ((m.net/m.revenue)*100).toFixed(1) : '—';
                      return (
                        <tr key={m.month} style={{ background:i%2===0?'#fff':'#f8fafc', opacity:hasRow?1:0.45 }}>
                          <td style={{ padding:'9px 14px', fontWeight:600, color:'#334155' }}>{m.month}</td>
                          <td style={{ padding:'9px 14px', textAlign:'right', color:'#16a34a', fontWeight:hasRow?700:400 }}>{hasRow?fmtTL(m.revenue):'—'}</td>
                          <td style={{ padding:'9px 14px', textAlign:'right', color:'#dc2626', fontWeight:hasRow?700:400 }}>{hasRow?fmtTL(m.expense):'—'}</td>
                          <td style={{ padding:'9px 14px', textAlign:'right', fontWeight:700, color:m.net>=0?'#16a34a':'#dc2626' }}>{hasRow?fmtTL(m.net):'—'}</td>
                          <td style={{ padding:'9px 14px', textAlign:'right', color:'#2563eb' }}>{hasRow&&m.revenue>0?`%${mMarj}`:'—'}</td>
                          <td style={{ padding:'9px 14px', textAlign:'right' }}>
                            {hasRow ? (
                              <span style={{ background:m.net>=0?'#dcfce7':'#fee2e2', color:m.net>=0?'#16a34a':'#dc2626', padding:'2px 8px', borderRadius:5, fontSize:'0.75rem', fontWeight:700 }}>
                                {m.net>=0?'Kârlı':'Zararlı'}
                              </span>
                            ) : <span style={{ color:'#d1d5db', fontSize:'0.75rem' }}>Veri yok</span>}
                          </td>
                        </tr>
                      );
                    })}
                    {/* Toplam Satırı */}
                    <tr style={{ background:'#1a5c381a', fontWeight:800 }}>
                      <td style={{ padding:'11px 14px', color:'#1a5c38' }}>TOPLAM</td>
                      <td style={{ padding:'11px 14px', textAlign:'right', color:'#16a34a' }}>{fmtTL(monthly.reduce((s,m)=>s+m.revenue,0))}</td>
                      <td style={{ padding:'11px 14px', textAlign:'right', color:'#dc2626' }}>{fmtTL(monthly.reduce((s,m)=>s+m.expense,0))}</td>
                      <td style={{ padding:'11px 14px', textAlign:'right', color:net>=0?'#16a34a':'#dc2626' }}>{fmtTL(monthly.reduce((s,m)=>s+m.net,0))}</td>
                      <td colSpan={2} />
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Tab: Gelirler ── */}
          {tab==='gelirler' && (
            <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:14, overflow:'hidden' }}>
              <div style={{ padding:'14px 18px', background:'#f0fdf4', borderBottom:'1px solid #d1fae5', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontWeight:700, color:'#16a34a' }}>Gelirler ({revenues.length} kayıt)</span>
                <button onClick={()=>setRevModal({data:emptyRev(),id:null})} className="primary-btn" style={{ fontSize:'0.82rem' }}>+ Yeni Gelir Ekle</button>
              </div>
              <RecordTable
                rows={revenues}
                cols={['Tarih','Ay','Kategori','Açıklama','Tutar']}
                renderRow={r=>[
                  r.entry_date?new Date(r.entry_date).toLocaleDateString('tr-TR'):'—',
                  r.month_name,
                  <Tag color="#16a34a">{r.category}</Tag>,
                  <span style={{ color:'#64748b', fontSize:'0.82rem' }}>{r.description||'—'}</span>,
                  <span style={{ color:'#16a34a', fontWeight:700 }}>{fmtTL(r.amount)}</span>,
                ]}
                onEdit={r=>setRevModal({data:{entryDate:r.entry_date?.split('T')[0]||'',monthName:r.month_name,yearValue:String(r.year_value),category:r.category,description:r.description||'',amount:String(r.amount),note:r.note||''},id:r.id})}
                onDelete={r=>deleteRev(r.id)}
                emptyText="Bu dönem için gelir kaydı yok. '+ Yeni Gelir Ekle' ile başlayın veya Excel dosyası yükleyin."
              />
            </div>
          )}

          {/* ── Tab: Giderler ── */}
          {tab==='giderler' && (
            <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:14, overflow:'hidden' }}>
              <div style={{ padding:'14px 18px', background:'#fef2f2', borderBottom:'1px solid #fee2e2', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontWeight:700, color:'#dc2626' }}>Giderler ({expenses.length} kayıt)</span>
                <button onClick={()=>setExpModal({data:emptyExp(),id:null})} style={{ padding:'7px 16px', borderRadius:8, border:'none', fontWeight:700, fontSize:'0.82rem', cursor:'pointer', background:'#dc2626', color:'#fff' }}>+ Yeni Gider Ekle</button>
              </div>
              <RecordTable
                rows={expenses}
                cols={['Tarih','Ay','Kategori','Açıklama','Tutar']}
                renderRow={r=>[
                  r.entry_date?new Date(r.entry_date).toLocaleDateString('tr-TR'):'—',
                  r.month_name,
                  <Tag color="#dc2626">{r.category}</Tag>,
                  <span style={{ color:'#64748b', fontSize:'0.82rem' }}>{r.description||'—'}</span>,
                  <span style={{ color:'#dc2626', fontWeight:700 }}>{fmtTL(r.amount)}</span>,
                ]}
                onEdit={r=>setExpModal({data:{entryDate:r.entry_date?.split('T')[0]||'',monthName:r.month_name,yearValue:String(r.year_value),category:r.category,subCategory:r.sub_category||'',description:r.description||'',amount:String(r.amount),note:r.note||''},id:r.id})}
                onDelete={r=>deleteExp(r.id)}
                emptyText="Bu dönem için gider kaydı yok. '+ Yeni Gider Ekle' ile başlayın veya Excel dosyası yükleyin."
              />
            </div>
          )}

          {/* ── Tab: İçe Aktar ── */}
          {tab==='import' && (
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              {/* Şablon İndir */}
              <div style={{ background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:14, padding:'16px 20px', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:10 }}>
                <div>
                  <div style={{ fontWeight:700, color:'#1d4ed8', marginBottom:4 }}>Excel Şablonu</div>
                  <div style={{ fontSize:'0.82rem', color:'#3730a3' }}>
                    Dosyanızın doğru formatta olması için önce şablonu indirin.<br/>
                    <b>Gelirler</b> sekmesi: Tarih | Ay | Yıl | Kategori | Açıklama | Tutar<br/>
                    <b>Giderler</b> sekmesi: Tarih | Ay | Yıl | Kategori | Alt Kategori | Açıklama | Tutar
                  </div>
                </div>
                <button onClick={downloadTemplate} style={{ padding:'9px 20px', borderRadius:9, border:'none', fontWeight:700, fontSize:'0.85rem', cursor:'pointer', background:'#2563eb', color:'#fff' }}>
                  Şablon İndir (Excel)
                </button>
              </div>

              {/* Dosya Yükle */}
              <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:14, padding:20 }}>
                <div style={{ fontWeight:700, color:'#1e293b', marginBottom:14, fontSize:'0.95rem' }}>Excel Dosyası Yükle</div>
                <div style={{
                  border:'2px dashed #cbd5e1', borderRadius:12, padding:'36px 24px', textAlign:'center',
                  background:'#f8fafc', cursor:'pointer',
                }} onClick={()=>fileRef.current?.click()}>
                  <div style={{ fontSize:'2.5rem', marginBottom:10 }}>📂</div>
                  <div style={{ fontWeight:600, color:'#475569', marginBottom:4 }}>Excel dosyası seçin</div>
                  <div style={{ fontSize:'0.8rem', color:'#94a3b8' }}>.xlsx veya .xls formatı — Gelirler ve Giderler sekmeleri</div>
                  <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display:'none' }}
                    onChange={e=>handleFileSelect(e.target.files?.[0])} />
                </div>
                {importing && <div style={{ textAlign:'center', color:'#64748b', marginTop:14 }}>Dosya analiz ediliyor...</div>}
              </div>

              {/* Önizleme */}
              {preview && !importDone && (
                <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:14, overflow:'hidden' }}>
                  <div style={{ padding:'14px 18px', background:'#fefce8', borderBottom:'1px solid #fde68a', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8 }}>
                    <div>
                      <span style={{ fontWeight:700, color:'#92400e' }}>Önizleme — İçe Aktarılacak Kayıtlar</span>
                      <span style={{ fontSize:'0.8rem', color:'#78350f', marginLeft:12 }}>
                        {preview.totalRevenues||preview.revenues?.length||0} gelir + {preview.totalExpenses||preview.expenses?.length||0} gider kaydı tespit edildi
                      </span>
                    </div>
                    <div style={{ display:'flex', gap:8 }}>
                      <button onClick={()=>setPreview(null)} style={{ padding:'7px 14px', borderRadius:8, border:'1px solid #d1d5db', background:'#fff', cursor:'pointer', fontWeight:600, fontSize:'0.82rem', color:'#475569' }}>İptal</button>
                      <button onClick={confirmImport} disabled={importing} style={{ padding:'7px 18px', borderRadius:8, border:'none', background:'#16a34a', color:'#fff', fontWeight:700, fontSize:'0.85rem', cursor:'pointer' }}>
                        {importing ? 'Aktarılıyor...' : `${(preview.revenues?.length||0)+(preview.expenses?.length||0)} Kaydı Aktar`}
                      </button>
                    </div>
                  </div>
                  {/* Gelirler önizleme */}
                  {preview.revenues?.length>0 && (
                    <div style={{ padding:'12px 18px' }}>
                      <div style={{ fontWeight:700, color:'#16a34a', marginBottom:8 }}>Gelirler ({preview.revenues.length})</div>
                      <div style={{ overflowX:'auto' }}>
                        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.82rem' }}>
                          <thead><tr style={{ background:'#f0fdf4' }}>
                            {['Tarih','Ay','Yıl','Kategori','Açıklama','Tutar'].map(h=><th key={h} style={{ padding:'7px 10px', textAlign:'left', fontWeight:700, color:'#16a34a', borderBottom:'1px solid #d1fae5' }}>{h}</th>)}
                          </tr></thead>
                          <tbody>{preview.revenues.slice(0,8).map((r,i)=>(
                            <tr key={i} style={{ background:i%2?'#f8fafc':'#fff' }}>
                              <td style={{ padding:'6px 10px' }}>{r.entryDate}</td><td style={{ padding:'6px 10px' }}>{r.monthName}</td><td style={{ padding:'6px 10px' }}>{r.yearValue}</td>
                              <td style={{ padding:'6px 10px' }}>{r.category}</td><td style={{ padding:'6px 10px', color:'#64748b' }}>{r.description||'—'}</td>
                              <td style={{ padding:'6px 10px', color:'#16a34a', fontWeight:700 }}>{fmtTL(r.amount)}</td>
                            </tr>
                          ))}</tbody>
                        </table>
                        {preview.revenues.length>8 && <div style={{ padding:'8px 10px', color:'#94a3b8', fontSize:'0.78rem' }}>...ve {preview.revenues.length-8} satır daha</div>}
                      </div>
                    </div>
                  )}
                  {/* Giderler önizleme */}
                  {preview.expenses?.length>0 && (
                    <div style={{ padding:'12px 18px', borderTop:'1px solid #f1f5f9' }}>
                      <div style={{ fontWeight:700, color:'#dc2626', marginBottom:8 }}>Giderler ({preview.expenses.length})</div>
                      <div style={{ overflowX:'auto' }}>
                        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.82rem' }}>
                          <thead><tr style={{ background:'#fef2f2' }}>
                            {['Tarih','Ay','Yıl','Kategori','Açıklama','Tutar'].map(h=><th key={h} style={{ padding:'7px 10px', textAlign:'left', fontWeight:700, color:'#dc2626', borderBottom:'1px solid #fee2e2' }}>{h}</th>)}
                          </tr></thead>
                          <tbody>{preview.expenses.slice(0,8).map((r,i)=>(
                            <tr key={i} style={{ background:i%2?'#f8fafc':'#fff' }}>
                              <td style={{ padding:'6px 10px' }}>{r.entryDate}</td><td style={{ padding:'6px 10px' }}>{r.monthName}</td><td style={{ padding:'6px 10px' }}>{r.yearValue}</td>
                              <td style={{ padding:'6px 10px' }}>{r.category}</td><td style={{ padding:'6px 10px', color:'#64748b' }}>{r.description||'—'}</td>
                              <td style={{ padding:'6px 10px', color:'#dc2626', fontWeight:700 }}>{fmtTL(r.amount)}</td>
                            </tr>
                          ))}</tbody>
                        </table>
                        {preview.expenses.length>8 && <div style={{ padding:'8px 10px', color:'#94a3b8', fontSize:'0.78rem' }}>...ve {preview.expenses.length-8} satır daha</div>}
                      </div>
                    </div>
                  )}
                  {preview.revenues?.length===0&&preview.expenses?.length===0 && (
                    <div style={{ padding:'24px', textAlign:'center', color:'#dc2626', fontSize:'0.9rem' }}>Dosyada tanınabilir veri bulunamadı. Lütfen şablona uygun format kullanın.</div>
                  )}
                </div>
              )}

              {/* İçe aktarma başarı */}
              {importDone && (
                <div style={{ background:'#f0fdf4', border:'1px solid #86efac', borderRadius:12, padding:'18px 24px' }}>
                  <div style={{ fontWeight:700, color:'#16a34a', fontSize:'1rem', marginBottom:6 }}>İçe aktarma tamamlandı!</div>
                  <div style={{ color:'#166534', fontSize:'0.88rem' }}>
                    {importDone.insertedRevenues} gelir + {importDone.insertedExpenses} gider kaydı aktarıldı. Toplam: {importDone.total} kayıt.
                  </div>
                  <button onClick={()=>{ setImportDone(null); setTab('ozet'); }} style={{ marginTop:12, padding:'7px 16px', borderRadius:8, border:'none', background:'#16a34a', color:'#fff', fontWeight:700, cursor:'pointer', fontSize:'0.85rem' }}>
                    Özete Git
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Modal: Gelir Ekle/Düzenle ── */}
      {revModal && (
        <div className="modal-overlay" onClick={()=>setRevModal(null)}>
          <div className="modal" style={{ maxWidth:580 }} onClick={e=>e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ margin:0 }}>{revModal.id?'Geliri Düzenle':'Yeni Gelir Ekle'}</h3>
              <button className="modal-close" onClick={()=>setRevModal(null)}>×</button>
            </div>
            <form onSubmit={saveRev} style={{ padding:20, display:'flex', flexDirection:'column', gap:14 }}>
              <div style={S.grid2}>
                <Fld label="Tarih *"><input type="date" value={revModal.data.entryDate} required style={S.inp} onChange={e=>setRevModal(p=>({...p,data:{...p.data,entryDate:e.target.value}}))} /></Fld>
                <Fld label="Ay"><select value={revModal.data.monthName} style={S.sel} onChange={e=>setRevModal(p=>({...p,data:{...p.data,monthName:e.target.value}}))}>{MONTHS.map(m=><option key={m}>{m}</option>)}</select></Fld>
                <Fld label="Yıl"><select value={revModal.data.yearValue} style={S.sel} onChange={e=>setRevModal(p=>({...p,data:{...p.data,yearValue:e.target.value}}))}>{YEARS.map(y=><option key={y}>{y}</option>)}</select></Fld>
                <Fld label="Kategori"><select value={revModal.data.category} style={S.sel} onChange={e=>setRevModal(p=>({...p,data:{...p.data,category:e.target.value}}))}>{REV_CATS.map(c=><option key={c}>{c}</option>)}</select></Fld>
                <Fld label="Açıklama" full><input value={revModal.data.description} style={S.inp} placeholder="Gelir açıklaması" onChange={e=>setRevModal(p=>({...p,data:{...p.data,description:e.target.value}}))} /></Fld>
                <Fld label="Tutar (₺) *"><input type="number" min="0" step="0.01" required value={revModal.data.amount} style={S.inp} onChange={e=>setRevModal(p=>({...p,data:{...p.data,amount:e.target.value}}))} /></Fld>
                <Fld label="Not"><input value={revModal.data.note} style={S.inp} placeholder="İsteğe bağlı not" onChange={e=>setRevModal(p=>({...p,data:{...p.data,note:e.target.value}}))} /></Fld>
              </div>
              <div style={{ display:'flex', gap:8, paddingTop:4 }}>
                <button type="submit" disabled={saving} className="primary-btn">{saving?'Kaydediliyor...':revModal.id?'Güncelle':'Kaydet'}</button>
                <button type="button" className="secondary-btn" onClick={()=>setRevModal(null)}>İptal</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Gider Ekle/Düzenle ── */}
      {expModal && (
        <div className="modal-overlay" onClick={()=>setExpModal(null)}>
          <div className="modal" style={{ maxWidth:620 }} onClick={e=>e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ margin:0 }}>{expModal.id?'Gideri Düzenle':'Yeni Gider Ekle'}</h3>
              <button className="modal-close" onClick={()=>setExpModal(null)}>×</button>
            </div>
            <form onSubmit={saveExp} style={{ padding:20, display:'flex', flexDirection:'column', gap:14 }}>
              <div style={S.grid2}>
                <Fld label="Tarih *"><input type="date" value={expModal.data.entryDate} required style={S.inp} onChange={e=>setExpModal(p=>({...p,data:{...p.data,entryDate:e.target.value}}))} /></Fld>
                <Fld label="Ay"><select value={expModal.data.monthName} style={S.sel} onChange={e=>setExpModal(p=>({...p,data:{...p.data,monthName:e.target.value}}))}>{MONTHS.map(m=><option key={m}>{m}</option>)}</select></Fld>
                <Fld label="Yıl"><select value={expModal.data.yearValue} style={S.sel} onChange={e=>setExpModal(p=>({...p,data:{...p.data,yearValue:e.target.value}}))}>{YEARS.map(y=><option key={y}>{y}</option>)}</select></Fld>
                <Fld label="Kategori"><select value={expModal.data.category} style={S.sel} onChange={e=>setExpModal(p=>({...p,data:{...p.data,category:e.target.value}}))}>{EXP_CATS.map(c=><option key={c}>{c}</option>)}</select></Fld>
                <Fld label="Alt Kategori"><input value={expModal.data.subCategory||''} style={S.inp} placeholder="İsteğe bağlı" onChange={e=>setExpModal(p=>({...p,data:{...p.data,subCategory:e.target.value}}))} /></Fld>
                <Fld label="Açıklama" full><input value={expModal.data.description} style={S.inp} placeholder="Gider açıklaması" onChange={e=>setExpModal(p=>({...p,data:{...p.data,description:e.target.value}}))} /></Fld>
                <Fld label="Tutar (₺) *"><input type="number" min="0" step="0.01" required value={expModal.data.amount} style={S.inp} onChange={e=>setExpModal(p=>({...p,data:{...p.data,amount:e.target.value}}))} /></Fld>
                <Fld label="Not"><input value={expModal.data.note||''} style={S.inp} placeholder="İsteğe bağlı not" onChange={e=>setExpModal(p=>({...p,data:{...p.data,note:e.target.value}}))} /></Fld>
              </div>
              <div style={{ display:'flex', gap:8, paddingTop:4 }}>
                <button type="submit" disabled={saving} style={{ padding:'9px 20px', borderRadius:9, border:'none', fontWeight:700, cursor:'pointer', background:'#dc2626', color:'#fff' }}>{saving?'Kaydediliyor...':expModal.id?'Güncelle':'Kaydet'}</button>
                <button type="button" className="secondary-btn" onClick={()=>setExpModal(null)}>İptal</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Mini Bileşenler ───────────────────────────────────────────────────────────
function KpiCard({ label, value, color }) {
  return (
    <div style={{ background:'#fff', border:`1px solid ${color}22`, borderLeft:`4px solid ${color}`, borderRadius:12, padding:'14px 16px' }}>
      <div style={{ fontSize:'0.72rem', fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:4 }}>{label}</div>
      <div style={{ fontSize:'1.3rem', fontWeight:800, color, lineHeight:1.1 }}>{value}</div>
    </div>
  );
}

function ActionBtn({ color, onClick, children }) {
  return (
    <button onClick={onClick} style={{ padding:'7px 13px', borderRadius:8, border:'none', cursor:'pointer', fontSize:'0.8rem', fontWeight:700, background:color, color:'#fff', whiteSpace:'nowrap' }}>
      {children}
    </button>
  );
}

function Tag({ color, children }) {
  return <span style={{ background:`${color}15`, color, fontWeight:700, fontSize:'0.72rem', padding:'2px 7px', borderRadius:5, whiteSpace:'nowrap' }}>{children}</span>;
}

function RecordTable({ rows, cols, renderRow, onEdit, onDelete, emptyText }) {
  if (rows.length === 0) return (
    <div style={{ padding:'28px 18px', textAlign:'center', color:'#94a3b8', fontSize:'0.875rem' }}>{emptyText}</div>
  );
  return (
    <div style={{ overflowX:'auto' }}>
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.855rem' }}>
        <thead>
          <tr style={{ background:'#f8fafc' }}>
            {cols.map(c=><th key={c} style={{ padding:'9px 12px', textAlign:'left', fontWeight:700, color:'#475569', borderBottom:'1px solid #e2e8f0', whiteSpace:'nowrap' }}>{c}</th>)}
            <th style={{ padding:'9px 12px', textAlign:'right', color:'#475569', borderBottom:'1px solid #e2e8f0' }}>İşlem</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row,i)=>{
            const cells = renderRow(row);
            return (
              <tr key={row.id} style={{ background:i%2===0?'#fff':'#f8fafc' }}>
                {cells.map((c,ci)=><td key={ci} style={{ padding:'9px 12px', borderBottom:'1px solid #f1f5f9', color:'#334155' }}>{c}</td>)}
                <td style={{ padding:'9px 12px', borderBottom:'1px solid #f1f5f9', textAlign:'right', whiteSpace:'nowrap' }}>
                  <button onClick={()=>onEdit(row)} style={{ padding:'3px 10px', borderRadius:6, border:'1px solid #e2e8f0', background:'#f8fafc', cursor:'pointer', fontSize:'0.78rem', color:'#475569', marginRight:4 }}>Düzenle</button>
                  <button onClick={()=>onDelete(row)} style={{ padding:'3px 10px', borderRadius:6, border:'1px solid #fee2e2', background:'#fef2f2', cursor:'pointer', fontSize:'0.78rem', color:'#dc2626' }}>Sil</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Fld({ label, children, full }) {
  return (
    <div style={full?{gridColumn:'1/-1'}:{}}>
      <label style={{ display:'block', fontSize:'0.78rem', fontWeight:600, color:'#64748b', marginBottom:4 }}>{label}</label>
      {children}
    </div>
  );
}
