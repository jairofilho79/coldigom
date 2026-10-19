import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { GestureDocument, Item } from '../../lib/gestures/schema';
import type { EspecDeBloco, Resultado } from '../../lib/gestures/edit';
import {
  desagrupar,
  envolver,
  inserirApos,
  mover,
  novoGesto,
  remover,
} from '../../lib/gestures/edit';
import type { GestureEntry, Indice } from '../../lib/gestures/dictionary';
import { irmaosContiguos, ordenar, type Caminho } from '../../lib/gestures/flatten';
import {
  encontrarLimitesDosItens,
  itemNoOffset,
  itensNoIntervalo,
} from '../../lib/gestures/rawRanges';
import { GesturesToolbar } from './GesturesToolbar';
import { GesturePicker } from './GesturePicker';

export type GesturesRawEditorProps = {
  raw: string;
  onRawChange: (texto: string) => void;
  doc: GestureDocument | null;
  indice: Indice | null;
  foco: Caminho | null;
  onFoco: (caminho: Caminho | null) => void;
  onMudar: (r: Resultado) => void;
  erroSintaxe?: string | null;
  erroValidacao?: string | null;
  abrirSeletor?: number;
  onGestoCriado?: (entrada: GestureEntry) => void;
};

const mesmoCaminho = (a: Caminho | null, b: Caminho | null) =>
  JSON.stringify(a) === JSON.stringify(b);

