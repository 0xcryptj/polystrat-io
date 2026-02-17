import fs from 'node:fs';
import path from 'node:path';

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function moveIfExists(src: string, dst: string) {
  if (!fs.existsSync(src)) return;
  fs.renameSync(src, dst);
}

function main() {
  const root = process.cwd();
  const dataDir = path.join(root, 'data');
  ensureDir(dataDir);

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(dataDir, 'archive', `paper_reset_${ts}`);
  ensureDir(backupDir);

  const files = [
    'paper_t1.json',
    'paper_t2.json',
    'paper_t5.json',
    'equity_t1.jsonl',
    'equity_t2.jsonl',
    'equity_t5.jsonl',
    'paper.json'
  ];

  for (const f of files) {
    const src = path.join(dataDir, f);
    const dst = path.join(backupDir, f);
    moveIfExists(src, dst);
  }

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ok: true, backupDir }, null, 2));
}

main();
