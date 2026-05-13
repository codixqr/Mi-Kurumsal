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
    { name: 'Panel', path: '/', id: 'dashboard' },
    { name: 'Yatırımcı Yönetimi', path: '/investors', id: 'investors' },
    { name: 'Marka Portföy Yönetimi', path: '/brands', id: 'brands' },
    { name: 'Lokasyon Yönetimi', path: '/locations', id: 'locations' },
    { name: 'Proje & Süreç Takibi', path: '/projects', id: 'projects' },
    { name: 'Sözleşme Yönetimi', path: '/contracts', id: 'contracts' },
    { name: 'Görev Yönetimi', path: '/tasks', id: 'tasks' },
    { name: 'Finans & Kar/Zarar', path: '/pnl', id: 'pnl' },
    { name: 'Raporlar', path: '/reports', id: 'reports' },
    { name: 'Şablonlar', path: '/templates', id: 'templates' },
    { name: 'Akıllı Eşleştirme', path: '/matching', id: 'matching' },
    { name: 'Veri Tabanı', path: '/db-check', id: 'db-check' },
  ];

  const activeMenu = menuItems.find((m) => m.path === pathname || (m.path !== '/' && pathname.startsWith(m.path)));

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-logo-area">
          <div className="sidebar-logo-img-wrap">
            <img
              src="/logo/micore_logo.png"
              alt="Mi Core"
              className="sidebar-logo-img"
              onError={(e) => {
                e.target.style.display = 'none';
                const fb = e.target.parentElement;
                fb.innerHTML = '<span class="sidebar-logo-fallback">Mi</span>';
              }}
            />
          </div>
          <div className="sidebar-logo-text">
            <span className="sidebar-logo-name">Mi Core</span>
            <span className="sidebar-logo-sub">CRM Yönetim Sistemi</span>
          </div>
        </div>
        <nav className="menu">
          <Link href="/" className={`menu-link ${pathname === '/' ? 'active' : ''}`}>Panel</Link>
          <Link href="/investors" className={`menu-link ${pathname.startsWith('/investors') ? 'active' : ''}`}>Yatırımcı Yönetimi</Link>
          <Link href="/brands" className={`menu-link ${pathname.startsWith('/brands') ? 'active' : ''}`}>Marka Portföy Yönetimi</Link>
          <Link href="/locations" className={`menu-link ${pathname.startsWith('/locations') ? 'active' : ''}`}>Lokasyon Yönetimi</Link>
          <Link href="/projects" className={`menu-link ${pathname.startsWith('/projects') ? 'active' : ''}`}>Proje & Süreç Takibi</Link>
          <Link href="/contracts" className={`menu-link ${pathname.startsWith('/contracts') ? 'active' : ''}`}>Sözleşme Yönetimi</Link>
          <Link href="/tasks" className={`menu-link ${pathname.startsWith('/tasks') ? 'active' : ''}`}>Görev Yönetimi</Link>
          <Link href="/pnl" className={`menu-link ${pathname.startsWith('/pnl') ? 'active' : ''}`}>Finans & Kar/Zarar</Link>
          <Link href="/reports" className={`menu-link ${pathname.startsWith('/reports') ? 'active' : ''}`}>Raporlar</Link>
          <Link href="/templates" className={`menu-link ${pathname.startsWith('/templates') ? 'active' : ''}`}>Şablonlar</Link>
          <Link href="/matching" className={`menu-link ${pathname.startsWith('/matching') ? 'active' : ''}`}>Akıllı Eşleştirme</Link>
          {user.role === 'admin' && <Link href="/settings" className={`menu-link ${pathname.startsWith('/settings') ? 'active' : ''}`}>Ayarlar</Link>}
          {user.role === 'admin' && <Link href="/db-check" className={`menu-link ${pathname.startsWith('/db-check') ? 'active' : ''}`} style={{opacity: 0.5}}>Veri Tabanı</Link>}
        </nav>
      </aside>

      <main className="content">
        <header className="header">
          <div>
            <h1>Mi Core Yönetim Paneli</h1>
            <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem' }}>
              {activeMenu?.name || 'Genel Bakış'}
            </p>
          </div>
          <div className="header-actions">
            <button type="button" className="primary-btn" onClick={() => window.location.href='/investors'}>+ Yeni Lead</button>
            <button onClick={logout} className="danger-btn">Çıkış</button>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
