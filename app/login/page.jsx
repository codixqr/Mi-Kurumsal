'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import Link from 'next/link';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <section className="auth-wrap">
      <article className="auth-card">
        <h1 className="auth-logo-title">
          <img
            src="/logo/mikurumsal_logo.png"
            alt="Mi Kurumsal Logo"
            className="auth-logo-inline"
          />
        </h1>
        <p>Giriş yaparak operasyon paneline erişin.</p>
        
        <div className="auth-tabs">
          <button className="active">Giriş Yap</button>
          <Link href="/register">
            <button type="button">Kayıt Ol</button>
          </Link>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="loginEmail">E-posta</label>
            <input 
              id="loginEmail" 
              type="email" 
              required 
              placeholder="admin@mikurumsal.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="loginPassword">Şifre</label>
            <input 
              id="loginPassword" 
              type="password" 
              required 
              placeholder="********"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button type="submit">Giriş Yap</button>
        </form>
        {error && <p className="inline-message error">{error}</p>}
      </article>
    </section>
  );
}
