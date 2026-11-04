/**
 * Build-toolchain guards: the things a Dependabot bump of babel / sass /
 * webpack / eslint plugins would break before any Lighthouse code runs.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT, pkg, readJson } from './helpers.js';

const require = createRequire(import.meta.url);

describe('build configs only require declared packages', () => {
  const configs = ['webpack.common.js', 'webpack.dev.js', 'webpack.prod.js', 'webpack.watch.js', 'eslint.config.mjs', 'vitest.config.mjs'];
  const builtins = new Set(require('node:module').builtinModules);

  const requiredBy = () => {
    const found = [];
    for (const file of configs) {
      const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
      for (const m of text.matchAll(/(?:require\(|from\s+)['"]([^./'"][^'"]*)['"]/g)) {
        const spec = m[1].replace(/^node:/, '');
        const name = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
        if (!builtins.has(name)) found.push([name, file]);
      }
    }
    return found;
  };

  it('finds the requires (guards the scanner)', () => {
    const names = requiredBy().map(([n]) => n);
    expect(names).toContain('webpack');
    expect(names).toContain('webpack-merge');
  });

  // XFAIL (known issue, intentionally not fixed here): webpack.common.js does
  // `require('glob')` but package.json declares no `glob`. It only works today
  // because glob@7 happens to be hoisted in as a transitive dependency; a
  // routine update of whatever pulls it in could break `npm run dev/prod`.
  // Fix = add `glob` to devDependencies; then remove `.fails` below.
  it.fails('XFAIL: every package the build configs require is declared in package.json', () => {
    const declared = new Set(Object.keys({ ...pkg().dependencies, ...pkg().devDependencies }));
    const undeclared = requiredBy().filter(([n]) => !declared.has(n)).map(([n, f]) => `${n} (${f})`);
    expect(undeclared).toEqual([]);
  });

  it('currently only `glob` is undeclared (so this list cannot silently grow)', () => {
    const declared = new Set(Object.keys({ ...pkg().dependencies, ...pkg().devDependencies }));
    const undeclared = [...new Set(requiredBy().filter(([n]) => !declared.has(n)).map(([n]) => n))];
    expect(undeclared).toEqual(['glob']);
  });
});

describe('babel', () => {
  const babel = require('@babel/core');
  const run = (code, filename = 'x.js') => babel.transformSync(code, { cwd: ROOT, filename: path.join(ROOT, 'src', filename), babelrc: false, configFile: path.join(ROOT, 'babel.config.json') }).code;

  it('turns JSX into calls to the DOM pragma (jsx-dom-factory)', () => {
    const out = run('const el = <div class="a" id={x}>hi <b>there</b></div>;');
    expect(out).toContain('DOM("div"');
    expect(out).toContain('DOM("b"');
    expect(out).not.toContain('React');
  });

  it('transpiles modern syntax the sources use', () => {
    const out = run('const f = async (a) => { const { b, ...rest } = a ?? {}; return a?.c?.[0] ?? `x${b}`; }; export class K { #p = 1; static s = 2; }');
    // browserslist targets modern browsers, so syntax may be kept or lowered; either way it must compile.
    expect(out).toContain('K');
    expect(out).toContain('rest');
  });

  it('handles TypeScript syntax via preset-typescript', () => {
    const out = run('const n: number = 1; interface I { a: string } export function f(x: I): string { return x.a + n; }', 'x.ts');
    expect(out).not.toContain('interface');
    expect(out).not.toContain(': number');
  });
});

describe('sass', () => {
  it('compiles SCSS with variables, nesting and mixins', () => {
    const sass = require('sass');
    const { css } = sass.compileString('$c: #c0392b; @mixin pad($n) { padding: $n; } .a { color: $c; .b { @include pad(4px); } }');
    expect(css).toContain('.a {');
    expect(css).toContain('.a .b');
    expect(css).toContain('padding: 4px');
  });
});

describe('webpack configuration', () => {
  it('loads and exposes entries for every page, content script and inject script', () => {
    const common = require(path.join(ROOT, 'webpack.common.js'));
    const entry = common.entry;
    expect(entry).toBeTruthy();
    const keys = Object.keys(entry);
    expect(keys).toContain('background');
    expect(keys.some((k) => k.includes('contentscripts/'))).toBe(true);
    expect(keys.some((k) => k.includes('injectscripts/'))).toBe(true);
    expect(keys.length).toBeGreaterThan(20);
  });

  it('points every entry at a file that exists', () => {
    const entry = require(path.join(ROOT, 'webpack.common.js')).entry;
    const missing = Object.entries(entry)
      .flatMap(([k, v]) => (Array.isArray(v) ? v : typeof v === 'string' ? [v] : [v.import]).flat().map((f) => [k, f]))
      .filter(([, f]) => typeof f === 'string' && !fs.existsSync(path.join(ROOT, f)))
      .map(([k, f]) => `${k} -> ${f}`);
    expect(missing).toEqual([]);
  });

  it('ships each configured module rule with a loader that is installed', () => {
    const common = require(path.join(ROOT, 'webpack.common.js'));
    const loaders = common.module.rules.flatMap((r) => [r.loader, ...(r.use || []).map((u) => (typeof u === 'string' ? u : u.loader))]).filter(Boolean);
    expect(loaders.length).toBeGreaterThan(2);
    for (const l of loaders) expect(() => require.resolve(l), l).not.toThrow();
  });

  it('keeps the production and development configs loadable', () => {
    for (const f of ['webpack.dev.js', 'webpack.prod.js']) {
      const cfg = require(path.join(ROOT, f));
      expect(cfg.mode, f).toMatch(/development|production/);
    }
  });
});

describe('extension manifest', () => {
  const manifest = readJson('static', 'manifest.json');

  it('is a Manifest V3 extension', () => {
    expect(manifest.manifest_version).toBe(3);
  });

  it('declares a service worker and content scripts', () => {
    expect(manifest.background?.service_worker).toBeTruthy();
    expect(manifest.content_scripts.length).toBeGreaterThan(0);
  });

  it('has no remote-code CSP escape hatches (MV3 forbids them)', () => {
    const csp = JSON.stringify(manifest.content_security_policy || {});
    expect(csp).not.toMatch(/unsafe-eval|unsafe-inline/);
  });
});
