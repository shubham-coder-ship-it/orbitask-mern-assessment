import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../services/api.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/auth/me').then((r) => setUser(r.user)).catch(() => setUser(null)).finally(() => setLoading(false));
    const onUnauthorized = () => setUser(null);
    window.addEventListener('orbitask:unauthorized', onUnauthorized);
    return () => window.removeEventListener('orbitask:unauthorized', onUnauthorized);
  }, []);

  const login = useCallback(async (body) => setUser((await api.post('/auth/login', body)).user), []);
  const register = useCallback(async (body) => setUser((await api.post('/auth/register', body)).user), []);
  const logout = useCallback(async () => {
    try { await api.post('/auth/logout'); } finally { setUser(null); }
  }, []);

  const value = useMemo(() => ({ user, setUser, loading, login, register, logout, isAdmin: user?.role === 'admin' }), [user, loading, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
