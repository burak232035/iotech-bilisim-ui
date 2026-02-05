/**
 * RegisterForm Component
 * Registration form with validation
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  validateUsername,
  validatePassword,
  isValidEmail
} from '@utils/validation.utils';

export function RegisterForm() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    username: '',
    password: '',
    confirmPassword: ''
  });

  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value
    }));
    // Clear error for this field
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  const validate = () => {
    const newErrors = {};

    if (!formData.firstName.trim()) {
      newErrors.firstName = 'Ad alanı zorunludur';
    }

    if (!formData.lastName.trim()) {
      newErrors.lastName = 'Soyad alanı zorunludur';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'E-posta alanı zorunludur';
    } else if (!isValidEmail(formData.email)) {
      newErrors.email = 'Geçerli bir e-posta adresi girin';
    }

    const usernameValidation = validateUsername(formData.username);
    if (!usernameValidation.isValid) {
      newErrors.username = usernameValidation.message;
    }

    const passwordValidation = validatePassword(formData.password);
    if (!passwordValidation.isValid) {
      newErrors.password = passwordValidation.message;
    }

    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Şifreler eşleşmiyor';
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

    // TODO: Backend'e kayıt isteği gönderilecek
    // Şimdilik 2 saniye bekleyip başarılı kabul ediyoruz
    setTimeout(() => {
      alert('Kayıt başarılı! (Demo mode - backend bağlı değil)');
      navigate('/login');
    }, 2000);
  };

  return (
    <form onSubmit={handleSubmit} className="register-form">
      <div className="row">
        <div className="col-md-6">
          <div className="form-group">
            <label htmlFor="firstName">Ad *</label>
            <input
              type="text"
              className={`form-control ${errors.firstName ? 'is-invalid' : ''}`}
              id="firstName"
              name="firstName"
              value={formData.firstName}
              onChange={handleChange}
              disabled={isSubmitting}
            />
            {errors.firstName && (
              <div className="invalid-feedback">{errors.firstName}</div>
            )}
          </div>
        </div>

        <div className="col-md-6">
          <div className="form-group">
            <label htmlFor="lastName">Soyad *</label>
            <input
              type="text"
              className={`form-control ${errors.lastName ? 'is-invalid' : ''}`}
              id="lastName"
              name="lastName"
              value={formData.lastName}
              onChange={handleChange}
              disabled={isSubmitting}
            />
            {errors.lastName && (
              <div className="invalid-feedback">{errors.lastName}</div>
            )}
          </div>
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="email">E-posta *</label>
        <input
          type="email"
          className={`form-control ${errors.email ? 'is-invalid' : ''}`}
          id="email"
          name="email"
          value={formData.email}
          onChange={handleChange}
          disabled={isSubmitting}
        />
        {errors.email && (
          <div className="invalid-feedback">{errors.email}</div>
        )}
      </div>

      <div className="form-group">
        <label htmlFor="username">Kullanıcı Adı *</label>
        <input
          type="text"
          className={`form-control ${errors.username ? 'is-invalid' : ''}`}
          id="username"
          name="username"
          value={formData.username}
          onChange={handleChange}
          disabled={isSubmitting}
        />
        {errors.username && (
          <div className="invalid-feedback">{errors.username}</div>
        )}
      </div>

      <div className="form-group">
        <label htmlFor="password">Şifre *</label>
        <input
          type="password"
          className={`form-control ${errors.password ? 'is-invalid' : ''}`}
          id="password"
          name="password"
          value={formData.password}
          onChange={handleChange}
          disabled={isSubmitting}
        />
        {errors.password && (
          <div className="invalid-feedback">{errors.password}</div>
        )}
      </div>

      <div className="form-group">
        <label htmlFor="confirmPassword">Şifre Tekrar *</label>
        <input
          type="password"
          className={`form-control ${
            errors.confirmPassword ? 'is-invalid' : ''
          }`}
          id="confirmPassword"
          name="confirmPassword"
          value={formData.confirmPassword}
          onChange={handleChange}
          disabled={isSubmitting}
        />
        {errors.confirmPassword && (
          <div className="invalid-feedback">{errors.confirmPassword}</div>
        )}
      </div>

      <button
        type="submit"
        className="btn btn-success btn-block"
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <>
            <span className="loading-spinner"></span> Kaydediliyor...
          </>
        ) : (
          'Kayıt Ol'
        )}
      </button>
    </form>
  );
}
