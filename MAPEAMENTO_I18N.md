# Mapeamento Completo de Internacionalização (i18n)

Este documento mapeia todos os textos hardcoded que precisam ser traduzidos no frontend.

## Estrutura de Organização

Os textos estão organizados em categorias no arquivo JSON:
- `button.*` - Textos de botões
- `label.*` - Labels de formulários e campos
- `message.*` - Mensagens (sucesso, erro, avisos)
- `page.*` - Títulos de páginas e seções
- `action.*` - Ações rápidas e links
- `validation.*` - Mensagens de validação
- `entity.*` - Nomes de entidades
- `translation.*` - Textos da interface de traduções
- `auth.*` - Textos de autenticação
- `helper.*` - Textos auxiliares

---

## 1. AUTENTICAÇÃO

### Login (`pages/Login.tsx`)
```json
"auth": {
  "loginTitle": "Faça login na sua conta",
  "loginSubtitle": "Ou",
  "createAccount": "crie uma nova conta",
  "loginButton": "Entrar",
  "username": "Username",
  "password": "Senha"
}
```

### Register (`pages/Register.tsx`)
```json
"auth": {
  "registerTitle": "Crie sua conta",
  "registerSubtitle": "Já tem uma conta?",
  "loginLink": "Faça login",
  "registerButton": "Registrar",
  "confirmPassword": "Confirmar Senha"
}
```

---

## 2. PÁGINAS PRINCIPAIS

### Dashboard (`pages/Dashboard.tsx`)
✅ **JÁ TRADUZIDO** - usando `t('page.dashboard')`, `t('action.newPraise')`, etc.

### PraiseList (`pages/Praises/PraiseList.tsx`)
```json
"page": {
  "praises": "Praises" // JÁ TEM
},
"action": {
  "newPraise": "Novo Praise", // JÁ TEM
  "createFirstPraise": "Criar primeiro praise" // FALTANDO
},
"message": {
  "noPraisesFound": "Nenhum praise encontrado", // JÁ TEM (noPraises)
  "noPraises": "Nenhum praise cadastrado", // JÁ TEM
  "searchPlaceholder": "Buscar por nome..." // FALTANDO
},
"pagination": {
  "previous": "Anterior",
  "next": "Próximo"
}
```

### PraiseCreate (`pages/Praises/PraiseCreate.tsx`)
```json
"page": {
  "createPraise": "Criar Novo Praise" // FALTANDO
}
```

### PraiseEdit (`pages/Praises/PraiseEdit.tsx`)
```json
"page": {
  "editPraise": "Editar Praise" // FALTANDO
},
"message": {
  "praiseNotFound": "Praise não encontrado"
}
```

### PraiseDetail (`pages/Praises/PraiseDetail.tsx`)
```json
"message": {
  "errorLoadingPraise": "Erro ao carregar praise ou praise não encontrado.",
  "deletePraiseTitle": "Deletar Praise",
  "deletePraiseMessage": "Tem certeza que deseja deletar este praise? Esta ação não pode ser desfeita."
}
```

---

## 3. COMPONENTES DE FORMULÁRIO

### MaterialKindForm (`components/materialKinds/MaterialKindForm.tsx`)
```json
"label": {
  "materialKindName": "Nome do Tipo de Material" // FALTANDO
}
```

### MaterialTypeForm (`components/materialTypes/MaterialTypeForm.tsx`)
```json
"label": {
  "materialTypeName": "Nome do Tipo de Arquivo" // FALTANDO
}
```

### TagForm (`components/tags/TagForm.tsx`)
```json
"label": {
  "tagName": "Nome da Tag" // FALTANDO
}
```

### MaterialForm (`components/materials/MaterialForm.tsx`)
```json
"label": {
  "selectMaterialKind": "Selecione um tipo de material", // FALTANDO
  "selectFile": "Selecionar Arquivo", // FALTANDO
  "replaceFile": "Substituir Arquivo", // FALTANDO
  "changeFile": "Trocar Arquivo" // FALTANDO
}
```

### PraiseMaterialsList (`components/praises/PraiseMaterialsList.tsx`)
```json
"label": {
  "materials": "Materiais" // JÁ TEM
},
"action": {
  "newMaterial": "Novo Material" // JÁ TEM
},
"message": {
  "noMaterialsAdded": "Nenhum material adicionado" // JÁ TEM
}
```

---

## 4. LISTAGENS

