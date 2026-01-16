import { create } from 'zustand';
import i18n from '@/i18n/config';

interface LanguageState {
  currentLanguage: string;
  setLanguage: (lang: string) => void;
  initializeLanguage: () => void;
}

export const useLanguageStore = create<LanguageState>((set) => {
  const initializeLanguage = () => {
    if (typeof window === 'undefined') {
      return;
    }
    
    const savedLanguage = localStorage.getItem('i18n_language');
    const browserLang = navigator.language || (navigator as any).userLanguage;
    const supportedLanguages = ['pt-BR', 'en-US', 'es-ES'];
    
    let lang = 'pt-BR'; // Default
    
    if (savedLanguage && supportedLanguages.includes(savedLanguage)) {
      lang = savedLanguage;
    } else if (supportedLanguages.includes(browserLang)) {
      lang = browserLang;
    } else {
      const langPrefix = browserLang.split('-')[0];
      if (langPrefix === 'pt') lang = 'pt-BR';
      else if (langPrefix === 'en') lang = 'en-US';
      else if (langPrefix === 'es') lang = 'es-ES';
    }
    
    i18n.changeLanguage(lang);
    set({ currentLanguage: lang });
  };
  
  return {
    currentLanguage: i18n.language || 'pt-BR',
    setLanguage: (lang: string) => {
      i18n.changeLanguage(lang);
      if (typeof window !== 'undefined') {
        localStorage.setItem('i18n_language', lang);
      }
      set({ currentLanguage: lang });
    },
    initializeLanguage,
  };
});
