# Use Cases da Aplicação Coldigom

Este documento lista todos os casos de uso (use cases) da aplicação Coldigom desenvolvida até o momento.

## 1. Autenticação e Usuários

### 1.1 Registro de Usuário
- [X] **UC-001**: Registrar novo usuário
  - Campos: email, username, password
  - Validação de dados
  - Hash de senha
  - Verificação de unicidade de email e username

### 1.2 Login
- [X] **UC-002**: Autenticar usuário
  - Login com username e password
  - Geração de token JWT
  - Retorno de token de acesso

### 1.3 Gerenciamento de Sessão
- [X] **UC-003**: Manter sessão do usuário
  - Armazenamento de token no frontend
  - Validação de token em requisições
  - Redirecionamento para login se token inválido/expirado

### 1.4 Logout
- [X] **UC-004**: Encerrar sessão do usuário
  - Limpeza de token no frontend
  - Redirecionamento para página de login

## 2. Praises (Louvores)

### 2.1 Listagem de Praises
- [X] **UC-005**: Listar todos os praises
  - Paginação (skip/limit)
  - Busca por nome
  - Filtro por tag
  - Exibição de informações básicas (nome, número, tags, quantidade de materiais)

### 2.2 Visualização de Praise
- [X] **UC-006**: Visualizar detalhes de um praise
  - Exibir todas as informações do praise
  - Listar tags associadas
  - Listar materiais com seus tipos e kinds
  - Exibir status de revisão (in_review)
  - Exibir histórico de revisão (review_history)
  - Exibir descrição de revisão (in_review_description)

### 2.3 Criação de Praise
- [X] **UC-007**: Criar novo praise
  - Campos: nome, número (opcional)
  - Associação de tags (múltipla seleção)
  - Possibilidade de adicionar materiais durante criação
  - Validação de dados

### 2.4 Edição de Praise
- [X] **UC-008**: Editar praise existente
  - Atualizar nome e número
  - Adicionar/remover tags
  - Gerenciar materiais (adicionar/remover/editar)
  - Validação de dados

### 2.5 Exclusão de Praise
- [X] **UC-009**: Deletar praise
  - Confirmação antes de deletar
  - Exclusão em cascata de materiais associados

### 2.6 Gerenciamento de Tags em Praise
- [X] **UC-010**: Adicionar tag a um praise
  - Seleção de tag existente
  - Associação many-to-many

- [X] **UC-011**: Remover tag de um praise
  - Desassociação de tag
  - Manutenção da tag no sistema

### 2.7 Sistema de Revisão de Praise
- [X] **UC-012**: Iniciar revisão de um praise
  - Marcar praise como em revisão (in_review = true)
  - Adicionar descrição opcional da revisão
  - Registrar evento no histórico (review_history)

- [X] **UC-013**: Cancelar revisão de um praise
  - Marcar praise como não em revisão (in_review = false)
  - Registrar evento no histórico

- [X] **UC-014**: Finalizar revisão de um praise
  - Marcar praise como não em revisão
  - Registrar evento no histórico com data de finalização

- [X] **UC-015**: Visualizar histórico de revisão
  - Exibir array de eventos de revisão (datas e tipos)
  - Mostrar descrição da revisão atual se aplicável

### 2.8 Download de Praises
- [X] **UC-016**: Baixar praise completo em ZIP
  - Gerar ZIP com todos os materiais de arquivo (PDF/Audio)
  - Incluir README.txt com informações do praise
  - Excluir materiais não-arquivo (links externos)
  - Organizar arquivos por material kind

- [X] **UC-017**: Baixar materiais de múltiplos praises por Material Kind
  - Filtrar praises por tag (opcional)
  - Agrupar materiais por material_kind
  - Dividir em múltiplos ZIPs quando exceder tamanho máximo (configurável em MB)
  - Criar ZIP mestre contendo os ZIPs menores
  - Incluir README.txt com informações

