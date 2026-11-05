# Assistente de acervo: MCP, Cloudflare e expansão de capacidades

**Status: Proposta — não implementada; pendente de validação**

Este documento preserva os requisitos e as recomendações da conversa para handoff ao Tech Lead e ao dev-worker. Não é uma arquitetura aprovada nem uma afirmação de disponibilidade em produção. Os nomes de operações e o plano abaixo são ilustrativos, não contratos já publicados.

## 1. Objetivo e requisitos confirmados

Ao receber uma contribuição do **coldigui**, iniciar um fluxo na Cloudflare que chama um modelo ainda não escolhido, investiga o acervo com um MCP próprio, propõe tarefas e alterações, apresenta a prévia no **coldigom**, aguarda aprovação e somente então executa as alterações autorizadas.

- A execução automática atua **apenas sobre dados e conteúdos**: metadados, louvores (`praises`), tags, vínculos, agrupamentos e materiais, incluindo anexos e objetos associados.
- A contribuição pode corrigir **registros já existentes**, mesmo que não tenham sido criados pela colaboração. O limite são os **alvos e efeitos exatos aprovados**, não a origem dos registros.
- Código, deploy, migrações e alterações de schema ficam fora desse fluxo. Quando uma capacidade nova exigir desenvolvimento, isso é trabalho separado do dev-worker, com revisão e testes.
- O usuário quer praticidade para mudanças frequentes: criar, editar, associar, desassociar, agrupar, desagrupar, mover, remover e fundir sem desenvolver uma solução para cada colaboração.
- A aprovação humana deve abranger o plano concreto e sua prévia de impacto; uma intenção genérica não autoriza efeitos ilimitados.

### Pontos ainda desconhecidos

1. **Entrada da contribuição:** não foi localizada na exploração disponível. Pode ainda não estar implementada; o usuário verificará depois. Isso não bloqueia esta proposta. Confirmar origem, autenticação, identificador estável, formato e anexos antes da integração.
2. **Modelo/provedor:** escolha, custo, qualidade, suporte ao uso de ferramentas e política de tratamento/retenção de dados ainda pendentes.
3. **Identidade de serviço:** definir como orquestrador, MCP e executor se autenticam, quais permissões recebem e quem pode aprovar cada operação.
4. **Backup e retenção efetivos:** não foram comprovados, incluindo recuperação coordenada de D1 e R2, prazo de retenção e restauração testada.
5. **Semânticas novas:** validar desagrupamento, remoção de louvor, conflitos de grupo, política de exclusão e recuperação antes de habilitá-las.

## 2. Base existente e limites da exploração

As referências a seguir são caminhos relativos ao repositório. A conferência foi estática e direcionada: não houve acesso ao banco remoto, verificação de dados reais, teste de deploy ou validação em produção. Schema e configurações versionados não comprovam o estado do ambiente remoto; migrações aplicadas também precisam ser verificadas numa futura implementação.

| Evidência | Capacidade observada | O que não se pode concluir |
| --- | --- | --- |
| `api/package.json`; `api/src/routes/` | API TypeScript/Hono para Cloudflare Workers. | Que exista um agente de planejamento pronto. |
| `web/package.json`; `docs/MIGRATION_CLOUDFLARE.md` | Web React 19/Vite 8; documentação de hospedagem em Pages. | Que a UI do novo fluxo de aprovação já exista. |
| `api/wrangler.toml` | Bindings D1 `DB`, R2 `ASSETS`, Queue de importação Drive e Workers AI `AI`. | Queue Drive não é fila de contribuições; binding AI não comprova planejador, MCP ou Workflow implementados. |
| `api/src/routes/praises.ts` | `POST /api/praises`, `PATCH /api/praises/:id`, agrupamento, merge, associação/desassociação de tags e criação/upload de materiais. O PATCH aceita `if_updated_at` opcional. | Não foi encontrado DELETE genérico de louvor nem operação explícita de desagrupamento nos trechos explorados. Rotas existentes não são automaticamente capacidades autorizadas para o assistente. |
| `api/src/routes/tags.ts` | Leitura e criação de tags. | Não foram encontradas alteração/exclusão global de tags nessa rota. |
| `api/src/routes/materials.ts` | Edição, movimento via `praise_id`, exclusão de material e escrita de conteúdo. | Não há atomicidade compartilhada D1/R2 nem garantias de idempotência do novo executor. |
| `api/schema.sql`; `api/src/storageKeys.ts` | Relações/FKs, triggers FTS, classificação por `material_kind`; normalização de objetos R2 com prefixo `storage/`. | DELETE cascata do banco não resolve sozinho objetos R2 e efeitos de negócio. |
| `scripts/validate-acervo/README.md`; `scripts/validate-acervo/core/apply.py`; `api/src/routes/validation.ts` | Fila `validation_findings` com decisões; executor manual Python/Wrangler para `merge_praise` e `set_praise_field`, com guardas e log próprios. | Aprovar hoje não aciona execução automaticamente; esse executor não cobre o catálogo proposto inteiro. |

