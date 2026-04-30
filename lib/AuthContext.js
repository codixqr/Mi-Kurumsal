'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { apiClient } from '@/lib/apiClient';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('access_token');
      if (token) {
        apiClient.setToken(token);
        try {
          const userData = await apiClient.get('/auth/me');
          setUser(userData);
        } catch (err) {
          apiClient.setToken(null);
        }
      }
      setLoading(false);
    };
    initAuth();
  }, []);

  useEffect(() => {
    if (!loading) {
      const isPublicPath = ['/login', '/register'].includes(pathname);
      if (!user && !isPublicPath) {
        router.push('/login');
      } else if (user && isPublicPath) {
        router.push('/');
      }
    }
  }, [user, loading, pathname, router]);

  const login = async (email, password) => {
    const data = await apiClient.post('/auth/login', { email, password });
    apiClient.setToken(data.token);
    setUser(data.user);
    router.push('/');
  };

  const register = async (name, email, password) => {
    const data = await apiClient.post('/auth/register', { name, email, password });
    apiClient.setToken(data.token);
    setUser(data.user);
    router.push('/');
  };

  const logout = () => {
    apiClient.setToken(null);
    setUser(null);
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