## 3. Materiais de Praise

### 3.1 Listagem de Materiais
- [X] **UC-018**: Listar materiais de um praise
  - Exibir todos os materiais associados
  - Filtrar materiais antigos (is_old = false por padrão)
  - Mostrar tipo de material (PDF, Audio, YouTube, Spotify, Text)
  - Mostrar material kind

### 3.2 Visualização de Material
- [X] **UC-019**: Visualizar detalhes de um material
  - Exibir tipo de material
  - Exibir material kind
  - Exibir path/URL
  - Exibir status is_old e old_description se aplicável

### 3.3 Upload de Arquivo
- [X] **UC-020**: Fazer upload de arquivo (PDF/Audio)
  - Seleção de arquivo
  - Seleção de material kind
  - Upload para storage (Wasabi ou Local)
  - Detecção automática de tipo (PDF ou Audio)
  - Criação de registro no banco
  - Opção de marcar como material antigo (is_old)
  - Opção de adicionar descrição para material antigo (old_description)

### 3.4 Criação de Material (Link/Texto)
- [X] **UC-021**: Criar material de link externo (YouTube/Spotify)
  - Seleção de tipo (YouTube ou Spotify)
  - Inserção de URL
  - Seleção de material kind
  - Validação de URL

- [X] **UC-022**: Criar material de texto
  - Inserção de texto
  - Seleção de material kind

### 3.5 Edição de Material
- [X] **UC-023**: Editar material existente
  - Atualizar material kind
  - Atualizar path/URL (para links)
  - Atualizar texto (para materiais de texto)
  - Atualizar status is_old e old_description

### 3.6 Substituição de Arquivo
- [X] **UC-024**: Substituir arquivo de um material
  - Upload de novo arquivo
  - Substituição no storage
  - Atualização de path no banco
  - Opção de atualizar material kind
  - Opção de atualizar status is_old e old_description

### 3.7 Exclusão de Material
- [X] **UC-025**: Deletar material
  - Confirmação antes de deletar
  - Exclusão do arquivo no storage (se aplicável)
  - Exclusão do registro no banco

### 3.8 Download de Material
- [X] **UC-026**: Baixar arquivo de material
  - Geração de URL assinada (Wasabi) ou servir diretamente (Local)
  - Suporte a token via query parameter ou header Authorization
  - Validação de autenticação

- [X] **UC-027**: Obter URL de download temporária
  - Geração de URL assinada com expiração configurável
  - Apenas para materiais de arquivo (PDF/Audio)

### 3.9 Gerenciamento de Materiais Antigos
- [X] **UC-028**: Marcar material como antigo
  - Definir flag is_old = true
  - Adicionar descrição opcional (old_description)

- [X] **UC-029**: Filtrar materiais antigos na visualização
  - Ocultar materiais com is_old = true por padrão
  - Botão "Ver Materiais Antigos" para exibir todos
  - Indicador visual para materiais antigos

## 4. Tags de Praise

### 4.1 Listagem de Tags
- [X] **UC-030**: Listar todas as tags
  - Paginação (skip/limit)
  - Exibição de nome da tag

### 4.2 Visualização de Tag
- [X] **UC-031**: Visualizar detalhes de uma tag
  - Exibir nome da tag
  - Listar praises associados (opcional)

### 4.3 Criação de Tag
- [X] **UC-032**: Criar nova tag
  - Campo: nome
  - Validação de dados

### 4.4 Edição de Tag
- [X] **UC-033**: Editar tag existente
  - Atualizar nome
  - Validação de dados

### 4.5 Exclusão de Tag
- [X] **UC-034**: Deletar tag
  - Confirmação antes de deletar
  - Desassociação automática de praises

### 4.6 Listagem de Praises por Tag
- [X] **UC-035**: Listar todos os praises de uma tag específica
  - Filtro por tag_id na listagem de praises
  - Exibição de lista filtrada

