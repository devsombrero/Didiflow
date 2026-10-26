# Plano: DidiBot (assistente com Gemini)

Status: em implementação (v0.8.0). Escopo da primeira versão: aplicativo desktop.

## Objetivo

Um assistente opcional, o **DidiBot**, que conversa sobre o trabalho do usuário (tarefas, prazos,
horas) e ajuda a planejar, usando a **API Gemini no plano gratuito** do Google. Quem não conectar
uma conta Google continua usando o DidiFlow normalmente.

## Conta Google (opcional)

A API Gemini gratuita é liberada por **chave de API** criada no Google AI Studio com a conta Google
do usuário (aistudio.google.com/apikey). O DidiFlow pede essa conexão de forma opcional:

1. Configurações → DidiBot → **Conectar conta Google** abre o AI Studio no navegador.
2. O usuário entra com a conta Google, cria a chave gratuita e cola no DidiFlow.
3. O app testa a chave e lista os modelos disponíveis para ela.

Por que não OAuth: o acesso à API Gemini por OAuth exige projeto no Google Cloud, tela de
consentimento verificada e escopos restritos, sem ganho para um app pessoal. A chave do AI Studio é
o caminho oficial do plano gratuito.

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
3. **Configurações → DidiBot (Gemini)**: conectar conta Google, colar a chave, escolher o modelo
   (lista vinda da API, padrão `gemini-2.5-flash`), testar e remover a chave.

## Arquitetura

- `electron/ipc/gemini.ts`: cliente REST da API Gemini (`generateContent`, `models`), validação,
  classificação de erros (chave inválida, cota, modelo, bloqueio de segurança, rede) e
  configurações.
- IPC `ai:status`, `ai:save`, `ai:test`, `ai:models`, `ai:chat`, `ai:suggest-subtasks`.
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
