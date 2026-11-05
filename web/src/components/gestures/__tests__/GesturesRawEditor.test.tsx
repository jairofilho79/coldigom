import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { GestureDocument } from '../../../lib/gestures/schema';
import type { Indice } from '../../../lib/gestures/dictionary';
import type { Resultado } from '../../../lib/gestures/edit';
import { GesturesRawEditor } from '../GesturesRawEditor';

const docExemplo: GestureDocument = {
  schema: 'coldigom.gestures/1',
  title: '50 - DO ALTO CÉU',
  dictionaryVersion: 0,
  items: [
    { type: 'gesture', gestureId: 'e473b25ea89b', lyrics: [{ trigger: 'Do alto', text: 'céu' }] },
    { type: 'gesture', gestureId: 'e114cea04d3c', lyrics: [{ trigger: 'Do mundo', text: 'mau' }] },
  ],
};

const indiceExemplo: Indice = {
  version: 1,
  porId: new Map(),
  ativos: [
    {
      id: 'f7936ef1cda6',
      name: 'Mão para cima',
      description: '',
      exampleTriggers: ['Para cima'],
      image: 'assets/cia/gestures/f7936ef1cda6.png',
      gif: null,
      videos: [],
      status: 'active',
      replacedBy: null,
      updatedAt: '2026-01-01',
    },
  ],
};

