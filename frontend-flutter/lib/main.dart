import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:pdfrx/pdfrx.dart';
import 'core/config/hive_config.dart';
import 'core/theme/app_theme.dart';
import 'core/constants/app_constants.dart';
import 'core/i18n/generated/app_localizations.dart';
import 'app/routes/app_router.dart';
import 'app/stores/language_store.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  // Inicializar Hive
  await HiveConfig.init();
  
  // Inicializar pdfrx e silenciar warnings de WASM em desenvolvimento
  await pdfrxFlutterInitialize(dismissPdfiumWasmWarnings: true);
  
  // Log da URL da API em modo debug
  if (kDebugMode) {
    debugPrint('🚀 Coldigom Flutter iniciando...');
    debugPrint('📡 API Base URL: ${AppConstants.apiBaseUrl}');
  }
  
  runApp(
    const ProviderScope(
      child: ColdigomApp(),
    ),
  );
}

class ColdigomApp extends ConsumerWidget {
  const ColdigomApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final locale = ref.watch(currentLocaleProvider);
    
    return MaterialApp.router(
      title: 'Coldigom',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.lightTheme,
      darkTheme: AppTheme.darkTheme,
      themeMode: ThemeMode.system,
      locale: locale,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: const [
        Locale('pt', 'BR'),
        Locale('en', 'US'),
      ],
      routerConfig: AppRouter.router,
    );
  }
}
