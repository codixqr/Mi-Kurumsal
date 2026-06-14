'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/apiClient';

const MONTHS = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
const REV_CATS = ['Ciro', 'Komisyon Geliri', 'Kira Geliri', 'Danışmanlık Geliri', 'Diğer Gelir'];
const EXP_CATS = ['Gıda','Personel','Kira','Elektrik','Su','Doğalgaz','POS Komisyon','Paket Servis','Vergi','Stok/Devir','Diğer'];

const fmt = (n) => Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 });
const fmtTL = (n) => fmt(n) + ' ₺';
const curYear = String(new Date().getFullYear());
const curMonth = MONTHS[new Date().getMonth()];

const emptyRev = () => ({ entryDate: new Date().toISOString().split('T')[0], monthName: curMonth, yearValue: curYear, category: 'Ciro', description: '', amount: '', note: '' });
const emptyExp = () => ({ entryDate: new Date().toISOString().split('T')[0], monthName: curMonth, yearValue: curYear, category: 'Gıda', subCategory: '', description: '', amount: '', note: '' });

export default function CustomerPnl() {
  const [investors, setInvestors] = useState([]);
  const [selectedId, setSelectedId]   = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterYear, setFilterYear]   = useState(curYear);

  const [summary,  setSummary]  = useState(null);
  const [revenues, setRevenues] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading]   = useState(false);

  const [revTab, setRevTab] = useState('list'); // list | form
  const [expTab, setExpTab] = useState('list');
  const [revForm, setRevForm] = useState(emptyRev());
  const [expForm, setExpForm] = useState(emptyExp());
  const [editRevId, setEditRevId] = useState(null);
  const [editExpId, setEditExpId] = useState(null);
  const [saving, setSaving] = useState(false);

  // Yatırımcı listesi
  useEffect(() => {
    apiClient.get('/investors?pageSize=500&page=1').then(d => {
      setInvestors(Array.isArray(d) ? d : (d.items || []));
    }).catch(() => {});
  }, []);

  const buildQ = () => {
    const p = new URLSearchParams();
    if (filterMonth) p.set('month', filterMonth);
    if (filterYear)  p.set('year', filterYear);
    return p.toString();
  };

  const loadData = useCallback(async () => {
    if (!selectedId) return;
    setLoading(true);
    const q = buildQ();
    const qs = q ? '?' + q : '';
    const [s, r, e] = await Promise.all([
      apiClient.get(`/pnl/customer/${selectedId}/summary${qs}`).catch(() => null),
      apiClient.get(`/pnl/customer/${selectedId}/revenues${qs}`).catch(() => []),
      apiClient.get(`/pnl/customer/${selectedId}/expenses${qs}`).catch(() => []),
    ]);
    setSummary(s);
    setRevenues(Array.isArray(r) ? r : []);
    setExpenses(Array.isArray(e) ? e : []);
    setLoading(false);
  }, [selectedId, filterMonth, filterYear]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── CRUD ──────────────────────────────────────────────
  const saveRev = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editRevId) await apiClient.put(`/pnl/customer/${selectedId}/revenues/${editRevId}`, revForm);
      else           await apiClient.post(`/pnl/customer/${selectedId}/revenues`, revForm);
      setRevForm(emptyRev()); setEditRevId(null); setRevTab('list');
      await loadData();
    } catch (err) { alert(err.message || 'Hata'); }
    finally { setSaving(false); }
  };

  const saveExp = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editExpId) await apiClient.put(`/pnl/customer/${selectedId}/expenses/${editExpId}`, expForm);
      else           await apiClient.post(`/pnl/customer/${selectedId}/expenses`, expForm);
      setExpForm(emptyExp()); setEditExpId(null); setExpTab('list');
      await loadData();
    } catch (err) { alert(err.message || 'Hata'); }
    finally { setSaving(false); }
  };

  const deleteRev = async (id) => {
    if (!confirm('Bu gelir kaydını silmek istiyor musunuz?')) return;
    await apiClient.delete(`/pnl/customer/${selectedId}/revenues/${id}`);
    await loadData();
  };

  const deleteExp = async (id) => {
    if (!confirm('Bu gider kaydını silmek istiyor musunuz?')) return;
    await apiClient.delete(`/pnl/customer/${selectedId}/expenses/${id}`);
    await loadData();
  };

  const startEditRev = (r) => {
    setRevForm({ entryDate: r.entry_date?.split('T')[0] || '', monthName: r.month_name, yearValue: String(r.year_value), category: r.category, description: r.description || '', amount: String(r.amount), note: r.note || '' });
    setEditRevId(r.id); setRevTab('form');
  };

  const startEditExp = (r) => {
    setExpForm({ entryDate: r.entry_date?.split('T')[0] || '', monthName: r.month_name, yearValue: String(r.year_value), category: r.category, subCategory: r.sub_category || '', description: r.description || '', amount: String(r.amount), note: r.note || '' });
    setEditExpId(r.id); setExpTab('form');
  };

  // ── Export ───────────────────────────────────────────
  const exportFile = (type) => {
    const q = buildQ();
    const qs = q ? '?' + q : '';
    const token = localStorage.getItem('access_token');
    const url = `/api/pnl/customer/${selectedId}/export-${type}${qs}`;
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `musteri-kar-zarar-${selectedId}.${type === 'pdf' ? 'pdf' : 'xlsx'}`;
        a.click();
      }).catch(() => alert('Dışa aktarma hatası'));
  };

  const investor = summary?.investor || {};
  const totalRev = Number(summary?.totalRevenue || 0);
  const totalExp = Number(summary?.totalExpense || 0);
  const net      = Number(summary?.netProfit || 0);
  const margin   = summary?.margin || '0.0';

  // ── Render ────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Müşteri & Filtre Seçimi ── */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20 }}>
        <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1e293b', marginBottom: 14 }}>Müşteri Seç ve Filtrele</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          <div>
            <label style={lbl}>Müşteri *</label>
            <select value={selectedId} onChange={e => { setSelectedId(e.target.value); setSummary(null); setRevenues([]); setExpenses([]); }} style={sel}>
              <option value="">— Müşteri Seçin —</option>
              {investors.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Ay</label>
            <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)} style={sel}>
              <option value="">Tüm Aylar</option>
              {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Yıl</label>
            <select value={filterYear} onChange={e => setFilterYear(e.target.value)} style={sel}>
              {['2023','2024','2025','2026','2027'].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
      </div>

      {!selectedId && (
        <div style={{ textAlign: 'center', padding: '48px 24px', color: '#94a3b8', background: '#fff', border: '2px dashed #d1d5db', borderRadius: 14 }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📊</div>
          <div style={{ fontWeight: 600 }}>Müşteri seçin</div>
          <div style={{ fontSize: '0.85rem', marginTop: 4 }}>Yukarıdan bir müşteri seçerek kar/zarar tablosuna ulaşabilirsiniz.</div>
        </div>
      )}

      {selectedId && loading && (
        <div style={{ textAlign: 'center', padding: 32, color: '#64748b' }}>Yükleniyor...</div>
      )}

      {selectedId && !loading && summary && (
        <>
          {/* ── Müşteri Bilgi Kartı ── */}
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 14, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#1a5c38' }}>{investor.name || '—'}</div>
              <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: 2 }}>
                {investor.sector || '—'} · {investor.city || '—'} · {investor.phone || '—'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => exportFile('pdf')} style={exportBtn('#dc2626')}>PDF İndir</button>
              <button onClick={() => exportFile('excel')} style={exportBtn('#16a34a')}>Excel İndir</button>
            </div>
          </div>

          {/* ── KPI Kartları ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
            <KpiBox label="Toplam Gelir" value={fmtTL(totalRev)} color="#16a34a" />
            <KpiBox label="Toplam Gider" value={fmtTL(totalExp)} color="#dc2626" />
            <KpiBox label="Net Kar/Zarar" value={fmtTL(net)} color={net >= 0 ? '#16a34a' : '#dc2626'} />
            <KpiBox label="Kar Marjı" value={`%${margin}`} color="#2563eb" />
          </div>

          {/* ── Gelirler Bölümü ── */}
          <Section
            title="Gelirler"
            accent="#16a34a"
            tab={revTab}
            onTabChange={(t) => { setRevTab(t); if (t === 'form' && editRevId) { setRevForm(emptyRev()); setEditRevId(null); } }}
            formLabel={editRevId ? 'Geliri Düzenle' : 'Yeni Gelir Ekle'}
          >
            {revTab === 'list' ? (
              <DataTable
                rows={revenues}
                cols={['Tarih','Ay','Kategori','Açıklama','Tutar']}
                renderRow={r => [
                  r.entry_date ? new Date(r.entry_date).toLocaleDateString('tr-TR') : '—',
                  r.month_name,
                  r.category,
                  r.description || '—',
                  <span style={{ color: '#16a34a', fontWeight: 700 }}>{fmtTL(r.amount)}</span>,
                ]}
                data={revenues}
                onEdit={startEditRev}
                onDelete={deleteRev}
                emptyText="Bu dönem için gelir kaydı yok."
              />
            ) : (
              <form onSubmit={saveRev} style={formGrid}>
                <Field label="Tarih *"><input type="date" value={revForm.entryDate} onChange={e => setRevForm({...revForm, entryDate: e.target.value})} required style={inp} /></Field>
                <Field label="Ay"><select value={revForm.monthName} onChange={e => setRevForm({...revForm, monthName: e.target.value})} style={inp}>{MONTHS.map(m => <option key={m}>{m}</option>)}</select></Field>
                <Field label="Yıl"><select value={revForm.yearValue} onChange={e => setRevForm({...revForm, yearValue: e.target.value})} style={inp}>{['2023','2024','2025','2026','2027'].map(y => <option key={y}>{y}</option>)}</select></Field>
                <Field label="Kategori"><select value={revForm.category} onChange={e => setRevForm({...revForm, category: e.target.value})} style={inp}>{REV_CATS.map(c => <option key={c}>{c}</option>)}</select></Field>
                <Field label="Açıklama" full><input value={revForm.description} onChange={e => setRevForm({...revForm, description: e.target.value})} placeholder="İsteğe bağlı" style={inp} /></Field>
                <Field label="Tutar (₺) *"><input type="number" min="0" step="0.01" value={revForm.amount} onChange={e => setRevForm({...revForm, amount: e.target.value})} required style={inp} /></Field>
                <Field label="Not" full><input value={revForm.note} onChange={e => setRevForm({...revForm, note: e.target.value})} placeholder="İsteğe bağlı not" style={inp} /></Field>
                <div style={{ gridColumn: '1/-1', display: 'flex', gap: 8, paddingTop: 4 }}>
                  <button type="submit" disabled={saving} className="primary-btn">{saving ? 'Kaydediliyor...' : editRevId ? 'Güncelle' : 'Kaydet'}</button>
                  <button type="button" className="secondary-btn" onClick={() => { setRevTab('list'); setRevForm(emptyRev()); setEditRevId(null); }}>İptal</button>
                </div>
              </form>
            )}
          </Section>

          {/* ── Giderler Bölümü ── */}
          <Section
            title="Giderler"
            accent="#dc2626"
            tab={expTab}
            onTabChange={(t) => { setExpTab(t); if (t === 'form' && editExpId) { setExpForm(emptyExp()); setEditExpId(null); } }}
            formLabel={editExpId ? 'Gideri Düzenle' : 'Yeni Gider Ekle'}
          >
            {expTab === 'list' ? (
              <DataTable
                rows={expenses}
                cols={['Tarih','Ay','Kategori','Açıklama','Tutar']}
                renderRow={r => [
                  r.entry_date ? new Date(r.entry_date).toLocaleDateString('tr-TR') : '—',
                  r.month_name,
                  r.category,
                  r.description || '—',
                  <span style={{ color: '#dc2626', fontWeight: 700 }}>{fmtTL(r.amount)}</span>,
                ]}
                data={expenses}
                onEdit={startEditExp}
                onDelete={deleteExp}
                emptyText="Bu dönem için gider kaydı yok."
              />
            ) : (
              <form onSubmit={saveExp} style={formGrid}>
                <Field label="Tarih *"><input type="date" value={expForm.entryDate} onChange={e => setExpForm({...expForm, entryDate: e.target.value})} required style={inp} /></Field>
                <Field label="Ay"><select value={expForm.monthName} onChange={e => setExpForm({...expForm, monthName: e.target.value})} style={inp}>{MONTHS.map(m => <option key={m}>{m}</option>)}</select></Field>
                <Field label="Yıl"><select value={expForm.yearValue} onChange={e => setExpForm({...expForm, yearValue: e.target.value})} style={inp}>{['2023','2024','2025','2026','2027'].map(y => <option key={y}>{y}</option>)}</select></Field>
                <Field label="Kategori"><select value={expForm.category} onChange={e => setExpForm({...expForm, category: e.target.value})} style={inp}>{EXP_CATS.map(c => <option key={c}>{c}</option>)}</select></Field>
                <Field label="Alt Kategori"><input value={expForm.subCategory} onChange={e => setExpForm({...expForm, subCategory: e.target.value})} placeholder="İsteğe bağlı" style={inp} /></Field>
                <Field label="Açıklama" full><input value={expForm.description} onChange={e => setExpForm({...expForm, description: e.target.value})} placeholder="İsteğe bağlı" style={inp} /></Field>
                <Field label="Tutar (₺) *"><input type="number" min="0" step="0.01" value={expForm.amount} onChange={e => setExpForm({...expForm, amount: e.target.value})} required style={inp} /></Field>
                <Field label="Not" full><input value={expForm.note} onChange={e => setExpForm({...expForm, note: e.target.value})} placeholder="İsteğe bağlı not" style={inp} /></Field>
                <div style={{ gridColumn: '1/-1', display: 'flex', gap: 8, paddingTop: 4 }}>
                  <button type="submit" disabled={saving} className="primary-btn">{saving ? 'Kaydediliyor...' : editExpId ? 'Güncelle' : 'Kaydet'}</button>
                  <button type="button" className="secondary-btn" onClick={() => { setExpTab('list'); setExpForm(emptyExp()); setEditExpId(null); }}>İptal</button>
                </div>
              </form>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

// ── Küçük Yardımcı Bileşenler ─────────────────────────────────────────────────

function KpiBox({ label, value, color }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${color}33`, borderLeft: `4px solid ${color}`, borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: '1.4rem', fontWeight: 800, color, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function Section({ title, accent, tab, onTabChange, formLabel, children }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9', background: `${accent}08`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700, fontSize: '0.95rem', color: accent }}>{title}</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <TabBtn active={tab === 'list'} onClick={() => onTabChange('list')}>Liste</TabBtn>
          <TabBtn active={tab === 'form'} onClick={() => onTabChange('form')} accent={accent}>{formLabel}</TabBtn>
        </div>
      </div>
      <div style={{ padding: 18 }}>{children}</div>
    </div>
  );
}

function TabBtn({ active, onClick, children, accent }) {
  return (
    <button onClick={onClick} style={{
      padding: '5px 12px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
      background: active ? (accent || '#1a5c38') : '#f1f5f9',
      color: active ? '#fff' : '#475569',
    }}>{children}</button>
  );
}

function DataTable({ cols, renderRow, data, onEdit, onDelete, emptyText }) {
  if (data.length === 0) return <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>{emptyText}</div>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead>
          <tr style={{ background: '#f8fafc' }}>
            {cols.map(c => <th key={c} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{c}</th>)}
            <th style={{ padding: '8px 12px', textAlign: 'right', color: '#475569', borderBottom: '1px solid #e2e8f0' }}>İşlem</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, ri) => {
            const cells = renderRow(row);
            return (
              <tr key={row.id} style={{ background: ri % 2 === 0 ? '#fff' : '#f8fafc', transition: 'background 0.1s' }}>
                {cells.map((cell, ci) => <td key={ci} style={{ padding: '9px 12px', borderBottom: '1px solid #f1f5f9', color: '#334155' }}>{cell}</td>)}
                <td style={{ padding: '9px 12px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button onClick={() => onEdit(row)} style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', fontSize: '0.78rem', color: '#475569', marginRight: 4 }}>Düzenle</button>
                  <button onClick={() => onDelete(row.id)} style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid #fee2e2', background: '#fef2f2', cursor: 'pointer', fontSize: '0.78rem', color: '#dc2626' }}>Sil</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Field({ label, children, full }) {
  return (
    <div style={full ? { gridColumn: '1/-1' } : {}}>
      <label style={lbl}>{label}</label>
      {children}
    </div>
  );
}

// inline style helpers
const lbl = { display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#64748b', marginBottom: 4 };
const sel = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '0.875rem' };
const inp = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '0.875rem', boxSizing: 'border-box' };
const formGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 };
const exportBtn = (color) => ({
  padding: '8px 18px', borderRadius: 8, border: 'none', fontWeight: 700, fontSize: '0.85rem',
  cursor: 'pointer', background: color, color: '#fff',
});
