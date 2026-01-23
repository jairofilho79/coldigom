import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { PraiseListResponse } from '@/types';
import { List, Users, Lock } from 'lucide-react';

interface PraiseListCardProps {
  list: PraiseListResponse;
}

export const PraiseListCard = ({ list }: PraiseListCardProps) => {
  const { t } = useTranslation('common');
  
  return (
    <Link
      to={`/praise-lists/${list.id}`}
      className="block bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow p-6"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-2 mb-2">
            <List className="w-5 h-5 text-blue-600" />
            <h3 className="text-lg font-semibold text-gray-900">{list.name}</h3>
            {list.is_public ? (
              <Users className="w-4 h-4 text-gray-400" title={t('label.public') || 'Pública'} />
            ) : (
              <Lock className="w-4 h-4 text-gray-400" title={t('label.private') || 'Privada'} />
            )}
          </div>
          {list.description && (
            <p className="text-sm text-gray-600 mb-2">{list.description}</p>
          )}
          <div className="flex items-center space-x-4 mt-4 text-sm text-gray-600">
            <span>
              {list.praises_count} {list.praises_count === 1 ? t('praise.praise') : t('praise.praises')}
            </span>
            {list.owner && (
              <span className="text-gray-500">
                {t('label.by') || 'por'} {list.owner}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
};
