import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

import { AudioPlayer } from '../components/AudioPlayer';
import type { Material } from '../types';

/**
 * jsdom não implementa HTMLMediaElement: play/pause/load estouram "Not
 * implemented" e duration é um getter fixo em NaN. O dublê abaixo não responde
 * pelo componente — ele imita o elemento de mídia de verdade: play() e pause()
 * viram o estado `paused` e disparam os eventos correspondentes, que é por onde
 * o AudioPlayer descobre que está tocando. A lógica testada continua sendo a
 * do componente.
 */
type MediaFake = HTMLMediaElement & { __paused?: boolean; __duration?: number; __time?: number };

const protoMedia = HTMLMediaElement.prototype as unknown as Record<string, unknown>;
const descritoresOriginais = {
  paused: Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'paused'),
  duration: Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'duration'),
  currentTime: Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime'),
  play: Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'play'),
  pause: Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'pause'),
  load: Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'load'),
};

function instalarDubleDeMidia() {
  Object.defineProperty(HTMLMediaElement.prototype, 'paused', {
    configurable: true,
    get(this: MediaFake) {
      return this.__paused ?? true;
    },
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'duration', {
    configurable: true,
    get(this: MediaFake) {
      return this.__duration ?? NaN;
    },
    set(this: MediaFake, v: number) {
      this.__duration = v;
    },
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', {
    configurable: true,
    get(this: MediaFake) {
      return this.__time ?? 0;
    },
    set(this: MediaFake, v: number) {
      this.__time = v;
    },
  });
  protoMedia.play = function (this: MediaFake) {
    this.__paused = false;
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  };
  protoMedia.pause = function (this: MediaFake) {
    this.__paused = true;
    this.dispatchEvent(new Event('pause'));
  };
  protoMedia.load = function () {};
}

function removerDubleDeMidia() {
  for (const [nome, descritor] of Object.entries(descritoresOriginais)) {
    if (descritor) Object.defineProperty(HTMLMediaElement.prototype, nome, descritor);
    else delete protoMedia[nome];
  }
}

function faixa(n: number): Material {
  return {
    id: `m${n}`,
    praise_id: 'p1',
    material_kind: 'mp3',
    material_kind_name: `Faixa ${n}`,
    type: 'mp3',
    r2_key: `k${n}.mp3`,
    file_path_legacy: '',
    source_material_id: null,
  };
}

const urlDoAsset = (key: string) => `https://cdn.test/${key}`;

function elementoDeAudio(container: HTMLElement): MediaFake {
  const a = container.querySelector('audio');
  if (!a) throw new Error('sem <audio> na tela');
  return a as MediaFake;
}

function renderizar(materials: Material[]) {
  return render(<AudioPlayer materials={materials} getAssetUrl={urlDoAsset} />);
}

/**
 * O localStorage deste ambiente de teste é um objeto sem métodos — é
 * exatamente por isso que readStoredVolume checa `typeof getItem`. Quem precisa
 * de persistência de verdade instala este armazenamento em memória.
 */
const descritorLocalStorage = Object.getOwnPropertyDescriptor(window, 'localStorage');

function instalarLocalStorageEmMemoria(inicial: Record<string, string> = {}) {
  const dados = new Map(Object.entries(inicial));
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get: () => ({
      getItem: (k: string) => dados.get(k) ?? null,
      setItem: (k: string, v: string) => void dados.set(k, String(v)),
      removeItem: (k: string) => void dados.delete(k),
    }),
  });
  return dados;
}

function restaurarLocalStorage() {
  if (descritorLocalStorage) Object.defineProperty(window, 'localStorage', descritorLocalStorage);
}

beforeEach(() => {
  instalarDubleDeMidia();
});

afterEach(() => {
  removerDubleDeMidia();
  restaurarLocalStorage();
});

