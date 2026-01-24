import 'package:hive_flutter/hive_flutter.dart';

/// Configuração e inicialização do Hive
class HiveConfig {
  static const String authBoxName = 'auth';
  static const String cacheBoxName = 'cache';
  static const String offlineBoxName = 'offline';
  static const String preferencesBoxName = 'preferences';

  /// Inicializa o Hive
  static Future<void> init() async {
    await Hive.initFlutter();

    // Abrir boxes
    await Hive.openBox(authBoxName);
    await Hive.openBox(cacheBoxName);
    await Hive.openBox(offlineBoxName);
    await Hive.openBox(preferencesBoxName);
  }

  /// Limpa todos os dados (útil para logout)
  static Future<void> clearAll() async {
    await Hive.box(authBoxName).clear();
    await Hive.box(cacheBoxName).clear();
    await Hive.box(offlineBoxName).clear();
    await Hive.box(preferencesBoxName).clear();
  }
}
