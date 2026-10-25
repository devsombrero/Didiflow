# Integrações

## Estado atual (v1)

| Serviço         | Estado        | O que funciona                                                                                         |
| --------------- | ------------- | ------------------------------------------------------------------------------------------------------ |
| Jira            | Links manuais | URL do card por tarefa (`https`), aberta no navegador padrão; o detalhe mostra a chave (ex.: `DF-123`) |
| Slack           | Links manuais | URL da thread por tarefa, aberta no navegador padrão; o detalhe mostra workspace e canal               |
| GitHub / GitLab | Planejada     | —                                                                                                      |
| Google Calendar | Planejada     | —                                                                                                      |

O aplicativo **não chama APIs externas** nesta versão. O registro e o parser de links estão em `src/app/features/integrations/integrations.ts`.

## Arquitetura para integrações reais

Uma integração real deve seguir estas regras:

### Autenticação

- OAuth 2.0 **Authorization Code + PKCE**, com o navegador do sistema (`shell.openExternal`) e redirecionamento para um servidor _loopback_ temporário (`http://127.0.0.1:<porta aleatória>`) no processo principal. Nada de webviews embutidas.
- Os tokens (access/refresh) ficam no `secureStore` (criptografado com `safeStorage`), sob chaves por provedor (ex.: `integration:jira`). Eles nunca vão para o renderer, para o `localStorage` nem para o Supabase em texto puro.
- Segredos de aplicativo OAuth que não possam ficar no cliente: troca de token por uma **Supabase Edge Function**, com o segredo nas variáveis da função. Nunca no pacote Electron.

### Execução

- As chamadas às APIs externas acontecem no **processo principal**, por canais IPC específicos e validados (ex.: `jira:search-issues`, com parâmetros tipados e limites). O renderer recebe apenas dados já filtrados.
- Cada provedor implementa um contrato comum:
  - `connect()` e `disconnect()`;
  - `status()`: desconectado, conectado ou expirado;
  - `fetchLinkedItem(url)`: título e status do card ou da thread;
  - operações opcionais, declaradas em `capabilities`.
- A CSP do renderer não muda: o renderer não fala com hosts externos.

### Dados

- Uma tabela futura `integration_links (owner_id, task_id, provider, external_id, url, metadata jsonb, synced_at)`, com RLS por dono, guarda vínculos enriquecidos. Os campos atuais `jira_url` e `slack_thread_url` continuam válidos e podem ser migrados.
- Webhooks, quando forem necessários, entram por Edge Functions que validam a assinatura do provedor e gravam com o papel de serviço **no servidor**.

### Erros e permissões

- Erros de rede, de limite de taxa (respeitando o `Retry-After`) e de token expirado aparecem como estados explícitos ("reconectar"), nunca como dados vazios.
- Os escopos OAuth são os mínimos necessários (somente leitura sempre que possível), e o usuário pode desconectar a qualquer momento: o token é revogado no provedor e removido do secure store.
