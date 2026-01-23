import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { usePraiseLists } from '@/hooks/usePraiseLists';
import { PraiseListCard } from '@/components/praiseLists/PraiseListCard';
import { PraiseListFilters } from '@/components/praiseLists/PraiseListFilters';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import { Plus } from 'lucide-react';
import type { GetPraiseListsParams } from '@/api/praiseLists';

export const PraiseListList = () => {
  const { t } = useTranslation('common');
  const [filters, setFilters] = useState<GetPraiseListsParams>({});
  const { data: lists, isLoading, error } = usePraiseLists(filters);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <Loading size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center text-red-600">
        {t('message.errorLoadingData') || 'Erro ao carregar dados'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">
          {t('page.praiseLists') || 'Listas de Praises'}
        </h1>
        <Link to="/praise-lists/create">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            {t('action.newList') || 'Nova Lista'}
          </Button>
        </Link>
      </div>

      <PraiseListFilters filters={filters} onFiltersChange={setFilters} />

      {lists && lists.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {lists.map((list) => (
            <PraiseListCard key={list.id} list={list} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg">
            {Object.keys(filters).length > 0
              ? t('message.noListsFound') || 'Nenhuma lista encontrada com os filtros aplicados'
              : t('message.noLists') || 'Nenhuma lista encontrada'}
          </p>
          {Object.keys(filters).length === 0 && (
            <Link to="/praise-lists/create" className="mt-4 inline-block">
              <Button>{t('action.createFirstList') || 'Criar primeira lista'}</Button>
            </Link>
          )}
        </div>
      )}
    </div>
  );
};
