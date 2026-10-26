# Aplicativo Android

O DidiFlow para Android é o **mesmo app Angular**, empacotado com [Capacitor](https://capacitorjs.com/) 8. Telas, regras e dados são os mesmos do desktop, e o Supabase continua sendo o back-end (com RLS). Não existe uma segunda base de código.

## Por que Capacitor (e não NativeScript)

| Opção                  | Reaproveitamento                                                                              | Custo                                                                          |
| ---------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Capacitor              | 100% dos componentes, serviços, Angular Material, gráficos e Markdown                         | Interface web dentro da WebView do Android                                     |
| NativeScript + Angular | Serviços e regras; **toda a interface precisaria ser reescrita** com componentes NativeScript | Sem Angular Material, ngx-charts nem ngx-markdown; duas interfaces para manter |

Como o objetivo é ter o app no celular com as mesmas funções, o Capacitor entrega isso sem duplicar o projeto.

## O que muda no Android

- **Layout:** abaixo de 769 px de largura, o menu lateral vira gaveta (botão ☰) e aparece uma barra superior com o sino de notificações. Os filtros ficam dois por linha.
- **Mobile-first:** os estilos partem do celular e acrescentam o layout maior a partir de 769 px (`@include bp.desktop`), com o mesmo ponto de corte do menu.
- **Telas de até 768 px:**
  - lista de tarefas em cartões (título, status, prioridade, progresso, entrega e solicitante);
  - Kanban com uma coluna por tela, deslizando para os lados;
  - calendário semanal como lista de dias e mensal com marcadores coloridos (tocar no dia abre o dia);
  - grades de cartões em uma coluna e formulários (tarefa, metas, tempo, notificações) em tela cheia.
- **Builds separados:** o build do Android usa `dist/didiflow-mobile`, e o do desktop continua em `dist/didiflow`.
- **Sessão:** guardada nas Preferences do app (armazenamento privado do Android). No desktop continua no cofre criptografado do sistema.
- **Notificações:**
  - lembretes e notificações personalizadas da próxima semana são agendados no Android e aparecem **mesmo com o app fechado**;
  - o agendamento é refeito ao abrir o app, ao mudar uma regra e ao sair do app;
  - com o app aberto, os avisos aparecem como cartão;
  - tocar numa notificação abre a tela correspondente;
  - o Android 13+ pede permissão na primeira vez.
- **Botão voltar:** fecha a janela de diálogo aberta e depois a gaveta; em seguida volta de tela. Na tela inicial, minimiza o app.
- **Links externos:** abrem no navegador do celular.
- **Não disponível no celular:**
  - **Anexos de arquivo:** os arquivos ficam no disco do computador. A aba **Recursos** (links) funciona.
  - **Backups locais automáticos:** são do desktop. Exportar e restaurar usam o fluxo do navegador.

## Gerar o APK

```bash
npm run android:build
```

O APK de depuração sai em `release/android/DidiFlow-<versão>-debug.apk`.

O script `scripts/build-android.mjs`:

1. Define a URL do Supabase para o celular:
   - `DIDIFLOW_MOBILE_SUPABASE_URL`, se existir (ex.: `https://<projeto>.supabase.co`, ou `http://10.0.2.2:54321` no emulador);
   - senão, `http://<IP do PC na rede>:54321`, para o Supabase local.
2. Gera o `environment.ts` com essa URL e compila o Angular.
3. Restringe o tráfego sem TLS ao host do Supabase local (`network_security_config.xml`); todo o resto exige https.
4. Sincroniza o Capacitor, ajusta `versionName`/`versionCode` a partir do `package.json` e roda `gradlew assembleDebug`.
5. Restaura o `environment.ts` do desktop no final, mesmo se o build falhar.

Ferramentas: JDK 21 e Android SDK (plataforma 36). O script usa `JAVA_HOME_21`/`ANDROID_HOME` ou, se não existirem, as cópias em `%LOCALAPPDATA%\didiflow-tools` (JDK Temurin 21 e command-line tools do Android).

## Emulador

Para ver o app no PC sem celular:

1. Gere o APK do emulador (ele acessa o Supabase local por `10.0.2.2`, que é o PC visto de dentro do emulador):
   ```bash
   DIDIFLOW_MOBILE_SUPABASE_URL=http://10.0.2.2:54321 npm run android:build
   ```
   Renomeie o resultado para `release/android/DidiFlow-<versão>-emulator-debug.apk`.
2. Rode `npm run android:emulator`. O comando liga o dispositivo virtual **DidiFlow_Pixel** (Android 15, x86_64, aceleração WHPX), instala o APK e abre o app.

O emulador e a imagem do Android ficam em `%LOCALAPPDATA%didiflow-toolsandroid-sdk`, e o dispositivo virtual em `%USERPROFILE%.androidavdDidiFlow_Pixel.avd`. O `adb` está em `platform-tools` dentro do SDK.

## Usar com o Supabase local

1. PC e celular na mesma rede Wi-Fi.
2. Libere a porta **54321** no Firewall do Windows (rede privada). Sem isso, o celular não alcança o Supabase.
3. Instale o APK (habilite "instalar apps desconhecidos" para o gerenciador de arquivos ou use `adb install`).
4. Entre com a mesma conta do desktop.

O endereço do PC na rede pode mudar (DHCP). Nesse caso, gere o APK de novo.

## Segurança

- O build normal continua exigindo `https` para qualquer Supabase que não seja `127.0.0.1`. O `http` na rede local só é aceito quando o próprio script de Android pede (`DIDIFLOW_ALLOW_LAN_HTTP=1`), e só para endereços privados (10/8, 172.16/12, 192.168/16).
- O APK de depuração é assinado com a chave de debug do Android: serve para testes, não para distribuição. Uma versão para distribuição precisa de um Supabase com https, de uma chave de assinatura própria e de `assembleRelease`.
- Nenhuma chave `service_role` entra no app (o `write-env` recusa).
