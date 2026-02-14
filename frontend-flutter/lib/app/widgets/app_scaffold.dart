import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../stores/audio_player_store.dart';
import '../services/connectivity_service.dart';
import 'mini_audio_player.dart';
import 'app_drawer.dart';

/// Scaffold customizado que inclui mini player no footer quando necessário
class AppScaffold extends ConsumerWidget {
  final PreferredSizeWidget? appBar;
  final Widget body;
  final Widget? drawer;
  final Widget? floatingActionButton;
  final FloatingActionButtonLocation? floatingActionButtonLocation;
  final Widget? bottomNavigationBar;
  final bool resizeToAvoidBottomInset;

  const AppScaffold({
    super.key,
    this.appBar,
    required this.body,
    this.drawer,
    this.floatingActionButton,
    this.floatingActionButtonLocation,
    this.bottomNavigationBar,
    this.resizeToAvoidBottomInset = true,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final playerState = ref.watch(audioPlayerStateProvider);
    final connectivityAsync = ref.watch(connectivityStateProvider);
    final isOnline = connectivityAsync.value ?? true;

    // Se há material carregado e mini player deve estar visível, mostrar no footer
    final showMiniPlayer = playerState.currentMaterial != null &&
                          playerState.isMiniPlayerVisible;

    return Scaffold(
      appBar: appBar,
      body: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (!isOnline)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 16),
              color: Colors.orange.shade700,
              child: Row(
                children: [
                  Icon(Icons.cloud_off, color: Colors.white, size: 20),
                  const SizedBox(width: 8),
                  Text(
                    'Modo offline - alguns recursos indisponíveis',
                    style: TextStyle(color: Colors.white, fontSize: 14),
                  ),
                ],
              ),
            ),
          Expanded(child: body),
        ],
      ),
      drawer: drawer ?? const AppDrawer(),
      floatingActionButton: floatingActionButton,
      floatingActionButtonLocation: floatingActionButtonLocation,
      bottomNavigationBar: showMiniPlayer
          ? Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (bottomNavigationBar != null) bottomNavigationBar!,
                const MiniAudioPlayer(),
              ],
            )
          : bottomNavigationBar,
      resizeToAvoidBottomInset: resizeToAvoidBottomInset,
    );
  }
}
