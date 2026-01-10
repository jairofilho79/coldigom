import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { Layout } from '@/components/layout/Layout';
import { Login } from '@/pages/Login';
import { Register } from '@/pages/Register';
import { Dashboard } from '@/pages/Dashboard';
import { PraiseList } from '@/pages/Praises/PraiseList';
import { PraiseDetail } from '@/pages/Praises/PraiseDetail';
import { PraiseCreate } from '@/pages/Praises/PraiseCreate';
import { PraiseEdit } from '@/pages/Praises/PraiseEdit';
import { TagList } from '@/pages/Tags/TagList';
import { MaterialList } from '@/pages/Materials/MaterialList';
import { MaterialUploadPage } from '@/pages/Materials/MaterialUpload';
import { MaterialCreate } from '@/pages/Materials/MaterialCreate';
import { MaterialKindList } from '@/pages/MaterialKinds/MaterialKindList';
import { useAuthStore } from '@/store/authStore';
import { useEffect } from 'react';

function App() {
  const { checkAuth, isAuthenticated } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <Login />} />
          <Route path="/register" element={isAuthenticated ? <Navigate to="/" replace /> : <Register />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout>
                  <Dashboard />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/praises"
            element={
              <ProtectedRoute>
                <Layout>
                  <PraiseList />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/praises/create"
            element={
              <ProtectedRoute>
                <Layout>
                  <PraiseCreate />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/praises/:id"
            element={
              <ProtectedRoute>
                <Layout>
                  <PraiseDetail />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/praises/:id/edit"
            element={
              <ProtectedRoute>
                <Layout>
                  <PraiseEdit />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/tags"
            element={
              <ProtectedRoute>
                <Layout>
                  <TagList />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/materials"
            element={
              <ProtectedRoute>
                <Layout>
                  <MaterialList />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/materials/upload"
            element={
              <ProtectedRoute>
                <Layout>
                  <MaterialUploadPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/materials/create"
            element={
              <ProtectedRoute>
                <Layout>
                  <MaterialCreate />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/material-kinds"
            element={
              <ProtectedRoute>
                <Layout>
                  <MaterialKindList />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