describe('GesturesRawEditor', () => {
  it('indenta e desindenta o texto com Tab e Shift+Tab', async () => {
    const onRawChange = vi.fn();
    const props = {
      raw: 'linha',
      onRawChange,
      doc: docExemplo,
      indice: indiceExemplo,
      foco: null,
      onFoco: vi.fn(),
      onMudar: vi.fn(),
    };
    const { rerender } = render(<GesturesRawEditor {...props} />);
    const textarea = screen.getByRole('textbox', { name: 'Documento de gestos (JSON raw)' }) as HTMLTextAreaElement;
    textarea.setSelectionRange(0, 0);
    fireEvent.keyDown(textarea, { key: 'Tab' });
    expect(onRawChange).toHaveBeenLastCalledWith('  linha');
    await waitFor(() => expect(textarea.selectionStart).toBe(2));

    rerender(<GesturesRawEditor {...props} raw="  linha" />);
    textarea.setSelectionRange(2, 2);
    fireEvent.keyDown(textarea, { key: 'Tab', shiftKey: true });
    expect(onRawChange).toHaveBeenLastCalledWith('linha');
    await waitFor(() => expect(textarea.selectionStart).toBe(0));
    rerender(<GesturesRawEditor {...props} raw="linha" />);
    onRawChange.mockClear();
    fireEvent.keyDown(textarea, { key: 'Tab', shiftKey: true });
    expect(onRawChange).not.toHaveBeenCalled();
  });

  it('sincroniza alterações e foco quando o usuário seleciona um item', () => {
    const raw = JSON.stringify(docExemplo, null, 2);
    const onFoco = vi.fn();
    const onRawChange = vi.fn();
    render(
      <GesturesRawEditor raw={raw} onRawChange={onRawChange} doc={docExemplo}
        indice={indiceExemplo} foco={null} onFoco={onFoco} onMudar={vi.fn()} />
    );
    const textarea = screen.getByRole('textbox', { name: 'Documento de gestos (JSON raw)' }) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'alterado' } });
    expect(onRawChange).toHaveBeenCalledWith('alterado');
    const start = raw.indexOf('e473b25ea89b');
    textarea.setSelectionRange(start, start);
    fireEvent.select(textarea);
    expect(onFoco).toHaveBeenLastCalledWith([0]);
    const end = raw.indexOf('e114cea04d3c') + 12;
    textarea.setSelectionRange(start, end);
    fireEvent.click(textarea);
    expect(onFoco).toHaveBeenLastCalledWith([0]);
    fireEvent.keyUp(textarea, { key: 'ArrowDown' });
  });

  it('mostra erro de validação e permite abrir e fechar o seletor externamente', async () => {
    const props = {
      raw: JSON.stringify(docExemplo, null, 2),
      onRawChange: vi.fn(),
      doc: docExemplo,
      indice: indiceExemplo,
      foco: [0],
      onFoco: vi.fn(),
      onMudar: vi.fn(),
      erroValidacao: 'Documento inválido',
    };
    const { rerender } = render(<GesturesRawEditor {...props} abrirSeletor={0} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Documento inválido');
    rerender(<GesturesRawEditor {...props} abrirSeletor={1} />);
    expect(screen.getByRole('dialog', { name: 'Escolher gesto' })).toBeInTheDocument();
    await userEvent.setup().keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renderiza textarea com o JSON e a barra de ações', () => {
    const raw = JSON.stringify(docExemplo, null, 2);
    render(
      <GesturesRawEditor
        raw={raw}
        onRawChange={vi.fn()}
        doc={docExemplo}
        indice={indiceExemplo}
        foco={null}
        onFoco={vi.fn()}
        onMudar={vi.fn()}
      />
    );

    const textarea = screen.getByLabelText('Documento de gestos (JSON raw)');
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveValue(raw);

    // Botões da barra de ações
    expect(screen.getByRole('button', { name: 'Adicionar gesto' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Adicionar instrução' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Adicionar texto' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Repetir 2x' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Coro' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Link' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Final' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desagrupar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mover para cima' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mover para baixo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remover' })).toBeInTheDocument();
  });

  it('permite adicionar instrução via botão na visualização raw', async () => {
    const user = userEvent.setup();
    const onMudar = vi.fn<(r: Resultado) => void>();
    const raw = JSON.stringify(docExemplo, null, 2);

    render(
      <GesturesRawEditor
        raw={raw}
        onRawChange={vi.fn()}
        doc={docExemplo}
        indice={indiceExemplo}
        foco={[0]}
        onFoco={vi.fn()}
        onMudar={onMudar}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Adicionar instrução' }));
    expect(onMudar).toHaveBeenCalledTimes(1);
    const res = onMudar.mock.calls[0][0];
    expect(res.doc.items).toHaveLength(3);
    expect(res.doc.items[1]).toEqual({ type: 'instruction', kind: 'instruments' });
  });

  it('permite adicionar texto via botão na visualização raw', async () => {
    const user = userEvent.setup();
    const onMudar = vi.fn<(r: Resultado) => void>();
    const raw = JSON.stringify(docExemplo, null, 2);

    render(
      <GesturesRawEditor
        raw={raw}
        onRawChange={vi.fn()}
        doc={docExemplo}
        indice={indiceExemplo}
        foco={[1]}
        onFoco={vi.fn()}
        onMudar={onMudar}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Adicionar texto' }));
    expect(onMudar).toHaveBeenCalledTimes(1);
    const res = onMudar.mock.calls[0][0];
    expect(res.doc.items).toHaveLength(3);
    expect(res.doc.items[2]).toEqual({ type: 'text', text: '' });
  });

  it('abre seletor de gestos ao clicar em "Adicionar gesto" e insere no documento', async () => {
    const user = userEvent.setup();
    const onMudar = vi.fn<(r: Resultado) => void>();
    const raw = JSON.stringify(docExemplo, null, 2);

    render(
      <GesturesRawEditor
        raw={raw}
        onRawChange={vi.fn()}
        doc={docExemplo}
        indice={indiceExemplo}
        foco={[0]}
        onFoco={vi.fn()}
        onMudar={onMudar}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Adicionar gesto' }));
    expect(screen.getByRole('dialog', { name: 'Escolher gesto' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Mão para cima/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    expect(onMudar).toHaveBeenCalledTimes(1);
    const res = onMudar.mock.calls[0][0];
    expect(res.doc.items[1]).toMatchObject({
      type: 'gesture',
      gestureId: 'f7936ef1cda6',
    });
  });

  it('move e remove item via botões com o foco selecionado', async () => {
    const user = userEvent.setup();
    const onMudar = vi.fn<(r: Resultado) => void>();
    const raw = JSON.stringify(docExemplo, null, 2);

    const { rerender } = render(
      <GesturesRawEditor
        raw={raw}
        onRawChange={vi.fn()}
        doc={docExemplo}
        indice={indiceExemplo}
        foco={[0]}
        onFoco={vi.fn()}
        onMudar={onMudar}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Mover para baixo' }));
    expect(onMudar).toHaveBeenCalledTimes(1);
    expect(onMudar.mock.calls[0][0].doc.items[0]).toMatchObject({ gestureId: 'e114cea04d3c' });

    // Remover
    rerender(
      <GesturesRawEditor
        raw={raw}
        onRawChange={vi.fn()}
        doc={docExemplo}
        indice={indiceExemplo}
        foco={[1]}
        onFoco={vi.fn()}
        onMudar={onMudar}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Remover' }));
    expect(onMudar).toHaveBeenCalledTimes(2);
    expect(onMudar.mock.calls[1][0].doc.items).toHaveLength(1);
  });

  it('envolve em repetição ou coro via botões', async () => {
    const user = userEvent.setup();
    const onMudar = vi.fn<(r: Resultado) => void>();
    const raw = JSON.stringify(docExemplo, null, 2);

    render(
      <GesturesRawEditor
        raw={raw}
        onRawChange={vi.fn()}
        doc={docExemplo}
        indice={indiceExemplo}
        foco={[0]}
        onFoco={vi.fn()}
        onMudar={onMudar}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Coro' }));
    expect(onMudar).toHaveBeenCalledTimes(1);
    expect(onMudar.mock.calls[0][0].doc.items[0]).toMatchObject({ type: 'coro' });
  });

  it('exibe alerta de erro de sintaxe se informado', () => {
    render(
      <GesturesRawEditor
        raw="{\ninvalido"
        onRawChange={vi.fn()}
        doc={null}
        indice={indiceExemplo}
        foco={null}
        onFoco={vi.fn()}
        onMudar={vi.fn()}
        erroSintaxe="Unexpected token i in JSON at position 2"
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Unexpected token i in JSON at position 2');
    expect(screen.getByRole('button', { name: 'Adicionar gesto' })).toBeDisabled();
  });
});
