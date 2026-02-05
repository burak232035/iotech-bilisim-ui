/**
 * RegisterPage Component
 * Registration page
 */

import { Link } from 'react-router-dom';
import { PageTransition } from '@components/layout/PageTransition';
import { RegisterForm } from '@components/forms/RegisterForm';
import { Card } from '@components/common/Card';

export default function RegisterPage() {
  return (
    <PageTransition>
      <div
        style={{
          maxWidth: '600px',
          margin: '0 auto',
          paddingTop: '2rem'
        }}
      >
        <Card title="Kayıt Ol" icon="fas fa-user-plus" variant="success">
          <RegisterForm />

          <hr />

          <div className="text-center">
            <p className="mb-0">
              <small>
                Zaten hesabınız var mı?{' '}
                <Link to="/login">Giriş Yapın</Link>
              </small>
            </p>
          </div>
        </Card>
      </div>
    </PageTransition>
  );
}
