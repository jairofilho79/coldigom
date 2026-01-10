import { Link } from 'react-router-dom';
import type { PraiseResponse } from '@/types';
import { Music, Tag, File } from 'lucide-react';

interface PraiseCardProps {
  praise: PraiseResponse;
}

export const PraiseCard = ({ praise }: PraiseCardProps) => {
  return (
    <Link
      to={`/praises/${praise.id}`}
      className="block bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow p-6"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
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
                <span>{praise.tags.length} tag(s)</span>
              </div>
            )}
            {praise.materials.length > 0 && (
              <div className="flex items-center space-x-1">
                <File className="w-4 h-4" />
                <span>{praise.materials.length} material(is)</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
};
