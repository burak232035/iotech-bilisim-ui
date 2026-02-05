/**
 * Header Component
 * Navigation bar - adapted from anasayfa/index.html lines 18-31
 */

import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@contexts/AuthContext';

export function Header() {
  const location = useLocation();
  const { isAuthenticated, logout } = useAuth();

  const isActive = (path) => location.pathname === path;

  return (
    <header className="header">
      <div className="logo-box">
        <Link to="/" className="logo-title">
          Drone Sistemi
        </Link>
      </div>
      <nav className="nav">
        <ul className="nav-list">
          <li>
            <Link
              to="/"
              className={isActive('/') ? 'active' : ''}
            >
              Ana Sayfa
            </Link>
          </li>
          <li>
            <Link
              to="/about"
              className={isActive('/about') ? 'active' : ''}
            >
              Hakkımızda
            </Link>
          </li>
          <li>
            <Link
              to="/projects"
              className={isActive('/projects') ? 'active' : ''}
            >
              Projeler
            </Link>
          </li>
          <li>
            <Link
              to="/contact"
              className={isActive('/contact') ? 'active' : ''}
            >
              İletişim
            </Link>
          </li>
          {isAuthenticated ? (
            <>
              <li>
                <Link
                  to="/dashboard"
                  className={isActive('/dashboard') ? 'active' : ''}
                >
                  Dashboard
                </Link>
              </li>
              <li>
                <button
                  onClick={logout}
                  className="logout-btn"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'inherit',
                    cursor: 'pointer',
                    fontSize: 'inherit'
                  }}
                >
                  Çıkış
                </button>
              </li>
            </>
          ) : (
            <li>
              <Link
                to="/login"
                className={isActive('/login') ? 'active' : ''}
              >
                Giriş
              </Link>
            </li>
          )}
        </ul>
      </nav>
    </header>
  );
}
