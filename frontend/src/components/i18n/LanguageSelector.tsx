import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useLanguageStore } from '@/store/languageStore';
import { languagesApi, type LanguageResponse } from '@/api/languages';
import { useQuery } from '@tanstack/react-query';
import { Globe } from 'lucide-react';

export const LanguageSelector = () => {
  const { token } = useAuthStore();
  const { currentLanguage, setLanguage, initializeLanguage } = useLanguageStore();
  const [isOpen, setIsOpen] = useState(false);
  const [canFetch, setCanFetch] = useState(false);

  useEffect(() => {
    if (token) setCanFetch(true);
  }, [token]);

  // Buscar linguagens disponíveis (apenas após token estar pronto)
  const { data: languages = [] } = useQuery<LanguageResponse[]>({
    queryKey: ['languages'],
    queryFn: () => languagesApi.getAll(true), // Apenas linguagens ativas
    enabled: !!token && canFetch,
  });

  useEffect(() => {
    initializeLanguage();
  }, [initializeLanguage]);

  const handleLanguageChange = (langCode: string) => {
    setLanguage(langCode);
    setIsOpen(false);
  };

  if (languages.length === 0) {
    return null;
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 px-3 py-2 text-sm text-gray-700 hover:text-blue-600 rounded-md hover:bg-gray-100"
      >
        <Globe className="w-4 h-4" />
        <span className="uppercase">{currentLanguage}</span>
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-20 border border-gray-200">
            <div className="py-1">
              {languages.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => handleLanguageChange(lang.code)}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${
                    currentLanguage === lang.code
                      ? 'bg-blue-50 text-blue-600 font-medium'
                      : 'text-gray-700'
                  }`}
                >
                  {lang.name}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
