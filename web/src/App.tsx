import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { PraiseDetailPage } from './pages/PraiseDetailPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/praise/:id" element={<PraiseDetailPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
