import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../stores/audio_player_store.dart';
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
    
    // Se há material carregado e mini player deve estar visível, mostrar no footer
    final showMiniPlayer = playerState.currentMaterial != null && 
                          playerState.isMiniPlayerVisible;

    return Scaffold(
      appBar: appBar,
      body: body,
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
