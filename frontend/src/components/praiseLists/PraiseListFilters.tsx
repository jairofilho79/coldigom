import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Search, X, Calendar } from 'lucide-react';
import type { GetPraiseListsParams } from '@/api/praiseLists';

interface PraiseListFiltersProps {
  filters: GetPraiseListsParams;
  onFiltersChange: (filters: GetPraiseListsParams) => void;
}

export const PraiseListFilters = ({ filters, onFiltersChange }: PraiseListFiltersProps) => {
  const { t } = useTranslation('common');
  const [localName, setLocalName] = useState(filters.name || '');
  const [localDateFrom, setLocalDateFrom] = useState(filters.date_from || '');
  const [localDateTo, setLocalDateTo] = useState(filters.date_to || '');

  const handleApplyFilters = () => {
    const newFilters: GetPraiseListsParams = {};
    if (localName.trim()) {
      newFilters.name = localName.trim();
    }
    if (localDateFrom) {
      newFilters.date_from = localDateFrom;
    }
    if (localDateTo) {
      newFilters.date_to = localDateTo;
    }
    onFiltersChange(newFilters);
  };

  const handleClearFilters = () => {
    setLocalName('');
    setLocalDateFrom('');
    setLocalDateTo('');
    onFiltersChange({});
  };

  const hasActiveFilters = localName || localDateFrom || localDateTo;

  return (
    <div className="bg-white rounded-lg shadow-md p-6 space-y-4">
      <div className="flex items-center space-x-2 mb-4">
        <Search className="w-5 h-5 text-gray-500" />
        <h2 className="text-lg font-semibold text-gray-900">
          {t('label.filters') || 'Filtros de Pesquisa'}
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('label.listName') || 'Nome da Lista'}
          </label>
          <Input
            type="text"
            placeholder={t('placeholder.searchByName') || 'Pesquisar por nome...'}
            value={localName}
            onChange={(e) => setLocalName(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                handleApplyFilters();
              }
            }}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('label.dateFrom') || 'Data Inicial'}
          </label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="date"
              value={localDateFrom}
              onChange={(e) => setLocalDateFrom(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('label.dateTo') || 'Data Final'}
          </label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="date"
              value={localDateTo}
              onChange={(e) => setLocalDateTo(e.target.value)}
              min={localDateFrom || undefined}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end space-x-2 pt-2 border-t border-gray-200">
        {hasActiveFilters && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearFilters}
            className="flex items-center space-x-1"
          >
            <X className="w-4 h-4" />
            <span>{t('button.clearFilters') || 'Limpar Filtros'}</span>
          </Button>
        )}
        <Button
          variant="primary"
          size="sm"
          onClick={handleApplyFilters}
          className="flex items-center space-x-1"
        >
          <Search className="w-4 h-4" />
          <span>{t('button.search') || 'Pesquisar'}</span>
        </Button>
      </div>
    </div>
  );
};
