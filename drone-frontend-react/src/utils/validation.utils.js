/**
 * Form Validation Utilities
 */

/**
 * Validate email format
 * @param {string} email
 * @returns {boolean}
 */
export function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate password strength
 * @param {string} password
 * @returns {Object} { isValid: boolean, message: string }
 */
export function validatePassword(password) {
  if (!password || password.length < 6) {
    return {
      isValid: false,
      message: 'Şifre en az 6 karakter olmalıdır.'
    };
  }

  return { isValid: true, message: '' };
}

/**
 * Validate username
 * @param {string} username
 * @returns {Object} { isValid: boolean, message: string }
 */
export function validateUsername(username) {
  if (!username || username.trim().length < 3) {
    return {
      isValid: false,
      message: 'Kullanıcı adı en az 3 karakter olmalıdır.'
    };
  }

  return { isValid: true, message: '' };
}

/**
 * Escape HTML to prevent XSS
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[m]));
}
