# Prompt para Criação do Frontend - Praise Manager

## Contexto do Projeto

Preciso criar um frontend moderno e completo para gerenciar um sistema de praises (cânticos/louvor) que já possui um backend FastAPI funcional. O backend está implementado seguindo Clean Architecture e possui todas as funcionalidades necessárias.

## Informações do Backend

### Tecnologias Backend
- **Framework**: FastAPI
- **Banco de Dados**: PostgreSQL
- **Autenticação**: JWT (Bearer Token)
- **Storage**: Wasabi (S3-compatible) ou Local Storage
- **API Base URL**: `http://localhost:8000` (padrão, configurável)
- **Documentação**: Swagger UI disponível em `/docs`

### Estrutura de Dados

#### User (Usuário)
```typescript
interface UserResponse {
  id: string; // UUID
  email: string;
  username: string;
  is_active: boolean;
  created_at: string; // ISO datetime
  updated_at: string; // ISO datetime
}

interface UserCreate {
  email: string;
  username: string; // min: 3, max: 50
  password: string; // min: 6
}

interface Token {
  access_token: string;
  token_type: "bearer";
}
```

#### Praise (Cântico/Louvor)
```typescript
interface PraiseResponse {
  id: string; // UUID
  name: string; // min: 1, max: 255
  number: number | null;
  created_at: string; // ISO datetime
  updated_at: string; // ISO datetime
  tags: PraiseTagSimple[];
  materials: PraiseMaterialSimple[];
}

interface PraiseCreate {
  name: string;
  number?: number | null;
  tag_ids?: string[]; // UUID[]
  materials?: PraiseMaterialCreate[];
}

interface PraiseUpdate {
  name?: string;
  number?: number | null;
  tag_ids?: string[] | null; // UUID[]
}
```

#### PraiseTag (Tag de Louvor)
```typescript
interface PraiseTagResponse {
  id: string; // UUID
  name: string; // min: 1, max: 255
}

interface PraiseTagCreate {
  name: string;
}

interface PraiseTagUpdate {
  name?: string;
}
```

#### MaterialKind (Tipo de Material)
```typescript
interface MaterialKindResponse {
  id: string; // UUID
  name: string; // min: 1, max: 255
}

interface MaterialKindCreate {
  name: string;
}

interface MaterialKindUpdate {
  name?: string;
}
```

#### PraiseMaterial (Material de Louvor)
```typescript
enum MaterialType {
  FILE = "file",
  YOUTUBE = "youtube",
  SPOTIFY = "spotify",
  TEXT = "text"
}

interface PraiseMaterialResponse {
  id: string; // UUID
  material_kind_id: string; // UUID
  praise_id: string; // UUID
  path: string; // URL ou caminho do arquivo
  type: MaterialType;
  material_kind?: MaterialKindResponse;
}

interface PraiseMaterialCreate {
  praise_id: string; // UUID
  material_kind_id: string; // UUID
  path: string;
  type: MaterialType;
}

interface PraiseMaterialUpdate {
  material_kind_id?: string; // UUID
  path?: string;
  type?: MaterialType;
}
```

### Endpoints da API

#### Autenticação (Público)
- `POST /api/v1/auth/register` - Registra novo usuário
  - Body: `UserCreate`
  - Response: `UserResponse` (201)
  
- `POST /api/v1/auth/login` - Login e obter token JWT
  - Body: Form data `OAuth2PasswordRequestForm` (username, password)
  - Response: `Token` (200)

#### Praise Tags (Protegido - requer autenticação JWT)
- `GET /api/v1/praise-tags/` - Listar tags
  - Query params: `skip?: number`, `limit?: number` (default: 0, 100)
  - Response: `PraiseTagResponse[]`
  
- `GET /api/v1/praise-tags/{id}` - Obter tag por ID
  - Response: `PraiseTagResponse`
  
- `POST /api/v1/praise-tags/` - Criar tag
  - Body: `PraiseTagCreate`
  - Response: `PraiseTagResponse` (201)
  
- `PUT /api/v1/praise-tags/{id}` - Atualizar tag
  - Body: `PraiseTagUpdate`
  - Response: `PraiseTagResponse`
  
- `DELETE /api/v1/praise-tags/{id}` - Deletar tag
  - Response: 204 No Content

#### Material Kinds (Protegido - requer autenticação JWT)
- `GET /api/v1/material-kinds/` - Listar tipos de material
  - Query params: `skip?: number`, `limit?: number` (default: 0, 100)
  - Response: `MaterialKindResponse[]`
  
