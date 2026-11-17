const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
const currentMajor = Number(process.versions.node.split('.')[0]);
const bundledNode = path.join(
  os.homedir(),
  '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node'
);

if (args.length === 0) {
  console.error('Usage: node scripts/run-with-modern-node.cjs <script> [...args]');
  process.exit(1);
}

const nodeBin = currentMajor >= 20 || !fs.existsSync(bundledNode)
  ? process.execPath
  : bundledNode;

if (currentMajor < 20 && nodeBin === process.execPath) {
  console.error(`Node ${process.versions.node} is too old. Please use Node 20 or newer.`);
  process.exit(1);
}

const result = spawnSync(nodeBin, args, {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status == null ? 1 : result.status);
