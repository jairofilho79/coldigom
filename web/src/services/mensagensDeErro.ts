/**
 * Traduz o erro do servidor para uma frase que o usuário consegue agir sobre.
 *
 * Todos os catches da interface fazem `setError(err.message)`, e o que a caixa
 * vermelha mostrava era a frase crua da API — em inglês, num app inteiramente
 * em português: "Unauthorized", "Forbidden", "Praise not found",
 * "Cannot attach a parent tag; use a subtag", "Failed to bulk upload materials",
 * "Request failed". No pior caso, o corpo JSON cru devolvido pela API do Google.
 *
 * A mensagem do servidor não some: quando não há tradução conhecida, ela é
 * exibida como está — é melhor um texto estranho que um texto vago. E toda
 * mensagem original vai para o console, para investigação.
 */

/** Casadas por prefixo: a API acrescenta detalhe depois do texto base. */
const TRADUCOES: Array<[RegExp, string]> = [
  [/^Unauthorized$/i, 'Sua sessão expirou. Entre de novo com o Google.'],
  [/^Forbidden$/i, 'Esta conta não tem permissão para alterar o acervo.'],
  [/^Praise not found$/i, 'Este louvor não existe mais. Talvez tenha sido mesclado ou excluído.'],
  [/^Target praise not found$/i, 'O louvor de destino não foi encontrado. Confira o ID.'],
  [/^Tag not found$/i, 'Esta tag não existe mais no catálogo.'],
  [
    /^Cannot attach a parent tag; use a subtag/i,
    'Esta tag agrupa subtags e não pode ser anexada diretamente. Use uma subtag dela.',
  ],
  [
    /^Field '(\w+)' must be a non-empty string$/i,
    "O campo «$1» é obrigatório.",
  ],
  [/^Material not found/i, 'Este material não existe mais. Recarregue a página.'],
  [/does not belong to source praise$/i, 'Este material não pertence ao louvor de origem.'],
  [
    /^Failed to bulk upload materials$/i,
    'O envio dos arquivos falhou e nada foi gravado. Tente de novo.',
  ],
  [/^Drive not connected$/i, 'O Google Drive não está conectado. Autorize o acesso e tente de novo.'],
  [/^Request failed$/i, 'A requisição falhou e o servidor não explicou por quê. Tente de novo.'],
  [/^HTTP 5\d\d$/i, 'O servidor teve um problema. Tente de novo em alguns instantes.'],
  [/^HTTP 413$/i, 'O envio é grande demais para uma requisição só.'],
];

/**
 * Falha do próprio `fetch` (rede caiu, DNS, CORS): o navegador lança em vez de
 * responder, então nunca passava pelo tradutor abaixo — e o usuário lia
 * "Failed to fetch" ou "Load failed", conforme o navegador.
 */
export function mensagemDeRede(): string {
  return 'Não foi possível falar com o servidor. Verifique sua conexão e tente de novo.';
}

/** Erro do Drive vem com o corpo cru da resposta do Google grudado. */
const ERRO_DO_DRIVE = /^Drive \w+ failed \((\d{3})\)/i;

export function mensagemAmigavel(bruta: string): string {
  for (const [padrao, texto] of TRADUCOES) {
    if (padrao.test(bruta)) return bruta.replace(padrao, texto);
  }

  const drive = bruta.match(ERRO_DO_DRIVE);
  if (drive) {
    const status = drive[1];
    if (status === '403') return 'Sem permissão para ler este item no Google Drive.';
    if (status === '404') return 'Este item não existe mais no Google Drive.';
    if (status === '413') return 'Este arquivo do Drive passa do limite de 100 MB.';
    return 'O Google Drive recusou a operação. Tente de novo mais tarde.';
  }

  return bruta;
}
