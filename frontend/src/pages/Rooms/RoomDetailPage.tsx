import { useParams, useNavigate } from 'react-router-dom';
import { useRoom, useRoomByCode } from '@/hooks/useRooms';
import { RoomChat } from '@/components/rooms/RoomChat';
import { Button } from '@/components/ui/Button';
import { Share2, Trash2, LogOut, Plus, Import } from 'lucide-react';
import { useState } from 'react';
import { useDeleteRoom, useLeaveRoom, useAddPraiseToRoom, useImportListToRoom } from '@/hooks/useRooms';
import { usePraiseLists } from '@/hooks/usePraiseLists';
import { usePraises } from '@/hooks/usePraises';

export const RoomDetailPage = () => {
  const { id, code } = useParams<{ id?: string; code?: string }>();
  const navigate = useNavigate();
  const { data: roomById, isLoading: isLoadingById } = useRoom(id || '');
  const { data: roomByCode, isLoading: isLoadingByCode } = useRoomByCode(code || '');
  
  const room = id ? roomById : roomByCode;
  const isLoading = id ? isLoadingById : isLoadingByCode;
  
  const deleteRoom = useDeleteRoom();
  const leaveRoom = useLeaveRoom();
  const addPraise = useAddPraiseToRoom();
  const importList = useImportListToRoom();
  const { data: praiseLists = [] } = usePraiseLists();
  const { data: praises = [] } = usePraises({ limit: 100 });
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAddPraiseModal, setShowAddPraiseModal] = useState(false);

  if (isLoading) {
    return <div className="text-center py-12">Carregando sala...</div>;
  }

  if (!room) {
    return (
      <div className="text-center py-12">
        <p className="text-lg mb-4">Sala não encontrada</p>
        <Button onClick={() => navigate('/rooms')}>
          Voltar para Salas
        </Button>
      </div>
    );
  }

  const roomId = room.id;

  const handleDelete = async () => {
    if (confirm('Tem certeza que deseja deletar esta sala?')) {
      await deleteRoom.mutateAsync(roomId);
      navigate('/rooms');
    }
  };

  const handleLeave = async () => {
    if (confirm('Tem certeza que deseja sair desta sala?')) {
      await leaveRoom.mutateAsync(roomId);
      navigate('/rooms');
    }
  };

  const handleShare = () => {
    const url = `${window.location.origin}/rooms/code/${room.code}`;
    navigator.clipboard.writeText(url);
    alert('Link copiado para a área de transferência!');
  };

  const handleAddPraise = async (praiseId: string) => {
    await addPraise.mutateAsync({ roomId, praiseId });
    setShowAddPraiseModal(false);
  };

  const handleImportList = async (listId: string) => {
    await importList.mutateAsync({ roomId, listId });
    setShowImportModal(false);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h1 className="text-3xl font-bold mb-2">{room.name}</h1>
            {room.description && (
              <p className="text-gray-600 mb-2">{room.description}</p>
            )}
            <div className="flex items-center space-x-4 text-sm text-gray-600">
              <span className="font-mono bg-gray-100 px-2 py-1 rounded">
                Código: {room.code}
              </span>
              <span>{room.participants_count} participantes</span>
              <span>{room.praises_count} praises</span>
            </div>
          </div>
          <div className="flex space-x-2">
            <Button variant="outline" size="sm" onClick={handleShare}>
              <Share2 className="w-4 h-4 mr-2" />
              Compartilhar
            </Button>
            {room.is_creator ? (
              <Button variant="danger" size="sm" onClick={handleDelete}>
                <Trash2 className="w-4 h-4 mr-2" />
                Deletar
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={handleLeave}>
                <LogOut className="w-4 h-4 mr-2" />
                Sair
              </Button>
            )}
          </div>
        </div>

        {room.is_creator && (
          <div className="flex space-x-2 mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddPraiseModal(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Praise
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowImportModal(true)}
            >
              <Import className="w-4 h-4 mr-2" />
              Importar Lista
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Praises</h2>
          {room.praises.length === 0 ? (
            <p className="text-gray-600">Nenhum praise adicionado ainda</p>
          ) : (
            <div className="space-y-2">
              {room.praises.map((praise, index) => (
                <div
                  key={praise.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-md"
                >
                  <div>
                    <span className="font-semibold">{index + 1}.</span>
                    <span className="ml-2">{praise.praise_name}</span>
                    {praise.praise_number && (
                      <span className="ml-2 text-gray-500">#{praise.praise_number}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Participantes</h2>
            <div className="space-y-2">
              {room.participants.map((participant) => (
                <div key={participant.id} className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm">
                    {participant.username?.[0]?.toUpperCase() || 'U'}
                  </div>
                  <div>
                    <p className="font-medium">{participant.username}</p>
                    {participant.material_kind_name && (
                      <p className="text-xs text-gray-500">{participant.material_kind_name}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="h-96">
            <RoomChat roomId={roomId} />
          </div>
        </div>
      </div>

      {showAddPraiseModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-96 overflow-y-auto">
            <h3 className="text-xl font-semibold mb-4">Adicionar Praise</h3>
            <div className="space-y-2">
              {praises.map((praise) => (
                <button
                  key={praise.id}
                  onClick={() => handleAddPraise(praise.id)}
                  className="w-full text-left p-2 hover:bg-gray-100 rounded"
                >
                  {praise.name} {praise.number && `#${praise.number}`}
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              onClick={() => setShowAddPraiseModal(false)}
              className="mt-4"
            >
              Fechar
            </Button>
          </div>
        </div>
      )}

      {showImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-96 overflow-y-auto">
            <h3 className="text-xl font-semibold mb-4">Importar Lista</h3>
            <div className="space-y-2">
              {praiseLists.map((list) => (
                <button
                  key={list.id}
                  onClick={() => handleImportList(list.id)}
                  className="w-full text-left p-2 hover:bg-gray-100 rounded"
                >
                  {list.name} ({list.praises_count} praises)
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              onClick={() => setShowImportModal(false)}
              className="mt-4"
            >
              Fechar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