export function GesturesRawEditor({
  raw,
  onRawChange,
  doc,
  indice,
  foco,
  onFoco,
  onMudar,
  erroSintaxe,
  erroValidacao,
  abrirSeletor,
  onGestoCriado,
}: GesturesRawEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const textareaId = useId();
  const [vezes, setVezes] = useState(2);
  const [selecaoManual, setSelecaoManual] = useState<Caminho[]>([]);
  const [picker, setPicker] = useState<{
    modo: 'inserir' | 'trocar';
    caminho: Caminho | null;
  } | null>(null);

  const ranges = useMemo(() => encontrarLimitesDosItens(raw), [raw]);

  const [abrirSeletorAnterior, setAbrirSeletorAnterior] = useState(abrirSeletor);
  if (abrirSeletor !== abrirSeletorAnterior) {
    setAbrirSeletorAnterior(abrirSeletor);
    if (abrirSeletor) {
      setPicker({ modo: 'inserir', caminho: foco });
    }
  }

  // A seleção efetiva usa os itens envolvidos na seleção de texto, ou cai no foco
  const selecionados = useMemo<Caminho[]>(() => {
    if (selecaoManual.length > 0) {
      return irmaosContiguos(selecaoManual) ? ordenar(selecaoManual) : selecaoManual;
    }
    return foco ? [foco] : [];
  }, [selecaoManual, foco]);

  // Ao mudar foco externamente (ex.: clique na pré-visualização), rola o textarea até o item
  useEffect(() => {
    if (!foco || !textareaRef.current) return;
    const alvo = ranges.find((r) => mesmoCaminho(r.caminho, foco));
    if (!alvo) return;

    const ta = textareaRef.current;
    // Se o cursor já está dentro do item, não força reposicionamento
    if (ta.selectionStart >= alvo.start && ta.selectionEnd <= alvo.end && document.activeElement === ta) {
      return;
    }

    // Calcula altura aproximada da linha
    const totalLinhas = (raw.match(/\n/g) || []).length + 1;
    const alturaLinha = ta.scrollHeight / Math.max(1, totalLinhas);
    const scrollDesejado = Math.max(0, (alvo.startLine - 3) * alturaLinha);
    if (typeof ta.scrollTo === 'function') {
      ta.scrollTo({ top: scrollDesejado, behavior: 'smooth' });
    } else {
      ta.scrollTop = scrollDesejado;
    }
  }, [foco, ranges, raw]);

  const atualizarFocoPorCursor = (start: number, end: number) => {
    if (start === end) {
      setSelecaoManual([]);
      const item = itemNoOffset(ranges, start);
      if (!mesmoCaminho(item, foco)) {
        onFoco(item);
      }
    } else {
      const itens = itensNoIntervalo(ranges, start, end);
      setSelecaoManual(itens);
      if (itens.length > 0 && !mesmoCaminho(itens[0], foco)) {
        onFoco(itens[0]);
      }
    }
  };

  const aplicarResultado = (r: Resultado) => {
    setSelecaoManual(r.foco ? [r.foco] : []);
    onMudar(r);
  };

  const inserir = (item: Item) => {
    if (!doc) return;
    aplicarResultado(inserirApos(doc, foco, item));
  };

  const envolverEm = (espec: EspecDeBloco) => {
    if (!doc) return;
    aplicarResultado(envolver(doc, selecionados, espec));
  };

  const desagruparBloco = () => {
    if (!doc || !foco) return;
    aplicarResultado(desagrupar(doc, foco));
  };

  const moverItem = (dir: -1 | 1) => {
    if (!doc || !foco) return;
    aplicarResultado(mover(doc, foco, dir));
  };

  const removerItem = () => {
    if (!doc || !foco) return;
    aplicarResultado(remover(doc, foco));
  };

  const aoTeclar = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Suporte a Tab / Shift+Tab para indentação de 2 espaços
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = e.currentTarget;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;

      if (e.shiftKey) {
        // Desindentar
        const antes = raw.substring(0, start);
        const linhaInicio = antes.lastIndexOf('\n') + 1;
        if (raw.substring(linhaInicio, linhaInicio + 2) === '  ') {
          const novo = raw.substring(0, linhaInicio) + raw.substring(linhaInicio + 2);
          onRawChange(novo);
          queueMicrotask(() => {
            ta.setSelectionRange(Math.max(linhaInicio, start - 2), Math.max(linhaInicio, end - 2));
          });
        }
      } else {
        // Indentar 2 espaços
        const novo = raw.substring(0, start) + '  ' + raw.substring(end);
        onRawChange(novo);
        queueMicrotask(() => {
          ta.setSelectionRange(start + 2, start + 2);
        });
      }
    }
  };

  return (
    <div className="ge-editor ge-raw-editor">
      <GesturesToolbar
        doc={doc}
        foco={foco}
        selecionados={selecionados}
        vezes={vezes}
        onMudarVezes={setVezes}
        onAdicionarGesto={() => setPicker({ modo: 'inserir', caminho: foco })}
        onInserir={inserir}
        onEnvolver={envolverEm}
        onDesagrupar={desagruparBloco}
        onMover={moverItem}
        onRemover={removerItem}
        desabilitado={!doc}
      />

      {erroSintaxe ? (
        <div className="ge-raw-error" role="alert">
          {erroSintaxe}
        </div>
      ) : erroValidacao ? (
        <div className="ge-raw-error" role="alert">
          {erroValidacao}
        </div>
      ) : null}

      <textarea
        id={textareaId}
        ref={textareaRef}
        className="ge-raw-textarea"
        aria-label="Documento de gestos (JSON raw)"
        value={raw}
        rows={26}
        spellCheck={false}
        onChange={(e) => {
          onRawChange(e.target.value);
        }}
        onSelect={(e) => {
          atualizarFocoPorCursor(e.currentTarget.selectionStart, e.currentTarget.selectionEnd);
        }}
        onClick={(e) => {
          atualizarFocoPorCursor(e.currentTarget.selectionStart, e.currentTarget.selectionEnd);
        }}
        onKeyUp={(e) => {
          atualizarFocoPorCursor(e.currentTarget.selectionStart, e.currentTarget.selectionEnd);
        }}
        onKeyDown={aoTeclar}
        placeholder='{\n  "schema": "coldigom.gestures/1",\n  "title": "...",\n  "dictionaryVersion": 0,\n  "items": []\n}'
      />

      <GesturePicker
        indice={indice}
        aberto={picker !== null}
        onFechar={() => setPicker(null)}
        onCriado={onGestoCriado}
        onEscolher={(id) => {
          if (!picker || !doc) return;
          aplicarResultado(inserirApos(doc, picker.caminho, novoGesto(id)));
          setPicker(null);
        }}
      />
    </div>
  );
}