## 5. Material Kinds (Tipos de Material)

### 5.1 Listagem de Material Kinds
- [X] **UC-036**: Listar todos os material kinds
  - Paginação (skip/limit)
  - Exibição de nome

### 5.2 Visualização de Material Kind
- [X] **UC-037**: Visualizar detalhes de um material kind
  - Exibir nome
  - Listar materiais usando este kind (opcional)

### 5.3 Criação de Material Kind
- [X] **UC-038**: Criar novo material kind
  - Campo: nome
  - Validação de dados

### 5.4 Edição de Material Kind
- [X] **UC-039**: Editar material kind existente
  - Atualizar nome
  - Validação de dados

### 5.5 Exclusão de Material Kind
- [X] **UC-040**: Deletar material kind
  - Confirmação antes de deletar
  - Verificação de materiais associados

## 6. Material Types (Tipos de Material)

### 6.1 Listagem de Material Types
- [X] **UC-041**: Listar todos os material types
  - Paginação (skip/limit)
  - Tipos: PDF, Audio, YouTube, Spotify, Text

### 6.2 Visualização de Material Type
- [X] **UC-042**: Visualizar detalhes de um material type
  - Exibir nome do tipo

### 6.3 Criação de Material Type
- [X] **UC-043**: Criar novo material type
  - Campo: nome
  - Validação de dados

### 6.4 Edição de Material Type
- [X] **UC-044**: Editar material type existente
  - Atualizar nome
  - Validação de dados

### 6.5 Exclusão de Material Type
- [X] **UC-045**: Deletar material type
  - Confirmação antes de deletar
  - Verificação de materiais associados

## 7. Internacionalização (i18n)

### 7.1 Gerenciamento de Linguagens
- [X] **UC-046**: Listar linguagens disponíveis
  - Paginação (skip/limit)
  - Filtro por linguagens ativas (active_only)
  - Exibição de código e nome da linguagem

- [X] **UC-047**: Visualizar linguagem por código
  - Exibir detalhes da linguagem

- [X] **UC-048**: Criar nova linguagem
  - Campos: código, nome, flag de ativação
  - Validação de dados

- [X] **UC-049**: Editar linguagem existente
  - Atualizar nome e status de ativação
  - Validação de dados

- [X] **UC-050**: Deletar linguagem
  - Confirmação antes de deletar
  - Verificação de traduções associadas

### 7.2 Traduções de Material Kinds
- [X] **UC-051**: Criar tradução de Material Kind
  - Associar material kind a uma linguagem
  - Definir texto traduzido

- [X] **UC-052**: Listar traduções de Material Kind
  - Filtrar por material_kind_id ou language_code
  - Exibir traduções

- [X] **UC-053**: Editar tradução de Material Kind
  - Atualizar texto traduzido

- [X] **UC-054**: Deletar tradução de Material Kind
  - Remover tradução específica

### 7.3 Traduções de Praise Tags
- [X] **UC-055**: Criar tradução de Praise Tag
  - Associar tag a uma linguagem
  - Definir texto traduzido

- [X] **UC-056**: Listar traduções de Praise Tag
  - Filtrar por praise_tag_id ou language_code
  - Exibir traduções

- [X] **UC-057**: Editar tradução de Praise Tag
  - Atualizar texto traduzido

- [X] **UC-058**: Deletar tradução de Praise Tag
  - Remover tradução específica

### 7.4 Traduções de Material Types
- [X] **UC-059**: Criar tradução de Material Type
  - Associar material type a uma linguagem
  - Definir texto traduzido

- [X] **UC-060**: Listar traduções de Material Type
  - Filtrar por material_type_id ou language_code
  - Exibir traduções

- [X] **UC-061**: Editar tradução de Material Type
  - Atualizar texto traduzido

- [X] **UC-062**: Deletar tradução de Material Type
  - Remover tradução específica

