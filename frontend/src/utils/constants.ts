export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: '/api/v1/auth/login',
    REGISTER: '/api/v1/auth/register',
  },
  PRAISES: '/api/v1/praises',
  TAGS: '/api/v1/praise-tags',
  MATERIALS: '/api/v1/praise-materials',
  MATERIAL_KINDS: '/api/v1/material-kinds',
} as const;

export const PAGINATION = {
  DEFAULT_SKIP: 0,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 1000,
} as const;

export const FILE_UPLOAD = {
  MAX_SIZE: 100 * 1024 * 1024, // 100MB
  ALLOWED_TYPES: [
    'image/*',
    'audio/*',
    'video/*',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
} as const;
