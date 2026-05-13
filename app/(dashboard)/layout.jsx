'use client';

import { useAuth } from '@/lib/AuthContext';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function DashboardLayout({ children }) {
  const { user, logout, loading } = useAuth();
  const pathname = usePathname();
  const loadSampleData = async () => {
    try {
      const token = localStorage.getItem('access_token');
      await fetch('/api/admin/seed', { method: 'GET', headers: { Authorization: `Bearer ${token}` } });
      alert('Örnek veriler yüklendi. Sayfa yenilenecek.');
      window.location.reload();
    } catch (error) {
      alert('Örnek veri yüklenemedi.');
    }
  };

  if (loading) return <div className="loading-screen">Yükleniyor...</div>;
  if (!user) return null;

  const menuItems = [
    { name: 'Panel', path: '/', id: 'dashboard' },
    { name: 'Yatırımcı Yönetimi', path: '/investors', id: 'investors' },
    { name: 'Marka Portföy Yönetimi', path: '/brands', id: 'brands' },
    { name: 'Lokasyon Yönetimi', path: '/locations', id: 'locations' },
    { name: 'Proje & Süreç Takibi', path: '/projects', id: 'projects' },
    { name: 'Sözleşme Yönetimi', path: '/contracts', id: 'contracts' },
    { name: 'Finans Yönetimi', path: '/finance', id: 'finance' },
    { name: 'Görevler', path: '/tasks', id: 'tasks' },
    { name: 'Raporlar', path: '/reports', id: 'reports' },
    { name: 'Kar / Zarar', path: '/pnl', id: 'pnl' },
    { name: 'Şablonlar', path: '/templates', id: 'templates' },
    { name: 'Eşleştirme Motoru', path: '/matching', id: 'matching' },
    { name: 'Veri Tabanı', path: '/db-check', id: 'db-check' },
  ];
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark logo-inside">
            <img
              src="/logo/micore_logo.png"
              alt="Mi Core Logo"
              className="brand-logo"
              onError={(e) => { e.target.style.display='none'; e.target.parentElement.textContent='Mi'; }}
            />
          </div>
        </div>
        <nav className="menu">
          <Link href="/" className={`menu-link ${pathname === '/' ? 'active' : ''}`}>Panel</Link>
          <Link href="/investors" className={`menu-link ${pathname === '/investors' ? 'active' : ''}`}>Yatırımcı Yönetimi</Link>
          <Link href="/brands" className={`menu-link ${pathname === '/brands' ? 'active' : ''}`}>Marka Portföy Yönetimi</Link>
          <Link href="/locations" className={`menu-link ${pathname === '/locations' ? 'active' : ''}`}>Lokasyon Yönetimi</Link>
          <Link href="/projects" className={`menu-link ${pathname === '/projects' ? 'active' : ''}`}>Proje & Süreç Takibi</Link>
          <Link href="/contracts" className={`menu-link ${pathname === '/contracts' ? 'active' : ''}`}>Sözleşme Yönetimi</Link>
          <Link href="/finance" className={`menu-link ${pathname === '/finance' ? 'active' : ''}`}>Finans Yönetimi</Link>
          <Link href="/tasks" className={`menu-link ${pathname === '/tasks' ? 'active' : ''}`}>Görevler</Link>
          <Link href="/reports" className={`menu-link ${pathname === '/reports' ? 'active' : ''}`}>Raporlar</Link>
          <Link href="/pnl" className={`menu-link ${pathname === '/pnl' ? 'active' : ''}`}>Kar / Zarar</Link>
          <Link href="/templates" className={`menu-link ${pathname === '/templates' ? 'active' : ''}`}>Şablonlar</Link>
          <Link href="/matching" className={`menu-link ${pathname === '/matching' ? 'active' : ''}`}>Eşleştirme Motoru</Link>
          {user.role === 'admin' && <Link href="/settings" className={`menu-link ${pathname === '/settings' ? 'active' : ''}`}>Ayarlar</Link>}
          {user.role === 'admin' && <Link href="/db-check" className={`menu-link ${pathname === '/db-check' ? 'active' : ''}`} style={{opacity: 0.5}}>Veri Tabanı</Link>}
        </nav>
      </aside>

      <main className="content">
        <header className="header">
          <div>
            <h1>Mi Core Yönetim Paneli</h1>
          </div>
          <div className="header-actions">
            <button type="button" className="secondary-btn">Excel (Tümü)</button>
            {user.role === 'admin' && <button type="button" className="secondary-btn" onClick={loadSampleData}>Örnek Veri Yükle</button>}
            <button type="button" className="primary-btn" onClick={() => window.location.href='/investors'}>+ Yeni Lead</button>
            <button onClick={logout} className="danger-btn">Çıkış</button>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
