/**
 * HomePage Component
 * Landing page - adapted from anasayfa/index.html
 */

import { PageTransition } from '@components/layout/PageTransition';

export default function HomePage() {
  return (
    <PageTransition>
      <h1 style={{ marginBottom: '1rem' }}>Akıllı Kampüs Drone Sistemi</h1>

      <p
        style={{
          fontSize: '1.05rem',
          lineHeight: '1.7',
          maxWidth: '800px'
        }}
      >
        Bu platform, üniversite kampüslerinde otonom drone sistemleri kullanılarak
        <strong> alan analizi, çevresel durum tespiti ve atık sınıflandırması</strong>
        gerçekleştirmek amacıyla geliştirilmiştir.
      </p>

      <div className="feature-grid">
        <div className="feature-card">
          <h5>
            <i className="fas fa-map-marked-alt"></i> Haritalama
          </h5>
          <p>
            Kampüs alanı drone ile taranır ve gerçek zamanlı olarak analiz
            edilir.
          </p>
        </div>

        <div className="feature-card">
          <h5>
            <i className="fas fa-trash"></i> Atık Analizi
          </h5>
          <p>
            Metal, plastik, cam ve organik atıklar yapay zekâ ile
            sınıflandırılır.
          </p>
        </div>

        <div className="feature-card">
          <h5>
            <i className="fas fa-battery-half"></i> Drone Telemetrisi
          </h5>
          <p>Şarj, konum ve görev durumu anlık olarak izlenir.</p>
        </div>

        <div className="feature-card">
          <h5>
            <i className="fas fa-robot"></i> Otonom Görevler
          </h5>
          <p>
            Alan keşfi, tarama ve istasyona dönüş senaryoları desteklenir.
          </p>
        </div>
      </div>
    </PageTransition>
  );
}
