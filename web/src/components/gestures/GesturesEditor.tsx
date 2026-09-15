import { useEffect, useMemo, useState } from 'react';
import type { GestureDocument, InstructionKind, Item } from '../../lib/gestures/schema';
import { INSTRUCTION_KINDS } from '../../lib/gestures/schema';
import type { GestureEntry, Indice } from '../../lib/gestures/dictionary';
import { achatar, chaveDoCaminho, irmaosContiguos, ordenar, pai, type Caminho, type Cartao } from '../../lib/gestures/flatten';
import {
  adicionarLinha, definirInstrucao, definirRepeticoes, desagrupar, editarLinha, editarTexto, envolver, inserirApos, mover,
  novoGesto, podeDesagrupar, podeEnvolver, remover, removerLinha, trocarGesto, type EspecDeBloco, type Resultado,
} from '../../lib/gestures/edit';
import { ROTULOS_DE_INSTRUCAO } from '../../lib/gestures/render';
import { GesturePicker } from './GesturePicker';
import { GestureThumb } from './GestureThumb';

type Props = {
  doc: GestureDocument;
  indice: Indice | null;
  foco: Caminho | null;
  onFoco: (caminho: Caminho | null) => void;
  onMudar: (r: Resultado) => void;
  /** Chave do `path` que o servidor devolveu num 400. */
  erroNoCaminho?: string | null;
  /** Contador: quando muda, abre o seletor em modo inserir (Ctrl+Enter da página). */
  abrirSeletor?: number;
  /** Gesto criado de dentro do seletor: a página põe no índice; aqui ele entra no documento. */
  onGestoCriado?: (entrada: GestureEntry) => void;
};

const ROTULO_DO_TIPO: Record<string, string> = {
  gesture: 'Gesto', repeat: 'Repetir', coro: 'Coro', link: 'Link', final: 'Final', instruction: 'Instrução', text: 'Texto',
};

const mesmoCaminho = (a: Caminho | null, b: Caminho | null) => JSON.stringify(a) === JSON.stringify(b);

/**
 * A lista de cartões. O que se edita é a árvore (por caminho); a lista é só a
 * projeção de `achatar`. Seleção contígua entre irmãos é estado daqui; o foco é
 * da página, porque a pré-visualização ao lado o acompanha.
 */
