/**
 * App Component
 * Main application with routing and context providers
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AnimatePresence } from 'framer-motion';

import { MainLayout } from '@components/layout/MainLayout';
import { useAuth } from '@contexts/AuthContext';

// Lazy load pages
const HomePage = lazy(() => import('@pages/HomePage'));
const LoginPage = lazy(() => import('@pages/LoginPage'));
const RegisterPage = lazy(() => import('@pages/RegisterPage'));
const PasswordResetPage = lazy(() => import('@pages/PasswordResetPage'));
const DashboardPage = lazy(() => import('@pages/DashboardPage'));
const AboutPage = lazy(() => import('@pages/AboutPage'));
const ProjectsPage = lazy(() => import('@pages/ProjectsPage'));
const ContactPage = lazy(() => import('@pages/ContactPage'));

// Protected Route wrapper
function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem' }}>
        <div className="loading-spinner"></div>
        <p style={{ marginTop: '1rem' }}>Yükleniyor...</p>
      </div>
    );
  }

  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

// Loading fallback
function LoadingFallback() {
  return (
    <div style={{ textAlign: 'center', padding: '3rem' }}>
      <div className="loading-spinner"></div>
      <p style={{ marginTop: '1rem' }}>Sayfa yükleniyor...</p>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AnimatePresence mode="wait">
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
            {/* Public routes */}
            <Route
              path="/"
              element={
                <MainLayout>
                  <HomePage />
                </MainLayout>
              }
            />

            {/* Public content pages */}
            <Route
              path="/about"
              element={
                <MainLayout>
                  <AboutPage />
                </MainLayout>
              }
            />

            <Route
              path="/projects"
              element={
                <MainLayout>
                  <ProjectsPage />
                </MainLayout>
              }
            />

            <Route
              path="/contact"
              element={
                <MainLayout>
                  <ContactPage />
                </MainLayout>
              }
            />

            <Route
              path="/login"
              element={
                <MainLayout>
                  <LoginPage />
                </MainLayout>
              }
            />

            <Route
              path="/register"
              element={
                <MainLayout>
                  <RegisterPage />
                </MainLayout>
              }
            />

            <Route
              path="/forgot-password"
              element={
                <MainLayout>
                  <PasswordResetPage />
                </MainLayout>
              }
            />

            {/* Protected routes */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <DashboardPage />
                  </MainLayout>
                </ProtectedRoute>
              }
            />

            {/* Catch-all redirect */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AnimatePresence>
    </BrowserRouter>
  );
}

export default App;
