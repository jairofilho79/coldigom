# Coldigom Flutter

Frontend Flutter 3 para a aplicação Coldigom - aplicação mobile-first cross-platform.

## Plataformas Suportadas

- ✅ Android
- ✅ iOS  
- ✅ Windows
- ✅ macOS

**Nota:** Não há suporte para Web e Linux.

## Tecnologias

- **Flutter 3.38+** - Framework multiplataforma
- **Dart 3.10+** - Linguagem de programação
- **flutter_riverpod** - Gerenciamento de estado
- **Hive** - Armazenamento local (banco NoSQL)
- **Dio** - Cliente HTTP
- **go_router** - Navegação
- **background_downloader** - Download de arquivos em background
- **flutter_client_sse** - Server-Sent Events para tempo real

## Estrutura do Projeto

```
lib/
├── main.dart                 # Entry point
├── app/
│   ├── routes/              # Rotas e navegação
│   ├── pages/               # Telas da aplicação
│   ├── widgets/             # Componentes reutilizáveis
│   ├── services/            # Serviços (API, storage, etc)
│   │   ├── api/            # Cliente HTTP e serviços de API
│   │   └── offline/        # Serviços offline
│   ├── models/              # Modelos de dados
│   ├── stores/              # Gerenciamento de estado (Riverpod)
│   └── utils/               # Utilitários
├── core/
│   ├── config/              # Configurações
│   ├── theme/               # Tema e estilos
│   └── constants/           # Constantes
└── data/
    ├── local/                # Armazenamento local (Hive)
    └── remote/               # Cliente HTTP
```

## Instalação

1. Certifique-se de ter Flutter 3.38+ instalado:
```bash
flutter --version
```

2. Instale as dependências:
```bash
flutter pub get
```

3. Gere os arquivos de código:
```bash
flutter pub run build_runner build --delete-conflicting-outputs
```

## Desenvolvimento

### Executar no dispositivo/simulador

```bash
# Android
flutter run

# iOS (requer macOS)
flutter run

# Windows
flutter run -d windows

# macOS
flutter run -d macos
```

### Hot Reload

Durante o desenvolvimento, use `r` no terminal para hot reload ou `R` para hot restart.

## Build

Consulte [BUILD.md](BUILD.md) para instruções detalhadas de build para cada plataforma.

## Configuração

### Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto (opcional):

```env
API_BASE_URL=http://localhost:8000
```

Por padrão, a aplicação usa `http://localhost:8000` como URL base da API.

## Funcionalidades Principais

- ✅ Autenticação (Login/Registro)
- ✅ Gerenciamento de Praises
- ✅ Gerenciamento de Materiais
- ✅ Download offline de PDFs
- ✅ Visualização offline
- ✅ Salas em tempo real (SSE)
- ✅ Internacionalização (pt-BR, en-US)
- ✅ Tema claro/escuro

## Armazenamento Local

A aplicação usa **Hive** para todo armazenamento local:
- Tokens de autenticação
- Cache de dados da API
- Metadados de PDFs offline
- Preferências do usuário

## Offline

A aplicação suporta modo offline através de:
- Download manual de PDFs selecionados pelo usuário
- Cache de dados da API no Hive
- Visualização offline de PDFs baixados

## Contribuindo

1. Siga a estrutura de pastas estabelecida
2. Use Riverpod para gerenciamento de estado
3. Mantenha código limpo e documentado
4. Execute `flutter analyze` antes de commitar

## Licença

[Adicionar licença]
