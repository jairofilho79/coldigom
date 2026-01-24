import { Link } from 'react-router-dom';
import { useRooms, usePublicRooms } from '@/hooks/useRooms';
import { RoomCard } from '@/components/rooms/RoomCard';
import { Button } from '@/components/ui/Button';
import { Plus, Users } from 'lucide-react';
import { useState } from 'react';

export const RoomListPage = () => {
  const [showPublic, setShowPublic] = useState(false);
  const { data: myRooms = [], isLoading: isLoadingMy } = useRooms();
  const { data: publicRooms = [], isLoading: isLoadingPublic } = usePublicRooms({ limit: 20 });

  const rooms = showPublic ? publicRooms : myRooms;
  const isLoading = showPublic ? isLoadingPublic : isLoadingMy;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Salas</h1>
        <Link to="/rooms/create">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Criar Sala
          </Button>
        </Link>
      </div>

      <div className="mb-4 flex space-x-4">
        <button
          onClick={() => setShowPublic(false)}
          className={`px-4 py-2 rounded-md ${
            !showPublic
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Minhas Salas
        </button>
        <button
          onClick={() => setShowPublic(true)}
          className={`px-4 py-2 rounded-md ${
            showPublic
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          <Users className="w-4 h-4 inline mr-2" />
          Salas Públicas
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <p className="text-gray-600">Carregando salas...</p>
        </div>
      ) : rooms.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow-md">
          <p className="text-gray-600 mb-4">
            {showPublic ? 'Nenhuma sala pública encontrada' : 'Você ainda não tem salas'}
          </p>
          {!showPublic && (
            <Link to="/rooms/create">
              <Button>Criar sua primeira sala</Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {rooms.map((room) => (
            <RoomCard key={room.id} room={room} />
          ))}
        </div>
      )}
    </div>
  );
};
