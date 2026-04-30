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
    { name: 'DB Kontrol', path: '/db-check', id: 'db-check' },
  ];
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark logo-inside">
            <img
              src="/logo/mikurumsal_logo.png"
              alt="Mi Kurumsal Logo"
              className="brand-logo"
              onError={(e) => { e.target.style.display='none'; e.target.parentElement.textContent='Mi'; }}
            />
          </div>
          <div className="brand-text">
            <strong>Mi Core CRM</strong>
            <span>Franchise CRM</span>
          </div>
        </div>
        <nav className="menu">
          <Link href="/" className={`menu-link ${pathname === '/' ? 'active' : ''}`}>Dashboard</Link>
          <Link href="/investors" className={`menu-link ${pathname === '/investors' ? 'active' : ''}`}>Yatırımcılar</Link>
          <Link href="/brands" className={`menu-link ${pathname === '/brands' ? 'active' : ''}`}>Markalar</Link>
          <Link href="/locations" className={`menu-link ${pathname === '/locations' ? 'active' : ''}`}>Lokasyonlar</Link>
          <Link href="/projects" className={`menu-link ${pathname === '/projects' ? 'active' : ''}`}>Projeler</Link>
          <Link href="/contracts" className={`menu-link ${pathname === '/contracts' ? 'active' : ''}`}>Sözleşme & Finans</Link>
          <Link href="/tasks" className={`menu-link ${pathname === '/tasks' ? 'active' : ''}`}>Görevler</Link>
          <Link href="/reports" className={`menu-link ${pathname === '/reports' ? 'active' : ''}`}>Raporlar</Link>
          <Link href="/pnl" className={`menu-link ${pathname === '/pnl' ? 'active' : ''}`}>Kar / Zarar</Link>
          <Link href="/timeline" className={`menu-link ${pathname === '/timeline' ? 'active' : ''}`}>Timeline</Link>
          <Link href="/templates" className={`menu-link ${pathname === '/templates' ? 'active' : ''}`}>Şablonlar</Link>
          <Link href="/matching" className={`menu-link ${pathname === '/matching' ? 'active' : ''}`}>Eşleştirme Motoru</Link>
          <Link href="/db-check" className={`menu-link ${pathname === '/db-check' ? 'active' : ''}`} style={{opacity: 0.5}}>DB Kontrol</Link>
        </nav>
      </aside>

      <main className="content">
        <header className="header">
          <div>
            <img src="/logo/mikurumsal_logo.png" alt="Mi Kurumsal Logo" className="header-logo" style={{height: '60px', marginBottom: '5px'}} />
            <h1>Mi Kurumsal CRM Yönetim Paneli</h1>
          </div>
          <div className="header-actions">
            <button type="button" className="secondary-btn">Excel (Tümü)</button>
            <button type="button" className="primary-btn" onClick={() => window.location.href='/investors'}>+ Yeni Lead</button>
            <button onClick={logout} className="danger-btn">Çıkış</button>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
