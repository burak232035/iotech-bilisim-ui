/**
 * ContactPage Component
 * Contact page with email link
 * Ported from iletisim/iletisim.html
 */

import { PageTransition } from '@components/layout/PageTransition';

export default function ContactPage() {
  const handleMailClick = () => {
    const email = 'iotechbilisim@outlook.com';
    const subject = 'Akıllı Kampüs Drone Sistemi Hakkında';
    const body =
      'Merhaba,\n\nAkıllı Kampüs Drone Sistemi ile ilgili iletişime geçmek istiyorum.';

    window.location.href = `mailto:${email}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(body)}`;
  };

  return (
    <PageTransition>
      <div className="page-wrap">
        <section className="contact-card">
          <h1>
            <i className="fas fa-envelope"></i> Bizimle İletişime Geç
          </h1>

          <p className="contact-text">
            Akıllı Kampüs Drone Sistemi hakkında sorularınız, iş birlikleri
            veya teknik geri bildirimleriniz için bizimle iletişime
            geçebilirsiniz.
          </p>

          <div className="contact-info">
            <div>
              <i className="fas fa-at"></i>
              <span>iotechbilisim@outlook.com</span>
            </div>
          </div>

          <button
            className="cta-btn cta-primary"
            onClick={handleMailClick}
            type="button"
          >
            <i className="fas fa-paper-plane"></i>
            Mail Gönder
          </button>
        </section>
      </div>
    </PageTransition>
  );
}