export function GesturesEditor({ doc, indice, foco, onFoco, onMudar, erroNoCaminho, abrirSeletor, onGestoCriado }: Props) {
  const cartoes = useMemo(() => achatar(doc), [doc]);
  const [selecao, setSelecao] = useState<Caminho[]>([]);
  const [vezes, setVezes] = useState(2);
  const [picker, setPicker] = useState<{ modo: 'inserir' | 'trocar'; caminho: Caminho | null } | null>(null);

  useEffect(() => {
    if (abrirSeletor) setPicker({ modo: 'inserir', caminho: foco });
    // só quando o contador muda; o foco do momento é o que vale
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abrirSeletor]);

  // A seleção efetiva sempre inclui o foco; seleção velha de outro pai cai fora.
  const selecionados = useMemo<Caminho[]>(() => {
    if (!foco) return [];
    const comFoco = selecao.some((c) => mesmoCaminho(c, foco)) ? selecao : [foco];
    return irmaosContiguos(comFoco) ? ordenar(comFoco) : [foco];
  }, [selecao, foco]);

  const clicarCartao = (caminho: Caminho, shift: boolean) => {
    if (shift && foco && mesmoCaminho(pai(foco), pai(caminho))) {
      const p = pai(caminho) ?? [];
      const a = foco[foco.length - 1];
      const b = caminho[caminho.length - 1];
      const faixa: Caminho[] = [];
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) faixa.push([...p, i]);
      setSelecao(faixa);
      return;
    }
    setSelecao([caminho]);
    onFoco(caminho);
  };

  const aplicar = (r: Resultado) => {
    setSelecao(r.foco ? [r.foco] : []);
    onMudar(r);
  };

  const envolverEm = (espec: EspecDeBloco) => aplicar(envolver(doc, selecionados, espec));
  const motivoEnvolver = (espec: EspecDeBloco) => (selecionados.length ? podeEnvolver(doc, selecionados, espec) : 'Selecione um cartão.');
  const motivoDesagrupar = foco ? podeDesagrupar(doc, foco) : 'Selecione um bloco.';

  const inserir = (item: Item) => aplicar(inserirApos(doc, foco, item));

  const renderCartao = (c: Cartao) => {
    const chave = chaveDoCaminho(c.caminho);
    const emFoco = mesmoCaminho(foco, c.caminho);
    const selecionado = selecionados.some((s) => mesmoCaminho(s, c.caminho));
    const classes = ['ge-cartao', `ge-cartao--${c.item.type}`, emFoco ? 'is-foco' : '', selecionado ? 'is-selecionado' : '', erroNoCaminho === chave ? 'is-erro' : '']
      .filter(Boolean)
      .join(' ');
    return (
      <div
        key={chave}
        data-cartao={chave}
        className={classes}
        style={{ marginLeft: c.profundidade * 16 }}
        role="option"
        aria-selected={selecionado}
        tabIndex={0}
        onClick={(e) => clicarCartao(c.caminho, e.shiftKey)}
        // Shift+clique é seleção de faixa a partir do foco atual: o navegador
        // moveria o foco para o cartão clicado antes do onClick decidir a
        // faixa, trocando a âncora por baixo do gesto. Sem isso, a faixa vira
        // sempre um cartão só. `e.target !== e.currentTarget` só age quando o
        // mousedown é no próprio cartão — senão intercepta o clique de um
        // botão/input dentro dele.
        onMouseDown={(e) => { if (e.target !== e.currentTarget) return; if (e.shiftKey) e.preventDefault(); }}
        onFocus={() => { if (!emFoco) onFoco(c.caminho); }}
        // Mesma guarda: sem ela, Espaço/Enter digitados num input do cartão
        // (Gatilho, Leitura...) borbulham até aqui — o Espaço era engolido por
        // `preventDefault` (virava "ab" no lugar de "a b") e o Enter repetia a
        // seleção do cartão por cima de quem estava digitando.
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            clicarCartao(c.caminho, false);
          }
        }}
      >
        <div className="ge-cartao-tipo">{ROTULO_DO_TIPO[c.item.type] ?? c.item.type}</div>
        {renderCorpo(c.item, c.caminho)}
      </div>
    );
  };

  const renderCorpo = (item: Item, caminho: Caminho) => {
    switch (item.type) {
      case 'gesture':
        return (
          <div className="ge-gesto">
            <button
              type="button"
              className="ge-figura-btn"
              aria-label="Trocar gesto"
              onClick={(e) => {
                e.stopPropagation();
                setPicker({ modo: 'trocar', caminho });
              }}
            >
              <GestureThumb id={item.gestureId} indice={indice} tamanho={64} />
            </button>
            <div className="ge-linhas">
              {item.lyrics.map((l, n) => (
                <div key={n} className="ge-linha">
                  <input
                    aria-label="Gatilho"
                    className="ge-input ge-input--gatilho"
                    value={l.trigger}
                    placeholder="gatilho"
                    onClick={(e) => e.stopPropagation()}
                    onFocus={() => onFoco(caminho)}
                    onChange={(e) => onMudar(editarLinha(doc, caminho, n, { trigger: e.target.value }))}
                  />
                  <input
                    aria-label="Leitura"
                    className="ge-input ge-input--leitura"
                    value={l.text}
                    placeholder="leitura"
                    onClick={(e) => e.stopPropagation()}
                    onFocus={() => onFoco(caminho)}
                    onChange={(e) => onMudar(editarLinha(doc, caminho, n, { text: e.target.value }))}
                  />
                </div>
              ))}
              <div className="ge-linha-acoes">
                <button type="button" className="ge-btn ge-btn--mini" disabled={item.lyrics.length >= 3} onClick={(e) => { e.stopPropagation(); onMudar(adicionarLinha(doc, caminho)); }}>
                  + linha
                </button>
                <button type="button" className="ge-btn ge-btn--mini" disabled={item.lyrics.length <= 1} onClick={(e) => { e.stopPropagation(); onMudar(removerLinha(doc, caminho, item.lyrics.length - 1)); }}>
                  − linha
                </button>
                <code className="ge-id">{item.gestureId}</code>
              </div>
            </div>
          </div>
        );
      case 'repeat':
        return (
          <label className="ge-campo" onClick={(e) => e.stopPropagation()}>
            Repetições
            <input
              type="number"
              min={2}
              aria-label="Repetições"
              className="ge-input ge-input--n"
              value={item.count}
              onFocus={() => onFoco(caminho)}
              onChange={(e) => onMudar(definirRepeticoes(doc, caminho, Number(e.target.value)))}
            />
          </label>
        );
      case 'instruction':
        return (
          <select
            aria-label="Instrução"
            className="ge-input"
            value={item.kind}
            onClick={(e) => e.stopPropagation()}
            onFocus={() => onFoco(caminho)}
            onChange={(e) => onMudar(definirInstrucao(doc, caminho, e.target.value as InstructionKind))}
          >
            {INSTRUCTION_KINDS.map((k) => (
              <option key={k} value={k}>
                {ROTULOS_DE_INSTRUCAO[k]}
              </option>
            ))}
          </select>
        );
      case 'text':
        return (
          <input
            aria-label="Texto"
            className="ge-input"
            value={item.text}
            onClick={(e) => e.stopPropagation()}
            onFocus={() => onFoco(caminho)}
            onChange={(e) => onMudar(editarTexto(doc, caminho, e.target.value))}
          />
        );
      default:
        return <div className="ge-cartao-meta">{'children' in item ? `${item.children.length} filho(s)` : null}</div>;
    }
  };

  return (
    <div className="ge-editor">
      <div className="ge-barra" role="toolbar" aria-label="Ações do editor">
        <button type="button" className="ge-btn" onClick={() => setPicker({ modo: 'inserir', caminho: foco })}>Adicionar gesto</button>
        <button type="button" className="ge-btn" onClick={() => inserir({ type: 'instruction', kind: 'instruments' })}>Adicionar instrução</button>
        <button type="button" className="ge-btn" onClick={() => inserir({ type: 'text', text: '' })}>Adicionar texto</button>
        <span className="ge-barra-sep" />
        <input type="number" min={2} aria-label="Vezes" className="ge-input ge-input--n" value={vezes} onChange={(e) => setVezes(Math.max(2, Number(e.target.value) || 2))} />
        {(
          [
            [`Repetir ${vezes}x`, { type: 'repeat', count: vezes }],
            ['Coro', { type: 'coro' }],
            ['Link', { type: 'link' }],
            ['Final', { type: 'final' }],
          ] as [string, EspecDeBloco][]
        ).map(([rotulo, espec]) => {
          const motivo = motivoEnvolver(espec);
          return (
            <button key={rotulo} type="button" className="ge-btn" disabled={!!motivo} title={motivo ?? undefined} onClick={() => envolverEm(espec)}>
              {rotulo}
            </button>
          );
        })}
        <button type="button" className="ge-btn" disabled={!!motivoDesagrupar} title={motivoDesagrupar ?? undefined} onClick={() => foco && aplicar(desagrupar(doc, foco))}>Desagrupar</button>
        <span className="ge-barra-sep" />
        <button type="button" className="ge-btn" disabled={!foco} onClick={() => foco && aplicar(mover(doc, foco, -1))}>Mover para cima</button>
        <button type="button" className="ge-btn" disabled={!foco} onClick={() => foco && aplicar(mover(doc, foco, 1))}>Mover para baixo</button>
        <button type="button" className="ge-btn ge-btn--perigo" disabled={!foco} onClick={() => foco && aplicar(remover(doc, foco))}>Remover</button>
      </div>

      <div className="ge-lista" role="listbox" aria-label="Cartões do documento">
        {cartoes.length === 0 ? <p className="ge-vazio">Documento vazio. Comece por "Adicionar gesto".</p> : cartoes.map(renderCartao)}
      </div>

      <GesturePicker
        indice={indice}
        aberto={picker !== null}
        onFechar={() => setPicker(null)}
        onCriado={onGestoCriado}
        onEscolher={(id) => {
          if (!picker) return;
          if (picker.modo === 'trocar' && picker.caminho) onMudar(trocarGesto(doc, picker.caminho, id));
          else aplicar(inserirApos(doc, picker.caminho, novoGesto(id)));
          setPicker(null);
        }}
      />
    </div>
  );
}
