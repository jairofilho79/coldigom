import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useMaterialKinds } from '@/hooks/useMaterialKinds';
import { useTags } from '@/hooks/useTags';
import { useMaterialTypes } from '@/hooks/useMaterialTypes';
import { useLanguages } from '@/hooks/useLanguages';
import {
  translationsApi,
  type MaterialKindTranslationResponse,
  type PraiseTagTranslationResponse,
  type MaterialTypeTranslationResponse,
} from '@/api/translations';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLanguageStore } from '@/store/languageStore';
import toast from 'react-hot-toast';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

type EntityType = 'material_kind' | 'praise_tag' | 'material_type';

interface TranslationEntry {
  entityId: string;
  entityName: string;
  comparisonText: string;
  translationText: string;
  translationId?: string;
}

export const TranslationEditor = () => {
  const { t } = useTranslation('common');
  const { currentLanguage } = useLanguageStore();
  const queryClient = useQueryClient();

  const [entityType, setEntityType] = useState<EntityType>('material_kind');
  const [comparisonLanguage, setComparisonLanguage] = useState<string>(currentLanguage);
  const [targetLanguage, setTargetLanguage] = useState<string>('en-US');
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch data
  const { data: languages = [] } = useLanguages();
  const { data: materialKinds = [] } = useMaterialKinds();
  const { data: tags = [] } = useTags();
  const { data: materialTypes = [] } = useMaterialTypes();

  // Fetch translations
  const [translations, setTranslations] = useState<TranslationEntry[]>([]);
  const [loading, setLoading] = useState(false);

  // Get current entity list
  const entities = useMemo(() => {
    if (entityType === 'material_kind') return materialKinds;
    if (entityType === 'praise_tag') return tags;
    return materialTypes;
  }, [entityType, materialKinds, tags, materialTypes]);

  // Load translations
  const loadTranslations = async () => {
    if (!comparisonLanguage || !targetLanguage) return;

    setLoading(true);
    try {
      // Get all translations for target language
      const targetTranslations = await translationsApi[
        entityType === 'material_kind'
          ? 'getMaterialKindTranslations'
          : entityType === 'praise_tag'
          ? 'getPraiseTagTranslations'
          : 'getMaterialTypeTranslations'
      ](undefined, targetLanguage);

      type TranslationItem =
        | MaterialKindTranslationResponse
        | PraiseTagTranslationResponse
        | MaterialTypeTranslationResponse;
      const getEntityId = (t: TranslationItem): string => {
        if ('material_kind_id' in t) return t.material_kind_id;
        if ('praise_tag_id' in t) return t.praise_tag_id;
        return t.material_type_id;
      };
      const entries: TranslationEntry[] = entities.map((entity) => {
        const translation = (targetTranslations as TranslationItem[]).find(
          (t) => getEntityId(t) === entity.id
        );

        // For comparison text, try to get translation in comparison language, otherwise use name
        let comparisonText = entity.name;
        // TODO: Load comparison language translations if needed

        return {
          entityId: entity.id,
          entityName: entity.name,
          comparisonText,
          translationText: translation?.translated_name || '',
          translationId: translation?.id,
        };
      });

      setTranslations(entries);
    } catch (error: any) {
      toast.error(error.response?.data?.detail || t('message.errorLoadingTranslations'));
    } finally {
      setLoading(false);
    }
  };

  // Save all translations mutation
  const saveAllTranslationsMutation = useMutation({
    mutationFn: async (entriesToSave: TranslationEntry[]) => {
      const results = [];
      for (const entry of entriesToSave) {
        if (!entry.translationText.trim()) {
          continue; // Skip empty translations
        }

        const translationData = {
          language_code: targetLanguage,
          translated_name: entry.translationText.trim(),
          ...(entityType === 'material_kind'
            ? { material_kind_id: entry.entityId }
            : entityType === 'praise_tag'
            ? { praise_tag_id: entry.entityId }
            : { material_type_id: entry.entityId }),
        };

        try {
          if (entry.translationId) {
            // Update existing translation
            const result = await translationsApi[
              entityType === 'material_kind'
                ? 'updateMaterialKindTranslation'
                : entityType === 'praise_tag'
                ? 'updatePraiseTagTranslation'
                : 'updateMaterialTypeTranslation'
            ](entry.translationId, { translated_name: entry.translationText.trim() });
            results.push({ entry, result });
          } else {
            // Create new translation
            const result = await translationsApi[
              entityType === 'material_kind'
                ? 'createMaterialKindTranslation'
                : entityType === 'praise_tag'
                ? 'createPraiseTagTranslation'
                : 'createMaterialTypeTranslation'
            ](translationData as any);
            results.push({ entry, result });
          }
        } catch (error: any) {
          // Continue with other translations even if one fails
          console.error(`Error saving translation for ${entry.entityId}:`, error);
          throw error;
        }
      }
      return results;
    },
    onSuccess: (results) => {
      // Update local state with new IDs
      const updated = [...translations];
      results.forEach(({ entry, result }) => {
        const index = updated.findIndex((t) => t.entityId === entry.entityId);
        if (index !== -1) {
          updated[index] = {
            ...updated[index],
            translationId: result.id,
          };
        }
      });
      setTranslations(updated);

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['translations'] });
      queryClient.invalidateQueries({
        queryKey: [
          entityType === 'material_kind' ? 'materialKinds' : entityType === 'praise_tag' ? 'tags' : 'materialTypes',
        ],
      });

      toast.success(t('message.translationsSaved', { count: results.length }));
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || t('message.errorSavingTranslations'));
    },
  });

  // Filtered translations
  const filteredTranslations = useMemo(() => {
    if (!searchTerm) return translations;
    const term = searchTerm.toLowerCase();
    return translations.filter(
      (entry) =>
        entry.entityName.toLowerCase().includes(term) ||
        entry.comparisonText.toLowerCase().includes(term) ||
        entry.translationText.toLowerCase().includes(term)
    );
  }, [translations, searchTerm]);

  // Load translations when entity type or languages change
  useEffect(() => {
    if (entities.length > 0 && comparisonLanguage && targetLanguage) {
      loadTranslations();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, comparisonLanguage, targetLanguage]);

  const handleSaveAll = () => {
    // Get all translations that have text filled
    const entriesToSave = translations.filter((entry) => entry.translationText.trim());
    if (entriesToSave.length === 0) {
      toast.error(t('message.noTranslationsToSave'));
      return;
    }
    saveAllTranslationsMutation.mutate(entriesToSave);
  };

  const handleTranslationChange = (index: number, value: string) => {
    const updated = [...translations];
    updated[index] = { ...updated[index], translationText: value };
    setTranslations(updated);
  };

  // Count how many translations have text
  const translationsToSaveCount = useMemo(() => {
    return translations.filter((entry) => entry.translationText.trim()).length;
  }, [translations]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('translation.entityType')}
            </label>
            <select
              value={entityType}
              onChange={(e) => {
                setEntityType(e.target.value as EntityType);
                setTranslations([]);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="material_kind">Material Kind</option>
              <option value="praise_tag">Praise Tag</option>
              <option value="material_type">Material Type</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('translation.comparisonLanguage')}
            </label>
            <select
              value={comparisonLanguage}
              onChange={(e) => {
                setComparisonLanguage(e.target.value);
                setTranslations([]);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              onBlur={loadTranslations}
            >
              {languages.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('translation.targetLanguage')}
            </label>
            <select
              value={targetLanguage}
              onChange={(e) => {
                setTargetLanguage(e.target.value);
                setTranslations([]);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              onBlur={loadTranslations}
            >
              {languages
                .filter((lang) => lang.code !== comparisonLanguage)
                .map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.name}
                  </option>
                ))}
            </select>
          </div>
        </div>

        <div>
          <Input
            type="text"
            placeholder={t('label.search')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full"
          />
        </div>

        <Button onClick={loadTranslations} disabled={loading}>
          {t('translation.loadTranslations')}
        </Button>
      </div>

      {/* Split View */}
      {translations.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="grid grid-cols-2 divide-x divide-gray-200">
            {/* Left Side - Comparison */}
            <div className="p-4 bg-gray-50">
              <h3 className="font-semibold text-gray-700 mb-4">
                {languages.find((l) => l.code === comparisonLanguage)?.name || comparisonLanguage}
              </h3>
              <div className="space-y-4 max-h-[600px] overflow-y-auto">
                {filteredTranslations.map((entry) => (
                  <div key={entry.entityId} className="p-3 bg-white rounded border">
                    <div className="text-sm font-medium text-gray-900 mb-1">
                      {entry.entityName}
                    </div>
                    <div className="text-sm text-gray-600">{entry.comparisonText}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Side - Translation */}
            <div className="p-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold text-gray-700">
                  {languages.find((l) => l.code === targetLanguage)?.name || targetLanguage}
                </h3>
                <Button
                  onClick={handleSaveAll}
                  disabled={
                    translationsToSaveCount === 0 || saveAllTranslationsMutation.isPending
                  }
                  size="sm"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {saveAllTranslationsMutation.isPending
                    ? t('translation.saving')
                    : t('translation.saveAllWithCount', { count: translationsToSaveCount })}
                </Button>
              </div>
              <div className="space-y-4 max-h-[600px] overflow-y-auto">
                {filteredTranslations.map((entry) => {
                  const originalIndex = translations.indexOf(entry);
                  return (
                    <div key={entry.entityId} className="space-y-2">
                      <div className="text-sm font-medium text-gray-900">
                        {entry.entityName}
                      </div>
                        <Input
                          type="text"
                          value={entry.translationText}
                          onChange={(e) => handleTranslationChange(originalIndex, e.target.value)}
                          placeholder={t('translation.translationPlaceholder')}
                          className="w-full"
                        />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="text-center py-8 text-gray-500">{t('translation.loadingTranslations')}</div>
      )}

      {!loading && translations.length === 0 && entities.length > 0 && (
        <div className="text-center py-8 text-gray-500">
          {t('translation.loadTranslationsToStart')}
        </div>
      )}
    </div>
  );
};
