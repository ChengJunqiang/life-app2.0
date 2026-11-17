const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const platform = process.argv[2] || 'ios';
const port = process.env.LIFE_APP_PORT || '5174';
const host = process.env.LIFE_APP_HOST || (platform === 'android' ? '10.0.2.2' : '127.0.0.1');
const appRoot = path.resolve(__dirname, '..');
const capBin = path.join(appRoot, 'node_modules/@capacitor/cli/bin/capacitor');
const viteBin = path.join(appRoot, 'node_modules/vite/bin/vite.js');

if (!['ios', 'android'].includes(platform)) {
  console.error('Platform must be ios or android.');
  process.exit(1);
}

function isServerReady() {
  return new Promise((resolve) => {
    const request = http.get(`http://127.0.0.1:${port}`, (response) => {
      response.resume();
      resolve(true);
    });

    request.on('error', () => resolve(false));
    request.setTimeout(700, () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isServerReady()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  return false;
}

function runCommand(args, options = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: appRoot,
    env: process.env,
    stdio: 'inherit',
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status == null ? 1 : result.status);
  }
}

function ensureWebDir() {
  const distDir = path.join(appRoot, 'dist');
  const indexHtml = path.join(distDir, 'index.html');

  if (fs.existsSync(indexHtml)) {
    return;
  }

  fs.mkdirSync(distDir, { recursive: true });
  fs.writeFileSync(
    indexHtml,
    '<!doctype html><html><head><meta charset="utf-8"><title>Life</title></head><body><div id="app"></div></body></html>\n'
  );
}

function removeLiveReloadUrl() {
  const configPath = platform === 'ios'
    ? path.join(appRoot, 'ios/App/App/capacitor.config.json')
    : path.join(appRoot, 'android/app/src/main/assets/capacitor.config.json');
  if (!fs.existsSync(configPath)) return;

  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (config.server && config.server.url) {
      delete config.server.url;
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
    }
  } catch (error) {
    console.error(`Could not clean live reload config: ${error.message}`);
  }
}

async function main() {
  let viteProcess = null;

  if (!(await isServerReady())) {
    viteProcess = spawn(process.execPath, [viteBin, '--host', '0.0.0.0', '--port', port], {
      cwd: appRoot,
      env: process.env,
      stdio: 'inherit',
    });

    if (!(await waitForServer(20000))) {
      console.error(`Vite dev server did not start on port ${port}.`);
      if (viteProcess) {
        viteProcess.kill();
      }
      process.exit(1);
    }
  }

  ensureWebDir();

  if (!fs.existsSync(path.join(appRoot, platform))) {
    console.log(`Adding Capacitor ${platform} project...`);
    runCommand([path.join(__dirname, 'prepare-native.cjs'), platform]);
  }

  removeLiveReloadUrl();

  const runArgs = [
    capBin,
    'run',
    platform,
    '--live-reload',
    '--host',
    host,
    '--port',
    port,
  ];

  if (platform === 'android') {
    runArgs.push('--forwardPorts', `${port}:${port}`);
  }

  const capProcess = spawn(process.execPath, runArgs, {
    cwd: appRoot,
    env: process.env,
    stdio: 'inherit',
  });

  function shutdown() {
    if (capProcess && !capProcess.killed) {
      // Capacitor restores live reload configuration on SIGINT.
      capProcess.kill('SIGINT');
    }
    if (viteProcess && !viteProcess.killed) {
      viteProcess.kill();
    }
  }

  process.on('SIGINT', () => {
    shutdown();
    process.exitCode = 130;
  });
  process.on('SIGTERM', () => {
    shutdown();
    process.exitCode = 143;
  });

  capProcess.on('exit', (code) => {
    removeLiveReloadUrl();
    if (viteProcess && !viteProcess.killed) {
      viteProcess.kill();
    }
    process.exit(process.exitCode || (code == null ? 1 : code));
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
