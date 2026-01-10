import { z } from 'zod';

// Login Schema
export const loginSchema = z.object({
  username: z.string().min(3, 'Username deve ter no mínimo 3 caracteres'),
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
});

export type LoginFormData = z.infer<typeof loginSchema>;

// Register Schema
export const registerSchema = z
  .object({
    email: z.string().email('Email inválido'),
    username: z
      .string()
      .min(3, 'Username deve ter no mínimo 3 caracteres')
      .max(50, 'Username deve ter no máximo 50 caracteres'),
    password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'As senhas não coincidem',
    path: ['confirmPassword'],
  });

export type RegisterFormData = z.infer<typeof registerSchema>;

// Praise Schemas
export const praiseCreateSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(255, 'Nome muito longo'),
  number: z.number().int().positive().nullable().optional(),
  tag_ids: z.array(z.string().uuid()).optional(),
  materials: z.array(z.any()).optional(),
});

export type PraiseCreateFormData = z.infer<typeof praiseCreateSchema>;

export const praiseUpdateSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(255, 'Nome muito longo').optional(),
  number: z.number().int().positive().nullable().optional(),
  tag_ids: z.array(z.string().uuid()).nullable().optional(),
});

export type PraiseUpdateFormData = z.infer<typeof praiseUpdateSchema>;

// Tag Schemas
export const tagCreateSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(255, 'Nome muito longo'),
});

export type TagCreateFormData = z.infer<typeof tagCreateSchema>;

export const tagUpdateSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(255, 'Nome muito longo').optional(),
});

export type TagUpdateFormData = z.infer<typeof tagUpdateSchema>;

// Material Kind Schemas
export const materialKindCreateSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(255, 'Nome muito longo'),
});

export type MaterialKindCreateFormData = z.infer<typeof materialKindCreateSchema>;

export const materialKindUpdateSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(255, 'Nome muito longo').optional(),
});

export type MaterialKindUpdateFormData = z.infer<typeof materialKindUpdateSchema>;

// Material Schemas
export const materialCreateSchema = z.object({
  praise_id: z.string().uuid('ID do praise inválido'),
  material_kind_id: z.string().uuid('ID do tipo de material inválido'),
  path: z.string().min(1, 'Path/URL é obrigatório'),
  type: z.enum(['file', 'youtube', 'spotify', 'text']),
});

export type MaterialCreateFormData = z.infer<typeof materialCreateSchema>;

export const materialUpdateSchema = z.object({
  material_kind_id: z.string().uuid('ID do tipo de material inválido').optional(),
  path: z.string().min(1, 'Path/URL é obrigatório').optional(),
  type: z.enum(['file', 'youtube', 'spotify', 'text']).optional(),
});

export type MaterialUpdateFormData = z.infer<typeof materialUpdateSchema>;
