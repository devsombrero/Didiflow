# Plano: DidiBot (assistente com Gemini)

Status: implementado na v0.8.0 e testado ao vivo em 2026-10-26 (login Google, criação da chave, conversa e sugestões). Escopo da primeira versão: aplicativo desktop.

Projeto do Google Cloud: `didiflow`, com Cloud Resource Manager, Service Usage e API Keys ativadas, tela de consentimento externa em modo de teste e o client "DidiFlow Desktop".

## Objetivo

Um assistente opcional, o **DidiBot**, que conversa sobre o trabalho do usuário (tarefas, prazos,
horas) e ajuda a planejar, usando a **API Gemini no plano gratuito** do Google. Quem não conectar
uma conta Google continua usando o DidiFlow normalmente.

## Conta Google (opcional) e criação automática da chave

**Entrar com Google** cria a chave do Gemini sozinho, do mesmo jeito que o Google AI Studio faz por
baixo (`electron/ipc/google-connect.ts`):

1. Login no navegador do sistema: OAuth 2.0 para apps instalados, com PKCE e retorno em
   `http://127.0.0.1:<porta>` (RFC 8252). Escopos: `openid`, `email` e `cloud-platform`;
   `access_type=online`, sem refresh token.
2. Procura um projeto da conta com o rótulo `didiflow=didibot` (Cloud Resource Manager v3) e, se
   não existir, cria `didiflow-<aleatório>` ("DidiFlow DidiBot").
3. Ativa `generativelanguage.googleapis.com` no projeto (Service Usage).
4. Cria uma API key restrita a esse serviço (API Keys v2) e lê o valor.
5. Guarda a chave criptografada e o e-mail da conta; o token do Google é descartado.

A colagem manual de uma chave do AI Studio continua disponível ("Ou use uma chave própria").

Erros tratados: login cancelado, permissão negada, tempo esgotado, Termos do Google Cloud não
aceitos (contas que nunca usaram o Cloud precisam aceitar uma vez em console.cloud.google.com),
conta sem permissão para criar projetos (comum em contas de empresa) e rede.

### Configuração no Google Cloud (uma vez, pelo dono do app)

1. Num projeto do Google Cloud do DidiFlow, ative: Cloud Resource Manager API, Service Usage API e
   API Keys API (as chamadas feitas com o login do usuário contam cota nesse projeto).
2. Tela de consentimento OAuth: tipo **Externo**, nome "DidiFlow", e-mail de suporte, escopos
   `openid`, `email` e `.../auth/cloud-platform`. Enquanto o app estiver em **Teste**, só os
   e-mails cadastrados em "Usuários de teste" (até 100) conseguem entrar, e o Google mostra o aviso
   de app não verificado. Para liberar a qualquer conta, o app precisa passar pela verificação do
   Google (o escopo `cloud-platform` é sensível).
3. Credenciais → Criar ID do cliente OAuth → tipo **App para computador**.
4. No `.env.production` (e no `.env` para testar em desenvolvimento):
   `DIDIFLOW_GOOGLE_CLIENT_ID` e `DIDIFLOW_GOOGLE_CLIENT_SECRET`. Em apps instalados o "secret" não
   é confidencial (o Google trata assim); mesmo assim ele não vai para o git.

## Segurança e privacidade

- A chave fica no processo principal do Electron, em um secure store próprio
  (`ai-secrets.json`, criptografado com `safeStorage`). O renderer grava ou remove a chave, mas nunca
  lê o valor de volta. As chamadas ao Gemini saem do processo principal (`x-goog-api-key`), nunca
  do renderer, e a CSP do renderer não muda.
- Aviso explícito na tela: no plano gratuito, o Google pode usar o conteúdo enviado para melhorar
  seus produtos. O usuário escolhe se as tarefas entram no contexto (chave "Incluir minhas
  tarefas", ligada por padrão e lembrada por aparelho).
- O contexto enviado é um resumo: títulos, status, prioridade, prazos, progresso, projeto e épico
  das tarefas abertas, além das horas de hoje. Descrições e observações não são enviadas.
- Limites: até 20 mensagens por conversa, 4.000 caracteres por mensagem e 20.000 de contexto,
  validados no IPC. Erros de cota (429) viram mensagem amigável.

## Funcionalidades (v1)

1. **Página DidiBot** (menu lateral): conversa com respostas em Markdown, atalhos ("Resumo do meu
   dia", "O que priorizar agora?", "Planejar a semana", "Tarefas em risco") e "Nova conversa". O
   histórico fica só na memória da sessão.
2. **Sugerir subtarefas**: no painel de subtarefas do detalhe, o DidiBot propõe subtarefas
   (resposta JSON estruturada). O usuário marca as que quer e o app as cria. Nada é criado sem
   confirmação.
3. **Configurações → DidiBot (Gemini)**: entrar com Google (chave criada automaticamente) ou colar
   uma chave própria, escolher o modelo (lista vinda da API, padrão `gemini-2.5-flash`), testar e
   desconectar.

## Arquitetura

- `electron/ipc/gemini.ts`: cliente REST da API Gemini (`generateContent`, `models`), validação,
  classificação de erros (chave inválida, cota, modelo, bloqueio de segurança, rede) e
  configurações.
- IPC `ai:status`, `ai:save`, `ai:test`, `ai:models`, `ai:chat`, `ai:suggest-subtasks`,
  `ai:connect-google`.
- Renderer: `DidiBotService` (contexto e conversa), página `/didibot`, card nas Configurações e
  ação no painel de subtarefas.

## Testes (antes de documentação e manual)

- Unitários do processo principal: validação, montagem das requisições, erros e armazenamento da
  chave (fetch falso).
- Unitários do Angular: montagem do contexto, conversa e sugestões.
- E2E: página e configurações sem chave (sem chamar o Google), superfície da API do preload.
- Teste real com a chave do usuário (chat e sugestões) antes de atualizar manual e docs.

## Fora da v1

- Android (precisa de outro armazenamento seguro para a chave e chamadas sem o processo principal).
- Criação de tarefas pelo chat (function calling) e respostas em streaming.
