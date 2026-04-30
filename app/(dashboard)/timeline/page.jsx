'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/apiClient';

export default function TimelinePage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      try { const data = await apiClient.get('/activity'); setLogs(data); } catch (err) {}
      finally { setLoading(false); }
    };
    fetchLogs();
  }, []);

  if (loading) return <div className="card">Yükleniyor...</div>;

  return (
    <section className="card page-section active">
      <h2>Activity Timeline</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Zaman</th><th>Kullanıcı</th><th>Modül</th><th>Aksiyon</th><th>Özet</th></tr>
          </thead>
          <tbody>
            {logs.map(log => (
              <tr key={log.id}>
                <td style={{fontSize: '0.85em'}}>{new Date(log.created_at).toLocaleString('tr-TR')}</td>
                <td>{log.user_name}</td>
                <td><span className="badge">{log.module_name}</span></td>
                <td>{log.action_type}</td>
                <td>{log.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
