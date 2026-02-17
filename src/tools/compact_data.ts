import fs from 'node:fs';
import path from 'node:path';

function tailFileLines(filePath: string, maxLines: number): string[] {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (lines.length <= maxLines) return lines;
  return lines.slice(-maxLines);
}

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function rotateJsonl(filePath: string, keepLines: number) {
  if (!fs.existsSync(filePath)) return;
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const archiveDir = path.join(dir, 'archive');
  ensureDir(archiveDir);

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const archivePath = path.join(archiveDir, `${base}.${ts}.bak`);

  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (lines.length <= keepLines) return;

  fs.writeFileSync(archivePath, raw);
  const kept = lines.slice(-keepLines).join('\n') + '\n';
  fs.writeFileSync(filePath, kept);
  // eslint-disable-next-line no-console
  console.log(`[compact] rotated ${base}: ${lines.length} -> ${keepLines} (archived to ${archivePath})`);
}

function main() {
  const root = process.cwd();
  const dataDir = path.join(root, 'data');
  ensureDir(dataDir);

  // Keep series longer; keep ops short because it gets spammy.
  rotateJsonl(path.join(dataDir, 'opportunities.jsonl'), 2000);
  rotateJsonl(path.join(dataDir, 'btc5m_series.jsonl'), 20000);
}

main();
