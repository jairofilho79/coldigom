import { useEffect, useRef, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { roomsApi } from '@/api/rooms';
import type { RoomMessageResponse } from '@/types';

const getSSEUrl = (roomId: string) => {
  const baseUrl = import.meta.env.VITE_API_BASE_URL || '';
  let url = '';
  
  if (baseUrl) {
    url = baseUrl;
  } else {
    // Use current window location
    url = `${window.location.protocol}//${window.location.host}`;
  }
  
  const token = localStorage.getItem('token');
  return `${url}/api/v1/rooms/${roomId}/events${token ? `?token=${token}` : ''}`;
};

export interface UseRoomSSEOptions {
  roomId: string;
  enabled?: boolean;
  onPraiseAdded?: (data: any) => void;
  onPraiseRemoved?: (data: any) => void;
  onPraiseReordered?: (data: any) => void;
  onMessage?: (message: RoomMessageResponse) => void;
  onUserJoined?: (data: any) => void;
  onUserLeft?: (data: any) => void;
  onRoomUpdated?: (data: any) => void;
  onRoomDeleted?: () => void;
}

export const useRoomSSE = (options: UseRoomSSEOptions) => {
  const {
    roomId,
    enabled = true,
    onPraiseAdded,
    onPraiseRemoved,
    onPraiseReordered,
    onMessage,
    onUserJoined,
    onUserLeft,
    onRoomUpdated,
    onRoomDeleted,
  } = options;

  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const queryClient = useQueryClient();

  // Função para enviar mensagem via HTTP POST
  const sendMessage = useCallback(async (message: string) => {
    if (!roomId || message.trim().length === 0 || message.length > 140) {
      throw new Error('Invalid message');
    }

    try {
      await roomsApi.sendRoomMessage(roomId, { message: message.trim() });
      // A resposta SSE virá automaticamente via broadcast
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }, [roomId]);

  // Usar refs para callbacks para evitar recriação do EventSource
  const callbacksRef = useRef({
    onPraiseAdded,
    onPraiseRemoved,
    onPraiseReordered,
    onMessage,
    onUserJoined,
    onUserLeft,
    onRoomUpdated,
    onRoomDeleted,
  });

  // Atualizar refs quando callbacks mudarem
  useEffect(() => {
    callbacksRef.current = {
      onPraiseAdded,
      onPraiseRemoved,
      onPraiseReordered,
      onMessage,
      onUserJoined,
      onUserLeft,
      onRoomUpdated,
      onRoomDeleted,
    };
  }, [onPraiseAdded, onPraiseRemoved, onPraiseReordered, onMessage, onUserJoined, onUserLeft, onRoomUpdated, onRoomDeleted]);

  useEffect(() => {
    if (!enabled || !roomId) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
        setConnected(false);
      }
      return;
    }

    // Se já existe uma conexão ativa, não criar nova
    if (eventSourceRef.current && eventSourceRef.current.readyState !== EventSource.CLOSED) {
      return;
    }

    const url = getSSEUrl(roomId);
    console.log('Creating SSE connection to:', url);
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setConnected(true);
      console.log('SSE connected to room', roomId);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const callbacks = callbacksRef.current;
        
        switch (data.type) {
          case 'connected':
            console.log('SSE: Connected to room');
            break;
            
          case 'praise_added':
            queryClient.invalidateQueries({ queryKey: ['room', roomId] });
            callbacks.onPraiseAdded?.(data);
            break;
            
          case 'praise_removed':
            queryClient.invalidateQueries({ queryKey: ['room', roomId] });
            callbacks.onPraiseRemoved?.(data);
            break;
            
          case 'praise_reordered':
            queryClient.invalidateQueries({ queryKey: ['room', roomId] });
            callbacks.onPraiseReordered?.(data);
            break;
            
          case 'message_sent':
            // Adiciona mensagem ao cache
            queryClient.setQueryData(
              ['room', roomId, 'messages'],
              (old: RoomMessageResponse[] = []) => {
                // Evita duplicatas
                if (old.some(msg => msg.id === data.message_id)) {
                  return old;
                }
                return [...old, {
                  id: data.message_id,
                  room_id: data.room_id,
                  user_id: data.user_id,
                  username: data.username,
                  material_kind_name: data.material_kind_name,
                  message: data.message,
                  created_at: data.created_at,
                }];
              }
            );
            callbacks.onMessage?.({
              id: data.message_id,
              room_id: data.room_id,
              user_id: data.user_id,
              username: data.username,
              material_kind_name: data.material_kind_name,
              message: data.message,
              created_at: data.created_at,
            });
            break;
            
          case 'user_joined':
            queryClient.invalidateQueries({ queryKey: ['room', roomId, 'participants'] });
            callbacks.onUserJoined?.(data);
            break;
            
          case 'user_left':
            queryClient.invalidateQueries({ queryKey: ['room', roomId, 'participants'] });
            callbacks.onUserLeft?.(data);
            break;
            
          case 'room_updated':
            queryClient.invalidateQueries({ queryKey: ['room', roomId] });
            callbacks.onRoomUpdated?.(data);
            break;
            
          case 'room_deleted':
            eventSource.close();
            callbacks.onRoomDeleted?.();
            break;
            
          case 'list_imported':
            queryClient.invalidateQueries({ queryKey: ['room', roomId] });
            break;
            
          case 'join_request_received':
            // Notificação para o criador da sala
            queryClient.invalidateQueries({ queryKey: ['room', roomId, 'joinRequests'] });
            break;
        }
      } catch (error) {
        console.error('Error parsing SSE message:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE error:', error);
      setConnected(false);
      // EventSource reconecta automaticamente, mas vamos fechar se houver erro persistente
      if (eventSource.readyState === EventSource.CLOSED) {
        console.log('SSE connection closed, will not reconnect');
      }
    };

    return () => {
      console.log('Cleaning up SSE connection');
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setConnected(false);
    };
  }, [roomId, enabled, queryClient]);

  return {
    connected,
    sendMessage,
  };
};