### TagList (`pages/Tags/TagList.tsx`)
```json
"page": {
  "tags": "Tags" // JÁ TEM
},
"action": {
  "newTag": "Nova Tag" // JÁ TEM
},
"modal": {
  "createTag": "Criar Nova Tag",
  "editTag": "Editar Tag",
  "deleteTag": "Deletar Tag"
},
"message": {
  "noTagsRegistered": "Nenhuma tag cadastrada",
  "deleteTagConfirm": "Tem certeza que deseja deletar esta tag?"
}
```

### MaterialKindList (`pages/MaterialKinds/MaterialKindList.tsx`)
```json
"page": {
  "materialKinds": "Tipos de Material" // JÁ TEM
},
"action": {
  "newType": "Novo Tipo" // JÁ TEM
},
"modal": {
  "createMaterialKind": "Criar Novo Tipo de Material",
  "editMaterialKind": "Editar Tipo de Material",
  "deleteMaterialKind": "Deletar Tipo de Material"
},
"message": {
  "noMaterialKindsRegistered": "Nenhum tipo de material cadastrado",
  "deleteMaterialKindConfirm": "Tem certeza que deseja deletar este tipo de material?"
}
```

### MaterialTypeList (`pages/MaterialTypes/MaterialTypeList.tsx`)
```json
"page": {
  "materialTypes": "Tipos de Arquivo" // JÁ TEM
},
"action": {
  "newType": "Novo Tipo" // JÁ TEM
},
"modal": {
  "createMaterialType": "Criar Novo Tipo de Arquivo",
  "editMaterialType": "Editar Tipo de Arquivo",
  "deleteMaterialType": "Deletar Tipo de Arquivo"
},
"message": {
  "noMaterialTypesRegistered": "Nenhum tipo de arquivo cadastrado",
  "deleteMaterialTypeConfirm": "Tem certeza que deseja deletar este tipo de arquivo?"
}
```

---

## 5. HOOKS - MENSAGENS DE TOAST

### useAuth (`hooks/useAuth.ts`)
```json
"message": {
  "loginSuccess": "Login realizado com sucesso!",
  "loginError": "Erro ao fazer login",
  "registerSuccess": "Registro realizado com sucesso! Faça login para continuar.",
  "registerError": "Erro ao registrar"
}
```

### usePraises (`hooks/usePraises.ts`)
```json
"message": {
  "praiseCreated": "Praise criado com sucesso!",
  "praiseCreateError": "Erro ao criar praise",
  "praiseUpdated": "Praise atualizado com sucesso!",
  "praiseUpdateError": "Erro ao atualizar praise",
  "praiseDeleted": "Praise deletado com sucesso!",
  "praiseDeleteError": "Erro ao deletar praise"
}
```

### useTags (`hooks/useTags.ts`)
```json
"message": {
  "tagCreated": "Tag criada com sucesso!",
  "tagCreateError": "Erro ao criar tag",
  "tagUpdated": "Tag atualizada com sucesso!",
  "tagUpdateError": "Erro ao atualizar tag",
  "tagDeleted": "Tag deletada com sucesso!",
  "tagDeleteError": "Erro ao deletar tag"
}
```

### useMaterialKinds (`hooks/useMaterialKinds.ts`)
```json
"message": {
  "materialKindCreated": "Tipo de material criado com sucesso!",
  "materialKindCreateError": "Erro ao criar tipo de material",
  "materialKindUpdated": "Tipo de material atualizado com sucesso!",
  "materialKindUpdateError": "Erro ao atualizar tipo de material",
  "materialKindDeleted": "Tipo de material deletado com sucesso!",
  "materialKindDeleteError": "Erro ao deletar tipo de material"
}
```

### useMaterialTypes (`hooks/useMaterialTypes.ts`)
```json
"message": {
  "materialTypeCreated": "Tipo de arquivo criado com sucesso!",
  "materialTypeCreateError": "Erro ao criar tipo de arquivo",
  "materialTypeUpdated": "Tipo de arquivo atualizado com sucesso!",
  "materialTypeUpdateError": "Erro ao atualizar tipo de arquivo",
  "materialTypeDeleted": "Tipo de arquivo deletado com sucesso!",
  "materialTypeDeleteError": "Erro ao deletar tipo de arquivo"
}
```

### useLanguages (`hooks/useLanguages.ts`)
```json
"message": {
  "languageCreated": "Linguagem criada com sucesso",
  "languageCreateError": "Erro ao criar linguagem",
  "languageUpdated": "Linguagem atualizada com sucesso",
  "languageUpdateError": "Erro ao atualizar linguagem",
  "languageDeleted": "Linguagem deletada com sucesso",
  "languageDeleteError": "Erro ao deletar linguagem"
}
```

