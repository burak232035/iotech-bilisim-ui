/**
 * ProjectsPage Component
 * Projects showcase page
 * Ported from projeler/projeler.html
 */

import { PageTransition } from '@components/layout/PageTransition';
import { Link } from 'react-router-dom';

export default function ProjectsPage() {
  return (
    <PageTransition>
      <div className="page-wrap">
        {/* Project Hero */}
        <section className="project-hero">
          <h1 className="project-title">
            <i className="fas fa-drone"></i>
            Akıllı Kampüs Drone Sistemi
          </h1>
          <p className="project-subtitle">
            Bu proje; kampüs içinde otonom drone görevleriyle{' '}
            <strong>alan keşfi</strong>, <strong>alan tarama</strong>,{' '}
            <strong>telemetri takibi</strong> ve{' '}
            <strong>atık/alan analizi</strong> üretmek için tasarlanmış web
            tabanlı bir panel sunar. Harita katmanında Leaflet kullanılarak
            konum ve görev verileri görselleştirilir.
          </p>

          <div style={{ marginTop: '1rem' }}>
            <span className="tag">AdminLTE</span>
            <span className="tag">Leaflet Maps</span>
            <span className="tag">Telemetri</span>
            <span className="tag">Atık Sınıflandırma</span>
            <span className="tag">Alan Analizi</span>
          </div>

          <div className="cta-row">
            <Link to="/dashboard" className="cta-btn cta-primary">
              <i className="fas fa-tachometer-alt"></i>
              Dashboard'a Git
            </Link>
            <Link to="/about" className="cta-btn cta-secondary">
              <i className="fas fa-info-circle"></i>
              Hakkımızda
            </Link>
          </div>
        </section>

        {/* Features Grid */}
        <div className="grid">
          <section className="card-box">
            <h3>
              <i className="fas fa-map-marked-alt"></i> Harita & Konum
            </h3>
            <p>
              Drone konumu kampüs üzerinde gösterilir. Görev sırasında rota ve
              kritik noktalar işaretlenebilir.
            </p>
          </section>

          <section className="card-box">
            <h3>
              <i className="fas fa-battery-half"></i> Telemetri İzleme
            </h3>
            <p>
              Şarj durumu, alan tarama yüzdesi ve görev modu gibi veriler panel
              üzerinden takip edilir.
            </p>
          </section>

          <section className="card-box">
            <h3>
              <i className="fas fa-leaf"></i> Yeşil / Beton Analizi
            </h3>
            <p>
              Kampüs alanı için yeşil ve beton yüzdeleri raporlanır. Zaman
              içinde değişim takibi yapılabilir.
            </p>
          </section>

          <section className="card-box">
            <h3>
              <i className="fas fa-trash"></i> Atık Sınıfları
            </h3>
            <p>
              Metal, karton, kağıt, cam, organik, geri dönüştürülemez ve
              plastik sınıfları yüzdesel olarak raporlanır.
            </p>
          </section>
        </div>

        {/* Modules */}
        <section className="card-box" style={{ marginTop: '1.2rem' }}>
          <h3>
            <i className="fas fa-sitemap"></i> Modüller
          </h3>
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            <li>Dashboard arayüzü (AdminLTE tabanlı)</li>
            <li>Leaflet harita entegrasyonu</li>
            <li>
              Görev aksiyonları (keşif, tarama, istasyona dönüş, manuel kontrol)
            </li>
            <li>Atık ve alan analizi raporlama ekranları</li>
            <li>Socket.IO ile gerçek zamanlı veri akışı</li>
            <li>PostgreSQL veritabanı ile alan ve session yönetimi</li>
          </ul>
        </section>
      </div>
    </PageTransition>
  );
}
