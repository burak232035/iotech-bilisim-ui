/**
 * LoginPage Component
 * Login page with form - adapted from giris_ekrani/giris.html
 */

import { Link } from 'react-router-dom';
import { PageTransition } from '@components/layout/PageTransition';
import { LoginForm } from '@components/forms/LoginForm';
import { Card } from '@components/common/Card';

export default function LoginPage() {
  return (
    <PageTransition>
      <div
        style={{
          maxWidth: '450px',
          margin: '0 auto',
          paddingTop: '2rem'
        }}
      >
        <Card title="Giriş Yap" icon="fas fa-sign-in-alt" variant="primary">
          <LoginForm />

          <div className="mt-3 text-center">
            <Link to="/forgot-password" className="text-muted">
              <small>Şifremi Unuttum</small>
            </Link>
          </div>

          <hr />

          <div className="text-center">
            <p className="mb-0">
              <small>
                Hesabınız yok mu?{' '}
                <Link to="/register">Kayıt Olun</Link>
              </small>
            </p>
          </div>
        </Card>
      </div>
    </PageTransition>
  );
}
