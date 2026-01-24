import 'package:connectivity_plus/connectivity_plus.dart';
import 'dart:async';

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

  /// Dispose
  void dispose() {
    _subscription?.cancel();
  }
}
