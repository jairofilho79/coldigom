import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/Button';
import { LogOut, Music } from 'lucide-react';

export const Header = () => {
  const { user, logout, isAuthenticated } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (!isAuthenticated) return null;

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link to="/" className="flex items-center space-x-2">
            <Music className="w-6 h-6 text-blue-600" />
            <span className="text-xl font-bold text-gray-900">Praise Manager</span>
          </Link>
          <nav className="flex items-center space-x-4">
            <Link
              to="/praises"
              className="text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium"
            >
              Praises
            </Link>
            <Link
              to="/tags"
              className="text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium"
            >
              Tags
            </Link>
            <Link
              to="/materials"
              className="text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium"
            >
              Materiais
            </Link>
            <Link
              to="/material-kinds"
              className="text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium"
            >
              Tipos de Material
            </Link>
            <div className="flex items-center space-x-3">
              <span className="text-sm text-gray-600">{user?.username}</span>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                <LogOut className="w-4 h-4 mr-1" />
                Sair
              </Button>
            </div>
          </nav>
        </div>
      </div>
    </header>
  );
};
