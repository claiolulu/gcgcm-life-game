#!/usr/bin/env node
/**
 * 跑测试：起一个**专用的**服务实例，用自己的数据库和端口。
 *
 * 以前测试直接打 localhost:3000，还会调 /api/admin/reset —— 也就是说
 * 每跑一次测试，就把正在用的那份数据清空一次。彩排时报名的人、
 * 现场真实的选手，都会这么没掉。
 *
 * 现在测试库在 server/data-test/，每次跑之前删干净；端口默认 3199，
 * 和开发/现场那个 3000 完全隔离。真实数据不受任何影响。
 */
import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.TEST_PORT || '3199';
const DATA = path.join(HERE, 'data-test');
const BASE = `http://localhost:${PORT}`;

const SUITES = ['test-flow.mjs', 'test-concurrency.mjs', 'test-readonly.mjs'];

// 每次从空库开始，测试之间不会互相污染
await rm(DATA, { recursive: true, force: true });

const server = spawn(process.execPath, [path.join(HERE, 'src', 'index.js')], {
  env: { ...process.env, MLG_DATA_DIR: DATA, PORT, NODE_ENV: 'test' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (d) => { serverLog += d; });
server.stderr.on('data', (d) => { serverLog += d; });

const stop = () => { server.kill('SIGTERM'); };
process.on('exit', stop);
process.on('SIGINT', () => { stop(); process.exit(130); });

// 等它起来
let up = false;
for (let i = 0; i < 60; i++) {
  try {
    const r = await fetch(`${BASE}/healthz`);
    if (r.ok) { up = true; break; }
  } catch { /* 还没起来 */ }
  await new Promise((r) => setTimeout(r, 250));
}
if (!up) {
  console.error('✗ 测试服务起不来。日志：\n' + serverLog.slice(-1500));
  process.exit(1);
}
console.log(`\n  测试服务 ${BASE}，数据库 server/data-test/（和现场那份完全隔离）\n`);

let failed = 0;
for (const suite of SUITES) {
  const code = await new Promise((resolve) => {
    const p = spawn(process.execPath, [path.join(HERE, suite)], {
      env: { ...process.env, BASE },
      stdio: 'inherit',
    });
    p.on('close', resolve);
  });
  if (code !== 0) failed++;
}

stop();
process.exit(failed > 0 ? 1 : 0);
