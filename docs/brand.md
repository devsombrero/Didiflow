# Identidade visual

<p><img src="../assets/brand/didiflow-logo-light.svg" alt="DidiFlow" width="360" /></p>

## Conceito

O símbolo une um **"D"** aberto a um **check** que entra por essa abertura e sobe. O D é a marca DidiFlow; o check é a tarefa concluída; o traço contínuo, que entra e segue em frente, representa o **fluxo**: o trabalho avançando até a entrega.

- **Minimalista:** dois traços de mesma espessura, pontas arredondadas, sem detalhes finos. Continua legível a 16 px.
- **Tecnológico:** geometria precisa, gradiente azul-céu e contraste alto.
- **Memorável:** o check "atravessando" o D é uma forma única e fácil de reconhecer.

## Cores

| Uso                       | Cor                                                   |
| ------------------------- | ----------------------------------------------------- |
| Gradiente do ícone        | `#38bdf8` → `#0284c7` → `#075985` (diagonal)          |
| Acento (palavra "Flow")   | `#0284c7` (tema claro) · `#38bdf8` (tema escuro)      |
| Palavra "Didi"            | `hsl(204 85% 30%)` (claro) · `hsl(0 0% 98%)` (escuro) |
| Símbolo sobre o gradiente | `#ffffff` (D) e `#e0f2fe` (check)                     |

A paleta completa da interface está em `src/styles.scss` (tokens `--mat-sys-*`).

## Tipografia

**Inter**, peso 800 e espaçamento negativo no logotipo; Inter variável na interface. A fonte é empacotada com o app (`@fontsource-variable/inter`), sem depender de internet.

## Arquivos-fonte (`assets/brand/`)

| Arquivo                            | Uso                                                                    |
| ---------------------------------- | ---------------------------------------------------------------------- |
| `didiflow-icon.svg`                | Ícone do app (quadrado arredondado): desktop, loja e Android legado    |
| `didiflow-icon-round.svg`          | Ícone redondo (Android legado)                                         |
| `didiflow-mark.svg`                | Só o símbolo, em gradiente, fundo transparente                         |
| `didiflow-mark-white.svg`          | Só o símbolo, branco (fundos coloridos, monocromático)                 |
| `didiflow-adaptive-foreground.svg` | Camada da frente do ícone adaptativo do Android (zona segura de 66 dp) |
| `didiflow-adaptive-background.svg` | Camada de fundo do ícone adaptativo (gradiente, sangrado)              |
| `didiflow-logo-light.svg`          | Logotipo horizontal para fundos claros                                 |
| `didiflow-logo-dark.svg`           | Logotipo horizontal para fundos escuros                                |

## Gerar os ícones

```bash
npm run icons
```

O script `scripts/generate-icons.mjs` (com `sharp`) gera, a partir dos SVGs:

- **Electron:**
  - `build/icon.ico`: Windows (16 a 256 px), usado no executável, no instalador e no desinstalador NSIS;
  - `build/icon.icns`: macOS (16 a 1024 px);
  - `build/icons/*.png`: Linux (16 a 1024 px);
  - `build/icon.png`: 1024 px, também usado como ícone da janela.
- **Interface:** `public/favicon.ico`, `public/brand/*.svg` e `public/icons/*.png` (192, 512 e apple-touch).
- **Android:**
  - `mipmap-*/ic_launcher.png` e `ic_launcher_round.png` (mdpi a xxxhdpi);
  - `mipmap-*/ic_launcher_foreground.png` e `ic_launcher_background.png`, para o ícone adaptativo;
  - `ic_launcher-playstore.png`: 512 px.

Os vetores do Android ficam em `android/app/src/main/res/drawable/`, escritos com os mesmos traços: `ic_didiflow_monochrome.xml` (ícone temático do Android 13+), `ic_stat_didiflow.xml` (notificações) e `ic_didiflow_splash.xml` (abertura).

## Onde a marca aparece

- **Electron:** executável, janela e barra de tarefas, instalador e desinstalador, e atalhos (via `electron-builder.yml` e `electron/main.ts`).
- **Android:**
  - ícone do app, ícone adaptativo com camada monocromática (ícones temáticos);
  - tela de abertura;
  - notificações, com o ícone branco e a cor de destaque `#0284c7`.
- **Interface:**
  - tela de carregamento (`src/index.html`);
  - login;
  - menu lateral e barra superior do celular;
  - favicon;
  - README.
