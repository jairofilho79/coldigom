# Guia de Build Multi-plataforma - Coldigom Flutter

Este documento contém instruções para fazer build da aplicação Flutter para Android, iOS, Windows e macOS.

## Pré-requisitos

### Todas as Plataformas
- Flutter SDK 3.10.3 ou superior
- Dart SDK 3.10.3 ou superior
- Git

### Android
- Android Studio
- Android SDK (API 33 ou superior)
- Java JDK 17 ou superior

### iOS / macOS
- macOS (obrigatório)
- Xcode 15.0 ou superior
- CocoaPods (`sudo gem install cocoapods`)
- Certificados de desenvolvimento da Apple (para iOS)

### Windows
- Visual Studio 2022 com componentes:
  - Desktop development with C++
  - Windows 10/11 SDK
- Git for Windows

## Configuração Inicial

1. Clone o repositório:
```bash
git clone <repository-url>
cd coldigom/frontend-flutter
```

2. Instale as dependências:
```bash
flutter pub get
```

3. Gere os arquivos de código:
```bash
flutter pub run build_runner build --delete-conflicting-outputs
```

## Build para Android

### Desenvolvimento (APK)
```bash
flutter build apk --debug
# ou
flutter build apk --release
```

O APK será gerado em: `build/app/outputs/flutter-apk/app-release.apk`

### Produção (AAB - Android App Bundle)
```bash
flutter build appbundle --release
```

O AAB será gerado em: `build/app/outputs/bundle/release/app-release.aab`

### Instalar no dispositivo
```bash
flutter install
```

## Build para iOS

**IMPORTANTE:** Requer macOS e Xcode.

1. Abra o projeto no Xcode:
```bash
open ios/Runner.xcworkspace
```

2. Configure o signing no Xcode:
   - Selecione o target "Runner"
   - Vá em "Signing & Capabilities"
   - Selecione seu Team
   - Configure o Bundle Identifier

3. Build via Flutter:
```bash
flutter build ios --release
```

4. Ou via Xcode:
   - Selecione um dispositivo ou simulador
   - Pressione Cmd+R para build e run

### Gerar IPA
```bash
flutter build ipa --release
```

O IPA será gerado em: `build/ios/ipa/`

## Build para Windows

1. Verifique se o suporte Windows está habilitado:
```bash
flutter doctor
```

2. Build:
```bash
flutter build windows --release
```

O executável será gerado em: `build/windows/runner/Release/`

### Criar instalador MSIX (opcional)
```bash
flutter build windows --release
# Depois use o Windows App Certification Kit ou outras ferramentas
```

## Build para macOS

**IMPORTANTE:** Requer macOS e Xcode.

1. Abra o projeto no Xcode:
```bash
open macos/Runner.xcworkspace
```

2. Configure o signing no Xcode

3. Build:
```bash
flutter build macos --release
```

O app será gerado em: `build/macos/Build/Products/Release/`

### Criar DMG (opcional)
Use ferramentas como `create-dmg` ou scripts customizados.

## Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto `frontend-flutter/`:

```env
API_BASE_URL=http://localhost:8000
```

Para usar em produção, configure via:
- Android: `android/app/src/main/AndroidManifest.xml`
- iOS: `ios/Runner/Info.plist`
- Windows: Variáveis de ambiente do sistema
- macOS: `macos/Runner/Info.plist`

## Troubleshooting

### Android
- Se houver problemas com Gradle, tente: `cd android && ./gradlew clean`
- Verifique se o Android SDK está configurado: `flutter doctor`

### iOS
- Execute `pod install` na pasta `ios/`
- Limpe o build: `flutter clean && flutter pub get`

### Windows
- Verifique se o Visual Studio Build Tools está instalado
- Execute `flutter doctor` para verificar configuração

### macOS
- Execute `pod install` na pasta `macos/`
- Verifique certificados no Keychain Access

## CI/CD

### GitHub Actions (Exemplo)

```yaml
# .github/workflows/build.yml
name: Build Flutter App

on:
  push:
    branches: [ main ]

jobs:
  build-android:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: subosito/flutter-action@v2
      - run: flutter pub get
      - run: flutter build appbundle --release

  build-ios:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v3
      - uses: subosito/flutter-action@v2
      - run: flutter pub get
      - run: flutter build ios --release --no-codesign

  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v3
      - uses: subosito/flutter-action@v2
      - run: flutter pub get
      - run: flutter build windows --release

  build-macos:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v3
      - uses: subosito/flutter-action@v2
      - run: flutter pub get
      - run: flutter build macos --release
```

## Notas Importantes

- **Não há suporte para Web e Linux** - flutter_riverpod não suporta web
- Todos os builds são nativos - não usam Docker para produção
- Para desenvolvimento, use Docker apenas para ambiente compartilhado
- Certifique-se de ter espaço suficiente em disco (builds podem ocupar vários GB)
