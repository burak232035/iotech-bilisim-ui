/**
 * LoginForm Component
 * Login form with validation - adapted from giris.js
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@contexts/AuthContext';
import { validateUsername, validatePassword } from '@utils/validation.utils';

export function LoginForm() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [formData, setFormData] = useState({
    username: '',
    password: '',
    rememberMe: false
  });

  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loginError, setLoginError] = useState('');

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    // Clear error for this field
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
    setLoginError('');
  };

  const validate = () => {
    const newErrors = {};

    const usernameValidation = validateUsername(formData.username);
    if (!usernameValidation.isValid) {
      newErrors.username = usernameValidation.message;
    }

    const passwordValidation = validatePassword(formData.password);
    if (!passwordValidation.isValid) {
      newErrors.password = passwordValidation.message;
    }

    return newErrors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsSubmitting(true);
    setLoginError('');

    try {
      const result = await login(
        formData.username,
        formData.password,
        formData.rememberMe
      );

      if (result.success) {
        navigate('/dashboard');
      } else {
        setLoginError(result.error || 'Giriş başarısız');
      }
    } catch (error) {
      setLoginError('Beklenmeyen bir hata oluştu');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="login-form">
      {loginError && (
        <div className="alert alert-danger" role="alert">
          {loginError}
        </div>
      )}

      <div className="form-group">
        <label htmlFor="username">Kullanıcı Adı</label>
        <input
          type="text"
          className={`form-control ${errors.username ? 'is-invalid' : ''}`}
          id="username"
          name="username"
          value={formData.username}
          onChange={handleChange}
          placeholder="Kullanıcı adınızı girin"
          disabled={isSubmitting}
        />
        {errors.username && (
          <div className="invalid-feedback">{errors.username}</div>
        )}
      </div>

      <div className="form-group">
        <label htmlFor="password">Şifre</label>
        <input
          type="password"
          className={`form-control ${errors.password ? 'is-invalid' : ''}`}
          id="password"
          name="password"
          value={formData.password}
          onChange={handleChange}
          placeholder="Şifrenizi girin"
          disabled={isSubmitting}
        />
        {errors.password && (
          <div className="invalid-feedback">{errors.password}</div>
        )}
      </div>

      <div className="form-group form-check">
        <input
          type="checkbox"
          className="form-check-input"
          id="rememberMe"
          name="rememberMe"
          checked={formData.rememberMe}
          onChange={handleChange}
          disabled={isSubmitting}
        />
        <label className="form-check-label" htmlFor="rememberMe">
          Beni Hatırla
        </label>
      </div>

      <button
        type="submit"
        className="btn btn-primary btn-block"
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <>
            <span className="loading-spinner"></span> Giriş yapılıyor...
          </>
        ) : (
          'Giriş Yap'
        )}
      </button>

      <div className="mt-3 text-center">
        <small className="text-muted">
          Demo: Kullanıcı adı: <strong>admin</strong>, Şifre:{' '}
          <strong>admin123</strong>
        </small>
      </div>
    </form>
  );
}