### Regras que precisam continuar valendo

- Tags têm **um nível de subtags**; o nome não pode conter vírgula. Tag-pai com filhos não pode receber novo vínculo direto ao louvor (`tags.ts` e associação em `praises.ts`).
- Campos de louvor têm validações específicas; o nome não pode ficar vazio. O mecanismo opcional `if_updated_at` é uma base útil, não uma cobertura universal de concorrência. Validar sua granularidade e a estratégia de versão para cada entidade/efeito.
- Tipos e categorias de material obedecem ao catálogo e às validações atuais. Não transformar um material com arquivo guardado em link por um PATCH que perca o ponteiro do R2 (`materials.ts`).
- Alterar conteúdo pode limpar o estado de revisão, e mudanças relacionadas a gestos/vídeos podem incrementar a versão do dicionário (`materials.ts`; `api/src/routes/gestures.ts`). Esses efeitos devem aparecer na prévia.
- A exclusão atual de material combina batch no D1 e limpeza R2 best-effort. Isso é evidência de risco de estado parcial, não garantia de recuperação.
- O README do validador explica por que merge por SQL recusa certos casos, como fonte com `r2_key` e nova tag-pai: contornar a API pode contornar invariantes ou deixar objetos órfãos.

## 3. Fluxo recomendado e tradeoffs

```text
Contribuição coldigui
  -> Worker de entrada: validar, autenticar origem, deduplicar, persistir
  -> [Queue opcional: distribuição/controle de carga]
  -> Orquestrador / Workflow: modelo + MCP de leitura/regras/contexto
  -> Plano versionado persistido em D1 + prévia no coldigom
  -> Aprovação autenticada e autorizada no backend
  -> Executor determinístico: revalidar e aplicar somente o plano aprovado
  -> Resultados por tarefa, reconciliação e auditoria
```

**Queue é opcional.** Um Worker pode criar a instância de Workflow diretamente por binding. Adicionar Queue faz sentido para absorver picos, controlar distribuição ou desacoplar entrada, ao custo de mais estados e duplicatas a administrar. Não reutilizar a fila Drive apenas porque já existe.

**Workflow é uma opção de orquestração durável**, especialmente para espera humana e retries. A documentação oficial descreve `waitForEvent` para aguardar aprovação. O evento é um sinal de retomada, **não autorização**: ao despertar, ler do D1 a aprovação válida para aquela versão/hash, conferir identidade, prazo e permissões novamente.

O **D1 deve ser a fonte durável do plano, decisão e progresso**. Persistir a aprovação antes de sinalizar o Workflow e manter entrega/reconciliação rastreável: se persistiu mas o sinal falhou, uma retomada controlada consulta o D1 e reenvia/retoma sem repetir efeitos. Prever corrida, evento duplicado, expiração e evento não entregue; não depender da presença de um evento como único registro de aprovação. Timeout nunca vira aprovação implícita.

Retries de Workflow/Queue não fornecem **exactly-once** para efeitos de negócio e não substituem autorização. Cada tarefa deve suportar replay idempotente e detectar resultado desconhecido. O estado do Workflow ajuda a orquestrar; o ledger de execução protege os efeitos.

