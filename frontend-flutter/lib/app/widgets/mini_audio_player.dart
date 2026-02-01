import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../stores/audio_player_store.dart';

/// Mini player de áudio para footer
class MiniAudioPlayer extends ConsumerStatefulWidget {
  final bool isInDrawer;
  
  const MiniAudioPlayer({super.key, this.isInDrawer = false});

  @override
  ConsumerState<MiniAudioPlayer> createState() => _MiniAudioPlayerState();
}

class _MiniAudioPlayerState extends ConsumerState<MiniAudioPlayer> {
  double? _localSliderValue; // Estado local para o slider durante arraste

  String _formatDuration(Duration? duration) {
    if (duration == null) return '0:00';
    final minutes = duration.inMinutes;
    final seconds = duration.inSeconds % 60;
    return '${minutes.toString()}:${seconds.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final playerState = ref.watch(audioPlayerStateProvider);
    final playerNotifier = ref.read(audioPlayerStateProvider.notifier);

    // Não mostrar se não houver material carregado
    if (playerState.currentMaterial == null) {
      return const SizedBox.shrink();
    }

    final position = playerState.position ?? Duration.zero;
    final duration = playerState.duration ?? Duration.zero;
    final progress = duration.inMilliseconds > 0
        ? position.inMilliseconds / duration.inMilliseconds
        : 0.0;
    
    // Usar valor local se estiver arrastando, senão usar o progresso real
    final sliderValue = _localSliderValue ?? progress;

    final material = playerState.currentMaterial!;
    final materialKindName = playerState.materialKindName ?? material.materialKind?.name ?? 'Áudio';
    final praiseName = playerState.praiseName ?? '';

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.1),
            blurRadius: 4,
            offset: const Offset(0, -2),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Linha superior: Nome do praise e material kind
            Row(
              children: [
                // Ícone de áudio
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  child: Icon(
                    Icons.music_note,
                    color: Theme.of(context).primaryColor,
                    size: 20,
                  ),
                ),
                // Nome do praise e material kind
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (praiseName.isNotEmpty)
                        Text(
                          praiseName,
                          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                                fontWeight: FontWeight.w600,
                              ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      Text(
                        materialKindName,
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              color: Colors.grey[600],
                            ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
                // Controles de ação (olho, nova aba, X)
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Olho fechado/aberto (esconder/mostrar)
                    if (widget.isInDrawer)
                      IconButton(
                        icon: const Icon(Icons.visibility),
                        iconSize: 20,
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(),
                        onPressed: () => playerNotifier.showMiniPlayer(),
                        tooltip: 'Mostrar mini player',
                      )
                    else
                      IconButton(
                        icon: const Icon(Icons.visibility_off),
                        iconSize: widget.isInDrawer ? 20 : 24,
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(),
                        onPressed: () => playerNotifier.hideMiniPlayer(),
                        tooltip: 'Esconder mini player',
                      ),
                    SizedBox(width: widget.isInDrawer ? 4 : 8),
                    // Nova aba (abrir tela cheia)
                    IconButton(
                      icon: const Icon(Icons.open_in_new),
                      iconSize: widget.isInDrawer ? 20 : 24,
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(),
                      onPressed: () {
                        final material = playerState.currentMaterial!;
                        final praiseName = playerState.praiseName ?? '';
                        final materialKindName = playerState.materialKindName ?? material.materialKind?.name ?? '';
                        context.push(
                          '/materials/${material.id}/audio?praiseName=${Uri.encodeComponent(praiseName)}&materialKindName=${Uri.encodeComponent(materialKindName)}',
                        );
                      },
                      tooltip: 'Abrir em tela cheia',
                    ),
                    SizedBox(width: widget.isInDrawer ? 4 : 8),
                    // X (fechar)
                    IconButton(
                      icon: const Icon(Icons.close),
                      iconSize: widget.isInDrawer ? 20 : 24,
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(),
                      onPressed: () => playerNotifier.closePlayer(),
                      tooltip: 'Fechar player',
                    ),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 8),
            // Linha inferior: Seeker + botões de controle
            Row(
              children: [
                // Seeker simples
                Expanded(
                  child: Slider(
                    value: sliderValue.clamp(0.0, 1.0),
                    onChanged: (value) {
                      // Atualizar apenas visualmente durante o arraste
                      setState(() {
                        _localSliderValue = value;
                      });
                    },
                    onChangeEnd: (value) {
                      // Fazer seek apenas quando soltar o slider
                      setState(() {
                        _localSliderValue = null; // Limpar estado local
                      });
                      final newPosition = Duration(
                        milliseconds: (value * duration.inMilliseconds).round(),
                      );
                      playerNotifier.seek(newPosition);
                    },
                  ),
                ),
                // Tempo
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  child: Text(
                    '${_formatDuration(position)} / ${_formatDuration(duration)}',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ),
                // Play/Pause
                IconButton(
                  icon: Icon(playerState.isPlaying ? Icons.pause : Icons.play_arrow),
                  iconSize: widget.isInDrawer ? 24 : 28,
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                  onPressed: () => playerNotifier.togglePlayPause(),
                  tooltip: playerState.isPlaying ? 'Pausar' : 'Reproduzir',
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
