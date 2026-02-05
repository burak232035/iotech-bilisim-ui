/**
 * LocalStorage Service
 * Abstraction for browser storage operations
 */

import { STORAGE_KEYS } from '@utils/constants';

class StorageServiceClass {
  /**
   * Get user from localStorage
   * @returns {Object|null}
   */
  getUser() {
    try {
      const userJson = localStorage.getItem(STORAGE_KEYS.USER);
      return userJson ? JSON.parse(userJson) : null;
    } catch (error) {
      console.error('Error reading user from localStorage:', error);
      return null;
    }
  }

  /**
   * Set user in localStorage
   * @param {Object} user
   */
  setUser(user) {
    try {
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
    } catch (error) {
      console.error('Error saving user to localStorage:', error);
    }
  }

  /**
   * Clear user from localStorage
   */
  clearUser() {
    try {
      localStorage.removeItem(STORAGE_KEYS.USER);
    } catch (error) {
      console.error('Error clearing user from localStorage:', error);
    }
  }

  /**
   * Get remember me preference
   * @returns {boolean}
   */
  getRememberMe() {
    return localStorage.getItem(STORAGE_KEYS.REMEMBER_ME) === 'true';
  }

  /**
   * Set remember me preference
   * @param {boolean} value
   */
  setRememberMe(value) {
    localStorage.setItem(STORAGE_KEYS.REMEMBER_ME, String(value));
  }
}

export const StorageService = new StorageServiceClass();
