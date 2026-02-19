import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { usePraises } from '@/hooks/usePraises';
import { useTag } from '@/hooks/useTags';
import { useEntityTranslations } from '@/hooks/useEntityTranslations';
import { PraiseCard } from '@/components/praises/PraiseCard';
import { DownloadByMaterialKindModal } from '@/components/praises/DownloadByMaterialKindModal';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import { Plus, Search, X, Tag, Download } from 'lucide-react';

export const PraiseList = () => {
  const { t } = useTranslation('common');
  const [searchParams, setSearchParams] = useSearchParams();
  const { getPraiseTagName } = useEntityTranslations();
  const [searchTerm, setSearchTerm] = useState('');
  const [searchInLyrics, setSearchInLyrics] = useState(false);
  const [skip, setSkip] = useState(0);
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [sortBy, setSortBy] = useState<'name' | 'number'>('name');
  const limit = 20;
  const tagId = searchParams.get('tag_id') || undefined;

  const { data: praises, isLoading, error } = usePraises({
    skip,
    limit,
    name: searchTerm || undefined,
    tag_id: tagId,
    search_in_lyrics: searchInLyrics || undefined,
    sort_by: sortBy,
    sort_direction: 'asc',
    no_number: sortBy === 'number' ? 'last' : undefined,
  });

  const { data: tag } = useTag(tagId || '');

  const handleRemoveTagFilter = () => {
    const newSearchParams = new URLSearchParams(searchParams);
    newSearchParams.delete('tag_id');
    setSearchParams(newSearchParams);
    setSkip(0);
  };

  if (isLoading && !praises) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <Loading size="lg" />
      </div>
    );
  }

  // Mostra erro apenas se não houver dados em cache (stale ou não)
  if (error && !praises) {
    return (
      <div className="text-center text-red-600">
        {t('message.errorLoadingData')}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">{t('page.praises')}</h1>
        <div className="flex space-x-3">
          <Button
            variant="outline"
            onClick={() => setIsDownloadModalOpen(true)}
          >
            <Download className="w-4 h-4 mr-2" />
            {t('button.downloadByMaterialKind') || 'Baixar por Material Kind'}
          </Button>
          <Link to="/praises/create">
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              {t('action.newPraise')}
            </Button>
          </Link>
        </div>
      </div>

      {tagId && tag && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Tag className="w-5 h-5 text-blue-600" />
            <span className="text-blue-800 font-medium">
              {t('message.filteringByTag')}: <span className="font-semibold">{getPraiseTagName(tag.id, tag.name)}</span>
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRemoveTagFilter}
            className="flex items-center space-x-1"
          >
            <X className="w-4 h-4" />
            <span>{t('button.removeFilter')}</span>
          </Button>
        </div>
      )}

      <div className="space-y-2">
        <div className="relative flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder={t('message.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setSkip(0);
              }}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <label className="flex items-center gap-2 whitespace-nowrap text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={searchInLyrics}
              onChange={(e) => {
                setSearchInLyrics(e.target.checked);
                setSkip(0);
              }}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            {t('label.searchInLyrics') || 'Letra'}
          </label>
          <div className="flex items-center gap-2">
            <label htmlFor="sort-praises" className="text-sm font-medium text-gray-700 whitespace-nowrap">
              {t('label.sortBy') || 'Ordenar por'}
            </label>
            <select
              id="sort-praises"
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value as 'name' | 'number');
                setSkip(0);
              }}
              className="rounded-md border border-gray-300 py-2 pl-3 pr-8 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="name">{t('option.sortByName') || 'Nome'}</option>
              <option value="number">{t('option.sortByNumber') || 'Número (sem número por último)'}</option>
            </select>
          </div>
        </div>
      </div>

      {praises && praises.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {praises.map((praise) => (
            <PraiseCard key={praise.id} praise={praise} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg">
            {searchTerm ? t('message.noPraisesFound') : t('message.noPraises')}
          </p>
          {!searchTerm && (
            <Link to="/praises/create" className="mt-4 inline-block">
              <Button>{t('action.createFirstPraise')}</Button>
            </Link>
          )}
        </div>
      )}

      {praises && praises.length >= limit && (
        <div className="flex justify-center space-x-4">
          <Button
            variant="outline"
            onClick={() => setSkip(Math.max(0, skip - limit))}
            disabled={skip === 0}
          >
            {t('pagination.previous')}
          </Button>
          <Button
            variant="outline"
            onClick={() => setSkip(skip + limit)}
            disabled={praises.length < limit}
          >
            {t('pagination.next')}
          </Button>
        </div>
      )}

      <DownloadByMaterialKindModal
        isOpen={isDownloadModalOpen}
        onClose={() => setIsDownloadModalOpen(false)}
        tagId={tagId}
        tagName={tag ? getPraiseTagName(tag.id, tag.name) : undefined}
      />
    </div>
  );
};
