import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChordProEditor } from '../ChordProEditor';
import { lineToText } from '../../../lib/chordpro/edit';
import { parse } from '../../../lib/chordpro/parse';
import { validateSong } from '../../../lib/chordpro/validate';
import type { Song } from '../../../lib/chordpro/types';

const fonte = '{title: Confio Em Deus}\n{key: A}\n\nConfio em [A]Deus\n[E]   A linda [A]flor\n';

/**
 * O editor é controlado: quem guarda o Song é a página. O harness faz esse papel —
 * sem ele um campo de cabeçalho voltaria ao valor da prop entre uma tecla e outra
 * (React restaura o valor de input controlado), e "apagar A e digitar G" daria "AG".
 * `onChange` continua sendo o espião que os testes inspecionam.
 */
function renderEditor(src = fonte) {
  const song = parse(src);
  const onChange = vi.fn();

  function Pagina() {
    const [atual, setAtual] = useState<Song>(song);
    return (
      <ChordProEditor
        song={atual}
        onChange={(novo) => {
          onChange(novo);
          setAtual(novo);
        }}
        issues={validateSong(atual)}
      />
    );
  }

  const utils = render(<Pagina />);
  return { ...utils, song, onChange };
}

describe('editar uma linha', () => {
  it('clicar na linha abre um campo com o texto dela', async () => {
    renderEditor();
    await userEvent.click(screen.getByText(/Confio em/));
    expect(screen.getByRole('textbox', { name: /linha/i })).toHaveValue('Confio em [A]Deus');
  });

  it('confirmar devolve um Song novo com a linha reparseada', async () => {
    const { onChange } = renderEditor();
    await userEvent.click(screen.getByText(/Confio em/));
    const campo = screen.getByRole('textbox', { name: /linha/i });
    await userEvent.clear(campo);
    // "[[" é como o userEvent digita um "[" literal — "[" sozinho abre descritor de tecla.
    await userEvent.type(campo, 'Confio em [[Bm]Deus');
    await userEvent.click(screen.getByRole('button', { name: /confirmar/i }));

    expect(onChange).toHaveBeenCalled();
    const novo = onChange.mock.calls.at(-1)![0];
    const linha = novo.stanzas[0].lines[0];
    expect(linha.cells[1].chord).toBe('Bm');
  });

  it('normaliza o acorde digitado na confirmação', async () => {
    const { onChange } = renderEditor();
    await userEvent.click(screen.getByText(/Confio em/));
    const campo = screen.getByRole('textbox', { name: /linha/i });
    await userEvent.clear(campo);
    await userEvent.type(campo, 'Confio em [[Cm7b5]Deus');
    await userEvent.click(screen.getByRole('button', { name: /confirmar/i }));

    const novo = onChange.mock.calls.at(-1)![0];
    expect(novo.stanzas[0].lines[0].cells[1].chord).toBe('Cø');
  });

  it('cancelar não altera nada', async () => {
    const { onChange } = renderEditor();
    await userEvent.click(screen.getByText(/Confio em/));
    await userEvent.type(screen.getByRole('textbox', { name: /linha/i }), 'lixo');
    await userEvent.click(screen.getByRole('button', { name: /cancelar/i }));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('confirmar não engole o que foi digitado', () => {
  /** Os três textos que o parser de linha única não transforma em linha de cifra.
   *  Confirmar qualquer um deles gravava uma linha em branco, em silêncio. */
  const engolidos: Array<[string, string]> = [
    ['só espaços', '   '],
    ['diretiva de cabeçalho', '{title: Novo}'],
    ['nota do pipeline', '; nota'],
  ];

  for (const [nome, texto] of engolidos) {
    it(`recusa ${nome} em vez de virar linha em branco`, async () => {
      const { onChange } = renderEditor();
      await userEvent.click(screen.getByText(/Confio em/));
      const campo = screen.getByRole('textbox', { name: /linha/i });
      await userEvent.clear(campo);
      // "{" e "[" precisam ser dobrados: sozinhos abrem descritor de tecla no userEvent.
      await userEvent.type(campo, texto.replace(/\{/g, '{{').replace(/\[/g, '[['));
      await userEvent.click(screen.getByRole('button', { name: /confirmar/i }));

      expect(onChange).not.toHaveBeenCalled();
      // O campo continua aberto com o texto intacto: nada foi perdido.
      expect(screen.getByRole('textbox', { name: /linha/i })).toHaveValue(texto);
      expect(screen.getByText(/não forma uma linha de cifra/i)).toBeInTheDocument();
    });
  }

  it('esvaziar o valor de um {comment} não vira linha de células em silêncio', async () => {
    const { onChange } = renderEditor('{comment: Refrão}\nletra [C]aqui\n');
    await userEvent.click(screen.getByText('Refrão'));
    await userEvent.clear(screen.getByRole('textbox', { name: /linha/i }));
    await userEvent.click(screen.getByRole('button', { name: /confirmar/i }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/não forma uma linha de cifra/i)).toBeInTheDocument();
  });

  it('voltar a digitar tira o aviso do caminho', async () => {
    renderEditor();
    await userEvent.click(screen.getByText(/Confio em/));
    const campo = screen.getByRole('textbox', { name: /linha/i });
    await userEvent.clear(campo);
    await userEvent.click(screen.getByRole('button', { name: /confirmar/i }));
    expect(screen.getByText(/não forma uma linha de cifra/i)).toBeInTheDocument();

    await userEvent.type(campo, 'a');
    expect(screen.queryByText(/não forma uma linha de cifra/i)).toBeNull();
  });

  it('{comment} com valor continua confirmando', async () => {
    const { onChange } = renderEditor('{comment: Refrão}\nletra [C]aqui\n');
    await userEvent.click(screen.getByText('Refrão'));
    const campo = screen.getByRole('textbox', { name: /linha/i });
    await userEvent.clear(campo);
    await userEvent.type(campo, '{{comment: Final}');
    await userEvent.click(screen.getByRole('button', { name: /confirmar/i }));

    expect(onChange.mock.calls.at(-1)![0].stanzas[0].lines[0]).toEqual({
      kind: 'comment',
      text: 'Final',
    });
  });
});

describe('normalização é feita nas células, não no texto', () => {
  it('colchete escapado é texto e não vira acorde normalizado', async () => {
    const { onChange } = renderEditor();
    await userEvent.click(screen.getByText(/Confio em/));
    const campo = screen.getByRole('textbox', { name: /linha/i });
    await userEvent.clear(campo);
    await userEvent.type(campo, '\\[[Cm7b5\\]');
    await userEvent.click(screen.getByRole('button', { name: /confirmar/i }));

    const linha = onChange.mock.calls.at(-1)![0].stanzas[0].lines[0];
    expect(linha.cells).toHaveLength(1);
    expect(linha.cells[0].chord).toBeNull();
    expect(linha.cells[0].text).toBe('[Cm7b5]');
  });

  it('`\\[` que abre e `]` solto que fecha continuam texto — o regex reescrevia', async () => {
    const { onChange } = renderEditor();
    await userEvent.click(screen.getByText(/Confio em/));
    const campo = screen.getByRole('textbox', { name: /linha/i });
    await userEvent.clear(campo);
    // Para o parseCells (o dono da regra) isto é texto literal "[Cdim] tal": `\[` é
    // colchete escapado e `]` sozinho nunca é delimitador. Um regex `/\[([^\]]*)\]/`
    // casa daqui até o `]` solto, captura "Cdim" e grava "[C°] tal" — corrompe letra.
    await userEvent.type(campo, '\\[[Cdim] tal');
    await userEvent.click(screen.getByRole('button', { name: /confirmar/i }));

    const linha = onChange.mock.calls.at(-1)![0].stanzas[0].lines[0];
    expect(linha.cells[0].chord).toBeNull();
    expect(linha.cells[0].text).toBe('[Cdim] tal');
  });
});

describe('inserir símbolo do painel de dicas', () => {
  it('cai na posição do cursor, devolve o foco e deixa o cursor depois do símbolo', async () => {
    renderEditor();
    await userEvent.click(screen.getByText(/Confio em/));
    const campo = screen.getByRole('textbox', { name: /linha/i }) as HTMLInputElement;
    expect(campo).toHaveValue('Confio em [A]Deus');

    // Cursor entre "Confio" e " em": a posição importa, senão o símbolo iria para o fim.
    campo.focus();
    campo.setSelectionRange(6, 6);

    // O painel é irmão ACIMA da lista de linhas: abrir e clicar aqui tira o foco do
    // campo. É exatamente isso que o queueMicrotask do editor existe para desfazer.
    await userEvent.click(screen.getByRole('button', { name: /como escrever/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Inserir ø' }));

    expect(campo).toHaveValue('Confioø em [A]Deus');
    await waitFor(() => expect(campo).toHaveFocus());
    expect(campo.selectionStart).toBe(7);
    expect(campo.selectionEnd).toBe(7);
  });

  it('substitui a seleção, em vez de empurrá-la para o lado', async () => {
    renderEditor();
    await userEvent.click(screen.getByText(/Confio em/));
    const campo = screen.getByRole('textbox', { name: /linha/i }) as HTMLInputElement;

    campo.focus();
    campo.setSelectionRange(0, 6); // "Confio"
    await userEvent.click(screen.getByRole('button', { name: /como escrever/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Inserir ø' }));

    expect(campo).toHaveValue('ø em [A]Deus');
    expect(campo.selectionStart).toBe(1);
  });
});

describe('o espaçamento fica visível enquanto se edita', () => {
  it('o preview da linha em edição usa as células reais', async () => {
    const { container } = renderEditor();
    await userEvent.click(screen.getByText(/A linda/));
    const preview = container.querySelector('.cp-editing-preview')!;
    expect(preview.querySelector('.cp-text')!.textContent).toBe('   A linda ');
  });

  it('o preview acompanha o que está sendo digitado', async () => {
    const { container } = renderEditor();
    await userEvent.click(screen.getByText(/Confio em/));
    const campo = screen.getByRole('textbox', { name: /linha/i });
    await userEvent.clear(campo);
    await userEvent.type(campo, 'ab[[C]cd');
    const preview = container.querySelector('.cp-editing-preview')!;
    // A célula de texto solto ("ab") também tem um .cp-chord — vazio, porque é ele que
    // reserva a linha do rótulo. O acorde digitado é o primeiro rótulo não vazio.
    const acordes = Array.from(preview.querySelectorAll('.cp-chord'))
      .map((n) => n.textContent)
      .filter((t) => t !== '');
    expect(acordes).toEqual(['C']);
  });
});

describe('estrutura', () => {
  it('adiciona linha', async () => {
    const { onChange } = renderEditor();
    await userEvent.click(screen.getAllByRole('button', { name: /inserir linha/i })[0]);
    expect(onChange.mock.calls.at(-1)![0].stanzas[0].lines).toHaveLength(3);
  });

  it('remove linha', async () => {
    const { onChange } = renderEditor();
    await userEvent.click(screen.getAllByRole('button', { name: /remover linha/i })[0]);
    expect(onChange.mock.calls.at(-1)![0].stanzas[0].lines).toHaveLength(1);
  });

  it('remover a linha aberta fecha a edição, para o rascunho não cair na linha vizinha', async () => {
    renderEditor();
    await userEvent.click(screen.getByText(/Confio em/));
    await userEvent.type(screen.getByRole('textbox', { name: /linha/i }), ' e mais');
    await userEvent.click(screen.getAllByRole('button', { name: /remover linha/i })[0]);
    // Sem isto, o campo reapareceria sobre a linha que era a 1 com o rascunho antigo,
    // e "Confirmar" gravaria no endereço errado — as linhas se reindexaram.
    expect(screen.queryByRole('textbox', { name: /linha/i })).toBeNull();
  });

  it('separa estrofe', async () => {
    const { onChange } = renderEditor();
    await userEvent.click(screen.getAllByRole('button', { name: /separar estrofe/i })[1]);
    expect(onChange.mock.calls.at(-1)![0].stanzas).toHaveLength(2);
  });
});

describe('cabeçalho', () => {
  it('edita o tom', async () => {
    const { onChange } = renderEditor();
    const campo = screen.getByLabelText('Tom');
    await userEvent.clear(campo);
    await userEvent.type(campo, 'G');
    expect(onChange.mock.calls.at(-1)![0].header.key).toBe('G');
  });

  it('esvaziar o campo remove a diretiva', async () => {
    const { onChange } = renderEditor();
    await userEvent.clear(screen.getByLabelText('Tom'));
    expect(onChange.mock.calls.at(-1)![0].header.key).toBeUndefined();
  });
});

describe('erros de acorde', () => {
  it('marca a linha que tem token não reconhecido', () => {
    const { container } = renderEditor('Confio em [Bmm]Deus\n');
    expect(container.querySelector('.cp-line-row--invalid')).not.toBeNull();
  });

  it('mostra o motivo, com a raiz lida e o pedaço recusado', () => {
    // `getByText(/Bmm/)` NÃO testava isto: o único elemento com esse texto é o
    // `<span class="cp-chord">` da linha renderizada, que aparece com validação ou
    // sem. O motivo de `parseChordToken` não contém "Bmm" — ele nomeia a raiz que
    // conseguiu ler e o resto que não virou qualidade, e é isso que diz ao revisor
    // onde está o erro.
    const { container } = renderEditor('Confio em [Bmm]Deus\n');
    const aviso = container.querySelector('.cp-line-issue')!;
    expect(aviso).toHaveTextContent('depois da raiz B, "mm" não é uma qualidade válida');
  });

  it('anotação não é marcada como erro', () => {
    const { container } = renderEditor('[*2x]\nletra [C]aqui\n');
    expect(container.querySelector('.cp-line-row--invalid')).toBeNull();
  });
});

describe('o espaçamento sobrevive à confirmação', () => {
  it('confirmar sem editar devolve a linha byte a byte', async () => {
    const { onChange } = renderEditor();
    await userEvent.click(screen.getByText(/A linda/));
    await userEvent.click(screen.getByRole('button', { name: /confirmar/i }));

    // O caminho real do dado ao confirmar é lineToText → replaceLine → normalizarLinha
    // (que só troca `cell.chord`, nunca o texto). Os três espaços de "[E]   A linda"
    // são dado do acervo: nenhum trecho pode encolhê-los.
    const novo = onChange.mock.calls.at(-1)![0];
    expect(lineToText(novo, { stanza: 0, line: 1 })).toBe('[E]   A linda [A]flor');
    expect(novo.stanzas[0].lines[1].cells[0].text).toBe('   A linda ');
  });
});

describe('cifra sem nenhuma linha não é beco sem saída', () => {
  // `{title: X}\n\n` é o que o pipeline grava quando não consegue extrair a cifra, e
  // é o que sobra de "+" seguido de "−". O parse devolve `stanzas: []`, o editor
  // itera sobre lista vazia e não desenha NENHUM botão — o "+" só existe dentro de
  // uma linha. Sem uma linha, "Salvar" fica travado por falta de letra: nem o título
  // dava para corrigir, e a única saída era cancelar.
  const soCabecalho = '{title: X}\n\n';

  it('o botão de adicionar linha existe mesmo sem nenhuma estrofe', () => {
    renderEditor(soCabecalho);
    expect(screen.queryByRole('button', { name: /^editar linha/i })).toBeNull();
    expect(screen.getByRole('button', { name: /adicionar linha/i })).toBeInTheDocument();
  });

  it('clicar cria a primeira linha, e ela é editável', async () => {
    const { onChange } = renderEditor(soCabecalho);
    await userEvent.click(screen.getByRole('button', { name: /adicionar linha/i }));

    const novo = onChange.mock.calls.at(-1)![0];
    expect(novo.stanzas).toHaveLength(1);
    expect(novo.stanzas[0].lines).toHaveLength(1);
    // O cabeçalho continua intacto: criar linha não é reescrever a cifra.
    expect(novo.header.title).toBe('X');

    await userEvent.click(screen.getByRole('button', { name: /^editar linha 1/i }));
    const campo = screen.getByRole('textbox', { name: 'Texto da linha' });
    await userEvent.type(campo, 'Confio em [[A]Deus');
    await userEvent.click(screen.getByRole('button', { name: /confirmar/i }));

    const linha = onChange.mock.calls.at(-1)![0].stanzas[0].lines[0];
    expect(linha.cells[1].chord).toBe('A');
  });

  it('acrescenta no FIM da cifra, não só depois de uma linha existente', async () => {
    const { onChange } = renderEditor();
    await userEvent.click(screen.getByRole('button', { name: /adicionar linha/i }));

    const novo = onChange.mock.calls.at(-1)![0];
    const ultima = novo.stanzas.at(-1)!;
    expect(ultima.lines).toHaveLength(3);
    // A nova é a última, e está vazia — o "+" da linha 2 daria o mesmo, mas só
    // depois de encontrar a última linha; aqui o botão é um só, no fim do corpo.
    expect(ultima.lines[2]).toEqual({
      kind: 'cells',
      cells: [{ chord: null, attached: false, text: '' }],
    });
  });
});

describe('o foco não cai no <body> a cada mutação estrutural', () => {
  it('separar estrofe mantém o foco no botão da mesma linha, agora na estrofe nova', async () => {
    renderEditor();
    const antes = screen.getAllByRole('button', { name: /separar estrofe/i });
    await userEvent.click(antes[1]);

    // A `div` que continha o botão desmonta (a linha mudou de estrofe). Sem mover o
    // foco de propósito ele vai para o `<body>`, e voltar ao ponto exige tabular
    // desde o topo do documento.
    const depois = screen.getAllByRole('button', { name: /separar estrofe/i });
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(depois[1]);
  });

  it('remover a última linha de uma estrofe leva o foco à linha vizinha', async () => {
    // Duas estrofes de uma linha: remover a segunda apaga a ESTROFE inteira
    // (`mapStanzas` filtra estrofe vazia) e desmonta a `div` que continha o botão.
    // (Removendo a PRIMEIRA o foco sobrevive por acidente: as chaves são o índice,
    // o React reaproveita o nó da primeira `div` e só troca o conteúdo.)
    renderEditor('a [C]um\n\nb [D]dois\n');
    const botoes = screen.getAllByRole('button', { name: /remover linha/i });
    await userEvent.click(botoes[1]);

    const restantes = screen.getAllByRole('button', { name: /remover linha/i });
    expect(restantes).toHaveLength(1);
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(restantes[0]);
  });

  it('remover a última linha da cifra inteira leva o foco ao botão de adicionar', async () => {
    renderEditor('a [C]um\n');
    await userEvent.click(screen.getByRole('button', { name: /remover linha/i }));

    // Não sobrou linha nenhuma: o único lugar para onde o foco pode ir é o botão
    // que recria uma — que é justamente o que faltava neste estado.
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: /adicionar linha/i })
    );
  });

  it('inserir linha leva o foco à linha recém-criada', async () => {
    renderEditor();
    await userEvent.click(screen.getAllByRole('button', { name: /inserir linha abaixo/i })[0]);
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: /^editar linha 2, vazia/i })
    );
  });

  it('adicionar linha no fim leva o foco à linha recém-criada', async () => {
    renderEditor('a [C]um\n');
    await userEvent.click(screen.getByRole('button', { name: /adicionar linha/i }));
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: /^editar linha 2, vazia/i })
    );
  });
});

describe('cada linha se anuncia pelo que tem dentro', () => {
  // O `aria-label` SUPRIME o conteúdo do `div`: com um rótulo fixo, uma cifra de 40
  // linhas se anuncia quarenta vezes igual e não há como saber qual se vai abrir.
  it('o alvo de edição traz o número e o texto da linha', () => {
    renderEditor();
    expect(
      screen.getByRole('button', { name: 'Editar linha 1: Confio em [A]Deus' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^editar linha 2: \[E\]\s*A linda/i })).toBeInTheDocument();
  });

  it('os três botões de ação dizem de qual linha são', () => {
    renderEditor();
    expect(
      screen.getByRole('button', { name: 'Inserir linha abaixo da linha 1: Confio em [A]Deus' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Remover linha 1: Confio em [A]Deus' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Separar estrofe aqui, antes da linha 1: Confio em [A]Deus',
      })
    ).toBeInTheDocument();
  });

  it('a numeração é da cifra inteira, não reinicia a cada estrofe', () => {
    renderEditor('a [C]um\n\nb [D]dois\n');
    // Sem isso, "linha 1" apareceria duas vezes — o mesmo problema de novo.
    expect(screen.getByRole('button', { name: 'Editar linha 1: a [C]um' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar linha 2: b [D]dois' })).toBeInTheDocument();
  });

  it('linha vazia se anuncia como vazia, e não como uma linha sem nome', async () => {
    renderEditor();
    await userEvent.click(screen.getAllByRole('button', { name: /inserir linha abaixo/i })[0]);
    expect(screen.getByRole('button', { name: 'Editar linha 2, vazia' })).toBeInTheDocument();
  });
});

describe('abrir a linha pelo teclado', () => {
  it('Enter no alvo da linha abre o campo', async () => {
    renderEditor();
    screen.getByRole('button', { name: /^editar linha 1/i }).focus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('textbox', { name: 'Texto da linha' })).toHaveValue(
      'Confio em [A]Deus'
    );
  });

  it('Espaço abre e não rola a página', () => {
    renderEditor();
    const alvo = screen.getByRole('button', { name: /^editar linha 2/i });
    alvo.focus();
    // fireEvent devolve false quando o handler chamou preventDefault — sem isso, o
    // Espaço rolaria a página junto de abrir a linha.
    expect(fireEvent.keyDown(alvo, { key: ' ' })).toBe(false);
    expect(screen.getByRole('textbox', { name: 'Texto da linha' })).toHaveValue(
      '[E]   A linda [A]flor'
    );
  });

  it('outra tecla não abre nada', () => {
    renderEditor();
    const alvo = screen.getByRole('button', { name: /^editar linha 1/i });
    alvo.focus();
    fireEvent.keyDown(alvo, { key: 'a' });
    expect(screen.queryByRole('textbox', { name: 'Texto da linha' })).toBeNull();
  });
});

describe('a recusa da confirmação é anunciada', () => {
  it('o aviso vive numa região viva: o foco fica no campo e nada mais muda', async () => {
    renderEditor();
    await userEvent.click(screen.getByText(/Confio em/));
    const campo = screen.getByRole('textbox', { name: 'Texto da linha' });
    await userEvent.clear(campo);
    await userEvent.keyboard('{Enter}');

    const aviso = screen.getByText(/não forma uma linha de cifra/i);
    // Sem `role`/`aria-live`, quem usa leitor de tela conclui que o Enter não fez
    // nada: o foco não saiu do campo e o valor não mudou.
    expect(aviso).toHaveAttribute('role', 'status');
    expect(aviso).toHaveAttribute('aria-live', 'polite');
    expect(campo).toHaveFocus();
  });
});

describe('inserir símbolo sem linha aberta', () => {
  it('os botões ficam desabilitados e dizem por quê', async () => {
    renderEditor();
    await userEvent.click(screen.getByRole('button', { name: /como escrever/i }));

    const inserir = screen.getByRole('button', { name: 'Inserir ø' });
    // Antes eles pareciam habilitados e não faziam nada: `inserirSimbolo` desiste
    // em silêncio quando não há linha aberta.
    expect(inserir).toBeDisabled();
    expect(inserir).toHaveAccessibleDescription(/abra uma linha/i);
  });

  it('abrir uma linha habilita', async () => {
    renderEditor();
    await userEvent.click(screen.getByRole('button', { name: /como escrever/i }));
    await userEvent.click(screen.getByText(/Confio em/));
    expect(screen.getByRole('button', { name: 'Inserir ø' })).toBeEnabled();
  });
});

describe('é controlado', () => {
  it('não guarda o Song: um song novo por prop troca o que está na tela', () => {
    const antes = parse('Linha antiga [C]aqui\n');
    const depois = parse('Linha nova [G]ali\n');
    const { rerender } = render(
      <ChordProEditor song={antes} onChange={vi.fn()} issues={validateSong(antes)} />
    );
    expect(screen.getByText(/Linha antiga/)).toBeInTheDocument();

    rerender(<ChordProEditor song={depois} onChange={vi.fn()} issues={validateSong(depois)} />);
    // Um editor que guardasse o Song em estado interno continuaria mostrando o antigo.
    expect(screen.queryByText(/Linha antiga/)).toBeNull();
    expect(screen.getByText(/Linha nova/)).toBeInTheDocument();
  });
});
