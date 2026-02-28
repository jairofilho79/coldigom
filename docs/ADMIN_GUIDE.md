# Guia de Boas Práticas (Admin Guide)

Bem-vindo ao painel do **Coldigom (Coletânea Digital Object Manager)**.

A aplicação atualmente confere a **todos os usuários logados permissões totais de administração**. Isso acontece porque esta ferramenta é construída e focada na equipe restrita de músicos e gestores de louvor.

Por conta desse alto nível de privilégio, solicitamos extrema atenção às ações a seguir:

## 1. Exclusão de Arquivos e Praises

- **Ações são Definitivas**: Clicar em excluir um "Praise" ou seus Materiais de arquivo (PDF, Áudios) resulta na exclusão persistente de nossos servidores (SSD). **Não há lixeira**.
- Antes de excluir um Material de um Praise, certifique-se de que não há membros da equipe que dependem exclusivamente dele. Caso queira substituir o arquivo (por exemplo, subindo uma cifra com tom corrigido), utilize o botão de "Substituir" ou crie um arquivo novo.

## 2. Repercussão no App Móvel

- **Sincronia Automática**: Lembre-se de que qualquer alteração de Cifra, Áudio ou Metadados do Louvor será refletida em tempo real para todos os músicos e fiéis que consomem a aplicação **Coletânea Digital (App Flutter)**.
- Nunca faça testes (criação de Louvores fakes, testando links) no ambiente de Produção.

## 3. Uso em Salas e Transmissão

- Ao usar o recurso de **Rooms (Salas de Louvor)** para ensaios ou culto ao vivo, atente-se de que qualquer adição/deleção/reordenação na playlist sincronizará instantaneamente nos dispositivos de todos. Coordene com o restante da equipe qual membro será o "Líder" que operará o dispositivo mestre durante o uso do recurso.

## 4. Rate Limiting Interno

- Embora seja improvável para administradores logados, a aplicação possui limitadores contra robôs que geram alto tráfego de downloads. Caso observe instabilidades ou mensagens do tipo `429 Too Many Requests`, aguarde 1 ou 2 minutos para que os limites sejam reestabelecidos automaticamente.
