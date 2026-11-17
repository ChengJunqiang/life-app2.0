const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const appRoot = path.resolve(__dirname, '..');
const capBin = path.join(appRoot, 'node_modules/@capacitor/cli/bin/capacitor');
const requested = process.argv[2] || 'all';
const platforms = requested === 'all' ? ['ios', 'android'] : [requested];

if (platforms.some((platform) => !['ios', 'android'].includes(platform))) {
  console.error('Usage: node scripts/prepare-native.cjs [all|ios|android]');
  process.exit(1);
}

const missing = platforms.filter((platform) => !fs.existsSync(path.join(appRoot, platform)));
if (missing.length === 0) {
  console.log('Native project source already exists. No build or sync performed.');
  process.exit(0);
}

// `cap add` automatically syncs when webDir exists; Android then also invokes
// Gradle. Temporarily hide dist so this command only generates project source,
// never copies an old web bundle, installs Pods, or compiles either platform.
const dist = path.join(appRoot, 'dist');
const staging = fs.mkdtempSync(path.join(appRoot, '.native-prepare-'));
const savedDist = path.join(staging, 'dist');
let status = 0;

try {
  if (fs.existsSync(dist)) fs.renameSync(dist, savedDist);

  for (const platform of missing) {
    const result = spawnSync(process.execPath, [capBin, 'add', platform], {
      cwd: appRoot,
      env: process.env,
      stdio: 'inherit',
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      status = result.status || 1;
      break;
    }

    if (platform === 'ios') {
      // Capacitor 7's stock template targets iOS 14; this app uses the HTML
      // dialog API supported by WKWebView from iOS 15.4 onward.
      const podfile = path.join(appRoot, 'ios/App/Podfile');
      const project = path.join(appRoot, 'ios/App/App.xcodeproj/project.pbxproj');
      fs.writeFileSync(podfile, fs.readFileSync(podfile, 'utf8').replace("platform :ios, '14.0'", "platform :ios, '15.4'"));
      fs.writeFileSync(project, fs.readFileSync(project, 'utf8').replaceAll('IPHONEOS_DEPLOYMENT_TARGET = 14.0;', 'IPHONEOS_DEPLOYMENT_TARGET = 15.4;'));
    }

    if (platform === 'android') {
      // Discard the template's 2+2 test and incorrect sample application ID.
      for (const folder of ['test', 'androidTest']) {
        fs.rmSync(path.join(appRoot, 'android/app/src', folder), { recursive: true, force: true });
      }
      // Generate Capacitor's Gradle dependency source without invoking Gradle.
      // The empty public directory tells `cap update` not to copy web assets.
      // It is removed below: this command does not prepare a runnable bundle.
      const publicDir = path.join(appRoot, 'android/app/src/main/assets/public');
      fs.mkdirSync(publicDir, { recursive: true });
      try {
        const update = spawnSync(process.execPath, [capBin, 'update', 'android'], {
          cwd: appRoot,
          env: process.env,
          stdio: 'inherit',
        });
        if (update.error) throw update.error;
        if (update.status !== 0) {
          status = update.status || 1;
          break;
        }
      } finally {
        fs.rmSync(publicDir, { recursive: true, force: true });
      }
    }
  }
} catch (error) {
  console.error(error.message);
  status = 1;
} finally {
  if (fs.existsSync(savedDist)) fs.renameSync(savedDist, dist);
  fs.rmSync(staging, { recursive: true, force: true });
}

if (status === 0) {
  console.log('Native project source prepared. No build or sync performed.');
  console.log('Before running either platform, build the current web app and run cap sync.');
}
process.exit(status);
