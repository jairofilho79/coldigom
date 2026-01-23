import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useMaterialKinds } from '@/hooks/useMaterialKinds';
import { useUserMaterialKindPreferences, useUpdateMaterialKindOrder } from '@/hooks/useUserPreferences';
import { useEntityTranslations } from '@/hooks/useEntityTranslations';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import type { MaterialKindResponse } from '@/types';
import { ChevronUp, ChevronDown, X, Plus } from 'lucide-react';

export const MaterialKindPreferenceSelector = () => {
  const { t } = useTranslation('common');
  const { data: materialKinds, isLoading: materialKindsLoading } = useMaterialKinds();
  const { data: preferences, isLoading: preferencesLoading } = useUserMaterialKindPreferences();
  const { getMaterialKindName } = useEntityTranslations();
  const updateOrder = useUpdateMaterialKindOrder();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (preferences) {
      const sorted = [...preferences]
        .sort((a, b) => a.order - b.order)
        .map((p) => p.material_kind_id);
      setSelectedIds(sorted);
    }
  }, [preferences]);

  const isLoading = materialKindsLoading || preferencesLoading;

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-8">
        <Loading />
      </div>
    );
  }

  const availableKinds = materialKinds?.filter((kind) => !selectedIds.includes(kind.id)) || [];
  
  // Ordena os disponíveis pelo nome traduzido
  const sortedAvailableKinds = [...availableKinds].sort((a, b) => {
    const nameA = getMaterialKindName(a.id, a.name).toLowerCase();
    const nameB = getMaterialKindName(b.id, b.name).toLowerCase();
    return nameA.localeCompare(nameB);
  });
  
  const selectedKinds = selectedIds
    .map((id) => materialKinds?.find((k) => k.id === id))
    .filter((k): k is MaterialKindResponse => k !== undefined);

  const handleAdd = (kindId: string) => {
    if (selectedIds.length < 5) {
      setSelectedIds([...selectedIds, kindId]);
    }
  };

  const handleRemove = (kindId: string) => {
    setSelectedIds(selectedIds.filter((id) => id !== kindId));
  };

  const handleMoveUp = (index: number) => {
    if (index > 0) {
      const newIds = [...selectedIds];
      [newIds[index - 1], newIds[index]] = [newIds[index], newIds[index - 1]];
      setSelectedIds(newIds);
    }
  };

  const handleMoveDown = (index: number) => {
    if (index < selectedIds.length - 1) {
      const newIds = [...selectedIds];
      [newIds[index], newIds[index + 1]] = [newIds[index + 1], newIds[index]];
      setSelectedIds(newIds);
    }
  };

  const handleSave = () => {
    updateOrder.mutate({ material_kind_ids: selectedIds });
  };

  const isMaxReached = selectedIds.length >= 5;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          {t('preferences.materialKind.title')}
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          {t('preferences.materialKind.description')}
        </p>
        <div className="text-sm text-gray-700 mb-4">
          {t('preferences.materialKind.selected', { count: selectedIds.length })}
        </div>
      </div>

      {/* Lista de selecionados */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-gray-700">
          {t('preferences.materialKind.selected', { count: selectedIds.length })}
        </h4>
        {selectedKinds.length === 0 ? (
          <p className="text-sm text-gray-500 italic">
            {t('message.noMaterialKindsRegistered')}
          </p>
        ) : (
          <div className="space-y-2">
            {selectedKinds.map((kind, index) => (
              <div
                key={kind.id}
                className="flex items-center justify-between bg-gray-50 p-3 rounded-md border border-gray-200"
              >
                <div className="flex items-center space-x-3 flex-1">
                  <span className="text-sm font-medium text-gray-500 w-6">
                    {index + 1}.
                  </span>
                  <span className="text-sm text-gray-900">
                    {getMaterialKindName(kind.id, kind.name)}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleMoveUp(index)}
                    disabled={index === 0}
                    className="p-1 text-gray-600 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed"
                    title={t('preferences.materialKind.moveUp')}
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleMoveDown(index)}
                    disabled={index === selectedKinds.length - 1}
                    className="p-1 text-gray-600 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed"
                    title={t('preferences.materialKind.moveDown')}
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleRemove(kind.id)}
                    className="p-1 text-red-600 hover:text-red-700"
                    title={t('preferences.materialKind.remove')}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lista de disponíveis */}
      {!isMaxReached && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-700">
            {t('preferences.materialKind.add')}
          </h4>
          {sortedAvailableKinds.length === 0 ? (
            <p className="text-sm text-gray-500 italic">
              {t('preferences.materialKind.maxReached')}
            </p>
          ) : (
            <div className="space-y-2">
              {sortedAvailableKinds.map((kind) => (
                <div
                  key={kind.id}
                  className="flex items-center justify-between bg-white p-3 rounded-md border border-gray-200 hover:border-blue-300"
                >
                  <span className="text-sm text-gray-900">
                    {getMaterialKindName(kind.id, kind.name)}
                  </span>
                  <button
                    onClick={() => handleAdd(kind.id)}
                    className="p-1 text-blue-600 hover:text-blue-700"
                    title={t('preferences.materialKind.add')}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {isMaxReached && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
          <p className="text-sm text-yellow-800">
            {t('preferences.materialKind.maxReached')}
          </p>
        </div>
      )}

      {/* Botão salvar */}
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={updateOrder.isPending}
          isLoading={updateOrder.isPending}
        >
          {t('button.save')}
        </Button>
      </div>
    </div>
  );
};
