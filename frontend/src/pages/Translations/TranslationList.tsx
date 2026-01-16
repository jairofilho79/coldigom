import { TranslationEditor } from './TranslationEditor';
import { useTranslation } from 'react-i18next';

export const TranslationList = () => {
  const { t } = useTranslation('common');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">{t('page.translations')}</h1>
        <p className="mt-2 text-gray-600">
          {t('translation.description')}
        </p>
      </div>

      <TranslationEditor />
    </div>
  );
};
