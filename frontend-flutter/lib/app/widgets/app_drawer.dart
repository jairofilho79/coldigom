import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/i18n/generated/app_localizations.dart';
import '../stores/auth_store.dart';
import '../stores/audio_player_store.dart';
import '../services/offline/download_service.dart';
import 'mini_audio_player.dart';
import 'language_selector_widget.dart';

/// Navigation drawer com mini player no footer quando áudio está em background
class AppDrawer extends ConsumerWidget {
  const AppDrawer({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authProvider);
    final playerState = ref.watch(audioPlayerStateProvider);
    final l10n = AppLocalizations.of(context)!;
    
    // Verificar se áudio está em background (escondido)
    final showMiniPlayerInDrawer = playerState.currentMaterial != null && 
                                    playerState.isBackground;

    return Drawer(
      child: Column(
        children: [
          // Header do drawer
          UserAccountsDrawerHeader(
            accountName: Text(
              authState.user?.username ?? l10n.drawerUser,
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
            accountEmail: Text(
              authState.user?.email ?? '',
            ),
            currentAccountPicture: CircleAvatar(
              backgroundColor: Colors.white,
              child: Text(
                (authState.user?.username ?? 'U')[0].toUpperCase(),
                style: const TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
            decoration: BoxDecoration(
              color: Theme.of(context).primaryColor,
            ),
          ),
          // Menu de navegação
          Expanded(
            child: ListView(
              padding: EdgeInsets.zero,
              children: [
                ListTile(
                  leading: const Icon(Icons.dashboard),
                  title: Text(l10n.drawerDashboard),
                  onTap: () {
                    Navigator.pop(context);
                    context.go('/');
                  },
                ),
                ListTile(
                  leading: const Icon(Icons.music_note),
                  title: Text(l10n.drawerPraises),
                  onTap: () {
                    Navigator.pop(context);
                    context.go('/praises');
                  },
                ),
                ListTile(
                  leading: const Icon(Icons.list),
                  title: Text(l10n.drawerPraiseLists),
                  onTap: () {
                    Navigator.pop(context);
                    context.go('/praise-lists');
                  },
                ),
                ListTile(
                  leading: const Icon(Icons.meeting_room),
                  title: const Text('Salas'),
                  onTap: () {
                    Navigator.pop(context);
                    context.go('/rooms/offline');
                  },
                ),
                ListTile(
                  leading: const Icon(Icons.label),
                  title: Text(l10n.drawerTags),
                  onTap: () {
                    Navigator.pop(context);
                    context.go('/tags');
                  },
                ),
                ListTile(
                  leading: const Icon(Icons.language),
                  title: Text(l10n.drawerLanguages),
                  onTap: () {
                    Navigator.pop(context);
                    context.go('/languages');
                  },
                ),
                ListTile(
                  leading: const Icon(Icons.folder),
                  title: Text(l10n.drawerMaterialKinds),
                  onTap: () {
                    Navigator.pop(context);
                    context.go('/material-kinds');
                  },
                ),
                ListTile(
                  leading: const Icon(Icons.category),
                  title: Text(l10n.drawerMaterialTypes),
                  onTap: () {
                    Navigator.pop(context);
                    context.go('/material-types');
                  },
                ),
                ListTile(
                  leading: const Icon(Icons.translate),
                  title: Text(l10n.drawerTranslations),
                  onTap: () {
                    Navigator.pop(context);
                    context.go('/translations');
                  },
                ),
                const Divider(),
                const LanguageSelectorWidget(),
                ListTile(
                  leading: const Icon(Icons.logout),
                  title: Text(l10n.drawerLogout),
                  onTap: () async {
                    Navigator.pop(context);
                    // Limpar cache de URLs antes de fazer logout
                    ref.read(offlineDownloadServiceProvider).clearUrlCache();
                    await ref.read(authProvider.notifier).logout();
                    if (context.mounted) {
                      context.go('/login');
                    }
                  },
                ),
              ],
            ),
          ),
          // Mini player no footer quando em background
          if (showMiniPlayerInDrawer) const MiniAudioPlayer(isInDrawer: true),
        ],
      ),
    );
  }
}
