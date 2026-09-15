import { useId, useState } from 'react';

import { createGesture } from '../../services/api';
import type { GestureEntry } from '../../lib/gestures/dictionary';

type Props = {
  /** O que a pessoa já tinha digitado na busca do seletor, para não redigitar. */
  nomeInicial?: string;
  onCriado: (entrada: GestureEntry) => void;
  /** Com ouvinte, aparece "Cancelar" (no seletor); na página do dicionário não há para onde voltar. */
  onCancelar?: () => void;
};

/**
 * O formulário de gesto novo — nome, descrição, gatilhos e a figura PNG. É o
 * mesmo na página do dicionário e dentro do seletor do editor; quem usa decide
 * o que fazer com a entrada criada (recarregar a lista, inserir no documento).
 */
export function NovoGestoForm({ nomeInicial = '', onCriado, onCancelar }: Props) {
  const id = useId();
  const [nome, setNome] = useState(nomeInicial);
  const [descricao, setDescricao] = useState('');
  const [gatilhos, setGatilhos] = useState('');
  const [figura, setFigura] = useState<File | null>(null);
  // Um <input type="file"> não aceita value=''; trocar a chave remonta vazio.
  const [geracaoDoArquivo, setGeracaoDoArquivo] = useState(0);
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const criar = async () => {
    if (!nome.trim() || !figura) return;
    setCriando(true);
    setErro(null);
    try {
      const entrada = await createGesture({
        name: nome.trim(),
        description: descricao.trim(),
        exampleTriggers: gatilhos.split(',').map((s) => s.trim()).filter(Boolean),
        image: figura,
      });
      setNome('');
      setDescricao('');
      setGatilhos('');
      setFigura(null);
      setGeracaoDoArquivo((n) => n + 1);
      onCriado(entrada);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao criar o gesto');
    } finally {
      setCriando(false);
    }
  };

  return (
    <div className="edit-grid">
      <div className="edit-field"><label htmlFor={`${id}-nome`}>Nome</label><input id={`${id}-nome`} value={nome} onChange={(e) => setNome(e.target.value)} /></div>
      <div className="edit-field"><label htmlFor={`${id}-desc`}>Descrição</label><input id={`${id}-desc`} value={descricao} onChange={(e) => setDescricao(e.target.value)} /></div>
      <div className="edit-field"><label htmlFor={`${id}-gat`}>Gatilhos de exemplo</label><input id={`${id}-gat`} placeholder="separados por vírgula" value={gatilhos} onChange={(e) => setGatilhos(e.target.value)} /></div>
      <div className="edit-field"><label htmlFor={`${id}-png`}>Figura PNG</label><input key={geracaoDoArquivo} id={`${id}-png`} type="file" accept="image/png,.png" onChange={(e) => setFigura(e.target.files?.[0] ?? null)} /></div>
      <div className="edit-actions">
        <button type="button" className="auth-btn" disabled={criando || !nome.trim() || !figura} onClick={() => void criar()}>Criar gesto</button>
        {onCancelar ? <button type="button" className="ge-btn" onClick={onCancelar}>Cancelar</button> : null}
        {erro ? <span className="cp-review-error" role="status">{erro}</span> : null}
      </div>
    </div>
  );
}