### 7.5 Interface de Tradução
- [X] **UC-063**: Visualizar lista de textos para tradução
  - Aba de linguagens com lista de textos
  - Comparação com linguagem de referência escolhida pelo usuário
  - Indicar quais textos precisam de tradução

- [X] **UC-064**: Editar traduções na interface
  - Editor de traduções para Material Kinds, Tags e Material Types
  - Seleção de linguagem de comparação

## 8. Preferências do Usuário

### 8.1 Gerenciamento de Preferências de Material Kind
- [X] **UC-065**: Definir ordem de preferência de material kinds
  - Criar/atualizar lista ordenada de material kinds preferidos
  - Máximo de 5 preferências
  - Ordem de prioridade

- [X] **UC-066**: Visualizar preferências de material kinds
  - Listar material kinds preferidos em ordem
  - Exibir ordem de prioridade

- [X] **UC-067**: Remover preferências de material kinds
  - Limpar todas as preferências do usuário

## 9. Listas de Praises

### 9.1 Listagem de Listas
- [X] **UC-068**: Listar minhas listas e listas seguidas
  - Exibir listas criadas pelo usuário
  - Exibir listas que o usuário segue
  - Filtros opcionais: nome, data inicial, data final
  - Exibir contagem de praises em cada lista

- [X] **UC-069**: Listar listas públicas
  - Exibir listas públicas de todos os usuários
  - Paginação (skip/limit)

### 9.2 Visualização de Lista
- [X] **UC-070**: Visualizar detalhes de uma lista
  - Exibir informações da lista (nome, descrição, criador)
  - Listar praises na ordem definida
  - Indicar se é minha lista ou seguida
  - Exibir contagem de praises

### 9.3 Criação de Lista
- [X] **UC-071**: Criar nova lista de praises
  - Campos: nome, descrição, flag is_public
  - Validação de dados
  - Lista vazia inicialmente

### 9.4 Edição de Lista
- [X] **UC-072**: Editar lista existente
  - Atualizar nome, descrição e visibilidade
  - Apenas o criador pode editar

### 9.5 Exclusão de Lista
- [X] **UC-073**: Deletar lista
  - Confirmação antes de deletar
  - Apenas o criador pode deletar
  - Desassociação de praises

### 9.6 Gerenciamento de Praises na Lista
- [X] **UC-074**: Adicionar praise à lista
  - Seleção de praise existente
  - Adição à lista mantendo ordem

- [X] **UC-075**: Remover praise da lista
  - Remoção de praise específico
  - Manutenção da ordem dos demais

- [X] **UC-076**: Reordenar praises na lista
  - Alterar ordem dos praises na lista
  - Atualização de ordem de exibição

### 9.7 Compartilhamento de Listas
- [X] **UC-077**: Seguir uma lista
  - Adicionar lista às listas seguidas
  - Receber atualizações da lista

- [X] **UC-078**: Deixar de seguir uma lista
  - Remover lista das listas seguidas

- [X] **UC-079**: Copiar uma lista
  - Criar cópia de uma lista pública ou seguida
  - Nova lista pertence ao usuário atual
  - Copiar todos os praises na mesma ordem

## 10. Salas (Rooms)

### 10.1 Listagem de Salas
- [X] **UC-080**: Listar salas do usuário
  - Exibir salas onde o usuário é participante
  - Exibir contagem de participantes e praises
  - Exibir informações básicas (nome, código, tipo de acesso)

- [X] **UC-081**: Listar salas públicas
  - Exibir salas públicas disponíveis
  - Paginação (skip/limit)
  - Exibir contagem de participantes e praises

### 10.2 Visualização de Sala
- [X] **UC-082**: Visualizar detalhes de uma sala
  - Exibir informações da sala (nome, descrição, código, criador)
  - Listar participantes com nome e material kind preferido
  - Listar praises na ordem definida
  - Exibir tipo de acesso (public, password, approval)
  - Exibir histórico de mensagens do chat

