import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';


import LoginPage          from './pages/LoginPage';
import RegisterPage       from './pages/RegisterPage';
import DashboardPage      from './pages/DashboardPage';
import DocumentsPage      from './pages/DocumentsPage';
import DocumentDetailPage from './pages/DocumentDetailPage';
import UploadPage         from './pages/UploadPage';

// Route guard — redirect to /login if not authenticated
function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div style={{
        display: 'flex', height: '100vh',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <div className="spinner spinner-lg" />
      </div>
    );
  }
  return user ? children : <Navigate to="/login" replace />;
}

// Redirect logged-in users away from auth pages
function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Navigate to="/dashboard" replace /> : children;
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public */}
            <Route path="/login"    element={<PublicRoute><LoginPage /></PublicRoute>} />
            <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />

            {/* Protected */}
            <Route path="/dashboard"         element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
            <Route path="/documents"         element={<PrivateRoute><DocumentsPage /></PrivateRoute>} />
            <Route path="/documents/:id"     element={<PrivateRoute><DocumentDetailPage /></PrivateRoute>} />
            <Route path="/upload"            element={<PrivateRoute><UploadPage /></PrivateRoute>} />

            {/* Default */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>

          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: 'var(--bg-2)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                fontSize: '13.5px',
              },
            }}
          />
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}

