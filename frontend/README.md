# Frontend - Praise Manager

Frontend React + Vite + TypeScript para gerenciamento de praises, materiais e tags.

## Tecnologias

- **React 19** - Biblioteca UI
- **Vite** - Build tool e dev server
- **TypeScript** - Tipagem estática
- **React Router v7** - Roteamento
- **TanStack Query** - Gerenciamento de estado e cache de dados
- **Zustand** - Estado global (autenticação)
- **Axios** - Cliente HTTP
- **React Hook Form + Zod** - Formulários e validação
- **Tailwind CSS** - Estilização
- **Lucide React** - Ícones
- **React Hot Toast** - Notificações

## Estrutura do Projeto

```
frontend/
├── src/
│   ├── api/              # Cliente HTTP e endpoints da API
│   ├── components/       # Componentes React
│   │   ├── ui/          # Componentes reutilizáveis
│   │   ├── layout/      # Layout e navegação
│   │   ├── praises/     # Componentes de praises
│   │   ├── tags/        # Componentes de tags
│   │   ├── materials/   # Componentes de materiais
│   │   └── materialKinds/ # Componentes de tipos de material
│   ├── hooks/           # Custom hooks
│   ├── pages/           # Páginas/Views
│   ├── store/           # Zustand stores
│   ├── types/           # TypeScript types
│   ├── utils/           # Utilitários e helpers
│   ├── App.tsx          # Componente raiz com rotas
│   └── main.tsx         # Entry point
├── public/              # Arquivos estáticos
├── .env.example         # Template de variáveis de ambiente
└── package.json
```

## Instalação

```bash
# Instalar dependências
npm install

# Criar arquivo .env.local
cp .env.example .env.local
# Editar .env.local com a URL da API
```

## Configuração

Crie um arquivo `.env.local` na raiz do projeto frontend:

```env
VITE_API_BASE_URL=http://localhost:8000
```

## Scripts Disponíveis

```bash
# Desenvolvimento
npm run dev

# Build para produção
npm run build

# Preview do build
npm run preview

# Lint
npm run lint
```

## Desenvolvimento

1. Certifique-se de que o backend está rodando em `http://localhost:8000`
2. Execute `npm run dev`
3. Acesse `http://localhost:3000`

## Funcionalidades

### Autenticação
- Login e registro de usuários
- Gerenciamento de token JWT
- Proteção de rotas

### Praises
- Listagem com busca e paginação
- Criação, edição e exclusão
- Visualização de detalhes
- Gerenciamento de tags e materiais

### Materiais
- Upload de arquivos
- Criação de links (YouTube, Spotify)
- Criação de textos
- Download de arquivos
- Visualização por tipo

### Tags
- CRUD completo de tags
- Associação com praises

### Tipos de Material
- CRUD completo de tipos de material
- Categorização de materiais

## Integração com Backend

O frontend se comunica com o backend FastAPI através de:

- **Base URL**: Configurada em `VITE_API_BASE_URL`
- **Autenticação**: Bearer Token JWT no header `Authorization`
- **Interceptors**: Axios interceptors para adicionar token e tratar erros 401

## Estrutura de Rotas

- `/login` - Página de login
- `/register` - Página de registro
- `/` - Dashboard
- `/praises` - Lista de praises
- `/praises/create` - Criar praise
- `/praises/:id` - Detalhes do praise
- `/praises/:id/edit` - Editar praise
- `/tags` - Gerenciar tags
- `/materials` - Lista de materiais
- `/materials/upload` - Upload de material
- `/materials/create` - Criar material (link/texto)
- `/material-kinds` - Gerenciar tipos de material

## Notas

- Todas as rotas (exceto `/login` e `/register`) requerem autenticação
- O token JWT é armazenado no localStorage
- React Query gerencia cache e sincronização de dados
- Formulários usam React Hook Form com validação Zod
- Mensagens de erro e sucesso via React Hot Toast
