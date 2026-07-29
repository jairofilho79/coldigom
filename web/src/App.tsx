import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { HomePage } from './pages/HomePage';
import { PraiseDetailPage } from './pages/PraiseDetailPage';
import { PraiseMergeSelectPage } from './pages/PraiseMergeSelectPage';
import { PraiseMergeImportPage } from './pages/PraiseMergeImportPage';
import { RawChordProListPage } from './pages/RawChordProListPage';
import { RawChordProDetailPage } from './pages/RawChordProDetailPage';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="app-shell">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/raw-chordPro" element={<RawChordProListPage />} />
            <Route path="/raw-chordPro/:id" element={<RawChordProDetailPage />} />
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
