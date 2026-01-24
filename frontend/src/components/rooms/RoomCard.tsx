import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { RoomResponse } from '@/types';
import { Users, Lock, Key, UserCheck } from 'lucide-react';

interface RoomCardProps {
  room: RoomResponse;
}

export const RoomCard = ({ room }: RoomCardProps) => {
  const { t } = useTranslation('common');
  
  const getAccessIcon = () => {
    switch (room.access_type) {
      case 'public':
        return <Users className="w-4 h-4 text-green-500" title={t('room.access.public') || 'Pública'} />;
      case 'password':
        return <Key className="w-4 h-4 text-yellow-500" title={t('room.access.password') || 'Com senha'} />;
      case 'approval':
        return <UserCheck className="w-4 h-4 text-blue-500" title={t('room.access.approval') || 'Aprovação necessária'} />;
      default:
        return null;
    }
  };
  
  return (
    <Link
      to={`/rooms/${room.id}`}
      className="block bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow p-6"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-2 mb-2">
            <h3 className="text-lg font-semibold text-gray-900">{room.name}</h3>
            {getAccessIcon()}
          </div>
          {room.description && (
            <p className="text-sm text-gray-600 mb-2">{room.description}</p>
          )}
          <div className="flex items-center space-x-4 mt-4 text-sm text-gray-600">
            <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">
              {room.code}
            </span>
            <span>
              {room.participants_count} {t('room.participants') || 'participantes'}
            </span>
            <span>
              {room.praises_count} {t('room.praises') || 'praises'}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
};
