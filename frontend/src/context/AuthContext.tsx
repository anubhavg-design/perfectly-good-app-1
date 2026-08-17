import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authApi, loadToken, setToken } from '../api/client';
import { registerForPushNotifications, savePushToken } from '../utils/notifications';

export interface User {
  user_id: string;
  email: string;
  name: string;
  role: 'user' | 'vendor' | 'admin' | 'vendor_staff';
  picture: string | null;
  location: any;
  created_at: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  appleLogin: (identityToken: string, name?: string, email?: string) => Promise<User>;
  register: (name: string, email: string, phone: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

async function tryRegisterPush(userId: string) {
  try {
    const token = await registerForPushNotifications();
    if (token && userId) {
      await savePushToken(userId, token);
    }
  } catch (err) {
    console.log('Push registration skipped:', err);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const userData = await authApi.me();
      setUser(userData);
      await AsyncStorage.setItem('user', JSON.stringify(userData));
      tryRegisterPush(userData.user_id);
    } catch {
      setUser(null);
      await AsyncStorage.removeItem('user');
      await setToken(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await loadToken();
        const cached = await AsyncStorage.getItem('user');
        if (cached) {
          setUser(JSON.parse(cached));
        }
        await refreshUser();
      } catch {
        // Not logged in
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async (email: string, password: string) => {
    const userData = await authApi.login({ email, password });
    if (userData?.access_token) {
      await setToken(userData.access_token);
    }
    setUser(userData);
    await AsyncStorage.setItem('user', JSON.stringify(userData));
    tryRegisterPush(userData.user_id);
    return userData;
  };

  const appleLogin = async (identityToken: string, name?: string, email?: string) => {
    const userData = await authApi.apple({ identity_token: identityToken, name, email });
    if (userData?.access_token) {
      await setToken(userData.access_token);
    }
    setUser(userData);
    await AsyncStorage.setItem('user', JSON.stringify(userData));
    tryRegisterPush(userData.user_id);
    return userData;
  };

  const register = async (name: string, email: string, phone: string, password: string) => {
    const userData = await authApi.register({ name, email, phone, password });
    if (userData?.access_token) {
      await setToken(userData.access_token);
    }
    setUser(userData);
    await AsyncStorage.setItem('user', JSON.stringify(userData));
    tryRegisterPush(userData.user_id);
    return userData;
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch {}
    setUser(null);
    await AsyncStorage.removeItem('user');
    await setToken(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, appleLogin, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