describe('AudioPlayer — faixa selecionada sobrevive à lista mudando', () => {
  it('remover a faixa selecionada não faz o player sumir', () => {
    // Repro: 3 MP3s, usuário seleciona a faixa 3 e remove uma faixa. Com a
    // seleção guardada por índice, materials[2] virava undefined e o player
    // inteiro saía da tela — sem como voltar sem recarregar.
    const { container, rerender } = renderizar([faixa(1), faixa(2), faixa(3)]);

    fireEvent.click(screen.getByRole('button', { name: 'Faixa 3' }));
    expect(elementoDeAudio(container).getAttribute('src')).toBe('https://cdn.test/k3.mp3');

    rerender(<AudioPlayer materials={[faixa(1), faixa(2)]} getAssetUrl={urlDoAsset} />);

    expect(screen.getByLabelText('Tocar')).toBeTruthy();
    expect(elementoDeAudio(container).getAttribute('src')).toBe('https://cdn.test/k1.mp3');
  });

  it('remover uma faixa anterior não troca a faixa selecionada', () => {
    const { container, rerender } = renderizar([faixa(1), faixa(2), faixa(3), faixa(4)]);

    fireEvent.click(screen.getByRole('button', { name: 'Faixa 3' }));

    rerender(
      <AudioPlayer materials={[faixa(2), faixa(3), faixa(4)]} getAssetUrl={urlDoAsset} />
    );

    expect(elementoDeAudio(container).getAttribute('src')).toBe('https://cdn.test/k3.mp3');
    expect(screen.getByLabelText('Faixa 3')).toBeTruthy();
  });

  it('trocar de faixa zera o tempo mostrado', () => {
    const { container } = renderizar([faixa(1), faixa(2)]);
    const audio = elementoDeAudio(container);

    audio.duration = 120;
    fireEvent.loadedMetadata(audio);
    audio.currentTime = 42;
    fireEvent.timeUpdate(audio);
    expect(screen.getByText('0:42')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Faixa 2' }));

    expect(screen.queryByText('0:42')).toBeNull();
    expect(screen.getAllByText('0:00').length).toBeGreaterThan(0);
  });

  it('um novo carregamento zera o relógio', () => {
    // É o caminho de quando o src troca sem clique — a faixa corrente saiu da
    // lista e o player caiu na primeira.
    const { container } = renderizar([faixa(1)]);
    const audio = elementoDeAudio(container);

    audio.duration = 120;
    fireEvent.loadedMetadata(audio);
    audio.currentTime = 42;
    fireEvent.timeUpdate(audio);
    expect(screen.getByText('0:42')).toBeTruthy();

    fireEvent.loadStart(audio);

    expect(screen.queryByText('0:42')).toBeNull();
    expect(screen.getAllByText('0:00').length).toBe(2);
  });

  it('sem materiais não renderiza nada', () => {
    const { container } = renderizar([]);
    expect(container.innerHTML).toBe('');
  });
});

describe('AudioPlayer — reprodução', () => {
  it('tocar e pausar acompanham o elemento de áudio', () => {
    const { container } = renderizar([faixa(1)]);
    const audio = elementoDeAudio(container);

    fireEvent.click(screen.getByLabelText('Tocar'));
    expect(audio.paused).toBe(false);

    fireEvent.click(screen.getByLabelText('Pausar'));
    expect(audio.paused).toBe(true);
    expect(screen.getByLabelText('Tocar')).toBeTruthy();
  });

  it('trocar de faixa enquanto toca retoma a reprodução na nova faixa', () => {
    const { container } = renderizar([faixa(1), faixa(2)]);
    const audio = elementoDeAudio(container);

    fireEvent.click(screen.getByLabelText('Tocar'));
    fireEvent.click(screen.getByRole('button', { name: 'Faixa 2' }));

    // O navegador pausa sozinho quando o src troca; o wasPlayingRef é quem
    // lembra que era para continuar tocando.
    act(() => audio.pause());
    expect(screen.getByLabelText('Tocar')).toBeTruthy();

    fireEvent.loadedMetadata(audio);
    expect(audio.paused).toBe(false);
    expect(screen.getByLabelText('Pausar')).toBeTruthy();
  });

  it('o fim da faixa volta o tempo para zero e sai do estado tocando', () => {
    const { container } = renderizar([faixa(1)]);
    const audio = elementoDeAudio(container);

    audio.duration = 90;
    fireEvent.loadedMetadata(audio);
    fireEvent.click(screen.getByLabelText('Tocar'));
    audio.currentTime = 90;
    fireEvent.timeUpdate(audio);
    fireEvent.ended(audio);

    expect(screen.getByLabelText('Tocar')).toBeTruthy();
    expect(screen.getAllByText('0:00').length).toBeGreaterThan(0);
  });

  it('arrastar a barra de posição move o áudio', () => {
    const { container } = renderizar([faixa(1)]);
    const audio = elementoDeAudio(container);

    audio.duration = 200;
    fireEvent.loadedMetadata(audio);

    const barra = screen.getByLabelText('Posição do áudio') as HTMLInputElement;
    expect(barra.disabled).toBe(false);
    fireEvent.change(barra, { target: { value: '65' } });

    expect(audio.currentTime).toBe(65);
    expect(screen.getByText('1:05')).toBeTruthy();
    expect(screen.getByText('3:20')).toBeTruthy();
  });

  it('duração não finita não quebra o relógio nem habilita o seek', () => {
    const { container } = renderizar([faixa(1)]);
    const audio = elementoDeAudio(container);

    audio.duration = NaN;
    fireEvent.loadedMetadata(audio);
    expect((screen.getByLabelText('Posição do áudio') as HTMLInputElement).disabled).toBe(true);
    expect(screen.getAllByText('0:00').length).toBe(2);

    audio.duration = Infinity;
    fireEvent.loadedMetadata(audio);
    expect(screen.getAllByText('0:00').length).toBe(2);

    audio.currentTime = -5;
    fireEvent.timeUpdate(audio);
    expect(screen.getAllByText('0:00').length).toBe(2);
  });
});

describe('AudioPlayer — volume e mudo', () => {
  it('o volume é aplicado ao áudio e guardado no localStorage', () => {
    const guardado = instalarLocalStorageEmMemoria();
    const { container } = renderizar([faixa(1)]);
    const audio = elementoDeAudio(container);

    fireEvent.change(screen.getByLabelText('Nível de volume'), { target: { value: '0.3' } });

    expect(audio.volume).toBeCloseTo(0.3);
    expect(guardado.get('audio-volume')).toBe('0.3');
  });

  it('o volume guardado é lido na montagem', () => {
    instalarLocalStorageEmMemoria({ 'audio-volume': '0.25' });
    const { container } = renderizar([faixa(1)]);

    expect((screen.getByLabelText('Nível de volume') as HTMLInputElement).value).toBe('0.25');
    expect(elementoDeAudio(container).volume).toBeCloseTo(0.25);
  });

  it('valor guardado inválido ou fora da faixa cai no padrão', () => {
    instalarLocalStorageEmMemoria({ 'audio-volume': 'nada disso' });
    const { unmount } = renderizar([faixa(1)]);
    expect((screen.getByLabelText('Nível de volume') as HTMLInputElement).value).toBe('0.8');
    unmount();

    instalarLocalStorageEmMemoria({ 'audio-volume': '7' });
    renderizar([faixa(1)]);
    expect((screen.getByLabelText('Nível de volume') as HTMLInputElement).value).toBe('1');
  });

  it('sem localStorage utilizável o player abre no volume padrão', () => {
    // Ambiente onde `localStorage` existe mas não tem os métodos (é o caso
    // deste próprio runner): não pode estourar nem perder o player.
    expect(() => renderizar([faixa(1)])).not.toThrow();
    expect((screen.getByLabelText('Nível de volume') as HTMLInputElement).value).toBe('0.8');
  });

  it('armazenamento bloqueado não derruba o player', () => {
    // Safari privado / cookies desligados: ler e escrever no localStorage
    // estoura. O player tem que abrir mesmo assim, no volume padrão.
    const lancar = () => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    };
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get: () => ({ getItem: lancar, setItem: lancar, removeItem: lancar }),
    });

    expect(() => renderizar([faixa(1)])).not.toThrow();
    expect((screen.getByLabelText('Nível de volume') as HTMLInputElement).value).toBe('0.8');
    expect(() =>
      fireEvent.change(screen.getByLabelText('Nível de volume'), { target: { value: '0.4' } })
    ).not.toThrow();
  });

  it('silenciar e voltar o som alternam o mudo do áudio', () => {
    const { container } = renderizar([faixa(1)]);
    const audio = elementoDeAudio(container);

    fireEvent.click(screen.getByLabelText('Silenciar'));
    expect(audio.muted).toBe(true);

    fireEvent.click(screen.getByLabelText('Ativar som'));
    expect(audio.muted).toBe(false);
  });

  it('arrastar o volume até zero estando mudo continua mudo', () => {
    // Havia dois caminhos desmutando (o handler inline e o onVolumeChange):
    // levar o volume a zero desmutava, o que é o contrário do que o gesto pede.
    const { container } = renderizar([faixa(1)]);
    const audio = elementoDeAudio(container);

    fireEvent.click(screen.getByLabelText('Silenciar'));
    fireEvent.change(screen.getByLabelText('Nível de volume'), { target: { value: '0' } });

    expect(screen.getByLabelText('Ativar som')).toBeTruthy();
    expect(audio.muted).toBe(true);
  });

  it('subir o volume estando mudo devolve o som', () => {
    const { container } = renderizar([faixa(1)]);
    const audio = elementoDeAudio(container);

    fireEvent.click(screen.getByLabelText('Silenciar'));
    fireEvent.change(screen.getByLabelText('Nível de volume'), { target: { value: '0.5' } });

    expect(screen.getByLabelText('Silenciar')).toBeTruthy();
    expect(audio.muted).toBe(false);
  });
});