**Hospedagem:** Cloudflare pode hospedar um servidor MCP remoto via HTTP. Preferir comunicação interna/bindings onde o transporte, cliente e runtime forem compatíveis; verificar essa compatibilidade na implementação. Evitar endpoints administrativos públicos desnecessários. Se houver acesso remoto, autenticar e delimitar permissões no servidor.

**MCP não é o modelo.** É o protocolo/interface para disponibilizar ferramentas e contexto. Não aprende automaticamente o negócio, não torna a integração segura por si e não substitui regras executáveis. Hospedar MCP na Cloudflare também não mantém tudo dentro dela: um modelo externo recebe os dados enviados para seu provedor.

## 4. Conhecimento de negócio revisável

Recomenda-se um pacote de conhecimento **versionado e revisado por pessoas**, ligado à versão do catálogo:

- Resumo das entidades: louvor, material, classificação, tag/subtag, grupo, fonte/keeper de merge, objetos R2 e referências de gestos.
- Regras e efeitos colaterais: campos permitidos, revisão, versionamento, tratamento de grupo, exclusão, compartilhamento/referências de objetos e limites de volume.
- Schemas descritos, exemplos válidos/inválidos e critérios para pedir esclarecimento diante de duplicatas ou ambiguidade.
- Ferramentas de consulta delimitadas e paginadas para buscar candidatos, detalhar IDs e inspecionar vínculos/impactos; limites de resultados, tamanho, tempo e autorização.
- Recuperação apenas do contexto relevante à contribuição, com evidências e proveniência no plano.

Não enviar o backend inteiro nem dump do schema a cada contribuição. A curadoria inicial consulta código/schema para produzir um resumo útil; a execução recupera dados relevantes por ferramentas. Nunca expor segredos, credenciais, tabelas de autenticação ou informações sem relação com a tarefa. Sugestões de regras feitas pelo modelo passam por revisão antes de mudar o pacote de conhecimento.

## 5. Catálogo extensível de operações de domínio

**Implementar uma vez por capacidade, não uma vez por colaboração.** Manter um catálogo explícito de operações implementadas, revisadas e testadas. O plano só combina entradas habilitadas desse catálogo; operações ainda não habilitadas viram pendências para desenvolvimento, não improvisação pelo modelo.

| Operação proposta | Base observada | Guardas e impacto a validar antes de habilitar |
| --- | --- | --- |
| `edit_praise_metadata` | PATCH de louvor existente. | Whitelist de campos; versão/estado anterior; não incluir agrupamento ou exclusão por atalhos. Risco relativamente menor para poucos campos. |
| `create_praise` | POST de louvor existente. | Dados obrigatórios, candidatos a duplicata e identidade idempotente da criação. |
| `create_tag` | POST de tag existente. | Nome sem vírgula, pai válido, apenas um nível, duplicatas/ambiguidade. |
| `attach_tag` | Associação existente em `praises.ts`. | IDs exatos e proibição de nova associação a pai com filhos. |
| `detach_tag` | Desassociação existente em `praises.ts`. | Vínculo exato e efeitos de classificação na prévia. |
| `group_praises` | Rota de agrupamento existente. | Semântica quando há grupos prévios, membros afetados, identidade do grupo e concorrência; não presumir fusão de grupos inteira. |
| `ungroup_praises` | Suporte explícito não confirmado. | Verificar suporte e definir destino dos membros, grupo residual e guardas; não escrever `group_id` livre como substituto. |
| `add_material` | Criação/uploads existentes em `praises.ts`. | Categoria/tipo, anexo aprovado, tamanho, conteúdo, objeto e vínculo exatos. |
| `update_material` | PATCH e escrita de conteúdo existentes. | Distinguir metadados de conteúdo; revisão, versões, links e efeitos no dicionário. |
| `move_material` | PATCH com `praise_id` existente. | Material/origem/destino exatos; vínculos e objeto; preservação de proveniência de merge. |
| `remove_material` | DELETE de material existente. | Preview de referências, gestos e R2; política de retenção e reconciliação. Risco alto se destruir conteúdo. |
| `remove_praise` | DELETE genérico não encontrado. | Nova capacidade a verificar/implementar; preview de materiais, links, tags, grupos, referências e objetos. Nunca cascata cega. |
| `merge_praises` | Merge existente; apply manual com cobertura restrita. | Keeper/fonte, campos vencedores, tags, materiais preservados/removidos e R2; operação destrutiva de alto impacto. |