---

## 6. VALIDAÇÃO (`utils/validation.ts`)

```json
"validation": {
  "usernameMinLength": "Username deve ter no mínimo {min} caracteres",
  "usernameMaxLength": "Username deve ter no máximo {max} caracteres",
  "passwordMinLength": "Senha deve ter no mínimo {min} caracteres",
  "passwordMismatch": "As senhas não coincidem",
  "nameRequired": "Nome é obrigatório",
  "nameTooLong": "Nome muito longo",
  "praiseIdInvalid": "ID do praise inválido",
  "materialKindIdInvalid": "ID do tipo de material inválido",
  "materialTypeIdInvalid": "ID do tipo de arquivo inválido",
  "pathRequired": "Path/URL é obrigatório"
}
```

---

## 7. INTERFACE DE TRADUÇÕES

### TranslationList (`pages/Translations/TranslationList.tsx`)
```json
"translation": {
  "description": "Gerencie as traduções de Material Kinds, Praise Tags e Material Types"
}
```

### TranslationEditor (`pages/Translations/TranslationEditor.tsx`)
```json
"translation": {
  "entityType": "Tipo de Entidade",
  "comparisonLanguage": "Linguagem de Comparação",
  "targetLanguage": "Linguagem de Destino",
  "loadTranslations": "Carregar Traduções",
  "saveAll": "Salvar Todas",
  "saving": "Salvando...",
  "saveAllWithCount": "Salvar Todas ({count})",
  "noTranslationsToSave": "Nenhuma tradução para salvar",
  "loadTranslationsToStart": "Clique em \"Carregar Traduções\" para começar",
  "loadingTranslations": "Carregando traduções...",
  "translationPlaceholder": "Digite a tradução...",
  "errorLoading": "Erro ao carregar traduções",
  "errorSaving": "Erro ao salvar traduções",
  "successSaved": "{count} tradução(ões) salva(s) com sucesso"
}
```

---

## 8. COMPONENTES UI

### ConfirmDialog (`components/ui/ConfirmDialog.tsx`)
```json
"confirmDialog": {
  "defaultConfirm": "Confirmar",
  "defaultCancel": "Cancelar"
}
```

### MaterialCard (`components/materials/MaterialCard.tsx`)
```json
"entity": {
  "material": "Material"
}
```

---

## 9. HELPERS/UTILS

### helpers.ts (`utils/helpers.ts`)
```json
"helper": {
  "bytes": "Bytes",
  "kb": "KB",
  "mb": "MB",
  "gb": "GB"
}
```

---

## 10. MENSAGENS DE ERRO

```json
"message": {
  "errorLoadingData": "Erro ao carregar dados. Tente novamente.",
  "errorLoading": "Erro ao carregar", // Genérico
  "actionCannotBeUndone": "Esta ação não pode ser desfeita"
}
```

---

## RESUMO DE CATEGORIAS

### Já Traduzidos ✅
- Dashboard (maioria)
- Header (navegação)
- PraiseForm
- MaterialForm (parcial)
- PraiseDetail (parcial)
- TranslationList

### Faltando Tradução ❌

#### Autenticação
- Login.tsx (título, subtítulo, botão)
- Register.tsx (título, subtítulo, botão, confirmPassword)

#### Páginas
- PraiseList (busca, paginação)
- PraiseCreate (título)
- PraiseEdit (título, mensagem not found)
- PraiseDetail (mensagens de erro e confirmação)

#### Formulários
- MaterialKindForm (label)
- MaterialTypeForm (label)
- TagForm (label)
- MaterialForm (labels de arquivo)

#### Listagens
- TagList (modais, mensagens)
- MaterialKindList (modais, mensagens)
- MaterialTypeList (modais, mensagens)

#### Hooks (Toasts)
- useAuth (todas as mensagens)
- usePraises (todas as mensagens)
- useTags (todas as mensagens)
- useMaterialKinds (todas as mensagens)
- useMaterialTypes (todas as mensagens)
- useLanguages (todas as mensagens)

#### Validação
- validation.ts (todas as mensagens de validação)

#### Interface de Traduções
- TranslationEditor (algumas mensagens específicas)

---

## PRÓXIMOS PASSOS

1. Expandir arquivos JSON com todas as chaves faltantes
2. Refatorar componentes para usar `t()` nos lugares identificados
3. Criar hooks customizados para toasts traduzidos
4. Atualizar validação para usar traduções
