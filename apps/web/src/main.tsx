import '@fontsource-variable/inter';
import './styles.css';
import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { Layout } from './components/Layout';
import { ButtonLink, Container } from './components/ui';
import { PreferencesProvider, useT } from './lib/preferences';
import { queryClient } from './lib/queries';
import { ToastProvider } from './lib/toast';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { HomePage } from './pages/HomePage';
import { ProductPage } from './pages/ProductPage';
import { SettingsPage } from './pages/SettingsPage';

function NotFoundPage() {
  const t = useT();
  return (
    <Container className="flex flex-col items-center py-20 text-center">
      <p className="display-tight text-8xl font-medium text-accent-display">404</p>
      <h1 className="mt-6 text-3xl font-medium tracking-tight">{t('notFoundTitle')}</h1>
      <p className="mt-3 text-muted">{t('notFoundBody')}</p>
      <ButtonLink to="/" className="mt-8">
        {t('goHome')}
      </ButtonLink>
    </Container>
  );
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/product/:id', element: <ProductPage /> },
      { path: '/dashboard', element: <DashboardPage /> },
      { path: '/login', element: <AuthPage key="login" mode="login" /> },
      { path: '/register', element: <AuthPage key="register" mode="register" /> },
      { path: '/settings', element: <SettingsPage /> },
      // Old routes from the previous app.
      { path: '/wishlist', element: <DashboardPage /> },
      { path: '/search', element: <HomePage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <PreferencesProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </PreferencesProvider>
    </QueryClientProvider>
  </StrictMode>,
);
