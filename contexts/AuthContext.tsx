import { createContext, useContext, useEffect, useState } from 'react';
import { pb } from '../lib/pocketbase';
import type PocketBase from 'pocketbase';

interface AuthUser {
  id: string;
  email: string;
  username: string;
  created: string;
  updated: string;
  verified: boolean;
  collectionId: string;
  collectionName: string;
}

interface AuthContextType {
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  register: (email: string, password: string, passwordConfirm: string) => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if user is logged in
    const authData = pb.authStore.model;
    if (authData) {
      const userData: AuthUser = {
        id: authData.id,
        email: authData.email as string,
        username: authData.username as string,
        created: authData.created,
        updated: authData.updated,
        verified: authData.verified as boolean,
        collectionId: authData.collectionId,
        collectionName: authData.collectionName,
      };
      setUser(userData);
    }
    setIsLoading(false);

    // Subscribe to auth state changes
    pb.authStore.onChange((token, model) => {
      if (model) {
        const userData: AuthUser = {
          id: model.id,
          email: model.email as string,
          username: model.username as string,
          created: model.created,
          updated: model.updated,
          verified: model.verified as boolean,
          collectionId: model.collectionId,
          collectionName: model.collectionName,
        };
        setUser(userData);
      } else {
        setUser(null);
      }
    });
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const authData = await pb.collection('users').authWithPassword(email, password);
      const userData: AuthUser = {
        id: authData.record.id,
        email: authData.record.email,
        username: authData.record.username,
        created: authData.record.created,
        updated: authData.record.updated,
        verified: authData.record.verified,
        collectionId: authData.record.collectionId,
        collectionName: authData.record.collectionName,
      };
      setUser(userData);
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  const register = async (email: string, password: string, passwordConfirm: string) => {
    try {
      const data = {
        email,
        password,
        passwordConfirm,
        username: email.split('@')[0], // Crear un username basado en el email
      };
      await pb.collection('users').create(data);
      // Auto login after registration
      await login(email, password);
    } catch (error) {
      console.error('Registration error:', error);
      throw error;
    }
  };

  const logout = () => {
    pb.authStore.clear();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, register, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
