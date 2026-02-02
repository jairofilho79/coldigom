import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../stores/auth_store.dart';
import '../stores/audio_player_store.dart';
import '../services/offline/download_service.dart';
import 'mini_audio_player.dart';

/// Navigation drawer com mini player no footer quando áudio está em background
class AppDrawer extends ConsumerWidget {
  const AppDrawer({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authProvider);
    final playerState = ref.watch(audioPlayerStateProvider);
    
    // Verificar se áudio está em background (escondido)
    final showMiniPlayerInDrawer = playerState.currentMaterial != null && 
                                    playerState.isBackground;

    return Drawer(
      child: Column(
        children: [
          // Header do drawer
          UserAccountsDrawerHeader(
            accountName: Text(
              authState.user?.username ?? 'Usuário',
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
                  title: const Text('Dashboard'),
                  onTap: () {
                    Navigator.pop(context);
                    context.go('/');
                  },
                ),
                ListTile(
                  leading: const Icon(Icons.music_note),
                  title: const Text('Praises'),
                  onTap: () {
                    Navigator.pop(context);
                    context.go('/praises');
                  },
                ),
                ListTile(
                  leading: const Icon(Icons.label),
                  title: const Text('Tags'),
                  onTap: () {
                    Navigator.pop(context);
                    context.go('/tags');
                  },
                ),
                ListTile(
                  leading: const Icon(Icons.language),
                  title: const Text('Linguagens'),
                  onTap: () {
                    Navigator.pop(context);
                    context.go('/languages');
                  },
                ),
                ListTile(
                  leading: const Icon(Icons.folder),
                  title: const Text('Material Kinds'),
                  onTap: () {
                    Navigator.pop(context);
                    context.go('/material-kinds');
                  },
                ),
                ListTile(
                  leading: const Icon(Icons.category),
                  title: const Text('Material Types'),
                  onTap: () {
                    Navigator.pop(context);
                    context.go('/material-types');
                  },
                ),
                const Divider(),
                ListTile(
                  leading: const Icon(Icons.logout),
                  title: const Text('Sair'),
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
