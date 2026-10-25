import { app, BrowserWindow, net, protocol, session, shell } from 'electron';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { APP_HOST, APP_ORIGIN, APP_SCHEME, buildContentSecurityPolicy } from './config';
import { isClientRoute, resolveRendererPath } from './renderer-path';

// Only honored in unpackaged builds, so a packaged app can never be pointed
// at an arbitrary URL through the environment.
const devServerUrl = app.isPackaged ? undefined : process.env['DIDIFLOW_DEV_SERVER_URL'];
const rendererRoot = path.join(app.getAppPath(), 'dist', 'didiflow', 'browser');
const contentSecurityPolicy = buildContentSecurityPolicy(app.isPackaged);

protocol.registerSchemesAsPrivileged([
  { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

let mainWindow: BrowserWindow | null = null;

function isTrustedUrl(url: string): boolean {
  try {
    const { origin } = new URL(url);
    return origin === APP_ORIGIN || (!!devServerUrl && origin === new URL(devServerUrl).origin);
  } catch {
    return false;
  }
}

async function isFile(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

function registerAppProtocol(): void {
  protocol.handle(APP_SCHEME, async (request) => {
    const { host, pathname } = new URL(request.url);
    const requested = host === APP_HOST ? resolveRendererPath(rendererRoot, pathname) : null;
    if (!requested) {
      return new Response('Not found', { status: 404 });
    }

    let target = requested;
    if (!(await isFile(requested))) {
      if (!isClientRoute(pathname)) {
        return new Response('Not found', { status: 404 });
      }
      target = path.join(rendererRoot, 'index.html');
    }

    const file = await net.fetch(pathToFileURL(target).toString());
    const headers = new Headers(file.headers);
    headers.set('Content-Security-Policy', contentSecurityPolicy);
    headers.set('X-Content-Type-Options', 'nosniff');
    return new Response(file.body, { status: file.status, headers });
  });
}

function hardenWebContents(): void {
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-navigate', (event, url) => {
      if (!isTrustedUrl(url)) {
        event.preventDefault();
      }
    });
    contents.on('will-attach-webview', (event) => event.preventDefault());
    contents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('https://')) {
        void shell.openExternal(url);
      }
      return { action: 'deny' };
    });
  });
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: 'DidiFlow',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('Renderer process gone:', details.reason, details.exitCode);
  });

  void mainWindow.loadURL(devServerUrl ?? `${APP_ORIGIN}/`);
}

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception in main process:', error);
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  hardenWebContents();

  void app.whenReady().then(() => {
    // Deny every permission request (camera, geolocation, notifications...)
    // until a feature explicitly needs one.
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
      callback(false),
    );
    registerAppProtocol();
    createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
