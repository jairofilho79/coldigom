import type { MouseEvent, ReactNode } from 'react';

import type { GestureDocument, Item } from '../../lib/gestures/schema';
import type { Indice } from '../../lib/gestures/dictionary';
import { chaveDoCaminho, type Caminho } from '../../lib/gestures/flatten';
import { ROTULOS_DE_INSTRUCAO, separadorDaLinha } from '../../lib/gestures/render';
import { GestureThumb } from './GestureThumb';

type Props = {
  doc: GestureDocument;
  indice: Indice | null;
  /** 64 no editor, 96 no visualizador — a única diferença que a spec admite. */
  tamanhoDaFigura?: 64 | 96;
  /** Chave do caminho (chaveDoCaminho) do cartão em foco. */
  emFoco?: string;
  onClicarCartao?: (chave: string) => void;
};

/**
 * O renderizador do documento de gestos — o MESMO na pré-visualização do editor e
 * em qualquer outro lugar. As regras de desenho moram em regras.css.
 */
export function GestureDocumentView({ doc, indice, tamanhoDaFigura = 96, emFoco, onClicarCartao }: Props) {
  const props = (caminho: Caminho, classe: string) => {
    const chave = chaveDoCaminho(caminho);
    return {
      'data-caminho': chave,
      className: `${classe}${emFoco === chave ? ' is-foco' : ''}`,
      onClick: onClicarCartao
        ? (e: MouseEvent) => {
            e.stopPropagation();
            onClicarCartao(chave);
          }
        : undefined,
    };
  };

  const filhos = (itens: Item[], caminho: Caminho, colados = false) => (
    <div className={`gv-filhos${colados ? ' gv-filhos--colados' : ''}`}>
      {itens.map((f, i) => renderItem(f, [...caminho, i]))}
    </div>
  );

  const renderItem = (item: Item, caminho: Caminho): ReactNode => {
    const chave = chaveDoCaminho(caminho);
    switch (item.type) {
      case 'gesture':
        return (
          <div key={chave} {...props(caminho, 'gv-gesto')}>
            <GestureThumb id={item.gestureId} indice={indice} tamanho={tamanhoDaFigura} />
            <div className="gv-letras">
              {item.lyrics.map((l, n) => (
                <p key={n} className="gv-linha">
                  {l.trigger ? <span className="gv-gatilho">{l.trigger}</span> : null}
                  {l.trigger ? separadorDaLinha(l.text) : ''}
                  <span className="gv-leitura">{l.text}</span>
                </p>
              ))}
            </div>
          </div>
        );
      case 'repeat':
        return (
          <div key={chave} {...props(caminho, 'gv-bloco gv-repeat')}>
            {filhos(item.children, caminho)}
            <div className="gv-chave" aria-hidden="true">
              <span className="gv-vezes">{item.count}x</span>
            </div>
          </div>
        );
      case 'coro':
        return (
          <div key={chave} {...props(caminho, 'gv-bloco gv-coro')}>
            <div className="gv-rotulo">CORO</div>
            {filhos(item.children, caminho)}
            <div className="gv-chave gv-chave--tracejada" aria-hidden="true" />
          </div>
        );
      case 'link':
        return (
          <div key={chave} {...props(caminho, 'gv-bloco gv-link')}>
            <div className="gv-conector" aria-hidden="true">↓</div>
            {filhos(item.children, caminho, true)}
          </div>
        );
      case 'final':
        return (
          <div key={chave} {...props(caminho, 'gv-bloco gv-final')}>
            <div className="gv-divisor">FINAL</div>
            {filhos(item.children, caminho)}
          </div>
        );
      case 'instruction':
        return (
          <div key={chave} {...props(caminho, 'gv-instrucao')}>
            {ROTULOS_DE_INSTRUCAO[item.kind] ?? item.kind}
          </div>
        );
      case 'text':
        return (
          <div key={chave} {...props(caminho, 'gv-texto')}>
            {item.text}
          </div>
        );
      default: {
        // Tipo de um documento futuro: mostra como texto para não sumir com nada.
        const desconhecido = item as { text?: string; type?: string };
        return (
          <div key={chave} {...props(caminho, 'gv-texto')}>
            {desconhecido.text ?? `[${desconhecido.type}]`}
          </div>
        );
      }
    }
  };

  return (
    <article className="gv-papel">
      <h1 className="gv-titulo">{doc.title}</h1>
      {doc.items.map((item, i) => renderItem(item, [i]))}
    </article>
  );
}
