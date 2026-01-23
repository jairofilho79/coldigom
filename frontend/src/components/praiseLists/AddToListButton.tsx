import { useState, useRef, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { usePraiseLists, useAddPraiseToList, usePraiseList } from '@/hooks/usePraiseLists';
import { Button } from '@/components/ui/Button';
import { List, ChevronUp, Check } from 'lucide-react';

interface AddToListButtonProps {
  praiseId: string;
  onAdd?: (listId: string) => void;
}

export const AddToListButton = ({ praiseId, onAdd }: AddToListButtonProps) => {
  const { t } = useTranslation('common');
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { data: lists, isLoading } = usePraiseLists();
  const addPraiseMutation = useAddPraiseToList();
  
  // Get last used list
  const lastUsedListId = localStorage.getItem('lastUsedListId');
  const { data: lastUsedList } = usePraiseList(lastUsedListId || '');

  // Check if praise is already in the last used list
  const isPraiseInLastList = useMemo(() => {
    if (!lastUsedList || !lastUsedList.praises) return false;
    return lastUsedList.praises.some(p => p.id === praiseId);
  }, [lastUsedList, praiseId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleAddToList = (listId: string) => {
    addPraiseMutation.mutate(
      { listId, praiseId },
      {
        onSuccess: () => {
          setIsOpen(false);
          // Save as last used list
          localStorage.setItem('lastUsedListId', listId);
          if (onAdd) {
            onAdd(listId);
          }
        },
      }
    );
  };

  const handleQuickAdd = () => {
    if (lastUsedListId && !isPraiseInLastList) {
      handleAddToList(lastUsedListId);
    }
  };

  return (
    <div className="flex items-center justify-end gap-2 flex-wrap">
      {lastUsedList && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleQuickAdd}
          disabled={addPraiseMutation.isPending || isPraiseInLastList}
          className="flex items-center gap-1 min-w-0"
          title={
            isPraiseInLastList
              ? t('message.alreadyInList') || `Já está em ${lastUsedList.name}`
              : t('button.addToLastList') || `Adicionar à ${lastUsedList.name}`
          }
        >
          {isPraiseInLastList ? (
            <>
              <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
              <span className="hidden sm:inline truncate max-w-[150px]">
                {t('message.inList') || 'Na lista'} {lastUsedList.name}
              </span>
            </>
          ) : (
            <>
              <List className="w-4 h-4 flex-shrink-0" />
              <span className="hidden sm:inline truncate max-w-[150px]">
                {t('button.addTo') || 'Adicionar à'} {lastUsedList.name}
              </span>
            </>
          )}
        </Button>
      )}
      <div className="relative" ref={dropdownRef}>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1"
        >
          <List className="w-4 h-4" />
          <span>{t('button.addToList') || 'Adicionar à lista'}</span>
          <ChevronUp className="w-4 h-4" />
        </Button>

        {isOpen && (
          <div className="absolute bottom-full right-0 mb-2 w-64 bg-white rounded-md shadow-lg z-50 border border-gray-200">
            <div className="py-1 max-h-64 overflow-y-auto">
              {isLoading ? (
                <div className="px-4 py-2 text-sm text-gray-500">Carregando...</div>
              ) : lists && lists.length > 0 ? (
                lists.map((list) => (
                  <button
                    key={list.id}
                    onClick={() => handleAddToList(list.id)}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={addPraiseMutation.isPending}
                  >
                    <List className="w-4 h-4 flex-shrink-0" />
                    <span className="flex-1 truncate">{list.name}</span>
                    {list.praises_count > 0 && (
                      <span className="text-xs text-gray-500 flex-shrink-0">({list.praises_count})</span>
                    )}
                  </button>
                ))
              ) : (
                <div className="px-4 py-2 text-sm text-gray-500">
                  {t('message.noLists') || 'Nenhuma lista encontrada'}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
