import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useCreateRoom } from '@/hooks/useRooms';
import { Button } from '@/components/ui/Button';
import type { RoomCreate, RoomAccessType } from '@/types';
import { useNavigate } from 'react-router-dom';

export const RoomCreateForm = () => {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const createRoom = useCreateRoom();
  const [accessType, setAccessType] = useState<RoomAccessType>('public');
  
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RoomCreate>({
    defaultValues: {
      name: '',
      description: '',
      access_type: 'public',
      password: '',
      is_open_for_requests: true,
      auto_destroy_on_empty: true,
    },
  });

  const watchedAccessType = watch('access_type');

  const onSubmit = async (data: RoomCreate) => {
    try {
      const roomData: RoomCreate = {
        ...data,
        access_type: watchedAccessType,
        password: watchedAccessType === 'password' ? data.password : undefined,
        is_open_for_requests: watchedAccessType === 'approval' ? data.is_open_for_requests : undefined,
      };
      
      const room = await createRoom.mutateAsync(roomData);
      navigate(`/rooms/${room.id}`);
    } catch (error) {
      // Error is handled by the hook
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold mb-6">{t('room.create') || 'Criar Sala'}</h2>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('room.name') || 'Nome'}
          </label>
          <input
            {...register('name', { required: true, minLength: 1, maxLength: 255 })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={t('room.namePlaceholder') || 'Nome da sala'}
          />
          {errors.name && (
            <p className="text-red-500 text-sm mt-1">{t('validation.required') || 'Campo obrigatório'}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('room.description') || 'Descrição'}
          </label>
          <textarea
            {...register('description')}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={3}
            placeholder={t('room.descriptionPlaceholder') || 'Descrição da sala (opcional)'}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('room.accessType') || 'Tipo de Acesso'}
          </label>
          <select
            {...register('access_type')}
            onChange={(e) => setAccessType(e.target.value as RoomAccessType)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="public">{t('room.access.public') || 'Pública'}</option>
            <option value="password">{t('room.access.password') || 'Com senha'}</option>
            <option value="approval">{t('room.access.approval') || 'Aprovação necessária'}</option>
          </select>
        </div>

        {watchedAccessType === 'password' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('room.password') || 'Senha'}
            </label>
            <input
              type="password"
              {...register('password', { 
                required: watchedAccessType === 'password',
                minLength: 4,
                maxLength: 50,
              })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={t('room.passwordPlaceholder') || 'Senha da sala'}
            />
            {errors.password && (
              <p className="text-red-500 text-sm mt-1">
                {t('validation.passwordLength') || 'Senha deve ter entre 4 e 50 caracteres'}
              </p>
            )}
          </div>
        )}

        {watchedAccessType === 'approval' && (
          <div>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                {...register('is_open_for_requests')}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">
                {t('room.openForRequests') || 'Aceitar novos pedidos de entrada'}
              </span>
            </label>
          </div>
        )}

        <div>
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              {...register('auto_destroy_on_empty')}
              defaultChecked
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">
              {t('room.autoDestroyOnEmpty') || 'Destruir automaticamente quando vazia'}
            </span>
          </label>
        </div>

        <div className="flex justify-end space-x-4 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/rooms')}
          >
            {t('button.cancel') || 'Cancelar'}
          </Button>
          <Button type="submit" isLoading={createRoom.isPending}>
            {t('button.create') || 'Criar'}
          </Button>
        </div>
      </div>
    </form>
  );
};
