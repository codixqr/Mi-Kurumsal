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

  return (
    <div style={{ display: 'flex', minHeight: '100vh', width: '100vw', margin: 0, padding: 0, overflow: 'hidden' }}>
      {/* Left Form Side */}
      <div style={{
        flex: '1',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        background: '#ffffff',
        padding: '40px',
        minWidth: '400px',
        maxWidth: '500px',
        boxShadow: '10px 0 30px rgba(0,0,0,0.1)',
        zIndex: 10
      }}>
        <div style={{ width: '100%', maxWidth: '380px' }}>
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <img src="/logo/micore_logo.png" alt="Logo" style={{ height: '60px', marginBottom: '20px' }} />
            <h2 style={{ fontSize: '2rem', fontWeight: 800, color: '#1e293b', marginBottom: '10px' }}>Hoş Geldiniz</h2>
            <p style={{ color: '#64748b', fontSize: '1rem' }}>Sisteme erişmek için giriş yapın.</p>
          </div>
          
          {error && <div style={{ background: '#fef2f2', color: '#b91c1c', padding: '12px', borderRadius: '8px', marginBottom: '20px', textAlign: 'center', fontSize: '0.9rem', border: '1px solid #f87171' }}>{error}</div>}
          
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>E-posta</label>
              <input 
                type="email" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                required 
                placeholder="ornek@sirket.com"
                style={{ width: '100%', padding: '14px 16px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '1rem', transition: 'border-color 0.2s', outline: 'none' }}
                onFocus={(e) => e.target.style.borderColor = '#1a5c38'}
                onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>Şifre</label>
              <input 
                type="password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                required 
                placeholder="••••••••"
                style={{ width: '100%', padding: '14px 16px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '1rem', transition: 'border-color 0.2s', outline: 'none' }}
                onFocus={(e) => e.target.style.borderColor = '#1a5c38'}
                onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
              />
            </div>
            
            <button type="submit" style={{ 
              width: '100%', padding: '14px', marginTop: '10px', background: '#1a5c38', color: '#fff', 
              border: 'none', borderRadius: '10px', fontSize: '1rem', fontWeight: 600, 
              cursor: 'pointer', transition: 'background 0.2s, transform 0.1s' 
            }}
            onMouseOver={(e) => e.target.style.background = '#14462a'}
            onMouseOut={(e) => e.target.style.background = '#1a5c38'}
            onMouseDown={(e) => e.target.style.transform = 'scale(0.98)'}
            onMouseUp={(e) => e.target.style.transform = 'scale(1)'}
            >
              Giriş Yap
            </button>
          </form>
          
          <div style={{ textAlign: 'center', marginTop: '40px', fontSize: '0.85rem', color: '#94a3b8' }}>
            &copy; {new Date().getFullYear()} Mi Kurumsal Danışmanlık
          </div>
        </div>
      </div>

      {/* Right Image Side */}
      <div style={{
        flex: '2',
        position: 'relative',
        background: `url('https://images.unsplash.com/photo-1541432901042-2d8bd64b4a9b?q=80&w=2000&auto=format&fit=crop') center/cover no-repeat`,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        padding: '60px'
      }}>
        {/* Overlay gradient for text readability */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.1) 100%)' }}></div>
        <div style={{ position: 'relative', color: '#fff', zIndex: 1, maxWidth: '700px' }}>
          <h1 style={{ fontSize: '3.5rem', fontWeight: 800, marginBottom: '20px', lineHeight: 1.1 }}>İstanbul'dan<br/>Tüm Dünyaya.</h1>
          <p style={{ fontSize: '1.25rem', color: '#e2e8f0', lineHeight: 1.6 }}>
            Yatırımcıları doğru lokasyonlar ve kârlı markalarla buluşturarak; veriye dayalı stratejilerle en verimli büyüme adımlarını atmanızı sağlıyoruz.
          </p>
        </div>
      </div>
    </div>
  );
}
