import apiClient from './client';
import type { AxiosResponse } from 'axios';

export interface TranslationBase {
  id: string;
  language_code: string;
  translated_name: string;
}

export interface MaterialKindTranslationResponse extends TranslationBase {
  material_kind_id: string;
}

export interface PraiseTagTranslationResponse extends TranslationBase {
  praise_tag_id: string;
}

export interface MaterialTypeTranslationResponse extends TranslationBase {
  material_type_id: string;
}

export interface MaterialKindTranslationCreate {
  material_kind_id: string;
  language_code: string;
  translated_name: string;
}

export interface PraiseTagTranslationCreate {
  praise_tag_id: string;
  language_code: string;
  translated_name: string;
}

export interface MaterialTypeTranslationCreate {
  material_type_id: string;
  language_code: string;
  translated_name: string;
}

export interface MaterialKindTranslationUpdate {
  translated_name?: string;
}

export interface PraiseTagTranslationUpdate {
  translated_name?: string;
}

export interface MaterialTypeTranslationUpdate {
  translated_name?: string;
}

export const translationsApi = {
  // MaterialKind Translations
  getMaterialKindTranslations: async (
    material_kind_id?: string,
    language_code?: string
  ): Promise<MaterialKindTranslationResponse[]> => {
    const params: Record<string, string> = {};
    if (material_kind_id) params.material_kind_id = material_kind_id;
    if (language_code) params.language_code = language_code;
    
    const response: AxiosResponse<MaterialKindTranslationResponse[]> = await apiClient.get(
      '/api/v1/translations/material-kinds',
      { params }
    );
    return response.data;
  },

  getMaterialKindTranslation: async (id: string): Promise<MaterialKindTranslationResponse> => {
    const response: AxiosResponse<MaterialKindTranslationResponse> = await apiClient.get(
      `/api/v1/translations/material-kinds/${id}`
    );
    return response.data;
  },

  createMaterialKindTranslation: async (
    data: MaterialKindTranslationCreate
  ): Promise<MaterialKindTranslationResponse> => {
    const response: AxiosResponse<MaterialKindTranslationResponse> = await apiClient.post(
      '/api/v1/translations/material-kinds',
      data
    );
    return response.data;
  },

  updateMaterialKindTranslation: async (
    id: string,
    data: MaterialKindTranslationUpdate
  ): Promise<MaterialKindTranslationResponse> => {
    const response: AxiosResponse<MaterialKindTranslationResponse> = await apiClient.put(
      `/api/v1/translations/material-kinds/${id}`,
      data
    );
    return response.data;
  },

  deleteMaterialKindTranslation: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/v1/translations/material-kinds/${id}`);
  },

  // PraiseTag Translations
  getPraiseTagTranslations: async (
    praise_tag_id?: string,
    language_code?: string
  ): Promise<PraiseTagTranslationResponse[]> => {
    const params: Record<string, string> = {};
    if (praise_tag_id) params.praise_tag_id = praise_tag_id;
    if (language_code) params.language_code = language_code;
    
    const response: AxiosResponse<PraiseTagTranslationResponse[]> = await apiClient.get(
      '/api/v1/translations/praise-tags',
      { params }
    );
    return response.data;
  },

  getPraiseTagTranslation: async (id: string): Promise<PraiseTagTranslationResponse> => {
    const response: AxiosResponse<PraiseTagTranslationResponse> = await apiClient.get(
      `/api/v1/translations/praise-tags/${id}`
    );
    return response.data;
  },

  createPraiseTagTranslation: async (
    data: PraiseTagTranslationCreate
  ): Promise<PraiseTagTranslationResponse> => {
    const response: AxiosResponse<PraiseTagTranslationResponse> = await apiClient.post(
      '/api/v1/translations/praise-tags',
      data
    );
    return response.data;
  },

  updatePraiseTagTranslation: async (
    id: string,
    data: PraiseTagTranslationUpdate
  ): Promise<PraiseTagTranslationResponse> => {
    const response: AxiosResponse<PraiseTagTranslationResponse> = await apiClient.put(
      `/api/v1/translations/praise-tags/${id}`,
      data
    );
    return response.data;
  },

  deletePraiseTagTranslation: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/v1/translations/praise-tags/${id}`);
  },

  // MaterialType Translations
  getMaterialTypeTranslations: async (
    material_type_id?: string,
    language_code?: string
  ): Promise<MaterialTypeTranslationResponse[]> => {
    const params: Record<string, string> = {};
    if (material_type_id) params.material_type_id = material_type_id;
    if (language_code) params.language_code = language_code;
    
    const response: AxiosResponse<MaterialTypeTranslationResponse[]> = await apiClient.get(
      '/api/v1/translations/material-types',
      { params }
    );
    return response.data;
  },

  getMaterialTypeTranslation: async (id: string): Promise<MaterialTypeTranslationResponse> => {
    const response: AxiosResponse<MaterialTypeTranslationResponse> = await apiClient.get(
      `/api/v1/translations/material-types/${id}`
    );
    return response.data;
  },

  createMaterialTypeTranslation: async (
    data: MaterialTypeTranslationCreate
  ): Promise<MaterialTypeTranslationResponse> => {
    const response: AxiosResponse<MaterialTypeTranslationResponse> = await apiClient.post(
      '/api/v1/translations/material-types',
      data
    );
    return response.data;
  },

  updateMaterialTypeTranslation: async (
    id: string,
    data: MaterialTypeTranslationUpdate
  ): Promise<MaterialTypeTranslationResponse> => {
    const response: AxiosResponse<MaterialTypeTranslationResponse> = await apiClient.put(
      `/api/v1/translations/material-types/${id}`,
      data
    );
    return response.data;
  },

  deleteMaterialTypeTranslation: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/v1/translations/material-types/${id}`);
  },
};