- `GET /api/v1/material-kinds/{id}` - Obter tipo por ID
  - Response: `MaterialKindResponse`
  
- `POST /api/v1/material-kinds/` - Criar tipo
  - Body: `MaterialKindCreate`
  - Response: `MaterialKindResponse` (201)
  
- `PUT /api/v1/material-kinds/{id}` - Atualizar tipo
  - Body: `MaterialKindUpdate`
  - Response: `MaterialKindResponse`
  
- `DELETE /api/v1/material-kinds/{id}` - Deletar tipo
  - Response: 204 No Content

#### Praise Materials (Protegido - requer autenticação JWT)
- `GET /api/v1/praise-materials/` - Listar materiais
  - Query params: `skip?: number`, `limit?: number`, `praise_id?: UUID`
  - Response: `PraiseMaterialResponse[]`
  
- `GET /api/v1/praise-materials/{id}` - Obter material por ID
  - Response: `PraiseMaterialResponse`
  
- `POST /api/v1/praise-materials/upload` - Upload de arquivo
  - Body: `multipart/form-data` com campos:
    - `file: File` (obrigatório)
    - `material_kind_id: UUID` (obrigatório)
    - `praise_id: UUID` (obrigatório)
  - Response: `PraiseMaterialResponse` (201)
  
- `POST /api/v1/praise-materials/` - Criar material (links externos, textos)
  - Body: `PraiseMaterialCreate`
  - Response: `PraiseMaterialResponse` (201)
  
- `PUT /api/v1/praise-materials/{id}` - Atualizar material
  - Body: `PraiseMaterialUpdate`
  - Response: `PraiseMaterialResponse`
  
- `DELETE /api/v1/praise-materials/{id}` - Deletar material
  - Response: 204 No Content
  
- `GET /api/v1/praise-materials/{id}/download-url` - Obter URL de download
  - Query params: `expiration?: number` (default: 3600 segundos)
  - Response: `{ download_url: string, expires_in: number }`

#### Praises (Protegido - requer autenticação JWT)
- `GET /api/v1/praises/` - Listar praises
  - Query params: `skip?: number`, `limit?: number` (default: 0, 100), `name?: string` (busca opcional)
  - Response: `PraiseResponse[]`
  
- `GET /api/v1/praises/{id}` - Obter praise por ID
  - Response: `PraiseResponse`
  
- `POST /api/v1/praises/` - Criar praise
  - Body: `PraiseCreate`
  - Response: `PraiseResponse` (201)
  
- `PUT /api/v1/praises/{id}` - Atualizar praise
  - Body: `PraiseUpdate`
  - Response: `PraiseResponse`
  
- `DELETE /api/v1/praises/{id}` - Deletar praise
  - Response: 204 No Content

### Autenticação JWT

- **Tipo**: Bearer Token
- **Header**: `Authorization: Bearer <token>`
- **Validade padrão**: 30 minutos (configurável no backend)
- **Login**: Form data com `username` e `password`
- **Token**: Retornado no formato `{ access_token: string, token_type: "bearer" }`

Todas as rotas, exceto `/api/v1/auth/*`, requerem autenticação. Se não autenticado, retorna 401 Unauthorized.

## Requisitos do Frontend

### Stack Tecnológica Recomendada
- **Framework**: React 18+ com Vite
- **Linguagem**: TypeScript
- **Build Tool**: Vite (configuração rápida e HMR excelente)
- **Gerenciamento de Estado**: 
  - Zustand ou Redux Toolkit para estado global (recomendado: Zustand por simplicidade)
  - React Query / TanStack Query para cache e sincronização de dados da API (essencial)
- **Roteamento**: React Router v6+ (BrowserRouter)
- **Autenticação**: Context API ou Zustand para gerenciar token e usuário
- **HTTP Client**: Axios com interceptors para adicionar token automaticamente em todas as requisições
- **UI Framework**: 
  - Tailwind CSS + Headless UI / shadcn/ui (recomendado)
  - ou Material-UI / Chakra UI / Ant Design
- **Formulários**: React Hook Form + Zod para validação
- **Upload de Arquivos**: Suporte nativo para FormData com Axios
- **Notificações**: react-hot-toast ou react-toastify
- **Ícones**: lucide-react ou react-icons

### Funcionalidades Necessárias

