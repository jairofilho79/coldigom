import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:just_audio/just_audio.dart';
import '../models/praise_material_model.dart';
import '../services/audio/audio_player_service.dart';
import '../services/offline/download_service.dart';
import '../services/api/api_service.dart';

/// Estado do player de áudio
class AudioPlayerState {
  final PraiseMaterialResponse? currentMaterial;
  final String? praiseName;
  final String? materialKindName;
  final Duration? position;
  final Duration? duration;
  final bool isPlaying;
  final bool isLoading;
  final String? error;
  final bool isMiniPlayerVisible;
  final bool isBackground; // true quando mini player está escondido

  AudioPlayerState({
    this.currentMaterial,
    this.praiseName,
    this.materialKindName,
    this.position,
    this.duration,
    this.isPlaying = false,
    this.isLoading = false,
    this.error,
    this.isMiniPlayerVisible = false,
    this.isBackground = false,
  });

  AudioPlayerState copyWith({
    PraiseMaterialResponse? currentMaterial,
    String? praiseName,
    String? materialKindName,
    Duration? position,
    Duration? duration,
    bool? isPlaying,
    bool? isLoading,
    String? error,
    bool? isMiniPlayerVisible,
    bool? isBackground,
  }) {
    return AudioPlayerState(
      currentMaterial: currentMaterial ?? this.currentMaterial,
      praiseName: praiseName ?? this.praiseName,
      materialKindName: materialKindName ?? this.materialKindName,
      position: position ?? this.position,
      duration: duration ?? this.duration,
      isPlaying: isPlaying ?? this.isPlaying,
      isLoading: isLoading ?? this.isLoading,
      error: error,
      isMiniPlayerVisible: isMiniPlayerVisible ?? this.isMiniPlayerVisible,
      isBackground: isBackground ?? this.isBackground,
    );
  }

  /// Limpa o estado (quando player é fechado)
  AudioPlayerState clear() {
    return AudioPlayerState();
  }
}

/// Provider do serviço de áudio
final audioPlayerServiceProvider = Provider<AudioPlayerService>((ref) {
  final downloadService = ref.read(offlineDownloadServiceProvider);
  final apiService = ref.read(apiServiceProvider);
  return AudioPlayerService(downloadService, apiService);
});

/// Provider do estado do player de áudio
final audioPlayerStateProvider =
    StateNotifierProvider<AudioPlayerNotifier, AudioPlayerState>((ref) {
  final service = ref.read(audioPlayerServiceProvider);
  return AudioPlayerNotifier(service);
});

/// Notifier para gerenciar estado do player de áudio
class AudioPlayerNotifier extends StateNotifier<AudioPlayerState> {
  final AudioPlayerService _service;
  StreamSubscription<Duration>? _positionSubscription;
  StreamSubscription<Duration?>? _durationSubscription;
  StreamSubscription<PlayerState>? _playerStateSubscription;

  AudioPlayerNotifier(this._service) : super(AudioPlayerState()) {
    _setupListeners();
  }

  void _setupListeners() {
    final player = _service.player;

    // Escutar mudanças de posição
    _positionSubscription = player.positionStream.listen((position) {
      if (mounted) {
        state = state.copyWith(position: position);
      }
    });

    // Escutar mudanças de duração
    _durationSubscription = player.durationStream.listen((duration) {
      if (mounted) {
        state = state.copyWith(duration: duration);
      }
    });

    // Escutar mudanças de estado do player
    _playerStateSubscription = player.playerStateStream.listen((playerState) {
      if (mounted) {
        state = state.copyWith(
          isPlaying: playerState.playing,
          isLoading: playerState.processingState == ProcessingState.loading ||
              playerState.processingState == ProcessingState.buffering,
        );
      }
    });
  }

  /// Carrega um material de áudio
  Future<void> loadMaterial(
    PraiseMaterialResponse material, {
    String? praiseName,
    String? materialKindName,
  }) async {
    try {
      state = state.copyWith(
        currentMaterial: material,
        praiseName: praiseName,
        materialKindName: materialKindName ?? material.materialKind?.name,
        isLoading: true,
        error: null,
        isMiniPlayerVisible: false, // Resetar visibilidade ao carregar novo
        isBackground: false,
      );

      await _service.loadAudio(
        material,
        onDownloadProgress: (progress) {
          // Progresso pode ser usado para mostrar indicador
        },
        onError: (error) {
          if (mounted) {
            state = state.copyWith(
              error: error,
              isLoading: false,
            );
          }
        },
      );

      if (mounted) {
        state = state.copyWith(isLoading: false);
      }
    } catch (e) {
      if (mounted) {
        state = state.copyWith(
          error: e.toString(),
          isLoading: false,
        );
      }
    }
  }

  /// Toggle play/pause
  Future<void> togglePlayPause() async {
    try {
      final player = _service.player;
      if (player.playing) {
        await player.pause();
      } else {
        await player.play();
      }
    } catch (e) {
      if (mounted) {
        state = state.copyWith(error: e.toString());
      }
    }
  }

  /// Para o áudio e reseta posição
  Future<void> stop() async {
    try {
      await _service.player.stop();
    } catch (e) {
      if (mounted) {
        state = state.copyWith(error: e.toString());
      }
    }
  }

  /// Avança 5 segundos
  Future<void> seekForward() async {
    try {
      final currentPosition = state.position ?? Duration.zero;
      final newPosition = currentPosition + const Duration(seconds: 5);
      final duration = state.duration;
      
      if (duration != null && newPosition > duration) {
        await _service.player.seek(duration);
      } else {
        await _service.player.seek(newPosition);
      }
    } catch (e) {
      if (mounted) {
        state = state.copyWith(error: e.toString());
      }
    }
  }

  /// Retrocede 5 segundos
  Future<void> seekBackward() async {
    try {
      final currentPosition = state.position ?? Duration.zero;
      final newPosition = currentPosition - const Duration(seconds: 5);
      final seekPosition = newPosition < Duration.zero ? Duration.zero : newPosition;
      await _service.player.seek(seekPosition);
    } catch (e) {
      if (mounted) {
        state = state.copyWith(error: e.toString());
      }
    }
  }

  /// Faz seek para uma posição específica
  Future<void> seek(Duration position) async {
    try {
      await _service.player.seek(position);
    } catch (e) {
      if (mounted) {
        state = state.copyWith(error: e.toString());
      }
    }
  }

  /// Mostra o mini player no footer
  void showMiniPlayer() {
    state = state.copyWith(
      isMiniPlayerVisible: true,
      isBackground: false,
    );
  }

  /// Esconde o mini player (vai para background)
  void hideMiniPlayer() {
    state = state.copyWith(
      isMiniPlayerVisible: false,
      isBackground: true,
    );
  }

  /// Fecha o player completamente
  Future<void> closePlayer() async {
    try {
      await stop();
      // Não fazer dispose do serviço aqui, apenas limpar estado
      // O serviço será reutilizado se necessário
    } catch (e) {
      // Ignorar erros ao fechar
    }
    
    if (mounted) {
      state = state.clear();
    }
  }

  @override
  void dispose() {
    _positionSubscription?.cancel();
    _durationSubscription?.cancel();
    _playerStateSubscription?.cancel();
    super.dispose();
  }
}
