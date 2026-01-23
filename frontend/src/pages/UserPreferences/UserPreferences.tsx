import { useTranslation } from 'react-i18next';
import { MaterialKindPreferenceSelector } from '@/components/userPreferences/MaterialKindPreferenceSelector';

export const UserPreferences = () => {
  const { t } = useTranslation('common');

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">
          {t('page.userPreferences')}
        </h1>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        <MaterialKindPreferenceSelector />
      </div>
    </div>
  );
};
