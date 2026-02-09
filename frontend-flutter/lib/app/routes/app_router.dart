import 'package:flutter/material.dart';
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
import '../pages/translation_list_page.dart';
import '../pages/translation_form_page.dart';
import '../pages/praise_list_list_page.dart';
import '../pages/praise_list_detail_page.dart';
import '../pages/praise_list_create_page.dart';
import '../pages/praise_list_edit_page.dart';
import '../pages/pdf_viewer_page.dart';
import '../pages/audio_player_page.dart';
import '../pages/room_offline_page.dart';
import '../pages/text_viewer_page.dart';
import '../pages/offline_materials_page.dart';
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
        path: '/translations',
        name: 'translations',
        builder: (context, state) => const TranslationListPage(),
      ),
      GoRoute(
        path: '/translations/:entityType/create',
        name: 'translation-create',
        builder: (context, state) {
          final entityTypeStr = state.pathParameters['entityType']!;
          final entityId = state.uri.queryParameters['entityId'];
          TranslationEntityType entityType;
          switch (entityTypeStr) {
            case 'material-kind':
              entityType = TranslationEntityType.materialKind;
              break;
            case 'praise-tag':
              entityType = TranslationEntityType.praiseTag;
              break;
            case 'material-type':
              entityType = TranslationEntityType.materialType;
              break;
            default:
              throw Exception('Invalid entity type: $entityTypeStr');
          }
          return TranslationFormPage(
            entityType: entityType,
            entityId: entityId,
          );
        },
      ),
      GoRoute(
        path: '/translations/:entityType/:translationId/edit',
        name: 'translation-edit',
        builder: (context, state) {
          final entityTypeStr = state.pathParameters['entityType']!;
          final translationId = state.pathParameters['translationId']!;
          TranslationEntityType entityType;
          switch (entityTypeStr) {
            case 'material-kind':
              entityType = TranslationEntityType.materialKind;
              break;
            case 'praise-tag':
              entityType = TranslationEntityType.praiseTag;
              break;
            case 'material-type':
              entityType = TranslationEntityType.materialType;
              break;
            default:
              throw Exception('Invalid entity type: $entityTypeStr');
          }
          return TranslationFormPage(
            entityType: entityType,
            translationId: translationId,
          );
        },
      ),
      GoRoute(
        path: '/praise-lists',
        name: 'praise-lists',
        builder: (context, state) => const PraiseListListPage(),
      ),
      GoRoute(
        path: '/praise-lists/create',
        name: 'praise-list-create',
        builder: (context, state) => const PraiseListCreatePage(),
      ),
      GoRoute(
        path: '/praise-lists/:id/edit',
        name: 'praise-list-edit',
        builder: (context, state) {
          final id = state.pathParameters['id']!;
          return PraiseListEditPage(listId: id);
        },
      ),
      GoRoute(
        path: '/praise-lists/:id',
        name: 'praise-list-detail',
        builder: (context, state) {
          final id = state.pathParameters['id']!;
          return PraiseListDetailPage(listId: id);
        },
      ),
      GoRoute(
        path: '/rooms/offline',
        name: 'room-offline',
        builder: (context, state) => const RoomOfflinePage(),
      ),
      GoRoute(
        path: '/rooms/offline/:roomId',
        name: 'room-offline-id',
        builder: (context, state) {
          final roomId = state.pathParameters['roomId']!;
          return RoomOfflinePage(roomId: roomId);
        },
      ),
      GoRoute(
        path: '/offline-materials',
        name: 'offline-materials',
        builder: (context, state) => const OfflineMaterialsPage(),
      ),
      GoRoute(
        path: '/materials/:materialId/view',
        name: 'pdf-viewer',
        builder: (context, state) {
          final materialId = state.pathParameters['materialId']!;
          final praiseName = state.uri.queryParameters['praiseName'] ?? '';
          final materialKindName = state.uri.queryParameters['materialKindName'] ?? '';
          final materialKindId = state.uri.queryParameters['materialKindId'];
          final roomId = state.uri.queryParameters['roomId'];
          final playlistIndexStr = state.uri.queryParameters['playlistIndex'];
          final playlistLengthStr = state.uri.queryParameters['playlistLength'];
          final playlistIndex = playlistIndexStr != null ? int.tryParse(playlistIndexStr) : null;
          final playlistLength = playlistLengthStr != null ? int.tryParse(playlistLengthStr) : null;
          return PdfViewerPage(
            key: ValueKey('pdf-$materialId-${playlistIndex ?? ''}'), // Key única para forçar reconstrução
            materialId: materialId,
            praiseName: praiseName,
            materialKindName: materialKindName,
            materialKindId: materialKindId,
            roomId: roomId,
            playlistIndex: playlistIndex,
            playlistLength: playlistLength,
          );
        },
      ),
      GoRoute(
        path: '/materials/:materialId/text',
        name: 'text-viewer',
        builder: (context, state) {
          final materialId = state.pathParameters['materialId']!;
          final praiseName = state.uri.queryParameters['praiseName'] ?? '';
          final materialKindName = state.uri.queryParameters['materialKindName'] ?? '';
          final materialKindId = state.uri.queryParameters['materialKindId'];
          final roomId = state.uri.queryParameters['roomId'];
          final playlistIndexStr = state.uri.queryParameters['playlistIndex'];
          final playlistLengthStr = state.uri.queryParameters['playlistLength'];
          final playlistIndex = playlistIndexStr != null ? int.tryParse(playlistIndexStr) : null;
          final playlistLength = playlistLengthStr != null ? int.tryParse(playlistLengthStr) : null;
          return TextViewerPage(
            key: ValueKey('text-$materialId-${playlistIndex ?? ''}'), // Key única para forçar reconstrução
            materialId: materialId,
            praiseName: praiseName,
            materialKindName: materialKindName,
            materialKindId: materialKindId,
            roomId: roomId,
            playlistIndex: playlistIndex,
            playlistLength: playlistLength,
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