#### 1. Autenticação
- [ ] Página de Login
  - Campos: username, password
  - Validação de formulário
  - Mensagens de erro amigáveis
  - Redirecionamento após login bem-sucedido
  
- [ ] Página de Registro
  - Campos: email, username, password, confirmar password
  - Validação de formulário
  - Mensagens de erro amigáveis
  
- [ ] Gerenciamento de Token
  - Armazenar token no localStorage ou cookie httpOnly
  - Adicionar token automaticamente em todas as requisições
  - Verificar validade do token
  - Redirecionar para login se token inválido/expirado
  - Logout com limpeza de token

#### 2. Dashboard / Listagem de Praises
- [ ] Lista de Praises
  - Paginação (skip/limit)
  - Busca por nome (filtro)
  - Cards ou tabela mostrando: nome, número, tags, quantidade de materiais
  - Botão para criar novo praise
  - Botões para editar/deletar cada praise
  - Visualização de detalhes ao clicar
  
- [ ] Visualização de Detalhes do Praise
  - Mostrar todas as informações: nome, número, tags, materiais
  - Lista de tags associadas
  - Lista de materiais com tipo e tipo de material
  - Para materiais FILE: botão para download/view
  - Para materiais YOUTUBE/SPOTIFY: embed ou link
  - Para materiais TEXT: exibir texto
  - Botões para adicionar/remover tags e materiais
  - Botão para editar praise
  - Botão para deletar praise (com confirmação)

#### 3. CRUD de Praises
- [ ] Criar Praise
  - Formulário com campos: nome, número (opcional)
  - Seleção múltipla de tags existentes (com opção de criar nova)
  - Possibilidade de adicionar materiais durante a criação
  - Validação de formulário
  - Submit e redirecionamento após sucesso
  
- [ ] Editar Praise
  - Formulário pré-preenchido com dados atuais
  - Mesmos campos do criar
  - Gerenciamento de tags (adicionar/remover)
  - Gerenciamento de materiais (adicionar/remover/editar)
  - Validação de formulário
  - Submit e atualização na lista
  
- [ ] Deletar Praise
  - Modal de confirmação
  - Mensagem clara sobre ação irreversível
  - Atualização da lista após deleção

#### 4. Gerenciamento de Materiais
- [ ] Upload de Arquivo
  - Input de arquivo com preview
  - Seleção de MaterialKind (dropdown)
  - Seleção de Praise (se criando standalone)
  - Barra de progresso durante upload
  - Mensagem de sucesso/erro
  - Validação de tipo e tamanho de arquivo
  
- [ ] Criar Material (Link/Texto)
  - Formulário com campos: tipo (YOUTUBE/SPOTIFY/TEXT), path/URL, MaterialKind
  - Validação de URL para links externos
  - Editor de texto para tipo TEXT
  - Submit e atualização na lista
  
- [ ] Lista de Materiais
  - Visualização por Praise ou geral
  - Filtro por tipo
  - Para FILE: preview/thumbnail se possível
  - Para YOUTUBE: embed do vídeo
  - Para SPOTIFY: widget ou link
  - Para TEXT: preview do texto
  - Botões para editar/deletar cada material
  - Botão para obter URL de download (para FILE)
  
- [ ] Editar Material
  - Formulário pré-preenchido
  - Validação
  - Submit e atualização
  
- [ ] Deletar Material
  - Confirmação
  - Para FILE: deletar do storage também (backend faz isso)
  - Atualização da lista

#### 5. Gerenciamento de Tags
- [ ] Lista de Tags
  - Visualização em grid ou lista
  - Botão para criar nova tag
  - Botões para editar/deletar
  - Mostrar quantidade de praises associados (se possível)
  
- [ ] Criar Tag
  - Formulário simples: nome
  - Validação
  - Submit e atualização
  
- [ ] Editar Tag
  - Formulário pré-preenchido
  - Validação
  - Submit e atualização
  
- [ ] Deletar Tag
  - Confirmação
  - Verificar se há praises associados (mostrar aviso)
  - Atualização da lista

#### 6. Gerenciamento de Material Kinds
- [ ] Lista de Material Kinds
  - Visualização organizada (pode ser categorizada por tipo: instrumentos, vozes, etc.)
  - Busca/filtro
  - Botão para criar novo
  - Botões para editar/deletar
  - Mostrar quantidade de materiais usando cada kind
  
