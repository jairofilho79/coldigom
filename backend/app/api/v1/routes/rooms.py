import asyncio
import json
from typing import Dict, Set
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

router = APIRouter()

# Armazena as filas asyncio (para assinantes) por room_id
room_connections: Dict[str, Set[asyncio.Queue]] = {}

async def event_generator(room_id: str, request: Request, queue: asyncio.Queue):
    try:
        # Envia evento de conexão inicial
        yield f"event: connected\ndata: {json.dumps({'room_id': room_id})}\n\n"
        
        while True:
            # Se o cliente desconectar, encerramos a conexão
            if await request.is_disconnected():
                break
                
            try:
                # Aguarda com timeout para enviar pings keep-alive periodicamente
                message = await asyncio.wait_for(queue.get(), timeout=15.0)
                yield f"event: room_updated\ndata: {message}\n\n"
            except asyncio.TimeoutError:
                # Ping vital em SSE para evitar fechamento idle por proxies
                yield ": ping\n\n"
                
    finally:
        if room_id in room_connections:
            room_connections[room_id].discard(queue)
            if not room_connections[room_id]:
                del room_connections[room_id]

@router.get("/{room_id}/events")
async def subscribe_room_events(room_id: str, request: Request):
    """Inscreve em Server-Sent Events (SSE) para uma sala específica."""
    if room_id not in room_connections:
        room_connections[room_id] = set()
        
    queue = asyncio.Queue()
    room_connections[room_id].add(queue)
    
    return StreamingResponse(
        event_generator(room_id, request, queue),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive"
        }
    )

@router.post("/{room_id}/notify-update")
async def notify_room_update(room_id: str):
    """Gatilho interno para notificar assinantes de que a sala mudou."""
    if room_id in room_connections:
        message = json.dumps({"room_id": room_id, "action": "sync_requested"})
        for queue in room_connections[room_id]:
            await queue.put(message)
    return {"status": "ok", "subscribers": len(room_connections.get(room_id, []))}
