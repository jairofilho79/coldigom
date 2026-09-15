import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as api from '../../../services/api';
import type { Material, MaterialKind, PraiseDetail } from '../../../types';
import { SecaoGestos } from '../SecaoGestos';

const gestos = (extra: Partial<Material> = {}): Material => ({
  id: 'g1', praise_id: 'p1', material_kind: 'k1', material_kind_name: 'Gestos', type: 'gestures',
  r2_key: 'assets/praises/p1/g1.gestures', file_path_legacy: '', source_material_id: null, ...extra,
});
const pdf: Material = { id: 'pdf1', praise_id: 'p1', material_kind: 'k2', material_kind_name: 'Gestos PDF', type: 'pdf', r2_key: 'assets/praises/p1/pdf1.pdf', file_path_legacy: '', source_material_id: null };
const categorias: MaterialKind[] = [{ id: 'k1', name: 'Gestos' }, { id: 'k2', name: 'Gestos PDF' }];

function montar(props: Partial<Parameters<typeof SecaoGestos>[0]> = {}) {
  const onAtualizar = vi.fn();
  render(
    <MemoryRouter>
      <SecaoGestos praiseId="p1" materiais={[gestos(), pdf]} categorias={categorias} podeEditar={false} onAtualizar={onAtualizar} {...props} />
    </MemoryRouter>
  );
  return { onAtualizar };
}

afterEach(() => vi.restoreAllMocks());

describe('SecaoGestos', () => {
  it('lista os materiais de gestos como links para o editor, com estado e selo', () => {
    montar({ materiais: [gestos({ has_content: false }), gestos({ id: 'g2', material_kind_name: 'Gestos II', has_content: true, is_reviewed: true }), pdf] });
    expect(screen.getByRole('heading', { name: /Gestos CIAs/ })).toBeInTheDocument();
    const links = screen.getAllByRole('link');
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/praise/p1/gestos/g1', '/praise/p1/gestos/g2']);
    expect(links[0]).toHaveTextContent('Sem conteúdo');
    expect(links[1]).toHaveTextContent('Documento');
    expect(links[1]).toHaveTextContent('revisado');
  });

  it('sem materiais e sem edição, não renderiza nada', () => {
    const { container } = render(<MemoryRouter><SecaoGestos praiseId="p1" materiais={[pdf]} categorias={categorias} podeEditar={false} onAtualizar={() => {}} /></MemoryRouter>);
    expect(container).toBeEmptyDOMElement();
  });

  it('com edição cria o material com categoria e PDF de origem, e devolve o louvor atualizado', async () => {
    const user = userEvent.setup();
    const atualizado = { id: 'p1', materials: [] } as unknown as PraiseDetail;
    const criar = vi.spyOn(api, 'createMaterial').mockResolvedValue(atualizado);
    const { onAtualizar } = montar({ podeEditar: true, materiais: [pdf] });
    await user.click(screen.getByRole('button', { name: 'Novo documento de gestos' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Categoria' }), 'k1');
    await user.selectOptions(screen.getByRole('combobox', { name: 'PDF de origem' }), 'pdf1');
    await user.click(screen.getByRole('button', { name: 'Criar' }));
    expect(criar).toHaveBeenCalledWith('p1', { material_kind: 'k1', type: 'gestures', source_material_id: 'pdf1' });
    expect(onAtualizar).toHaveBeenCalledWith(atualizado);
  });

  it('erro na criação aparece na seção e o formulário continua aberto', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'createMaterial').mockRejectedValue(new Error('Este louvor não existe mais.'));
    montar({ podeEditar: true });
    await user.click(screen.getByRole('button', { name: 'Novo documento de gestos' }));
    await user.click(screen.getByRole('button', { name: 'Criar' }));
    expect(await screen.findByText('Este louvor não existe mais.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Criar' })).toBeInTheDocument();
  });
});
