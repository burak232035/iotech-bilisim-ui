/**
 * AboutPage Component
 * About page with project overview, mission, vision, and roadmap
 * Ported from hakkimizda_ekrani/hakkimizda.html
 */

import { PageTransition } from '@components/layout/PageTransition';
import { Link } from 'react-router-dom';

export default function AboutPage() {
  return (
    <PageTransition>
      <div className="page-wrap">
        <h1 style={{ margin: '0 0 1rem 0', color: '#0b0f20' }}>Hakkımızda</h1>

        {/* Project Overview */}
        <section className="section-card">
          <h2>
            <i className="fas fa-info-circle"></i> Proje Özeti
          </h2>
          <p>
            <strong>Akıllı Kampüs Drone Sistemi</strong>, kampüs içinde otonom
            drone görevleri ile çevresel gözlem, alan analizi ve atık
            sınıflandırmasını destekleyen bir izleme platformudur. Haritalama
            katmanında Leaflet kullanılır; tespit/analiz katmanında görüntü
            işleme modelleri ile veri üretimi hedeflenir.
          </p>
        </section>

        {/* Mission & Vision */}
        <div className="two-col">
          <section className="section-card">
            <h2>
              <i className="fas fa-bullseye"></i> Misyon
            </h2>
            <ul>
              <li>
                Kampüs yaşam kalitesini artıracak çevresel analizler üretmek.
              </li>
              <li>
                Drone telemetrisi ve görüntü analiziyle sürdürülebilir veri
                toplamak.
              </li>
              <li>
                Atık yönetimi ve alan kullanımı için ölçülebilir metrikler
                sunmak.
              </li>
            </ul>
          </section>

          <section className="section-card">
            <h2>
              <i className="fas fa-eye"></i> Vizyon
            </h2>
            <ul>
              <li>
                Akıllı kampüsleri veri odaklı karar mekanizmalarıyla
                güçlendirmek.
              </li>
              <li>
                Otonom görev senaryolarını gerçek zamanlı haritalama ile
                birleştirmek.
              </li>
              <li>
                Farklı kampüslere kolay uyarlanabilir bir platform standardı
                oluşturmak.
              </li>
            </ul>
          </section>
        </div>

        {/* What We Do */}
        <section className="section-card">
          <h2>
            <i className="fas fa-cogs"></i> Neler Yapıyoruz?
          </h2>
          <ul>
            <li>
              <strong>Harita Tabanlı İzleme:</strong> Drone konumu ve görev
              durumunu harita üzerinde göstermek.
            </li>
            <li>
              <strong>Telemetri Takibi:</strong> Şarj, görev modu ve tarama
              yüzdesi gibi verileri panelde sunmak.
            </li>
            <li>
              <strong>Alan Analizi:</strong> Yeşil/beton oranı gibi kampüs
              metrikleri üretmek.
            </li>
            <li>
              <strong>Atık Sınıflandırma:</strong> Metal, plastik, cam vb.
              sınıfları yüzdesel raporlamak.
            </li>
          </ul>
        </section>

        {/* Technologies */}
        <section className="section-card">
          <h2>
            <i className="fas fa-layer-group"></i> Kullanılan Teknolojiler
          </h2>
          <div>
            <span className="badge">React + Vite</span>
            <span className="badge">AdminLTE</span>
            <span className="badge">Leaflet Maps</span>
            <span className="badge">Socket.IO</span>
            <span className="badge">Node.js + Express</span>
            <span className="badge">PostgreSQL</span>
            <span className="badge">Drone Telemetri</span>
            <span className="badge">Görüntü İşleme</span>
          </div>
          <p className="note">
            Modern web teknolojileri ile geliştirilmiş, ölçeklenebilir ve
            genişletilebilir bir platform.
          </p>
        </section>

        {/* Roadmap */}
        <section className="section-card">
          <h2>
            <i className="fas fa-road"></i> Yol Haritası
          </h2>
          <ol>
            <li>
              <strong>Arayüz Tamamlama:</strong> Sayfalar (Ana Sayfa,
              Hakkımızda, Harita, İletişim).
            </li>
            <li>
              <strong>Yetkilendirme:</strong> Giriş yaptıktan sonra dashboard
              erişimi.
            </li>
            <li>
              <strong>Gerçek Telemetri:</strong> Drone'dan veri çekme (SDK /
              server).
            </li>
            <li>
              <strong>Analiz & Raporlama:</strong> Atık/alan metriklerinin
              kaydı ve grafikleri.
            </li>
          </ol>

          <div className="cta-row">
            <Link to="/dashboard" className="cta-btn cta-primary">
              <i className="fas fa-tachometer-alt"></i> Dashboard'a Git
            </Link>
            <Link to="/contact" className="cta-btn cta-secondary">
              <i className="fas fa-envelope"></i> İletişim
            </Link>
          </div>
        </section>
      </div>
    </PageTransition>
  );
}
