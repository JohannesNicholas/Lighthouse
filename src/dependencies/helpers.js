// Shared helpers for the dependency tests (not a test file itself).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const readJson = (...parts) => JSON.parse(fs.readFileSync(path.join(ROOT, ...parts), 'utf8'));

export const pkg = () => readJson('package.json');
export const lock = () => readJson('package-lock.json');

export const installedVersion = (name) => {
  const file = path.join(ROOT, 'node_modules', name, 'package.json');
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).version : null;
};

const parse = (v) => {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};

const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/**
 * Minimal semver check for the range styles this repo uses: exact, ^x.y.z, ~x.y.z
 * (an `npm:pkg@range` alias is unwrapped first). Returns null for ranges it does
 * not understand (git urls, tags, etc.) so callers can skip them.
 */
export function satisfies(version, range) {
  const alias = /^npm:(?:@[^/]+\/)?[^@]+@(.+)$/.exec(range);
  if (alias) range = alias[1];
  const v = parse(version);
  if (!v) return null;
  const m = /^([\^~]?)(\d+\.\d+\.\d+)$/.exec(range);
  if (!m) return null;
  const base = parse(m[2]);
  if (cmp(v, base) < 0) return false;
  if (m[1] === '') return cmp(v, base) === 0;
  if (m[1] === '~') return v[0] === base[0] && v[1] === base[1];
  if (base[0] > 0) return v[0] === base[0];
  if (base[1] > 0) return v[0] === 0 && v[1] === base[1];
  return v[0] === 0 && v[1] === 0 && v[2] === base[2];
}

export function walk(dir, filter, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, filter, out);
    else if (filter(p)) out.push(p);
  }
  return out;
}

/** Bare (package) specifiers imported by non-test source files: Map<specifier, "file:line">. */
export function bareImports() {
  const found = new Map();
  const re = /^\s*(?:import\b[^'"]*?from\s*|import\s*|(?:const|let|var)\s+[^=]+=\s*require\(\s*|require\(\s*)['"]([^'"]+)['"]/;
  for (const file of walk(path.join(ROOT, 'src'), (p) => /\.(js|mjs|cjs)$/.test(p) && !/\.test\./.test(p) && !p.includes(`${path.sep}dependencies${path.sep}`))) {
    fs.readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        const specs = [];
        const m = re.exec(line);
        if (m) specs.push(m[1]);
        // AMD style: require(['knockout', 'knockout-secure-binding'], function (...) {})
        const amd = /^\s*require\(\s*\[([^\]]*)\]/.exec(line);
        if (amd) specs.push(...[...amd[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]));
        for (const spec of specs) {
          if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('node:')) continue;
          if (!found.has(spec)) found.set(spec, `${path.relative(ROOT, file)}:${i + 1}`);
        }
      });
  }
  return found;
}

export const packageName = (spec) => (spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]);
