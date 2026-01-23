import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/Button';
import { LanguageSelector } from '@/components/i18n/LanguageSelector';
import { LogOut, Music } from 'lucide-react';

export const Header = () => {
  const { t } = useTranslation('common');
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
            <span className="text-xl font-bold text-gray-900">{t('page.appName')}</span>
          </Link>
          <nav className="flex items-center space-x-4">
            <Link
              to="/praises"
              className="text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium"
            >
              {t('page.praises')}
            </Link>
            <Link
              to="/tags"
              className="text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium"
            >
              {t('page.tags')}
            </Link>
            <Link
              to="/material-kinds"
              className="text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium"
            >
              {t('page.materialKinds')}
            </Link>
            <Link
              to="/material-types"
              className="text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium"
            >
              {t('page.materialTypes')}
            </Link>
            <Link
              to="/translations"
              className="text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium"
            >
              {t('page.translations')}
            </Link>
            <Link
              to="/praise-lists"
              className="text-gray-700 hover:text-blue-600 px-3 py-2 rounded-md text-sm font-medium"
            >
              {t('page.praiseLists') || 'Listas'}
            </Link>
            <div className="flex items-center space-x-3">
              <LanguageSelector />
              <Link
                to="/user-preferences"
                className="text-sm text-gray-600 hover:text-blue-600 cursor-pointer transition-colors"
              >
                {user?.username}
              </Link>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                <LogOut className="w-4 h-4 mr-1" />
                {t('button.logout')}
              </Button>
            </div>
          </nav>
        </div>
      </div>
    </header>
  );
};
