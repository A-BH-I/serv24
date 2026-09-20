// Auth context and helpers for managing user sessions

import { createContext, useContext } from 'react';

export interface User {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  role: 'client' | 'provider' | 'admin';
  profile_picture?: string;
  is_verified: boolean;
}

export interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  updateUser: (user: Partial<User>) => void;
}

export const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}

export function getStoredAuth(): { token: string | null; user: User | null } {
  const token = localStorage.getItem('auth_token');
  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : null;
  return { token, user };
}

export function setStoredAuth(token: string, user: User) {
  localStorage.setItem('auth_token', token);
  localStorage.setItem('user', JSON.stringify(user));
}

export function clearStoredAuth() {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('user');
}
