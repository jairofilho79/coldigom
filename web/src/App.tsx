import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { HomePage } from './pages/HomePage';
import { PraiseDetailPage } from './pages/PraiseDetailPage';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="app-shell">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/praise/:id" element={<PraiseDetailPage />} />
          </Routes>
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
