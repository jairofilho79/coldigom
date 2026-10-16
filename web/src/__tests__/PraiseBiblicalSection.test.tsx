import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { PraiseBiblicalSection } from '../components/PraiseBiblicalSection';
import type { PraiseBiblicalInsight } from '../types';

describe('PraiseBiblicalSection', () => {
  it('não renderiza nada se biblical for nulo ou vazio', () => {
    const { container: c1 } = render(<PraiseBiblicalSection biblical={null} />);
    expect(c1.firstChild).toBeNull();

    const { container: c2 } = render(<PraiseBiblicalSection biblical={undefined} />);
    expect(c2.firstChild).toBeNull();

    const emptyBiblical: PraiseBiblicalInsight = {
      tem_citacao_direta: false,
      referencia_principal: null,
      resumo_uma_linha: '',
      resumo_formatado: '',
      citacoes_diretas: [],
      mensagem_central: null,
      temas_homileticos: [],
      pericopes_relacionadas: [],
    };
    const { container: c3 } = render(<PraiseBiblicalSection biblical={emptyBiblical} />);
    expect(c3.firstChild).toBeNull();
  });

  it('renderiza citação direta destacada quando tem_citacao_direta for true', () => {
    const biblical: PraiseBiblicalInsight = {
      tem_citacao_direta: true,
      referencia_principal: 'Marcos 5:27-30',
      resumo_uma_linha: 'Marcos 5:27-30 · Doze anos de sangue, e o manto que cura',
      resumo_formatado: '📖 Marcos 5:27-30 · Doze anos de sangue...',
      citacoes_diretas: [
        {
          referencia: 'Marcos 5:27-30',
          livro: 'Marcos',
          capitulo: 5,
          versiculo_inicio: 27,
          versiculo_fim: 30,
        },
      ],
      mensagem_central: null,
      temas_homileticos: [],
      pericopes_relacionadas: [],
    };

    render(<PraiseBiblicalSection biblical={biblical} />);

    expect(screen.getByTestId('biblical-direct-badge')).toBeInTheDocument();
    expect(within(screen.getByTestId('biblical-direct-badge')).getByText('Marcos 5:27-30')).toBeInTheDocument();
    expect(screen.getByTestId('biblical-citations-group')).toBeInTheDocument();
    expect(within(screen.getByTestId('biblical-citations-group')).getByText(/Marcos 5:27-30/)).toBeInTheDocument();
  });

  it('renderiza mensagem central teológica e temas homiléticos', () => {
    const biblical: PraiseBiblicalInsight = {
      tem_citacao_direta: false,
      referencia_principal: null,
      resumo_uma_linha: 'Salvação e Graça',
      resumo_formatado: '🕊️ Salvação e Graça',
      citacoes_diretas: [],
      mensagem_central: 'A perseverança dos santos e a suficiência do sacrifício de Cristo na cruz.',
      temas_homileticos: ['Graça', 'Redenção', 'Cruz'],
      pericopes_relacionadas: [],
    };

    render(<PraiseBiblicalSection biblical={biblical} />);

    expect(screen.queryByTestId('biblical-direct-badge')).not.toBeInTheDocument();
    expect(screen.getByTestId('biblical-central-message')).toBeInTheDocument();
    expect(
      screen.getByText('A perseverança dos santos e a suficiência do sacrifício de Cristo na cruz.')
    ).toBeInTheDocument();

    expect(screen.getByTestId('biblical-themes-group')).toBeInTheDocument();
    expect(screen.getByText('#Graça')).toBeInTheDocument();
    expect(screen.getByText('#Redenção')).toBeInTheDocument();
    expect(screen.getByText('#Cruz')).toBeInTheDocument();
  });

  it('renderiza perícopes relacionadas com afinidade e tipo de match', () => {
    const biblical: PraiseBiblicalInsight = {
      tem_citacao_direta: true,
      referencia_principal: 'Gênesis 2:9',
      resumo_uma_linha: 'Gênesis 2:9',
      resumo_formatado: '📖 Gênesis 2:9',
      citacoes_diretas: [],
      mensagem_central: null,
      temas_homileticos: [],
      pericopes_relacionadas: [
        {
          ordem: 0,
          referencia: 'Gênesis 1:1 - 2:3',
          titulo: 'Haja luz, e no sétimo dia Deus repousa',
          similarity: 100,
          match_tipo: 'citacao_direta',
        },
        {
          ordem: 1,
          referencia: 'Isaías 65:17-25',
          titulo: 'Casas para morar, vinhas para colher',
          similarity: 78,
          match_tipo: 'homiletico',
        },
      ],
    };

    render(<PraiseBiblicalSection biblical={biblical} />);

    expect(screen.getByTestId('biblical-pericopes-section')).toBeInTheDocument();
    expect(screen.getByText('Haja luz, e no sétimo dia Deus repousa')).toBeInTheDocument();
    expect(screen.getByText('100% afinidade')).toBeInTheDocument();
    expect(screen.getByText('Citação direta')).toBeInTheDocument();

    expect(screen.getByText('Casas para morar, vinhas para colher')).toBeInTheDocument();
    expect(screen.getByText('78% afinidade')).toBeInTheDocument();
    expect(screen.getByText('Homilético')).toBeInTheDocument();
  });
});
