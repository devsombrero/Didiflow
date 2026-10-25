import { app, BrowserWindow, net, protocol, safeStorage, session, shell } from 'electron';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { APP_HOST, APP_ORIGIN, APP_SCHEME, buildContentSecurityPolicy } from './config';
import { registerIpcHandlers } from './ipc/handlers';
import { SecureStore } from './ipc/secure-store';
import { assertExternalUrl, isTrustedOrigin } from './ipc/validation';
import { isClientRoute, resolveRendererPath } from './renderer-path';

// Only honored in unpackaged builds, so a packaged app can never be pointed
// at an arbitrary URL through the environment.
const devServerUrl = app.isPackaged ? undefined : process.env['DIDIFLOW_DEV_SERVER_URL'];

// Automated tests run each app instance with an isolated profile (session,
// secure store). Like the dev server URL, this is ignored in packaged builds.
const userDataOverride = app.isPackaged ? undefined : process.env['DIDIFLOW_USER_DATA_DIR'];
if (userDataOverride) app.setPath('userData', userDataOverride);
const trustedOrigins = devServerUrl ? [APP_ORIGIN, new URL(devServerUrl).origin] : [APP_ORIGIN];
const rendererRoot = path.join(app.getAppPath(), 'dist', 'didiflow', 'browser');
const contentSecurityPolicy = buildContentSecurityPolicy(app.isPackaged);

protocol.registerSchemesAsPrivileged([
  { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

let mainWindow: BrowserWindow | null = null;

function isTrustedUrl(url: string): boolean {
  return isTrustedOrigin(url, trustedOrigins);
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
      try {
        void shell.openExternal(assertExternalUrl(url));
      } catch {
        // Non-https targets are silently dropped.
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
      preload: path.join(__dirname, 'preload.cjs'),
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
    // Windows needs an AppUserModelID for toast notifications.
    if (process.platform === 'win32') app.setAppUserModelId('com.didiflow.app');
    registerIpcHandlers({
      store: new SecureStore(path.join(app.getPath('userData'), 'secure-store.json'), {
        isAvailable: () => safeStorage.isEncryptionAvailable(),
        encrypt: (plainText) => safeStorage.encryptString(plainText),
        decrypt: (encrypted) => safeStorage.decryptString(encrypted),
      }),
      trustedOrigins,
      getWindow: () => mainWindow,
    });
    createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