### 10.3 Busca de Sala por Código
- [X] **UC-083**: Buscar sala por código
  - Pesquisar sala usando código único
  - Acesso direto via URL com código

### 10.4 Criação de Sala
- [X] **UC-084**: Criar nova sala
  - Campos: nome, descrição, tipo de acesso (public, password, approval)
  - Configurações: is_open_for_requests, auto_destroy_on_empty
  - Geração automática de código único
  - Criador automaticamente vira participante

### 10.5 Edição de Sala
- [X] **UC-085**: Editar sala existente
  - Atualizar nome, descrição, tipo de acesso
  - Atualizar configurações
  - Apenas o criador pode editar
  - Broadcast de atualização via SSE para participantes

### 10.6 Exclusão de Sala
- [X] **UC-086**: Deletar sala
  - Confirmação antes de deletar
  - Apenas o criador pode deletar
  - Broadcast de exclusão via SSE
  - Limpeza de participantes e mensagens

### 10.7 Entrada em Sala
- [X] **UC-087**: Entrar em sala pública
  - Acesso direto sem autenticação adicional
  - Usuário vira participante automaticamente
  - Broadcast de entrada via SSE

- [X] **UC-088**: Entrar em sala com senha
  - Solicitar senha
  - Validação de senha
  - Entrada se senha correta
  - Broadcast de entrada via SSE

- [X] **UC-089**: Solicitar entrada em sala (modo aprovação)
  - Criar solicitação de entrada
  - Status: pending
  - Notificação ao criador via SSE

### 10.8 Aprovação de Entrada
- [X] **UC-090**: Aprovar solicitação de entrada
  - Criador aprova solicitação
  - Status muda para approved
  - Usuário vira participante
  - Broadcast de entrada via SSE

- [X] **UC-091**: Rejeitar solicitação de entrada
  - Criador rejeita solicitação
  - Status muda para rejected
  - Usuário não vira participante

- [X] **UC-092**: Visualizar solicitações de entrada
  - Listar solicitações pendentes/aprovadas/rejeitadas
  - Apenas criador pode visualizar
  - Filtrar por status

### 10.9 Saída de Sala
- [X] **UC-093**: Sair de uma sala
  - Remover participante da sala
  - Broadcast de saída via SSE
  - Destruir sala se auto_destroy_on_empty e último participante

### 10.10 Gerenciamento de Praises na Sala
- [X] **UC-094**: Adicionar praise à sala
  - Seleção de praise existente
  - Adição à lista da sala
  - Broadcast de adição via SSE para todos os participantes

- [X] **UC-095**: Remover praise da sala
  - Remoção de praise específico
  - Broadcast de remoção via SSE

- [X] **UC-096**: Reordenar praises na sala
  - Alterar ordem dos praises
  - Sincronização em tempo real via SSE
  - Broadcast de reordenação para todos os participantes

- [X] **UC-097**: Importar lista de praises para sala
  - Selecionar lista existente
  - Adicionar todos os praises da lista à sala
  - Manter ordem da lista
  - Broadcast de importação via SSE

### 10.11 Chat em Tempo Real
- [X] **UC-098**: Enviar mensagem no chat da sala
  - Criar mensagem com texto
  - Associar ao usuário e sala
  - Exibir nome do usuário e material kind preferido
  - Broadcast de mensagem via SSE para todos os participantes

- [X] **UC-099**: Visualizar histórico de mensagens
  - Listar mensagens da sala
  - Paginação (limit/offset)
  - Exibir nome do usuário, material kind e timestamp

- [X] **UC-100**: Receber mensagens em tempo real
  - Conexão SSE para receber novas mensagens
  - Atualização automática do chat
  - Exibir nome do usuário e material kind do remetente

