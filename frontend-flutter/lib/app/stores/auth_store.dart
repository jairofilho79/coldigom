import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';
import '../../core/config/hive_config.dart';
import '../../app/models/user_model.dart';

/// Provider do cliente de autenticação
final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier();
});

class AuthState {
  final UserResponse? user;
  final String? token;
  final bool isAuthenticated;

  AuthState({
    this.user,
    this.token,
    required this.isAuthenticated,
  });

  AuthState copyWith({
    UserResponse? user,
    String? token,
    bool? isAuthenticated,
  }) {
    return AuthState(
      user: user ?? this.user,
      token: token ?? this.token,
      isAuthenticated: isAuthenticated ?? this.isAuthenticated,
    );
  }
}

class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier() : super(AuthState(isAuthenticated: false)) {
    _loadAuthState();
  }

  void _loadAuthState() {
    final authBox = Hive.box(HiveConfig.authBoxName);
    final token = authBox.get('token') as String?;
    final userJson = authBox.get('user');

    if (token != null && userJson != null) {
      try {
        final user = UserResponse.fromJson(userJson as Map<String, dynamic>);
        state = AuthState(
          user: user,
          token: token,
          isAuthenticated: true,
        );
      } catch (e) {
        // Se houver erro ao carregar, limpar dados
        logout();
      }
    }
  }

  Future<void> login(String token, UserResponse user) async {
    final authBox = Hive.box(HiveConfig.authBoxName);
    await authBox.put('token', token);
    await authBox.put('user', user.toJson());

    state = AuthState(
      user: user,
      token: token,
      isAuthenticated: true,
    );
  }

  Future<void> logout() async {
    await HiveConfig.clearAll();
    state = AuthState(isAuthenticated: false);
  }
}
