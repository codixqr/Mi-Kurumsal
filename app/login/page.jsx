'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login } = useAuth();
  const router = useRouter();
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await login(email, password);
      router.push('/');
    } catch (err) {
      setError('Giriş başarısız. Lütfen bilgilerinizi kontrol edin.');
    }
  };

  const handleQuickLogin = async () => {
    try {
      // Varsayılan admin bilgileriyle hızlı giriş
      await login('admin@mikurumsal.com', 'Admin123*');
      router.push('/');
    } catch (err) {
      setError('Hızlı giriş başarısız. Lütfen veritabanının çalıştığından emin olun.');
    }
  };

  return (
    <div className="login-container" style={{
      display: 'flex', justifyContent: 'center', alignItems: 'center', 
      height: '100vh', background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)'
    }}>
      <div className="card login-card" style={{ width: '100%', maxWidth: '400px', padding: '30px' }}>
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <img src="/logo/mikurumsal_logo.png" alt="Logo" style={{ height: '50px', marginBottom: '15px' }} />
          <h2>CRM Giriş</h2>
          <p>Yönetim paneline erişmek için giriş yapın</p>
        </div>
        
        {error && <div className="alert alert-danger" style={{ color: 'red', marginBottom: '15px', textAlign: 'center' }}>{error}</div>}
        
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>E-posta</label>
            <input 
              type="email" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              required 
              style={{ width: '100%', padding: '10px', marginTop: '5px' }}
            />
          </div>
          <div className="field" style={{ marginTop: '15px' }}>
            <label>Şifre</label>
            <input 
              type="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              required 
              style={{ width: '100%', padding: '10px', marginTop: '5px' }}
            />
          </div>
          <button type="submit" className="primary-btn" style={{ width: '100%', marginTop: '20px', padding: '12px' }}>Giriş Yap</button>
        </form>

        <div style={{ marginTop: '20px', textAlign: 'center' }}>
          <div style={{ borderTop: '1px solid #ddd', paddingTop: '20px' }}>
            <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '10px' }}>Geliştirici Modu (Hızlı Erişim)</p>
            <button 
              onClick={handleQuickLogin} 
              className="secondary-btn" 
              style={{ width: '100%', padding: '10px', backgroundColor: '#e2e8f0', border: '1px solid #cbd5e0' }}
            >
              🚀 Admin Olarak Hızlı Giriş
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
