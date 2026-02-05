/**
 * PasswordResetPage Component
 * Password reset request page
 */

import { Link } from 'react-router-dom';
import { PageTransition } from '@components/layout/PageTransition';
import { PasswordResetForm } from '@components/forms/PasswordResetForm';
import { Card } from '@components/common/Card';

export default function PasswordResetPage() {
  return (
    <PageTransition>
      <div
        style={{
          maxWidth: '500px',
          margin: '0 auto',
          paddingTop: '2rem'
        }}
      >
        <Card
          title="Şifremi Unuttum"
          icon="fas fa-key"
          variant="warning"
        >
          <PasswordResetForm />

          <hr />

          <div className="text-center">
            <Link to="/login" className="btn btn-link">
              <i className="fas fa-arrow-left"></i> Giriş sayfasına dön
            </Link>
          </div>
        </Card>
      </div>
    </PageTransition>
  );
}