describe('AudioPlayer — modo de edição', () => {
  it('cada faixa ganha o Remover, que avisa o id certo', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(
      <AudioPlayer
        materials={[faixa(1), faixa(2)]}
        getAssetUrl={urlDoAsset}
        admin={{
          materialKindOptions: [{ value: 'mp3', label: 'MP3' }],
          saving: false,
          onUpdateKind: vi.fn().mockResolvedValue(undefined),
          onDelete,
        }}
      />
    );

    const remover = screen.getAllByRole('button', { name: 'Remover' });
    // Cabeçalho (faixa corrente) + uma entrada por faixa na lista.
    expect(remover.length).toBe(3);

    fireEvent.click(remover[remover.length - 1]);
    expect(onDelete).toHaveBeenCalledWith('m2');
  });
});

describe('nome acessível das faixas no modo admin', () => {
  it('o botão de trocar de faixa tem nome mesmo sem o rótulo visível', () => {
    // Com `admin`, o rótulo visível some (a categoria passa a ser editável ao
    // lado) e sobrava só o ícone `aria-hidden`: o botão não se anunciava. Quem
    // usa leitor de tela não conseguia trocar de faixa.
    render(
      <AudioPlayer
        materials={[
          { id: 'a', material_kind: 'k1', material_kind_name: 'Soprano', type: 'mp3', r2_key: 'k/a.mp3' },
          { id: 'b', material_kind: 'k2', material_kind_name: 'Contralto', type: 'mp3', r2_key: 'k/b.mp3' },
        ] as never}
        getAssetUrl={(k) => `https://cdn.test/${k}`}
        admin={{
          materialKindOptions: [{ value: 'k1', label: 'Soprano' }],
          saving: false,
          onUpdateKind: async () => {},
          onDelete: async () => {},
        }}
      />
    );

    expect(screen.getByRole('button', { name: /Soprano/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Contralto/ })).toBeTruthy();
  });
});
