from typing import Dict, List
from uuid import UUID
import asyncio
import json


class SSEManager:
    """Gerencia conexões SSE por sala (similar ao Durable Object)"""
    
    def __init__(self):
        # {room_id: [queue1, queue2, ...]} - filas de mensagens para cada cliente
        self.room_queues: Dict[UUID, List[asyncio.Queue]] = {}
    
    def subscribe(self, room_id: UUID) -> asyncio.Queue:
        """Inscreve um cliente em uma sala"""
        if room_id not in self.room_queues:
            self.room_queues[room_id] = []
        
        queue = asyncio.Queue()
        self.room_queues[room_id].append(queue)
        return queue
    
    def unsubscribe(self, room_id: UUID, queue: asyncio.Queue):
        """Remove inscrição de um cliente"""
        if room_id in self.room_queues:
            try:
                self.room_queues[room_id].remove(queue)
            except ValueError:
                pass
            
            # Remove sala se vazia
            if not self.room_queues[room_id]:
                del self.room_queues[room_id]
    
    async def broadcast(self, room_id: UUID, event_type: str, data: dict):
        """Envia evento para todos os clientes de uma sala"""
        if room_id not in self.room_queues:
            return
        
        message = {
            "type": event_type,
            **data  # Inclui todos os dados diretamente
        }
        
        # Envia para todas as filas (clientes)
        dead_queues = []
        for queue in self.room_queues[room_id]:
            try:
                await queue.put(message)
            except:
                dead_queues.append(queue)
        
        # Remove filas mortas
        for queue in dead_queues:
            self.unsubscribe(room_id, queue)
    
    def get_room_participants_count(self, room_id: UUID) -> int:
        """Retorna número de participantes conectados em uma sala"""
        if room_id not in self.room_queues:
            return 0
        return len(self.room_queues[room_id])


# Instância global do gerenciador
sse_manager = SSEManager()


async def event_stream(room_id: UUID, user_id: UUID):
    """Gera stream de eventos SSE para um cliente"""
    queue = sse_manager.subscribe(room_id)
    
    try:
        # Envia evento inicial de conexão
        yield f"data: {json.dumps({'type': 'connected', 'room_id': str(room_id)})}\n\n"
        
        while True:
            try:
                # Aguarda mensagem com timeout para manter conexão viva
                message = await asyncio.wait_for(queue.get(), timeout=30.0)
                
                # Formato SSE: "data: {json}\n\n"
                yield f"data: {json.dumps(message)}\n\n"
                
            except asyncio.TimeoutError:
                # Envia heartbeat para manter conexão viva
                yield ": heartbeat\n\n"
                
    except asyncio.CancelledError:
        pass
    finally:
        sse_manager.unsubscribe(room_id, queue)