“Risco menor” é relativo, não sinônimo de operação automaticamente segura. Um lote de milhares de edições simples pode superar o risco de uma única operação complexa. Remoção, merge, materiais/storage e agrupamento precisam de análise própria.

**Retenção, soft delete e quarentena são propostas**, não funcionalidades comprovadas. Escolher por capacidade e implementar os mecanismos necessários antes de oferecê-los. Para remover um louvor, enumerar tudo que cascatas e lógica de aplicação atingiriam, inclusive objetos compartilhados, e autorizar cada efeito. Exclusão definitiva deve ser adiada quando aplicável e sujeita à política validada.

### Contrato simples para o MVP

Usar **JSON de plano tipado + registro simples de handlers**, não construir uma grande DSL/engine de automação antecipadamente. Cada entrada declara parâmetros, campos permitidos, efeitos, guardas, limites, prévia, política de idempotência e versão do contrato.

O mesmo contrato de domínio deve servir à validação do executor e à geração dos schemas MCP, evitando versões divergentes. O MCP oferece poucas ferramentas orientadas a objetivos — localizar candidatos, obter contexto, avaliar impacto — em vez de despejar a API inteira. Operações do catálogo não precisam corresponder uma a uma a ferramentas expostas ao modelo.

Reusar serviços de negócio existentes. Onde a regra estiver somente dentro de uma rota, propor ao dev-worker uma **extração mínima futura** para compartilhamento entre rota e executor; wrappers MCP não devem reimplementar invariantes. Este documento não autoriza essa refatoração.

### IDs novos, dependências e escopo

Para uma criação seguida de vínculo, referenciar resultados de tarefas, por exemplo `task:create_praise.result.id`. Não tentar descobrir o ID posteriormente por nome ou outro lookup ambíguo.

A aprovação fixa os parâmetros concretos de criação, a referência permitida e a regra de vínculo ao resultado daquela tarefa. Antes do efeito seguinte, o executor resolve o resultado persistido para um ID concreto, registra o payload resolvido e valida que ele pertence à criação aprovada. Isso não dá permissão para substituir a referência por qualquer ID existente. Se o domínio precisar reutilizar um registro em vez de criar, esse ID e essa alternativa precisam constar explicitamente na prévia/aprovação.

Dependências devem formar uma ordem válida, sem ciclos. Aprovar IDs existentes, campos, quantidade de criações, total de tarefas, objetos/anexos, efeitos colaterais e limites agregados. Composição não pode ampliar privilégios, escalar volume ou atingir IDs fora do escopo, inclusive por merge, cascata ou efeitos indiretos.

## 6. Como acrescentar necessidades aos poucos

| Situação nova | Caminho recomendado |
| --- | --- |
| Outro valor de metadado, outro louvor/tag ou combinação diferente de operações já habilitadas. | Novos parâmetros/plano declarativo; **zero código novo**, com prévia e aprovação normais. |
| Padrão recorrente de combinação ou escolha dentro dos limites existentes. | Política/template versionado por configuração, com validação e revisão apropriadas. Facilita UX, não elimina aprovação. |
| Novo poder, efeito, regra/invariante, entidade/schema ou integração; suporte de backend ausente. | Implementação pelo dev-worker, revisão técnica e testes, depois habilitação explícita no catálogo. |

Configuração não pode reativar poderes desabilitados ou aumentar privilégios/limites sem revisão. Uma regra de negócio nova não se torna “só configuração” por ser escrita em texto ou JSON.

É necessário implementar quando aparece uma capacidade realmente nova. Isso é mais controlável e econômico do que dar um poder genérico irrestrito e corrigir acidentes depois, mas **implementar não garante segurança**: contratos, testes de invariantes e falhas, observabilidade e autorização continuam necessários. O custo inicial do catálogo é o tradeoff para reaproveitar capacidades nas colaborações seguintes.

