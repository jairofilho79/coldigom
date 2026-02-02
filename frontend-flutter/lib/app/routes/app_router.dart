import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../pages/login_page.dart';
import '../pages/dashboard_page.dart';
import '../pages/register_page.dart';
import '../pages/praise_list_page.dart';
import '../pages/praise_detail_page.dart';
import '../pages/praise_create_page.dart';
import '../pages/praise_edit_page.dart';
import '../pages/tag_list_page.dart';
import '../pages/tag_form_page.dart';
import '../pages/language_list_page.dart';
import '../pages/language_form_page.dart';
import '../pages/material_kind_list_page.dart';
import '../pages/material_kind_form_page.dart';
import '../pages/material_type_list_page.dart';
import '../pages/material_type_form_page.dart';
import '../pages/pdf_viewer_page.dart';
import '../pages/audio_player_page.dart';
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
      GoRoute(
        path: '/praises/create',
        name: 'praise-create',
        builder: (context, state) => const PraiseCreatePage(),
      ),
      GoRoute(
        path: '/praises/:id/edit',
        name: 'praise-edit',
        builder: (context, state) {
          final id = state.pathParameters['id']!;
          return PraiseEditPage(praiseId: id);
        },
      ),
      GoRoute(
        path: '/praises/:id',
        name: 'praise-detail',
        builder: (context, state) {
          final id = state.pathParameters['id']!;
          return PraiseDetailPage(praiseId: id);
        },
      ),
      GoRoute(
        path: '/tags',
        name: 'tags',
        builder: (context, state) => const TagListPage(),
      ),
      GoRoute(
        path: '/tags/create',
        name: 'tag-create',
        builder: (context, state) => const TagFormPage(),
      ),
      GoRoute(
        path: '/tags/:id/edit',
        name: 'tag-edit',
        builder: (context, state) {
          final id = state.pathParameters['id']!;
          return TagFormPage(tagId: id);
        },
      ),
      GoRoute(
        path: '/languages',
        name: 'languages',
        builder: (context, state) => const LanguageListPage(),
      ),
      GoRoute(
        path: '/languages/create',
        name: 'language-create',
        builder: (context, state) => const LanguageFormPage(),
      ),
      GoRoute(
        path: '/languages/:code/edit',
        name: 'language-edit',
        builder: (context, state) {
          final code = state.pathParameters['code']!;
          return LanguageFormPage(code: code);
        },
      ),
      GoRoute(
        path: '/material-kinds',
        name: 'material-kinds',
        builder: (context, state) => const MaterialKindListPage(),
      ),
      GoRoute(
        path: '/material-kinds/create',
        name: 'material-kind-create',
        builder: (context, state) => const MaterialKindFormPage(),
      ),
      GoRoute(
        path: '/material-kinds/:kindId/edit',
        name: 'material-kind-edit',
        builder: (context, state) {
          final kindId = state.pathParameters['kindId']!;
          return MaterialKindFormPage(kindId: kindId);
        },
      ),
      GoRoute(
        path: '/material-types',
        name: 'material-types',
        builder: (context, state) => const MaterialTypeListPage(),
      ),
      GoRoute(
        path: '/material-types/create',
        name: 'material-type-create',
        builder: (context, state) => const MaterialTypeFormPage(),
      ),
      GoRoute(
        path: '/material-types/:typeId/edit',
        name: 'material-type-edit',
        builder: (context, state) {
          final typeId = state.pathParameters['typeId']!;
          return MaterialTypeFormPage(typeId: typeId);
        },
      ),
      GoRoute(
        path: '/materials/:materialId/view',
        name: 'pdf-viewer',
        builder: (context, state) {
          final materialId = state.pathParameters['materialId']!;
          final praiseName = state.uri.queryParameters['praiseName'] ?? '';
          final materialKindName = state.uri.queryParameters['materialKindName'] ?? '';
          return PdfViewerPage(
            materialId: materialId,
            praiseName: praiseName,
            materialKindName: materialKindName,
          );
        },
      ),
      GoRoute(
        path: '/materials/:materialId/audio',
        name: 'audio-player',
        builder: (context, state) {
          final materialId = state.pathParameters['materialId']!;
          final praiseName = state.uri.queryParameters['praiseName'] ?? '';
          final materialKindName = state.uri.queryParameters['materialKindName'] ?? '';
          return AudioPlayerPage(
            materialId: materialId,
            praiseName: praiseName,
            materialKindName: materialKindName,
          );
        },
      ),
    ],
  );
}

