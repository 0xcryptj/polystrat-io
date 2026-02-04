import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type DocHeading = {
  level: number; // 1..6
  text: string;
  slug: string;
  line: number;
};

export type DocFileIndex = {
  file: string; // relative to workspace root
  headings: DocHeading[];
};

export type PolymarketDocsIndex = {
  root: string; // relative to workspace root
  files: DocFileIndex[];
  generatedAt: number;
};

const DOCS_ROOT_REL = path.join("docs", "polymarket");

export async function buildPolymarketDocsIndex(): Promise<PolymarketDocsIndex> {
  // We can't rely on process.cwd() because dev servers run from app subfolders.
  // Find the monorepo root by walking upward until we see a package.json with "workspaces".
  const workspaceRoot = await findWorkspaceRoot();
  const rootAbs = path.join(workspaceRoot, DOCS_ROOT_REL);

  let entries: string[] = [];
  try {
    const dirents = await fs.readdir(rootAbs, { withFileTypes: true });
    entries = dirents
      .filter((d) => d.isFile() && d.name.toLowerCase().endsWith(".md"))
      .map((d) => d.name)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    entries = [];
  }

  const files: DocFileIndex[] = [];

  for (const name of entries) {
    const rel = path.join(DOCS_ROOT_REL, name).replace(/\\/g, "/");
    const abs = path.join(rootAbs, name);

    const text = await fs.readFile(abs, "utf8");
    const headings = extractHeadings(text);

    files.push({ file: rel, headings });
  }

  return {
    root: DOCS_ROOT_REL.replace(/\\/g, "/"),
    files,
    generatedAt: Date.now()
  };
}

export function extractHeadings(markdown: string): DocHeading[] {
  const lines = markdown.split(/\r?\n/);
  const out: DocHeading[] = [];

  let inFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip fenced code blocks
    if (/^```/.test(line.trim())) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const m = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (!m) continue;

    const level = m[1].length;
    const text = m[2].trim();
    out.push({ level, text, slug: slugify(text), line: i + 1 });
  }

  return out;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[`~!@#$%^&*()_=+\[\]{}|;:'\",.<>?/\\]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function findWorkspaceRoot(): Promise<string> {
  // Start from this file's directory.
  let dir = path.dirname(fileURLToPath(import.meta.url));

  for (let i = 0; i < 10; i++) {
    const candidate = path.join(dir, "package.json");
    try {
      const raw = await fs.readFile(candidate, "utf8");
      const j = JSON.parse(raw);
      if (j && typeof j === "object" && Array.isArray(j.workspaces)) return dir;
    } catch {
      // ignore
    }

    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return process.cwd();
}
