import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ptBR from './locales/pt-BR/common.json';
import enUS from './locales/en-US/common.json';

// Detectar linguagem do navegador
const detectBrowserLanguage = (): string => {
  if (typeof window === 'undefined') {
    return 'pt-BR';
  }
  
  // Tentar recuperar do localStorage primeiro
  const savedLanguage = localStorage.getItem('i18n_language');
  if (savedLanguage) {
    return savedLanguage;
  }
  
  // Detectar do navegador
  const browserLang = navigator.language || (navigator as any).userLanguage;
  const supportedLanguages = ['pt-BR', 'en-US', 'es-ES'];
  
  // Se o navegador tiver exatamente a linguagem suportada
  if (supportedLanguages.includes(browserLang)) {
    return browserLang;
  }
  
  // Tentar match parcial (ex: pt → pt-BR, en → en-US)
  const langPrefix = browserLang.split('-')[0];
  if (langPrefix === 'pt') return 'pt-BR';
  if (langPrefix === 'en') return 'en-US';
  if (langPrefix === 'es') return 'es-ES';
  
  // Fallback padrão
  return 'pt-BR';
};

i18n
  .use(initReactI18next)
  .init({
    resources: {
      'pt-BR': {
        common: ptBR,
      },
      'en-US': {
        common: enUS,
      },
    },
    lng: detectBrowserLanguage(),
    fallbackLng: 'pt-BR',
    defaultNS: 'common',
    interpolation: {
      escapeValue: false, // React já faz escape
    },
    react: {
      useSuspense: false,
    },
  });

// Salvar mudanças de linguagem no localStorage
i18n.on('languageChanged', (lng) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('i18n_language', lng);
  }
});

export default i18n;
