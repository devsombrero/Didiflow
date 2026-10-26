// Starts the "DidiFlow_Pixel" Android emulator (if needed), installs the
// emulator APK and opens the app.
//
//   npm run android:emulator
//
// The emulator APK talks to the local Supabase through 10.0.2.2 (the host PC
// as seen from the emulator). Build it with:
//   DIDIFLOW_MOBILE_SUPABASE_URL=http://10.0.2.2:54321 npm run android:build
// then rename release/android/DidiFlow-<version>-debug.apk to
// DidiFlow-<version>-emulator-debug.apk (see docs/mobile.md).
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const sdk =
  process.env.ANDROID_HOME ??
  path.join(process.env.LOCALAPPDATA ?? '', 'didiflow-tools', 'android-sdk');
const adb = path.join(sdk, 'platform-tools', 'adb.exe');
const emulator = path.join(sdk, 'emulator', 'emulator.exe');
const sysdir = path.join(sdk, 'system-images', 'android-35', 'google_apis', 'x86_64');
const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
// Local-Supabase builds need the 10.0.2.2 variant; cloud builds use the regular APK.
const emulatorApk = `release/android/DidiFlow-${version}-emulator-debug.apk`;
const apk = existsSync(emulatorApk) ? emulatorApk : `release/android/DidiFlow-${version}-debug.apk`;

for (const [label, file] of [
  ['adb', adb],
  ['emulator', emulator],
  ['system image', sysdir],
  ['APK', apk],
]) {
  if (!existsSync(file)) {
    console.error(`android-emulator: ${label} not found at ${file}`);
    process.exit(1);
  }
}

const adbOut = (...args) => execFileSync(adb, args, { encoding: 'utf8' }).trim();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

if (!adbOut('devices').includes('emulator-')) {
  console.log('android-emulator: starting DidiFlow_Pixel…');
  spawn(
    emulator,
    [
      '-avd',
      'DidiFlow_Pixel',
      '-sysdir',
      sysdir,
      '-no-snapshot-save',
      '-gpu',
      'auto',
      '-no-boot-anim',
    ],
    {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, ANDROID_SDK_ROOT: sdk, ANDROID_HOME: sdk },
    },
  ).unref();
}

const deadline = Date.now() + 5 * 60 * 1000;
for (;;) {
  try {
    if (adbOut('shell', 'getprop', 'sys.boot_completed') === '1') break;
  } catch {
    // not connected yet
  }
  if (Date.now() > deadline) {
    console.error('android-emulator: the emulator did not finish booting in 5 minutes.');
    process.exit(1);
  }
  await sleep(3000);
}

console.log(`android-emulator: installing ${apk}`);
adbOut('install', '-r', apk);
try {
  adbOut('shell', 'pm', 'grant', 'app.didiflow.mobile', 'android.permission.POST_NOTIFICATIONS');
} catch {
  // older Android versions have no runtime notification permission
}
adbOut(
  'shell',
  'monkey',
  '-p',
  'app.didiflow.mobile',
  '-c',
  'android.intent.category.LAUNCHER',
  '1',
);
console.log('android-emulator: DidiFlow is open on the emulator.');
