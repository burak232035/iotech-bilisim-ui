/**
 * AuthContext - User Authentication State Management
 * Handles login, logout, and session persistence
 */

import { createContext, useContext, useState, useEffect } from 'react';
import { StorageService } from '@services/storage.service';
import { DEMO_CREDENTIALS } from '@utils/constants';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for stored user on mount
    const storedUser = StorageService.getUser();
    if (storedUser) {
      setUser(storedUser);
      setIsAuthenticated(true);
    }
    setIsLoading(false);
  }, []);

  const login = async (username, password, rememberMe = false) => {
    // Demo validation (matches existing logic from giris.js)
    if (
      username === DEMO_CREDENTIALS.USERNAME &&
      password === DEMO_CREDENTIALS.PASSWORD
    ) {
      const userData = { username, role: 'admin' };
      setUser(userData);
      setIsAuthenticated(true);

      if (rememberMe) {
        StorageService.setUser(userData);
        StorageService.setRememberMe(true);
      } else {
        StorageService.setRememberMe(false);
      }

      return { success: true };
    }

    return {
      success: false,
      error: 'Hatalı kullanıcı adı veya şifre.'
    };
  };

  const logout = () => {
    setUser(null);
    setIsAuthenticated(false);
    StorageService.clearUser();
  };

  const value = {
    user,
    isAuthenticated,
    isLoading,
    login,
    logout
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
