'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import Link from 'next/link';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { register } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await register(name, email, password);
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
        <p>Hesap oluşturarak CRM paneline katılın.</p>
        
        <div className="auth-tabs">
          <Link href="/login">
            <button type="button">Giriş Yap</button>
          </Link>
          <button className="active">Kayıt Ol</button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="regName">Ad Soyad</label>
            <input 
              id="regName" 
              type="text" 
              required 
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="regEmail">E-posta</label>
            <input 
              id="regEmail" 
              type="email" 
              required 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="regPassword">Şifre</label>
            <input 
              id="regPassword" 
              type="password" 
              required 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button type="submit">Kayıt Ol</button>
        </form>
        {error && <p className="inline-message error">{error}</p>}
      </article>
    </section>
  );
}
