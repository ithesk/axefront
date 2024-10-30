import type { AppProps } from 'next/app';
import { AuthProvider } from '../contexts/AuthContext';
import { ProtectedRoute } from '../components/auth/ProtectedRoute';
import '../styles/globals.css';

export default function App({ Component, pageProps, router }: AppProps) {
  // Lista de rutas públicas que no requieren autenticación
  const publicRoutes = ['/auth'];

  return (
    <AuthProvider>
      {publicRoutes.includes(router.pathname) ? (
        <Component {...pageProps} />
      ) : (
        <ProtectedRoute>
          <Component {...pageProps} />
        </ProtectedRoute>
      )}
    </AuthProvider>
  );
}
