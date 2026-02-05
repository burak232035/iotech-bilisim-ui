/**
 * PasswordResetForm Component
 * Password reset request form
 */

import { useState } from 'react';
import { isValidEmail } from '@utils/validation.utils';

export function PasswordResetForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleChange = (e) => {
    setEmail(e.target.value);
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!email.trim()) {
      setError('E-posta adresi zorunludur');
      return;
    }

    if (!isValidEmail(email)) {
      setError('Geçerli bir e-posta adresi girin');
      return;
    }

    setIsSubmitting(true);
    setError('');

    // TODO: Backend'e şifre sıfırlama isteği gönderilecek
    // Şimdilik 2 saniye bekleyip başarılı kabul ediyoruz
    setTimeout(() => {
      setIsSubmitting(false);
      setIsSuccess(true);
    }, 2000);
  };

  if (isSuccess) {
    return (
      <div className="alert alert-success" role="alert">
        <i className="fas fa-check-circle"></i>{' '}
        <strong>Başarılı!</strong>
        <p className="mb-0 mt-2">
          Şifre sıfırlama bağlantısı e-posta adresinize gönderildi.
          Lütfen gelen kutunuzu kontrol edin.
        </p>
        <small className="text-muted">
          (Demo mode - gerçek e-posta gönderilmedi)
        </small>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="password-reset-form">
      <p className="text-muted mb-3">
        E-posta adresinizi girin, size şifre sıfırlama bağlantısı
        gönderelim.
      </p>

      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}

      <div className="form-group">
        <label htmlFor="email">E-posta Adresi</label>
        <input
          type="email"
          className={`form-control ${error ? 'is-invalid' : ''}`}
          id="email"
          name="email"
          value={email}
          onChange={handleChange}
          placeholder="ornek@email.com"
          disabled={isSubmitting}
        />
        {error && <div className="invalid-feedback">{error}</div>}
      </div>

      <button
        type="submit"
        className="btn btn-warning btn-block"
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <>
            <span className="loading-spinner"></span> Gönderiliyor...
          </>
        ) : (
          'Şifre Sıfırlama Bağlantısı Gönder'
        )}
      </button>
    </form>
  );
}
