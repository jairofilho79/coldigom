import { describe, expect, it } from 'vitest';
import { mensagemAmigavel } from '../services/mensagensDeErro';

describe('mensagemAmigavel', () => {
  it('traduz as frases que o usuário mais encontra', () => {
    expect(mensagemAmigavel('Unauthorized')).toMatch(/sessão expirou/i);
    expect(mensagemAmigavel('Praise not found')).toMatch(/não existe mais/i);
    expect(mensagemAmigavel('Drive not connected')).toMatch(/não está conectado/i);
  });

  it('mantém o nome do campo na mensagem de obrigatoriedade', () => {
    expect(mensagemAmigavel("Field 'name' must be a non-empty string")).toBe(
      'O campo «name» é obrigatório.'
    );
  });

  it('resume o erro do Drive em vez de vazar o corpo do Google', () => {
    const cru = 'Drive metadata failed (403): {"error":{"code":403,"message":"Insufficient..."}}';
    expect(mensagemAmigavel(cru)).toBe('Sem permissão para ler este item no Google Drive.');
    expect(mensagemAmigavel(cru)).not.toMatch(/Insufficient/);
  });

  it('distingue os motivos de falha do Drive', () => {
    expect(mensagemAmigavel('Drive download failed (413): x')).toMatch(/100 MB/);
    expect(mensagemAmigavel('Drive download failed (404): x')).toMatch(/não existe mais/i);
  });

  it('devolve a mensagem original quando não conhece a tradução', () => {
    // Um texto estranho é melhor que um texto vago: o usuário pode reportá-lo.
    expect(mensagemAmigavel('Algo bem específico do servidor')).toBe(
      'Algo bem específico do servidor'
    );
  });
});
