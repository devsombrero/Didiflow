// Builds the Android app (debug APK) from the same Angular code.
//
//   npm run android:build
//
// npm run android:build uses .env.production (the cloud Supabase);
// npm run android:build:local uses the local Supabase from .env.
//
// Supabase URL used by the phone:
//   - DIDIFLOW_MOBILE_SUPABASE_URL, when set (e.g. https://<project>.supabase.co,
//     or http://10.0.2.2:54321 for the Android emulator);
//   - DIDIFLOW_SUPABASE_URL itself when it is not a local address (cloud);
//   - otherwise http://<this PC's LAN address>:<local Supabase port>, so a phone
//     on the same Wi-Fi reaches the local Supabase (allow the port in the
//     Windows firewall).
// Toolchain: JAVA_HOME / ANDROID_HOME, or the JDK 21 and Android SDK under
// %LOCALAPPDATA%\didiflow-tools. The desktop environment.ts is restored at the end.
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { loadEnv } from './load-env.mjs';

loadEnv();

const desktopUrl = process.env.DIDIFLOW_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const version = JSON.parse(readFileSync('package.json', 'utf8')).version;

function lanAddress() {
  const candidates = Object.values(networkInterfaces())
    .flat()
    .filter((net) => net && net.family === 'IPv4' && !net.internal)
    .map((net) => net.address)
    // Skip VirtualBox host-only and WSL/Docker virtual networks.
    .filter((ip) => !ip.startsWith('192.168.56.') && !/^172\.(1[6-9]|2\d|3[01])\./.test(ip));
  return (
    candidates.find((ip) => ip.startsWith('192.168.')) ??
    candidates.find((ip) => ip.startsWith('10.'))
  );
}

function mobileUrl() {
  if (process.env.DIDIFLOW_MOBILE_SUPABASE_URL) return process.env.DIDIFLOW_MOBILE_SUPABASE_URL;
  const local = new URL(desktopUrl);
  if (!['127.0.0.1', 'localhost'].includes(local.hostname)) return desktopUrl;
  const ip = lanAddress();
  if (!ip) throw new Error('No LAN address found; set DIDIFLOW_MOBILE_SUPABASE_URL.');
  return `http://${ip}:${local.port || 54321}`;
}

function toolchain() {
  const tools = path.join(process.env.LOCALAPPDATA ?? '', 'didiflow-tools');
  const jdk =
    process.env.JAVA_HOME_21 ??
    (existsSync(tools) ? readdirSync(tools).find((d) => d.startsWith('jdk-21')) : undefined);
  const javaHome =
    process.env.JAVA_HOME_21 ?? (jdk ? path.join(tools, jdk) : process.env.JAVA_HOME);
  const sdk = process.env.ANDROID_HOME ?? path.join(tools, 'android-sdk');
  if (!javaHome || !existsSync(javaHome)) throw new Error('JDK 21 not found (set JAVA_HOME_21).');
  if (!existsSync(sdk)) throw new Error('Android SDK not found (set ANDROID_HOME).');
  return { javaHome, sdk };
}

function run(command, args, env, cwd = '.') {
  console.log(`> ${command} ${args.join(' ')}`);
  execFileSync(command, args, { stdio: 'inherit', env, cwd, shell: process.platform === 'win32' });
}

/** Cleartext only for the local Supabase host (debug builds); https everywhere else. */
function writeNetworkConfig(url) {
  const { protocol, hostname } = new URL(url);
  const domain =
    protocol === 'http:'
      ? `\n    <domain-config cleartextTrafficPermitted="true">\n        <domain includeSubdomains="false">${hostname}</domain>\n    </domain-config>`
      : '';
  writeFileSync(
    'android/app/src/main/res/xml/network_security_config.xml',
    `<?xml version="1.0" encoding="utf-8"?>\n<network-security-config>\n    <base-config cleartextTrafficPermitted="false" />${domain}\n</network-security-config>\n`,
  );
}

function syncVersion() {
  const file = 'android/app/build.gradle';
  const [major, minor, patch] = version.split('.').map(Number);
  const code = major * 10000 + minor * 100 + patch;
  const gradle = readFileSync(file, 'utf8')
    .replace(/versionCode \d+/, `versionCode ${code}`)
    .replace(/versionName "[^"]*"/, `versionName "${version}"`);
  writeFileSync(file, gradle);
}

const url = mobileUrl();
const { javaHome, sdk } = toolchain();
const mobileEnv = {
  ...process.env,
  DIDIFLOW_SUPABASE_URL: url,
  DIDIFLOW_ALLOW_LAN_HTTP: '1',
  JAVA_HOME: javaHome,
  ANDROID_HOME: sdk,
};
console.log(`android: Supabase for the phone → ${url}`);

try {
  run('node', ['scripts/write-env.mjs'], mobileEnv);
  // Separate output: the desktop build in dist/didiflow stays untouched.
  run('npx', ['ng', 'build', '--output-path', 'dist/didiflow-mobile'], mobileEnv);
  writeNetworkConfig(url);
  writeFileSync('android/local.properties', `sdk.dir=${sdk.replaceAll('\\', '/')}\n`);
  syncVersion();
  run('npx', ['cap', 'sync', 'android'], mobileEnv);
  run(
    path.resolve('android', process.platform === 'win32' ? 'gradlew.bat' : 'gradlew'),
    ['assembleDebug', '--no-daemon', '-q'],
    mobileEnv,
    'android',
  );
  mkdirSync('release/android', { recursive: true });
  const target = `release/android/DidiFlow-${version}-debug.apk`;
  copyFileSync('android/app/build/outputs/apk/debug/app-debug.apk', target);
  console.log(`android: ${target}`);
} finally {
  // Back to the desktop configuration and the https-only network policy.
  writeNetworkConfig('https://localhost');
  run('node', ['scripts/write-env.mjs'], { ...process.env, DIDIFLOW_ALLOW_LAN_HTTP: '' });
}
