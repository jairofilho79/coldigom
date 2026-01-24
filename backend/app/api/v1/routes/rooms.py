from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from uuid import UUID
from app.core.dependencies import get_db, get_current_user
from app.core.sse import sse_manager, event_stream
from app.core.security import decode_access_token
from app.infrastructure.database.database import SessionLocal
from app.domain.models.user import User
from app.domain.schemas.room import (
    RoomCreate,
    RoomUpdate,
    RoomResponse,
    RoomDetailResponse,
    RoomJoinRequest as RoomJoinRequestSchema,
    RoomMessageCreate,
    RoomMessageResponse,
    RoomParticipantResponse,
    RoomPraiseAdd,
    RoomPraiseReorder,
    RoomJoinRequestDetail,
)
from app.application.services.room_service import RoomService
import json

router = APIRouter()


def convert_access_type_to_schema(access_type) -> str:
    """Convert model enum (uppercase) to schema enum (lowercase)"""
    access_type_map = {
        "PUBLIC": "public",
        "PASSWORD": "password",
        "APPROVAL": "approval",
    }
    access_type_value = access_type.value if hasattr(access_type, 'value') else str(access_type)
    return access_type_map.get(access_type_value, "public")


async def get_current_user_from_query(request: Request, db: Session = Depends(get_db)) -> User:
    """Obtém usuário atual via token na query string (para SSE)"""
    token = request.query_params.get("token")
    
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    payload = decode_access_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user_id_str: str = payload.get("sub")
    if user_id_str is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    try:
        user_id = UUID(user_id_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    from app.infrastructure.database.repositories.user_repository import UserRepository
    user_repo = UserRepository(db)
    user = user_repo.get_by_id(user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    return user


@router.get("/", response_model=List[RoomResponse])
def list_rooms(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Lista salas do usuário"""
    service = RoomService(db)
    rooms = service.get_user_rooms(current_user.id)
    
    result = []
    for room in rooms:
        participants_count = service.repository.get_participants_count(room.id)
        praises_count = len(service.repository.get_room_praises(room.id))
        result.append({
            "id": room.id,
            "code": room.code,
            "name": room.name,
            "description": room.description,
            "creator_id": room.creator_id,
            "access_type": convert_access_type_to_schema(room.access_type),
            "is_open_for_requests": room.is_open_for_requests,
            "auto_destroy_on_empty": room.auto_destroy_on_empty,
            "created_at": room.created_at,
            "updated_at": room.updated_at,
            "last_activity_at": room.last_activity_at,
            "participants_count": participants_count,
            "praises_count": praises_count,
        })
    
    return result


@router.get("/public", response_model=List[RoomResponse])
def list_public_rooms(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Lista salas públicas"""
    service = RoomService(db)
    rooms = service.get_public_rooms(skip=skip, limit=limit)
    
    result = []
    for room in rooms:
        participants_count = service.repository.get_participants_count(room.id)
        praises_count = len(service.repository.get_room_praises(room.id))
        result.append({
            "id": room.id,
            "code": room.code,
            "name": room.name,
            "description": room.description,
            "creator_id": room.creator_id,
            "access_type": convert_access_type_to_schema(room.access_type),
            "is_open_for_requests": room.is_open_for_requests,
            "auto_destroy_on_empty": room.auto_destroy_on_empty,
            "created_at": room.created_at,
            "updated_at": room.updated_at,
            "last_activity_at": room.last_activity_at,
            "participants_count": participants_count,
            "praises_count": praises_count,
        })
    
    return result


@router.get("/{room_id}", response_model=RoomDetailResponse)
def get_room(
    room_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obtém detalhes de uma sala"""
    service = RoomService(db)
    detail = service.get_room_detail(room_id, current_user.id)
    return detail


@router.get("/code/{code}", response_model=RoomDetailResponse)
def get_room_by_code(
    code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obtém sala por código"""
    service = RoomService(db)
    room = service.get_room_by_code(code, current_user.id)
    detail = service.get_room_detail(room.id, current_user.id)
    return detail


@router.post("/", response_model=RoomResponse, status_code=status.HTTP_201_CREATED)
def create_room(
    room_data: RoomCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Cria uma nova sala"""
    service = RoomService(db)
    room = service.create_room(current_user.id, room_data)
    
    participants_count = service.repository.get_participants_count(room.id)
    praises_count = len(service.repository.get_room_praises(room.id))
    
    return {
        "id": room.id,
        "code": room.code,
        "name": room.name,
        "description": room.description,
        "creator_id": room.creator_id,
        "access_type": convert_access_type_to_schema(room.access_type),
        "is_open_for_requests": room.is_open_for_requests,
        "auto_destroy_on_empty": room.auto_destroy_on_empty,
        "created_at": room.created_at,
        "updated_at": room.updated_at,
        "last_activity_at": room.last_activity_at,
        "participants_count": participants_count,
        "praises_count": praises_count,
    }


@router.put("/{room_id}", response_model=RoomResponse)
async def update_room(
    room_id: UUID,
    room_data: RoomUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Atualiza uma sala"""
    service = RoomService(db)
    room = service.update_room(room_id, current_user.id, room_data)
    
    participants_count = service.repository.get_participants_count(room.id)
    praises_count = len(service.repository.get_room_praises(room.id))
    
    # Broadcast update via SSE
    await sse_manager.broadcast(
        room_id,
        "room_updated",
        {
            "room_id": str(room_id),
            "name": room.name,
            "description": room.description,
            "access_type": convert_access_type_to_schema(room.access_type),
        }
    )
    
    return {
        "id": room.id,
        "code": room.code,
        "name": room.name,
        "description": room.description,
        "creator_id": room.creator_id,
        "access_type": convert_access_type_to_schema(room.access_type),
        "is_open_for_requests": room.is_open_for_requests,
        "auto_destroy_on_empty": room.auto_destroy_on_empty,
        "created_at": room.created_at,
        "updated_at": room.updated_at,
        "last_activity_at": room.last_activity_at,
        "participants_count": participants_count,
        "praises_count": praises_count,
    }


@router.delete("/{room_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_room(
    room_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Deleta uma sala"""
    service = RoomService(db)
    service.delete_room(room_id, current_user.id)
    
    # Broadcast deletion via SSE
    await sse_manager.broadcast(
        room_id,
        "room_deleted",
        {
            "room_id": str(room_id),
        }
    )
    
    return None


@router.post("/{room_id}/join", response_model=RoomDetailResponse)
async def join_room(
    room_id: UUID,
    join_data: Optional[RoomJoinRequestSchema] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Entra em uma sala"""
    service = RoomService(db)
    
    # Get room code from room_id
    room = service.get_room_by_id(room_id)
    password = join_data.password if join_data else None
    
    service.join_room(room.code, current_user.id, password)
    
    detail = service.get_room_detail(room_id, current_user.id)
    
    # Broadcast user joined via SSE
    await sse_manager.broadcast(
        room_id,
        "user_joined",
        {
            "room_id": str(room_id),
            "user_id": str(current_user.id),
            "username": current_user.username,
        }
    )
    
    return detail


@router.post("/code/{code}/join", response_model=RoomDetailResponse)
async def join_room_by_code(
    code: str,
    join_data: Optional[RoomJoinRequestSchema] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Entra em uma sala por código"""
    service = RoomService(db)
    password = join_data.password if join_data else None
    
    room = service.join_room(code, current_user.id, password)
    detail = service.get_room_detail(room.id, current_user.id)
    
    # Broadcast user joined via SSE
    await sse_manager.broadcast(
        room.id,
        "user_joined",
        {
            "room_id": str(room.id),
            "user_id": str(current_user.id),
            "username": current_user.username,
        }
    )
    
    return detail


@router.post("/code/{code}/request-join", response_model=RoomJoinRequestDetail)
async def request_join_room(
    code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Solicita entrada em uma sala (modo aprovação)"""
    service = RoomService(db)
    join_request = service.request_join(code, current_user.id)
    
    room = service.get_room_by_code(code)
    
    # Notify creator via SSE if connected
    await sse_manager.broadcast(
        room.id,
        "join_request_received",
        {
            "room_id": str(room.id),
            "request_id": str(join_request.id),
            "user_id": str(current_user.id),
            "username": current_user.username,
        }
    )
    
    return {
        "id": join_request.id,
        "room_id": join_request.room_id,
        "user_id": join_request.user_id,
        "username": current_user.username,
        "status": join_request.status.value,
        "requested_at": join_request.requested_at,
        "responded_at": join_request.responded_at,
    }


@router.post("/{room_id}/approve/{request_id}", response_model=RoomJoinRequestDetail)
async def approve_join_request(
    room_id: UUID,
    request_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Aprova solicitação de entrada"""
    service = RoomService(db)
    join_request = service.approve_join_request(room_id, request_id, current_user.id)
    
    # Broadcast user joined via SSE
    await sse_manager.broadcast(
        room_id,
        "user_joined",
        {
            "room_id": str(room_id),
            "user_id": str(join_request.user_id),
            "username": join_request.user.username if join_request.user else None,
        }
    )
    
    return {
        "id": join_request.id,
        "room_id": join_request.room_id,
        "user_id": join_request.user_id,
        "username": join_request.user.username if join_request.user else None,
        "status": join_request.status.value,
        "requested_at": join_request.requested_at,
        "responded_at": join_request.responded_at,
    }


@router.post("/{room_id}/reject/{request_id}", response_model=RoomJoinRequestDetail)
def reject_join_request(
    room_id: UUID,
    request_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Rejeita solicitação de entrada"""
    service = RoomService(db)
    join_request = service.reject_join_request(room_id, request_id, current_user.id)
    
    return {
        "id": join_request.id,
        "room_id": join_request.room_id,
        "user_id": join_request.user_id,
        "username": join_request.user.username if join_request.user else None,
        "status": join_request.status.value,
        "requested_at": join_request.requested_at,
        "responded_at": join_request.responded_at,
    }


@router.post("/{room_id}/leave", status_code=status.HTTP_204_NO_CONTENT)
async def leave_room(
    room_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Sai de uma sala"""
    service = RoomService(db)
    service.leave_room(room_id, current_user.id)
    
    # Broadcast user left via SSE
    await sse_manager.broadcast(
        room_id,
        "user_left",
        {
            "room_id": str(room_id),
            "user_id": str(current_user.id),
            "username": current_user.username,
        }
    )
    
    return None


@router.post("/{room_id}/praises/{praise_id}", status_code=status.HTTP_204_NO_CONTENT)
async def add_praise_to_room(
    room_id: UUID,
    praise_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Adiciona um praise à sala"""
    service = RoomService(db)
    service.add_praise(room_id, praise_id, current_user.id)
    
    # Get praise details
    praise = service.praise_repository.get_by_id(praise_id)
    
    # Broadcast praise added via SSE
    await sse_manager.broadcast(
        room_id,
        "praise_added",
        {
            "room_id": str(room_id),
            "praise_id": str(praise_id),
            "praise_name": praise.name if praise else None,
            "praise_number": praise.number if praise else None,
        }
    )
    
    return None


@router.delete("/{room_id}/praises/{praise_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_praise_from_room(
    room_id: UUID,
    praise_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Remove um praise da sala"""
    service = RoomService(db)
    service.remove_praise(room_id, praise_id, current_user.id)
    
    # Broadcast praise removed via SSE
    await sse_manager.broadcast(
        room_id,
        "praise_removed",
        {
            "room_id": str(room_id),
            "praise_id": str(praise_id),
        }
    )
    
    return None


@router.put("/{room_id}/praises/reorder", status_code=status.HTTP_204_NO_CONTENT)
async def reorder_praises_in_room(
    room_id: UUID,
    reorder_data: RoomPraiseReorder,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Reordena os praises na sala"""
    service = RoomService(db)
    service.reorder_praises(room_id, reorder_data, current_user.id)
    
    # Broadcast praise reordered via SSE
    await sse_manager.broadcast(
        room_id,
        "praise_reordered",
        {
            "room_id": str(room_id),
            "praise_orders": reorder_data.praise_orders,
        }
    )
    
    return None


@router.post("/{room_id}/import-list/{list_id}", status_code=status.HTTP_204_NO_CONTENT)
async def import_praise_list_to_room(
    room_id: UUID,
    list_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Importa uma lista de praises para a sala"""
    service = RoomService(db)
    service.import_praise_list(room_id, list_id, current_user.id)
    
    # Broadcast list imported via SSE
    await sse_manager.broadcast(
        room_id,
        "list_imported",
        {
            "room_id": str(room_id),
            "list_id": str(list_id),
        }
    )
    
    return None


@router.get("/{room_id}/messages", response_model=List[RoomMessageResponse])
def get_room_messages(
    room_id: UUID,
    limit: int = Query(100, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obtém histórico de mensagens da sala"""
    service = RoomService(db)
    
    # Check if user is participant
    if not service.repository.is_participant(room_id, current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You must be a participant to view messages"
        )
    
    messages = service.get_messages(room_id, limit=limit, offset=offset)
    return messages


@router.get("/{room_id}/participants", response_model=List[RoomParticipantResponse])
def get_room_participants(
    room_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obtém lista de participantes da sala"""
    service = RoomService(db)
    
    # Check if user is participant
    if not service.repository.is_participant(room_id, current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You must be a participant to view participants"
        )
    
    participants = service.repository.get_participants(room_id)
    result = []
    for p in participants:
        material_kind_pref = service.repository.get_user_material_kind_preference(p.user_id)
        result.append({
            "id": p.id,
            "user_id": p.user_id,
            "username": p.user.username if p.user else None,
            "material_kind_name": material_kind_pref.material_kind.name if material_kind_pref and material_kind_pref.material_kind else None,
            "joined_at": p.joined_at,
            "last_seen_at": p.last_seen_at,
        })
    
    return result


@router.get("/{room_id}/join-requests", response_model=List[RoomJoinRequestDetail])
def get_room_join_requests(
    room_id: UUID,
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obtém solicitações de entrada da sala"""
    service = RoomService(db)
    
    from app.domain.models.room import RoomJoinRequestStatus
    
    status_enum = None
    if status_filter:
        # Convert schema enum (lowercase) to model enum (uppercase)
        status_map = {
            "pending": RoomJoinRequestStatus.PENDING,
            "approved": RoomJoinRequestStatus.APPROVED,
            "rejected": RoomJoinRequestStatus.REJECTED,
        }
        status_lower = status_filter.lower()
        if status_lower in status_map:
            status_enum = status_map[status_lower]
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid status filter"
            )
    
    requests = service.get_join_requests(room_id, current_user.id, status_enum)
    return requests


@router.get("/{room_id}/events")
async def room_events_stream(
    room_id: UUID,
    request: Request,
    current_user: User = Depends(get_current_user_from_query)
):
    """Stream de eventos SSE para sincronização em tempo real"""
    # Criar sessão separada para o stream (não usar Depends(get_db) que fecha muito cedo)
    db = SessionLocal()
    try:
        service = RoomService(db)
        
        # Verificar se usuário é participante
        if not service.repository.is_participant(room_id, current_user.id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You must be a participant to receive events"
            )
        
        # Criar generator que fecha a sessão quando terminar
        async def stream_with_cleanup():
            try:
                async for chunk in event_stream(room_id, current_user.id):
                    yield chunk
            finally:
                db.close()
        
        return StreamingResponse(
            stream_with_cleanup(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",  # Nginx
            }
        )
    except HTTPException:
        db.close()
        raise
    except Exception as e:
        db.close()
        raise


@router.post("/{room_id}/messages", response_model=RoomMessageResponse)
async def send_room_message(
    room_id: UUID,
    message_data: RoomMessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Envia uma mensagem no chat da sala"""
    service = RoomService(db)
    
    # Verificar se é participante
    if not service.repository.is_participant(room_id, current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You must be a participant to send messages"
        )
    
    # Criar mensagem no banco
    room_message = service.send_message(room_id, current_user.id, message_data)
    
    # Obter preferência de material kind do usuário
    material_kind_pref = service.repository.get_user_material_kind_preference(current_user.id)
    
    # Preparar dados da mensagem para broadcast
    message_payload = {
        "message_id": str(room_message.id),
        "room_id": str(room_id),
        "user_id": str(current_user.id),
        "username": current_user.username,
        "material_kind_name": material_kind_pref.material_kind.name if material_kind_pref and material_kind_pref.material_kind else None,
        "message": room_message.message,
        "created_at": room_message.created_at.isoformat(),
    }
    
    # Broadcast via SSE para todos os participantes
    await sse_manager.broadcast(room_id, "message_sent", message_payload)
    
    return {
        "id": room_message.id,
        "room_id": room_id,
        "user_id": current_user.id,
        "username": current_user.username,
        "material_kind_name": message_payload["material_kind_name"],
        "message": room_message.message,
        "created_at": room_message.created_at,
    }
