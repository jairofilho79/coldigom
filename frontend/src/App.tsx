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
import { MaterialKindList } from '@/pages/MaterialKinds/MaterialKindList';
import { MaterialTypeList } from '@/pages/MaterialTypes/MaterialTypeList';
import { TranslationList } from '@/pages/Translations/TranslationList';
import { UserPreferences } from '@/pages/UserPreferences/UserPreferences';
import { PraiseListList } from '@/pages/PraiseLists/PraiseListList';
import { PraiseListDetailPage } from '@/pages/PraiseLists/PraiseListDetail';
import { PraiseListCreate } from '@/pages/PraiseLists/PraiseListCreate';
import { PraiseListEdit } from '@/pages/PraiseLists/PraiseListEdit';
import { RoomListPage } from '@/pages/Rooms/RoomListPage';
import { RoomDetailPage } from '@/pages/Rooms/RoomDetailPage';
import { RoomCreatePage } from '@/pages/Rooms/RoomCreatePage';
import { useAuthStore } from '@/store/authStore';

function App() {
  const { isAuthenticated } = useAuthStore();

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
            path="/material-kinds"
            element={
              <ProtectedRoute>
                <Layout>
                  <MaterialKindList />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/material-types"
            element={
              <ProtectedRoute>
                <Layout>
                  <MaterialTypeList />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/translations"
            element={
              <ProtectedRoute>
                <Layout>
                  <TranslationList />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/user-preferences"
            element={
              <ProtectedRoute>
                <Layout>
                  <UserPreferences />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/praise-lists"
            element={
              <ProtectedRoute>
                <Layout>
                  <PraiseListList />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/praise-lists/create"
            element={
              <ProtectedRoute>
                <Layout>
                  <PraiseListCreate />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/praise-lists/:id"
            element={
              <ProtectedRoute>
                <Layout>
                  <PraiseListDetailPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/praise-lists/:id/edit"
            element={
              <ProtectedRoute>
                <Layout>
                  <PraiseListEdit />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/rooms"
            element={
              <ProtectedRoute>
                <Layout>
                  <RoomListPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/rooms/create"
            element={
              <ProtectedRoute>
                <Layout>
                  <RoomCreatePage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/rooms/:id"
            element={
              <ProtectedRoute>
                <Layout>
                  <RoomDetailPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/rooms/code/:code"
            element={
              <ProtectedRoute>
                <Layout>
                  <RoomDetailPage />
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