### 10.12 Sincronização em Tempo Real (SSE)
- [X] **UC-101**: Receber eventos de sala em tempo real
  - Conexão SSE para eventos da sala
  - Eventos: user_joined, user_left, praise_added, praise_removed, praise_reordered, message_sent, room_updated, room_deleted, list_imported, join_request_received
  - Atualização automática da interface

- [X] **UC-102**: Visualizar participantes online
  - Lista de participantes atualizada em tempo real
  - Exibir nome e material kind preferido de cada participante
  - Atualização quando participantes entram/saem

## 11. Dashboard e Navegação

### 11.1 Dashboard Principal
- [X] **UC-103**: Visualizar dashboard
  - Estatísticas gerais (quantidade de praises, tags)
  - Lista de praises recentes
  - Ações rápidas (criar praise, gerenciar tags)
  - Links para principais seções

### 11.2 Navegação
- [X] **UC-104**: Navegar entre páginas
  - Menu de navegação
  - Links para: Dashboard, Praises, Tags, Material Kinds, Material Types, Listas, Salas, Traduções, Preferências
  - Breadcrumbs (opcional)

## 12. Storage e Arquivos

### 12.1 Gerenciamento de Storage
- [X] **UC-105**: Upload de arquivo para storage
  - Suporte a storage local (filesystem)
  - Suporte a Wasabi (S3-compatible)
  - Organização por pastas (praises/{praise_id})
  - Geração de path único

- [X] **UC-106**: Download de arquivo do storage
  - Download direto (storage local)
  - URL assinada com expiração (Wasabi)
  - Validação de autenticação

- [X] **UC-107**: Exclusão de arquivo do storage
  - Remoção de arquivo do storage
  - Limpeza automática ao deletar material

### 12.2 Servir Arquivos Estáticos
- [X] **UC-108**: Servir arquivos estáticos
  - Endpoint /assets para arquivos locais
  - Montagem de diretório de storage
  - Acesso direto via URL

## 13. Validação e Segurança

### 13.1 Validação de Dados
- [X] **UC-109**: Validar dados de entrada
  - Validação no backend (Pydantic schemas)
  - Validação no frontend (Zod schemas)
  - Mensagens de erro amigáveis

### 13.2 Autenticação e Autorização
- [X] **UC-110**: Proteger rotas com autenticação
  - Middleware de autenticação JWT
  - Verificação de token em todas as rotas protegidas
  - Retorno de erro 401 se não autenticado

- [X] **UC-111**: Validar permissões
  - Verificação de propriedade (criador pode editar/deletar)
  - Verificação de participação (salas)
  - Retorno de erro 403 se não autorizado

## 14. Internacionalização da Interface

### 14.1 Seleção de Idioma
- [X] **UC-112**: Selecionar idioma da interface
  - Suporte a múltiplos idiomas (pt-BR, en-US)
  - Troca de idioma em tempo real
  - Persistência da preferência

### 14.2 Tradução de Interface
- [X] **UC-113**: Exibir interface traduzida
  - Tradução de textos da interface
  - Tradução de mensagens de erro
  - Tradução de labels e botões

## Observações

### Use Cases Não Implementados (do todo.txt)
- [ ] **UC-114**: Sistema de níveis de permissão (user, admin, superadmin)
- [ ] **UC-115**: Autenticação de 2 fatores (obrigatório para admins)
- [ ] **UC-116**: Solicitar material (sistema de solicitações com status)
- [ ] **UC-117**: Adicionar praises no Wasabi (migração de storage)
- [ ] **UC-118**: Recriar frontend em Flutter

### Funcionalidades Técnicas
- [X] **UC-119**: Configuração CORS para frontend
- [X] **UC-120**: Tratamento de erros HTTP com CORS
- [X] **UC-121**: Health check endpoint (/health)
- [X] **UC-122**: Documentação automática da API (Swagger/ReDoc)

---

**Total de Use Cases Documentados: 122**
**Use Cases Implementados: 113**
**Use Cases Pendentes: 9**
