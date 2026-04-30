'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/apiClient';

export default function DbCheckPage() {
  const [dbStatus, setDbStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fixing, setFixing] = useState(false);

  const targetSchema = {
    investors: ['id', 'name', 'budget', 'city', 'sector', 'investment_type', 'pipeline_stage', 'currency', 'phone', 'email', 'district', 'goal', 'contact_history', 'meeting_notes', 'follow_up_date', 'documents', 'created_at', 'deleted_at'],
    brands: ['id', 'name', 'sector', 'min_budget', 'max_budget', 'currency', 'min_sqm', 'max_sqm', 'target_locations', 'monthly_growth', 'active', 'created_at', 'deleted_at'],
    locations: ['id', 'name', 'location_type', 'sqm', 'rent', 'currency', 'potential', 'recommended_brands', 'created_at', 'deleted_at'],
    projects: ['id', 'name', 'project_type', 'owner_team', 'priority', 'progress', 'stage', 'due_date', 'description', 'checklist', 'assignees', 'created_at', 'deleted_at'],
    contracts: ['id', 'note', 'contract_type', 'status', 'counterparty', 'start_date', 'end_date', 'amount', 'currency', 'created_at', 'deleted_at'],
    tasks: ['id', 'note', 'status', 'created_at', 'deleted_at'],
    pnl: ['id', 'month_name', 'year_value', 'revenue', 'expense', 'profit', 'note', 'created_at'],
    message_templates: ['id', 'channel', 'event_name', 'title', 'body', 'active', 'created_at'],
    activity_logs: ['id', 'user_id', 'user_name', 'module_name', 'action_type', 'summary', 'created_at']
  };

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const data = await apiClient.get('/admin/db-status');
      setDbStatus(data);
    } catch (err) {
      alert('Durum alınamadı.');
    } finally {
      setLoading(false);
    }
  };

  const handleFix = async () => {
    setFixing(true);
    try {
      const res = await apiClient.post('/admin/db-fix');
      alert(res.message);
      fetchStatus();
    } catch (err) {
      alert('Onarım başarısız.');
    } finally {
      setFixing(false);
    }
  };

  useEffect(() => { fetchStatus(); }, []);

  if (loading) return <div className="card">Veritabanı taranıyor...</div>;

  return (
    <section className="card page-section active">
      <div className="module-head">
        <h2>Veritabanı Sağlık Kontrolü</h2>
        <button 
          onClick={handleFix} 
          disabled={fixing}
          className="primary-btn"
        >
          {fixing ? 'Onarılıyor...' : 'Eksik Sütunları Tamamla'}
        </button>
      </div>

      <div className="db-report-grid" style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px', marginTop: '20px'}}>
        {Object.keys(targetSchema).map(table => {
          const currentColumns = dbStatus[table] || [];
          const missingColumns = targetSchema[table].filter(col => !currentColumns.includes(col));

          return (
            <article key={table} className="card" style={{padding: '15px'}}>
              <h3 style={{borderBottom: '1px solid #eee', paddingBottom: '10px'}}>{table}</h3>
              <ul style={{listStyle: 'none', padding: 0, marginTop: '10px'}}>
                {targetSchema[table].map(col => {
                  const isExists = currentColumns.includes(col);
                  return (
                    <li key={col} style={{
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      color: isExists ? '#10b981' : '#ef4444',
                      fontSize: '0.9em',
                      padding: '2px 0'
                    }}>
                      <span>{col}</span>
                      <span>{isExists ? '✓' : 'Eksik'}</span>
                    </li>
                  );
                })}
              </ul>
            </article>
          );
        })}
      </div>
    </section>
  );
}
