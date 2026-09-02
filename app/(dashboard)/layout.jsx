'use client';

import { useAuth } from '@/lib/AuthContext';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { MobileTableSetup } from '@/components/MobileTableSetup';

export default function DashboardLayout({ children }) {
  const { user, logout, loading } = useAuth();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
    { name: 'İşlem Geçmişi', path: '/timeline', id: 'timeline' },
  ];

  // Route protection redirect guard on client side
  useEffect(() => {
    if (user && user.role !== 'admin' && pathname !== '/') {
      const matchedMenu = menuItems.find((m) => m.path !== '/' && pathname.startsWith(m.path));
      const userPermissions = user.permissions || [];
      if (matchedMenu && !userPermissions.includes(matchedMenu.id)) {
        window.location.href = '/';
      }
    }
  }, [user, pathname]);

  // Close sidebar on path change
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  if (loading) return <div className="loading-screen">Yükleniyor...</div>;
  if (!user) return null;

  const userPermissions = user.permissions || [];
  const hasPermission = (id) => {
    if (user.role === 'admin') return true;
    if (id === 'dashboard') return true;
    return userPermissions.includes(id);
  };

  const filteredMenuItems = menuItems.filter((item) => hasPermission(item.id));
  const activeMenu = menuItems.find((m) => m.path === pathname || (m.path !== '/' && pathname.startsWith(m.path)));

  return (
    <div className="app">
      <MobileTableSetup />
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
      
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-logo-area">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
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
          <button className="sidebar-close-btn" onClick={() => setSidebarOpen(false)} aria-label="Menüyü Kapat">✕</button>
        </div>
        <nav className="menu">
          {filteredMenuItems.map((item) => {
            const extraStyle = item.id === 'db-check' ? { opacity: 0.5 } : {};
            return (
              <Link
                key={item.id}
                href={item.path}
                className={`menu-link ${pathname === item.path || (item.path !== '/' && pathname.startsWith(item.path)) ? 'active' : ''}`}
                style={extraStyle}
              >
                {item.name}
              </Link>
            );
          })}
          {user.role === 'admin' && <Link href="/settings" className={`menu-link ${pathname.startsWith('/settings') ? 'active' : ''}`}>Ayarlar</Link>}
        </nav>
      </aside>

      <main className="content">
        <header className="header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="menu-toggle-btn" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Menüyü Aç">☰</button>
            <div>
              <h1 style={{ margin: 0, fontSize: 'clamp(1rem, 3vw, 1.5rem)' }}>Mi Core Yönetim Paneli</h1>
              <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem' }}>
                {activeMenu?.name || 'Genel Bakış'}
              </p>
            </div>
          </div>
          <div className="header-actions">
            <button type="button" className="primary-btn" onClick={() => window.location.href='/investors?new=true'}>+ Yeni Lead</button>
            <button onClick={logout} className="danger-btn">Çıkış</button>
          </div>
        </header>
        {children}
      </main>

    </div>
  );
}