- [ ] Criar Material Kind
  - Formulário: nome
  - Sugestão de nomes comuns (baseado no enum MaterialKind do arquivo material-types.ts)
  - Validação
  - Submit e atualização
  
- [ ] Editar Material Kind
  - Formulário pré-preenchido
  - Validação
  - Submit e atualização
  
- [ ] Deletar Material Kind
  - Confirmação
  - Verificar se há materiais usando (mostrar aviso)
  - Atualização da lista

### Requisitos de UI/UX

- **Design Moderno e Responsivo**
  - Mobile-first ou responsivo completo
  - Layout limpo e intuitivo
  - Navegação clara entre seções
  - Loading states em todas as operações assíncronas
  - Empty states amigáveis quando não há dados
  - Error states com mensagens claras e ações de recuperação

- **Acessibilidade**
  - Navegação por teclado
  - ARIA labels apropriados
  - Contraste adequado de cores
  - Foco visível em elementos interativos

- **Performance**
  - Lazy loading de componentes pesados
  - Paginação eficiente
  - Cache inteligente de dados (React Query)
  - Otimização de imagens/vídeos quando possível

- **Experiência do Usuário**
  - Feedback visual em todas as ações (toast notifications)
  - Confirmações para ações destrutivas
  - Validação em tempo real de formulários
  - Auto-save ou draft para formulários longos (opcional)
  - Busca instantânea com debounce
  - Filtros persistentes na URL (query params)

### Estrutura de Pastas Sugerida

```
frontend/
├── src/
│   ├── api/
│   │   ├── client.ts          # Configuração do Axios/Fetch
│   │   ├── auth.ts            # Endpoints de autenticação
│   │   ├── praises.ts         # Endpoints de praises
│   │   ├── praiseTags.ts      # Endpoints de tags
│   │   ├── materialKinds.ts   # Endpoints de material kinds
│   │   └── praiseMaterials.ts # Endpoints de materiais
│   ├── components/
│   │   ├── ui/                # Componentes reutilizáveis (Button, Input, Modal, etc.)
│   │   ├── layout/            # Header, Sidebar, Footer, etc.
│   │   ├── praises/           # Componentes específicos de praises
│   │   ├── tags/              # Componentes de tags
│   │   ├── materials/         # Componentes de materiais
│   │   └── materialKinds/     # Componentes de material kinds
│   ├── hooks/
│   │   ├── useAuth.ts         # Hook de autenticação
│   │   ├── usePraises.ts      # Hook para queries de praises
│   │   └── ...                # Outros hooks customizados
│   ├── store/                 # Zustand stores ou Redux
│   │   ├── authStore.ts
│   │   └── ...
│   ├── types/
│   │   └── index.ts           # Types/Interfaces TypeScript
│   ├── utils/
│   │   ├── validation.ts      # Schemas Zod
│   │   ├── constants.ts       # Constantes
│   │   └── helpers.ts         # Funções auxiliares
│   ├── pages/                 # Páginas/Views
│   │   ├── Login.tsx
│   │   ├── Register.tsx
│   │   ├── Dashboard.tsx
│   │   ├── Praises/
│   │   │   ├── PraiseList.tsx
│   │   │   ├── PraiseDetail.tsx
│   │   │   ├── PraiseCreate.tsx
│   │   │   └── PraiseEdit.tsx
│   │   ├── Tags/
│   │   │   ├── TagList.tsx
│   │   │   ├── TagCreate.tsx
│   │   │   └── TagEdit.tsx
│   │   ├── Materials/
│   │   │   ├── MaterialList.tsx
│   │   │   ├── MaterialUpload.tsx
│   │   │   └── MaterialCreate.tsx
│   │   └── MaterialKinds/
│   │       ├── MaterialKindList.tsx
│   │       ├── MaterialKindCreate.tsx
│   │       └── MaterialKindEdit.tsx
│   ├── App.tsx                # Componente raiz com rotas
│   └── main.tsx               # Entry point (Vite)
├── public/
│   └── index.html
├── index.html                 # HTML principal (Vite)
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── tailwind.config.js
├── postcss.config.js
└── vite.config.ts
```

### Configuração e Variáveis de Ambiente

Criar arquivo `.env` na raiz do projeto frontend:
```
VITE_API_BASE_URL=http://localhost:8000
```

**Importante**: No Vite, variáveis de ambiente devem começar com `VITE_` para serem expostas ao código do cliente. Acesse com `import.meta.env.VITE_API_BASE_URL`.