A IA não registra handlers, não gera e executa SQL/código em runtime e não amplia autonomamente seu catálogo. Quando falta capacidade, produz uma pendência de desenvolvimento com justificativa; não executa um substituto com efeitos diferentes.

## 7. Política de SQL

- **Sem `execute_sql` geral no MVP.** Leituras e escritas seguem ferramentas delimitadas e serviços de domínio.
- Consultas internas são parametrizadas, protegidas por autorização e limitadas/paginadas. Até SQL arbitrário de leitura pode vazar dados, fazer joins indevidos ou consumir recursos excessivos.
- Se SQL excepcional for indispensável, tratá-lo **fora do fluxo automático**, com revisão técnica, alvos/impactos conhecidos e execução controlada por responsável autorizado.
- Parametrização, parser, sandbox e proibição de certas palavras não garantem semântica de negócio nem integridade dos objetos R2. MCP SQL genérico não substitui o catálogo.

## 8. Aprovação, execução e recuperação

### Autorização vinculada ao plano

O **modelo planeja; o serviço executa**. Ferramentas de escrita ficam acessíveis apenas ao executor no contexto aprovado, sem token administrativo total entregue ao agente.

Persistir versão do plano, hash de representação canônica do payload, versão do catálogo/políticas, escopo e identidade do aprovador. O backend autentica e autoriza aprovação e execução; prompts não fazem controle de acesso. Uma aprovação referencia precisamente esse conteúdo. Mudanças de parâmetros, tarefas, dependências, alvos ou efeitos invalidam a aprovação e exigem nova prévia/decisão.

Após a espera, revalidar prazo, revogação, permissões atuais, versões e condições das entidades. A checagem de condição e a mutação precisam ser atômicas quando possível; leitura seguida de escrita sem guarda deixa corrida. Conflito relevante interrompe o plano e pede revisão — não sobrescrever silenciosamente nem deixar o modelo “consertar” o plano aprovado em execução.

### Idempotência e resultado desconhecido

- Deduplicar entrada por identidade estável da contribuição e intent; registrar tarefas com chave única de execução, hash do payload e resultado persistido.
- Fazer **claim atômico** com unicidade por tarefa e proteção do intent lógico contra submissões/aprovações duplicadas. Mesma chave com hash diferente é conflito; novo `plan_id` não deve contornar a proteção do mesmo intent. Uma repetição intencional futura exige novo intent autorizado.
- Claims/leases isolados não bastam: usar guardas/fencing quando necessário para impedir executor antigo de produzir efeito após retomada, e acoplar ledger/mutação numa transação D1 quando viável. Persistir o ID gerado da criação de modo idempotente.
- Reter registros de idempotência por período que cubra replays, filas, retomadas e janela de aprovação; definir esse período antes de habilitar execução, sem remover a proteção enquanto ainda puder haver replay.
- Timeout após envio de uma escrita é **resultado desconhecido**, não prova de falha. Reconciliar ledger e pós-condições antes de repetir; ausência de certeza deve bloquear novos efeitos, especialmente criações e exclusões.

### Falhas parciais e D1/R2

Estados sugeridos: rascunho, aguardando aprovação, aprovado, rejeitado, expirado, executando, concluído, parcial, em conflito e aguardando reconciliação. Registrar também estado por tarefa, com resultado desconhecido distinto de falha comprovada.

Usar transações/batches D1 adequados às garantias suportadas quando possível. **D1 e R2 não têm transação compartilhada.** Para efeitos combinados, manter registro durável de intent/progresso, objetos identificados, pós-condições e reconciliação/compensação. Evitar apagar definitivamente um objeto antes de confirmar dependências e retenção aplicável.

Falhar de forma fechada e parar dependentes quando uma condição, autorização ou tarefa falhar. No MVP, preferir interromper também o restante do plano até reconciliar; retomada usa o mesmo plano válido e resultados já confirmados. Mostrar o que foi aplicado, não aplicado e indeterminado. Não prometer rollback universal: compensação pode falhar ou conflitar com edições posteriores e conteúdo definitivamente apagado pode ser irrecuperável.

Snapshots antes/depois ajudam auditoria e compensação, mas **não substituem backup e restauração testados**, inclusive para arquivos R2. Uma compensação também precisa de autorização, limites e guardas contra sobrescrever trabalho posterior.

