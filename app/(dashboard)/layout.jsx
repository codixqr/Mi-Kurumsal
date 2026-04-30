'use client';

import { useAuth } from '@/lib/AuthContext';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function DashboardLayout({ children }) {
  const { user, logout, loading } = useAuth();
  const pathname = usePathname();

  if (loading) return <div className="loading-screen">Yükleniyor...</div>;
  if (!user) return null;

  const menuItems = [
    { name: 'Dashboard', path: '/', id: 'dashboard' },
    { name: 'Yatırımcılar', path: '/investors', id: 'investors' },
    { name: 'Markalar', path: '/brands', id: 'brands' },
    { name: 'Lokasyonlar', path: '/locations', id: 'locations' },
    { name: 'Projeler', path: '/projects', id: 'projects' },
    { name: 'Sözleşme & Finans', path: '/contracts', id: 'contracts' },
    { name: 'Görevler', path: '/tasks', id: 'tasks' },
    { name: 'Raporlar', path: '/reports', id: 'reports' },
    { name: 'Kar / Zarar', path: '/pnl', id: 'pnl' },
    { name: 'Timeline', path: '/timeline', id: 'timeline' },
    { name: 'Şablonlar', path: '/templates', id: 'templates' },
    { name: 'Eşleştirme Motoru', path: '/matching', id: 'matching' },
  ];

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark logo-inside">
            <img src="/logo/mikurumsal_logo.png" alt="Mi Kurumsal Logo" className="brand-logo" />
          </div>
          <div className="brand-text">
            <strong>Mi Core CRM</strong>
            <span>Franchise CRM</span>
          </div>
        </div>
        <nav className="menu">
          {menuItems.map((item) => (
            <Link 
              key={item.id} 
              href={item.path} 
              className={`menu-link ${pathname === item.path ? 'active' : ''}`}
            >
              {item.name}
            </Link>
          ))}
        </nav>
      </aside>

      <main className="content">
        <header className="header">
          <div>
            <img src="/logo/mikurumsal_logo.png" alt="Mi Kurumsal Logo" className="header-logo" />
            <h1>Mi Kurumsal CRM Yönetim Paneli</h1>
            <p>Hoş geldin, <strong>{user.name}</strong></p>
          </div>
          <div className="header-actions">
            <button type="button">Excel (Tümü)</button>
            <button onClick={logout} className="danger-btn">Çıkış</button>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