### Tratamento de Erros

- Interceptor HTTP para capturar erros 401 e redirecionar para login
- Mensagens de erro amigáveis e traduzidas (português)
- Logging de erros para debugging (console ou serviço externo)
- Retry automático para falhas de rede (opcional)

### Validações no Frontend

- Usar Zod ou Yup para validação de formulários
- Validar antes de enviar para API
- Mostrar erros inline nos campos
- Mensagens de erro claras e em português

### Recursos Adicionais (Nice to Have)

- [ ] Modo escuro/claro
- [ ] Internacionalização (i18n) - começar com português
- [ ] Exportação de dados (CSV/JSON)
- [ ] Busca avançada com múltiplos filtros
- [ ] Ordenação de listas (por nome, data, etc.)
- [ ] Favoritos/Marcados
- [ ] Histórico de alterações (se backend suportar)
- [ ] Preview de arquivos antes do upload
- [ ] Drag and drop para upload
- [ ] Bulk operations (deletar múltiplos itens)
- [ ] Compartilhamento de links de praises

## Observações Importantes

1. **Autenticação**: Todos os endpoints (exceto auth) requerem Bearer Token no header `Authorization`
2. **CORS**: O backend já está configurado com CORS, mas certifique-se de configurar corretamente no frontend
3. **IDs**: Todos os IDs são UUIDs (strings)
4. **Datas**: Todas as datas vêm em formato ISO 8601 do backend
5. **Upload**: Para upload de arquivos, usar `multipart/form-data` com FormData
6. **Materiais**: Os materiais podem ser FILE (upload), YOUTUBE, SPOTIFY ou TEXT (URL ou texto direto)
7. **Material Kinds**: Há uma lista extensa de tipos de material (ver arquivo `material-types.ts` no projeto)

## Setup e Configuração Inicial

### Comandos para Iniciar o Projeto

```bash
# Criar projeto React com Vite e TypeScript
npm create vite@latest frontend -- --template react-ts

# ou com yarn
yarn create vite frontend --template react-ts

# ou com pnpm
pnpm create vite frontend --template react-ts

cd frontend

# Instalar dependências principais
npm install react-router-dom axios zustand @tanstack/react-query
npm install react-hook-form @hookform/resolvers zod
npm install lucide-react react-hot-toast
npm install -D tailwindcss postcss autoprefixer
npm install -D @types/node

# Instalar dependências de desenvolvimento
npm install -D @types/react @types/react-dom

# Configurar Tailwind CSS
npx tailwindcss init -p
```

### Configuração do Vite (vite.config.ts)

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
```

### Configuração do TypeScript (tsconfig.json)

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

### Configuração do React Router

O roteamento deve ser configurado no `App.tsx` ou em um arquivo separado de rotas:

```typescript
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import Dashboard from '@/pages/Dashboard';
// ... outras importações

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        {/* outras rotas protegidas */}
      </Routes>
    </BrowserRouter>
  );
}
```

### Configuração do Axios com Interceptors

Criar arquivo `src/api/client.ts`:

```typescript
import axios from 'axios';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor para adicionar token em todas as requisições
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Interceptor para tratar erros 401 (não autorizado)
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default apiClient;
```

### Configuração do React Query

Configurar o QueryClient no `main.tsx`:

```typescript
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutos
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </React.StrictMode>
);
```

## Entrega Esperada

- Código limpo, bem organizado e comentado quando necessário
- TypeScript com tipagem forte (evitar `any`)
- Componentes reutilizáveis e bem estruturados
- Testes básicos (opcional mas recomendado)
- README com instruções de instalação e execução
- Documentação de componentes principais
- `.env.example` para configuração
- Scripts npm para desenvolvimento e build (`npm run dev`, `npm run build`, `npm run preview`)

## Prioridades

**Alta Prioridade:**
1. Autenticação (login/registro/logout)
2. CRUD completo de Praises
3. Visualização e gerenciamento de materiais
4. Upload de arquivos

**Média Prioridade:**
5. CRUD de Tags
6. CRUD de Material Kinds
7. Busca e filtros avançados

**Baixa Prioridade:**
8. Recursos adicionais (nice to have)
9. Testes automatizados
10. Otimizações avançadas

---

**Importante**: Este prompt deve ser usado para gerar o frontend completo e funcional. Priorizar funcionalidade sobre perfeição estética inicialmente, mas manter um design profissional e usável.
