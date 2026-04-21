import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { PraiseDetailPage } from './pages/PraiseDetailPage';

function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/praise/:id" element={<PraiseDetailPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
