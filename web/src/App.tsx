import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { HomePage } from './pages/HomePage';
import { PraiseDetailPage } from './pages/PraiseDetailPage';
import { ChordProPage } from './pages/ChordProPage';
import { PraiseMergeSelectPage } from './pages/PraiseMergeSelectPage';
import { PraiseMergeImportPage } from './pages/PraiseMergeImportPage';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="app-shell">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/praise/:praiseId/cifra/:materialId" element={<ChordProPage />} />
            <Route path="/praise/:id/merge/:sourceId" element={<PraiseMergeImportPage />} />
            <Route path="/praise/:id/merge" element={<PraiseMergeSelectPage />} />
            <Route path="/praise/:id" element={<PraiseDetailPage />} />
          </Routes>
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
