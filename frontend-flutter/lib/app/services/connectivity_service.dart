import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'dart:async';

/// Provider do serviço de conectividade
final connectivityServiceProvider = Provider<ConnectivityService>((ref) {
  final service = ConnectivityService();
  ref.onDispose(() => service.dispose());
  return service;
});

/// Provider para estado de conectividade (stream)
final connectivityStateProvider = StreamProvider<bool>((ref) {
  final service = ref.watch(connectivityServiceProvider);
  return service.connectivityStream;
});

/// Provider para verificar se está conectado (one-time)
final isConnectedProvider = FutureProvider<bool>((ref) async {
  final service = ref.watch(connectivityServiceProvider);
  return await service.isConnected();
});

/// Serviço para verificar conectividade
class ConnectivityService {
  final Connectivity _connectivity = Connectivity();
  StreamSubscription<List<ConnectivityResult>>? _subscription;

  /// Verifica se está conectado
  Future<bool> isConnected() async {
    final result = await _connectivity.checkConnectivity();
    return !result.contains(ConnectivityResult.none);
  }

  /// Stream de mudanças de conectividade
  Stream<bool> get connectivityStream {
    return _connectivity.onConnectivityChanged.map((results) {
      return !results.contains(ConnectivityResult.none);
    });
  }

  /// Verifica se está online (com timeout)
  Future<bool> isOnline({Duration timeout = const Duration(seconds: 5)}) async {
    try {
      return await isConnected().timeout(timeout);
    } catch (e) {
      return false;
    }
  }

  /// Dispose
  void dispose() {
    _subscription?.cancel();
  }
}