### Auditoria, entrada não confiável e limites

Registrar contribuição, evidências, versões, plano/hash, aprovador, identidade do serviço, payload resolvido, antes/depois, claims, tentativas, efeitos e motivos de bloqueio. Restringir acesso e retenção; redigir/mascarar dados sensíveis e segredos na auditoria, sem perder a rastreabilidade necessária.

Contribuição, anexos e conteúdos recuperados são **dados não confiáveis**: podem conter injeção de prompt. Não aceitar instruções embutidas para ampliar permissões, ignorar aprovação ou acessar segredos. Validação estrutural e autorização continuam no servidor, independentemente da resposta do modelo.

Limitar chamadas de modelo/ferramentas, tamanho do contexto, tarefas, efeitos agregados, retries, loops, duração, custo e rate limits por origem/aprovador. Transferir ao modelo apenas os dados necessários; a seleção do provedor precisa considerar essa transferência e sua retenção. Conferir anexos/objetos e seus limites antes de processar ou executar.

## 9. Exemplo de contribuição complexa e prévia

Contribuição ilustrativa: “Corrigir o autor do louvor P-100, cadastrar uma versão instrumental como novo louvor, criar a tag Instrumental, associá-la ao cadastro novo, mover a partitura que está no cadastro errado, adicionar o anexo enviado e remover um material duplicado.” Os IDs abaixo são fictícios. Categoria e tipo do anexo devem estar confirmados no catálogo real antes da aprovação.

Após investigar, o plano poderia ter este formato resumido, **ainda não um schema implementado**:

```json
{
  "plan_id": "plano-exemplo",
  "version": 1,
  "intent_id": "contribuicao-exemplo:ajuste-acervo",
  "catalog_version": "versao-validada",
  "scope": {
    "existing_praise_ids": ["P-100", "P-200"],
    "material_ids": ["M-10", "M-11"],
    "approved_attachment_ids": ["A-1"],
    "max_tasks": 7,
    "max_new_praises": 1,
    "max_new_tags": 1
  },
  "tasks": [
    {
      "id": "edit_metadata",
      "operation": "edit_praise_metadata",
      "params": {"praise_id": "P-100", "fields": {"author": "Autor confirmado"}},
      "conditions": {"expected_state_ref": "preview:P-100"}
    },
    {
      "id": "create_praise",
      "operation": "create_praise",
      "params": {"name": "Louvor exemplo — instrumental"}
    },
    {
      "id": "create_tag",
      "operation": "create_tag",
      "params": {"name": "Instrumental", "parent_id": null}
    },
    {
      "id": "attach_tag",
      "operation": "attach_tag",
      "depends_on": ["create_praise", "create_tag"],
      "params": {"praise_id": "task:create_praise.result.id", "tag_id": "task:create_tag.result.id"}
    },
    {
      "id": "move_material",
      "operation": "move_material",
      "depends_on": ["create_praise"],
      "params": {"material_id": "M-10", "from_praise_id": "P-200", "to_praise_id": "task:create_praise.result.id"},
      "conditions": {"expected_state_ref": "preview:M-10"}
    },
    {
      "id": "add_material",
      "operation": "add_material",
      "depends_on": ["create_praise"],
      "params": {"praise_id": "task:create_praise.result.id", "attachment_id": "A-1", "classification_ref": "preview:A-1"}
    },
    {
      "id": "remove_material",
      "operation": "remove_material",
      "depends_on": ["move_material", "add_material"],
      "params": {"material_id": "M-11", "praise_id": "P-200"},
      "conditions": {"expected_state_ref": "preview:M-11", "removal_policy_ref": "politica-validada"}
    }
  ]
}
```

As referências `preview:*` apontam para valores concretos persistidos e incluídos no hash/aprovação, não contexto mutável resolvido por nome depois. `classification_ref` fixa `material_kind`/tipo aprovados; `removal_policy_ref` fixa uma política realmente implementada e versionada. Se faltar uma dessas capacidades/políticas, o exemplo fica bloqueado para execução.

**A prévia deve mostrar:**

