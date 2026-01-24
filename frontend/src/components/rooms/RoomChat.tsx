import { useState, useEffect, useRef } from 'react';
import { useRoomSSE } from '@/hooks/useRoomSSE';
import { useRoomMessages } from '@/hooks/useRoomMessages';
import { useRoom } from '@/hooks/useRooms';
import { Button } from '@/components/ui/Button';
import type { RoomMessageResponse } from '@/types';
import { Send, Wifi, WifiOff } from 'lucide-react';

interface RoomChatProps {
  roomId: string;
}

export const RoomChat = ({ roomId }: RoomChatProps) => {
  const [message, setMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { data: messages = [], refetch } = useRoomMessages(roomId, { limit: 100 });
  const { data: room, isError: roomError, isLoading: roomLoading } = useRoom(roomId);
  
  // Only enable SSE if room exists, hasn't errored, and is not loading
  // This prevents connection attempts when room doesn't exist
  const roomExists = !roomLoading && !roomError && !!room;
  
  const { connected, sendMessage } = useRoomSSE({
    roomId,
    enabled: roomExists,
    onMessage: () => {
      // Mensagem já foi adicionada ao cache pelo hook SSE
      refetch(); // Opcional: refetch para garantir sincronização
    },
    onRoomDeleted: () => {
      console.log('Room was deleted');
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && message.length <= 140 && connected) {
      try {
        await sendMessage(message.trim());
        setMessage('');
      } catch (error) {
        console.error('Failed to send message:', error);
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-lg shadow-md">
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-lg font-semibold">Chat</h3>
        <div className="flex items-center space-x-2">
          {connected ? (
            <Wifi className="w-4 h-4 text-green-500" />
          ) : (
            <WifiOff className="w-4 h-4 text-red-500" />
          )}
          <span className="text-sm text-gray-600">
            {connected ? 'Conectado' : 'Desconectado'}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg: RoomMessageResponse) => (
          <div key={msg.id} className="flex flex-col">
            <div className="flex items-center space-x-2 mb-1">
              <span className="font-semibold text-sm">{msg.username}</span>
              {msg.material_kind_name && (
                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                  {msg.material_kind_name}
                </span>
              )}
              <span className="text-xs text-gray-500">
                {new Date(msg.created_at).toLocaleTimeString()}
              </span>
            </div>
            <p className="text-sm text-gray-800">{msg.message}</p>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="p-4 border-t border-gray-200">
        <div className="flex space-x-2">
          <input
            type="text"
            value={message}
            onChange={(e) => {
              const val = e.target.value;
              if (val.length <= 140) {
                setMessage(val);
              }
            }}
            placeholder="Digite sua mensagem (máx. 140 caracteres)"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={!connected}
            maxLength={140}
          />
          <Button
            type="submit"
            disabled={!connected || !message.trim() || message.length > 140}
            size="sm"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <div className="mt-1 text-xs text-gray-500 text-right">
          {message.length}/140
        </div>
      </form>
    </div>
  );
};
