import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../pages/login_page.dart';
import '../pages/dashboard_page.dart';
import '../pages/register_page.dart';
import '../pages/praise_list_page.dart';
import '../stores/auth_store.dart';

class AppRouter {
  static final GoRouter router = GoRouter(
    initialLocation: '/login',
    redirect: (context, state) {
      final authState = ProviderScope.containerOf(context).read(authProvider);
      final isLoggedIn = authState.isAuthenticated;
      final isGoingToLogin = state.matchedLocation == '/login' || 
                            state.matchedLocation == '/register';

      // Se não está logado e não está indo para login/register, redirecionar para login
      if (!isLoggedIn && !isGoingToLogin) {
        return '/login';
      }

      // Se está logado e está indo para login/register, redirecionar para dashboard
      if (isLoggedIn && isGoingToLogin) {
        return '/';
      }

      return null; // Não redirecionar
    },
    routes: [
      GoRoute(
        path: '/login',
        name: 'login',
        builder: (context, state) => const LoginPage(),
      ),
      GoRoute(
        path: '/register',
        name: 'register',
        builder: (context, state) => const RegisterPage(),
      ),
      GoRoute(
        path: '/',
        name: 'dashboard',
        builder: (context, state) => const DashboardPage(),
      ),
      GoRoute(
        path: '/praises',
        name: 'praises',
        builder: (context, state) => const PraiseListPage(),
      ),
    ],
  );
}