- P-100: autor anterior e novo, condição de versão e nenhum outro campo alterado.
- Um novo louvor com os parâmetros exatos; uma nova tag sem pai, depois de conferir candidatos. Se já houver tag homônima, esclarecer/revisar o plano para usar seu ID concreto; não reutilizar silenciosamente.
- M-10: origem P-200 e destino exclusivo no resultado de `create_praise`; objeto R2 preservado se essa for a semântica validada, sem ampliar o movimento para outros materiais.
- A-1: objeto de upload autorizado, identidade/checksum quando aplicável, tamanho, tipo, categoria, destino e efeitos de conteúdo/revisão.
- M-11: motivo de duplicidade, material preservado como evidência, links/gestos/objetos afetados e política de retenção/exclusão. Remover somente depois de confirmar as tarefas das quais depende.
- Ordem, dependências, totais, condições de interrupção e efeitos indiretos; hash/versão aprovados associados ao conjunto inteiro.

Anexos usam **IDs de objetos previamente recebidos e aprovados**, com validação de origem, conteúdo, tamanho e permissão. Não aceitar URL arbitrária para o executor buscar arquivo: isso abre risco de SSRF e troca do conteúdo após aprovação. Referências de anexos não autorizam outros objetos do bucket. O plano contém operações de domínio, **não SQL livre**.

## 10. Adoção incremental conceitual

Esta sequência é uma recomendação para planejamento futuro, **não autorização de implementação**:

1. **Inventário:** mapear capacidade, origem da regra (rota/serviço/script), testes, autorização, efeitos e lacunas. Confirmar entrada coldigui, identidade de serviço, backup e políticas de recuperação.
2. **Leitura + planejamento:** MCP delimitado, pacote de conhecimento e planos/prévias persistidos, sem escrita automática. Medir qualidade, ambiguidade, custos e tentativa de injeção.
3. **Tags, metadados e criação:** habilitar pequeno subconjunto após contratos, guardas de conflito, idempotência e aprovação autenticada. Testar inclusive criação seguida de referência de resultado.
4. **Materiais/storage:** conteúdo, anexos, movimento e reconciliação D1/R2; testar falha entre gravações, revisão, referências e versões.
5. **Agrupamento, merge e destrutivos:** definir primeiro as semânticas ausentes, prévias completas, retenção e recuperação; habilitar por capacidade, com limites explícitos.
6. **Operação contínua:** UI no coldigom para aprovar/rejeitar e acompanhar tarefas, expiração, conflitos, parcial e reconciliação; templates revisados para casos frequentes.

Antes de habilitar cada etapa, exigir testes relevantes de invariantes e contratos, autorização, concorrência, retries/replays, falhas parciais e timeouts com resultado desconhecido. Avaliar o agente com casos representativos e adversariais após mudanças de modelo, descrições, conhecimento ou catálogo. Usar sandbox/staging com dados apropriados; êxito de um exemplo não comprova segurança em produção.

**Conclusão para expansão:** parâmetros e composição resolvem novos casos dentro das capacidades existentes; templates reduzem trabalho recorrente; novos poderes exigem desenvolvimento controlado. Esse equilíbrio preserva praticidade sem converter o assistente em um administrador genérico do banco e do storage.

## 11. Fontes oficiais consultadas

- [Cloudflare — Model Context Protocol](https://developers.cloudflare.com/agents/model-context-protocol/): hospedagem de MCP remoto, transporte HTTP, ferramentas orientadas a objetivos e permissões delimitadas.
- [Cloudflare Workflows — Events and parameters](https://developers.cloudflare.com/workflows/build/events-and-parameters/): criação por Worker/binding e espera por evento com `waitForEvent`.
- [Cloudflare Workflows — Sleeping and retrying](https://developers.cloudflare.com/workflows/build/sleeping-and-retrying/): espera, retries e tratamento de falhas; essas funcionalidades não garantem exactly-once dos efeitos externos nem rollback universal.

As fontes orientam a proposta. SDK, bindings, limites e detalhes de integração devem ser conferidos pelo dev-worker na versão usada durante a implementação; este documento não reproduz APIs ainda não verificadas no projeto.
