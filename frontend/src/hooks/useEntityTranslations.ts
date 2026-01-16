import { useQuery } from '@tanstack/react-query';
import { translationsApi } from '@/api/translations';
import { useLanguageStore } from '@/store/languageStore';

export const useEntityTranslations = () => {
  const { currentLanguage } = useLanguageStore();

  // Fetch translations for all entity types
  const { data: materialKindTranslations = [] } = useQuery({
    queryKey: ['materialKindTranslations', currentLanguage],
    queryFn: () => translationsApi.getMaterialKindTranslations(undefined, currentLanguage),
  });

  const { data: praiseTagTranslations = [] } = useQuery({
    queryKey: ['praiseTagTranslations', currentLanguage],
    queryFn: () => translationsApi.getPraiseTagTranslations(undefined, currentLanguage),
  });

  const { data: materialTypeTranslations = [] } = useQuery({
    queryKey: ['materialTypeTranslations', currentLanguage],
    queryFn: () => translationsApi.getMaterialTypeTranslations(undefined, currentLanguage),
  });

  const getMaterialKindName = (entityId: string, fallbackName: string): string => {
    const translation = materialKindTranslations.find((t) => t.material_kind_id === entityId);
    return translation?.translated_name || fallbackName;
  };

  const getPraiseTagName = (entityId: string, fallbackName: string): string => {
    const translation = praiseTagTranslations.find((t) => t.praise_tag_id === entityId);
    return translation?.translated_name || fallbackName;
  };

  const getMaterialTypeName = (entityId: string, fallbackName: string): string => {
    const translation = materialTypeTranslations.find((t) => t.material_type_id === entityId);
    return translation?.translated_name || fallbackName;
  };

  return {
    getMaterialKindName,
    getPraiseTagName,
    getMaterialTypeName,
    materialKindTranslations,
    praiseTagTranslations,
    materialTypeTranslations,
  };
};
