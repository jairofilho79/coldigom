import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { PraiseResponse } from '@/types';
import { Music, Tag, File } from 'lucide-react';

interface PraiseCardProps {
  praise: PraiseResponse;
}

export const PraiseCard = ({ praise }: PraiseCardProps) => {
  const { t } = useTranslation('common');

  return (
    <div className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow p-6 flex flex-col">
      <Link
        to={`/praises/${praise.id}`}
        className="flex-1"
      >
        <div className="flex items-center space-x-2 mb-2">
          <Music className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900">{praise.name}</h3>
          {praise.number && (
            <span className="text-sm text-gray-500">#{praise.number}</span>
          )}
        </div>
        <div className="flex items-center space-x-4 mt-4 text-sm text-gray-600">
          {praise.tags.length > 0 && (
            <div className="flex items-center space-x-1">
              <Tag className="w-4 h-4" />
              <span>
                {praise.tags.length} {praise.tags.length === 1 ? t('material.tag') : t('material.tags')}
              </span>
            </div>
          )}
          {praise.materials.length > 0 && (
            <div className="flex items-center space-x-1">
              <File className="w-4 h-4" />
              <span>
                {praise.materials.length} {praise.materials.length === 1 ? t('material.material') : t('material.materials')}
              </span>
            </div>
          )}
        </div>
      </Link>
    </div>
  );
};
