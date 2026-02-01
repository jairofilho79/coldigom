import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../services/api/api_service.dart';
import '../stores/audio_player_store.dart';
import '../widgets/app_status_widgets.dart';

class AudioPlayerPage extends ConsumerStatefulWidget {
  final String materialId;
  final String praiseName;
  final String materialKindName;

  const AudioPlayerPage({
    super.key,
    required this.materialId,
    required this.praiseName,
    required this.materialKindName,
  });

  @override
  ConsumerState<AudioPlayerPage> createState() => _AudioPlayerPageState();
}

class _AudioPlayerPageState extends ConsumerState<AudioPlayerPage> {
  bool _hasLoaded = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadAudio();
    });
  }

  @override
  void dispose() {
    // Não fechar o player aqui, apenas mostrar mini player quando sair
    // O player continuará tocando em background
    super.dispose();
  }

  Future<void> _loadAudio() async {
    if (_hasLoaded) return;
    
    try {
      final playerState = ref.read(audioPlayerStateProvider);
      final playerNotifier = ref.read(audioPlayerStateProvider.notifier);
      
      // Verificar se o material já está carregado (vindo do mini player)
      if (playerState.currentMaterial?.id == widget.materialId) {
        // Material já está carregado, apenas marcar como carregado
        setState(() {
          _hasLoaded = true;
        });
        return;
      }
      
      // Material não está carregado, carregar agora
      final apiService = ref.read(apiServiceProvider);
      final material = await apiService.getMaterialById(widget.materialId);
      
      await playerNotifier.loadMaterial(
        material,
        praiseName: widget.praiseName.isNotEmpty ? widget.praiseName : null,
        materialKindName: widget.materialKindName.isNotEmpty ? widget.materialKindName : null,
      );
      
      // Iniciar reprodução automaticamente apenas se não estava tocando
      if (!playerState.isPlaying) {
        await playerNotifier.togglePlayPause();
      }
      
      setState(() {
        _hasLoaded = true;
      });
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Erro ao carregar áudio: $e')),
        );
      }
    }
  }

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

    // Quando sair da página, mostrar mini player
    return PopScope(
      onPopInvoked: (didPop) {
        if (didPop && playerState.currentMaterial != null) {
          playerNotifier.showMiniPlayer();
        }
      },
      child: Scaffold(
        appBar: AppBar(
          leading: IconButton(
            icon: const Icon(Icons.arrow_back),
            onPressed: () {
              // Mostrar mini player ao sair
              if (playerState.currentMaterial != null) {
                playerNotifier.showMiniPlayer();
              }
              context.pop();
            },
          ),
          actions: [
            // Botão para destruir o player (fechar completamente)
            IconButton(
              icon: const Icon(Icons.close),
              onPressed: () async {
                await playerNotifier.closePlayer();
                if (context.mounted) {
                  context.pop();
                }
              },
              tooltip: 'Fechar e parar áudio',
            ),
          ],
          title: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                widget.materialKindName.isNotEmpty
                    ? widget.materialKindName
                    : 'Áudio',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              if (widget.praiseName.isNotEmpty)
                Text(
                  widget.praiseName,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Colors.white70,
                      ),
                ),
            ],
          ),
        ),
        body: _buildBody(playerState, playerNotifier),
      ),
    );
  }

  Widget _buildBody(AudioPlayerState state, AudioPlayerNotifier notifier) {
    if (state.isLoading && !_hasLoaded) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const CircularProgressIndicator(),
            const SizedBox(height: 16),
            Text(
              'Carregando áudio...',
              style: Theme.of(context).textTheme.bodyMedium,
            ),
          ],
        ),
      );
    }

    if (state.error != null) {
      return AppErrorWidget(
        message: state.error!,
        onRetry: () {
          _hasLoaded = false;
          _loadAudio();
        },
      );
    }

    if (state.currentMaterial == null) {
      return const AppEmptyWidget(
        message: 'Áudio não disponível',
        icon: Icons.audiotrack,
      );
    }

    return SafeArea(
      child: Column(
        children: [
          // Área principal com informações
          Expanded(
            child: Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  // Ícone grande de áudio
                  Icon(
                    Icons.music_note,
                    size: 120,
                    color: Theme.of(context).primaryColor,
                  ),
                  const SizedBox(height: 24),
                  // Nome do material kind
                  Text(
                    widget.materialKindName.isNotEmpty
                        ? widget.materialKindName
                        : 'Áudio',
                    style: Theme.of(context).textTheme.headlineSmall,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 8),
                  // Nome do praise
                  if (widget.praiseName.isNotEmpty)
                    Text(
                      widget.praiseName,
                      style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                            color: Colors.grey[600],
                          ),
                      textAlign: TextAlign.center,
                    ),
                ],
              ),
            ),
          ),
          // Controles de áudio
          _buildControls(state, notifier),
        ],
      ),
    );
  }

  Widget _buildControls(AudioPlayerState state, AudioPlayerNotifier notifier) {
    final position = state.position ?? Duration.zero;
    final duration = state.duration ?? Duration.zero;
    final progress = duration.inMilliseconds > 0
        ? position.inMilliseconds / duration.inMilliseconds
        : 0.0;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).scaffoldBackgroundColor,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.1),
            blurRadius: 4,
            offset: const Offset(0, -2),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Barra de progresso com seek
          Row(
            children: [
              Text(
                _formatDuration(position),
                style: Theme.of(context).textTheme.bodySmall,
              ),
              Expanded(
                child: Slider(
                  value: progress.clamp(0.0, 1.0),
                  onChanged: (value) {
                    final newPosition = Duration(
                      milliseconds: (value * duration.inMilliseconds).round(),
                    );
                    notifier.seek(newPosition);
                  },
                ),
              ),
              Text(
                _formatDuration(duration),
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ),
          const SizedBox(height: 16),
          // Controles principais
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              // Retroceder 5s
              IconButton(
                icon: const Icon(Icons.replay_5),
                iconSize: 32,
                onPressed: () => notifier.seekBackward(),
                tooltip: 'Retroceder 5 segundos',
              ),
              const SizedBox(width: 8),
              // Play/Pause
              IconButton(
                icon: Icon(state.isPlaying ? Icons.pause : Icons.play_arrow),
                iconSize: 48,
                onPressed: () => notifier.togglePlayPause(),
                tooltip: state.isPlaying ? 'Pausar' : 'Reproduzir',
              ),
              const SizedBox(width: 8),
              // Avançar 5s
              IconButton(
                icon: const Icon(Icons.forward_5),
                iconSize: 32,
                onPressed: () => notifier.seekForward(),
                tooltip: 'Avançar 5 segundos',
              ),
            ],
          ),
        ],
      ),
    );
  }
}
