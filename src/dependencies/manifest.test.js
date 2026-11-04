import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, pkg, lock, installedVersion, satisfies, bareImports, packageName } from './helpers.js';

const declared = () => ({ ...pkg().dependencies, ...pkg().devDependencies });

describe('satisfies() helper (guards the guard)', () => {
  it.each([
    ['1.2.3', '^1.0.0', true],
    ['2.0.0', '^1.9.0', false],
    ['1.0.0', '^1.2.0', false],
    ['0.5.9', '^0.5.5', true],
    ['0.6.0', '^0.5.5', false],
    ['0.0.4', '^0.0.3', false],
    ['6.0.9', '~6.0.3', true],
    ['6.1.0', '~6.0.3', false],
    ['0.0.9', '0.0.9', true],
    ['0.0.10', '0.0.9', false],
    ['5.3.8', 'npm:bootstrap@^5.3.8', true],
  ])('%s vs %s -> %s', (version, range, expected) => {
    expect(satisfies(version, range)).toBe(expected);
  });

  it('returns null for ranges it cannot judge', () => {
    expect(satisfies('1.0.0', 'git+https://github.com/x/y.git')).toBeNull();
    expect(satisfies('1.0.0', 'latest')).toBeNull();
  });
});

describe('package.json', () => {
  it('has no package in both dependencies and devDependencies', () => {
    const both = Object.keys(pkg().dependencies).filter((n) => n in pkg().devDependencies);
    expect(both).toEqual([]);
  });

  it('declares a runnable test script', () => {
    expect(pkg().scripts.test).toMatch(/vitest/);
  });
});

describe('installed packages', () => {
  it('has every declared dependency installed', () => {
    const missing = Object.keys(declared()).filter((n) => installedVersion(n) === null);
    expect(missing).toEqual([]);
  });

  it('has each installed version inside the declared range', () => {
    const outside = [];
    for (const [name, range] of Object.entries(declared())) {
      const v = installedVersion(name);
      if (v && satisfies(v, range) === false) outside.push(`${name}@${v} !~ ${range}`);
    }
    expect(outside).toEqual([]);
  });
});

describe('package-lock.json', () => {
  it('declares the same root dependencies as package.json (lockfile is in sync)', () => {
    const root = lock().packages[''];
    expect(root.dependencies).toEqual(pkg().dependencies);
    expect(root.devDependencies).toEqual(pkg().devDependencies);
  });

  it('locks a version inside the declared range for every direct dependency', () => {
    const outside = [];
    for (const [name, range] of Object.entries(declared())) {
      const entry = lock().packages[`node_modules/${name}`];
      if (!entry) {
        outside.push(`${name}: not locked`);
        continue;
      }
      if (satisfies(entry.version, range) === false) outside.push(`${name}@${entry.version} !~ ${range}`);
    }
    expect(outside).toEqual([]);
  });

  it('matches the installed version for every direct dependency', () => {
    const drift = [];
    for (const name of Object.keys(declared())) {
      const entry = lock().packages[`node_modules/${name}`];
      const v = installedVersion(name);
      if (entry && v && entry.version !== v) drift.push(`${name}: lock ${entry.version} vs installed ${v}`);
    }
    expect(drift).toEqual([]);
  });

  it('keeps a single copy of libraries that must be singletons (plugins patch the shared instance)', () => {
    const keys = Object.keys(lock().packages);
    const copies = (name) => keys.filter((k) => k === `node_modules/${name}` || k.endsWith(`/node_modules/${name}`));
    for (const name of ['leaflet', 'knockout', 'jquery', 'moment', 'd3', 'dc']) {
      expect(copies(name), name).toHaveLength(1);
    }
  });

  it('keeps a single major version of d3 (dc.js crashes on mixed d3 majors, see CLAUDE.md)', () => {
    const d3 = lock().packages['node_modules/d3'];
    expect(d3.version.split('.')[0]).toBe('7');
    const nested = Object.keys(lock().packages).filter((k) => /node_modules\/dc\/node_modules\/d3$/.test(k));
    expect(nested).toEqual([]);
  });

  it('only resolves from the npm registry, apart from the one known git dependency', () => {
    const odd = Object.entries(lock().packages)
      .filter(([k, v]) => k && v.resolved && !v.resolved.startsWith('https://registry.npmjs.org/'))
      .map(([k]) => k);
    expect(odd).toEqual(['node_modules/leaflet-fullscreen']);
  });

  it('pins the git dependency to a commit rather than a moving branch', () => {
    expect(lock().packages['node_modules/leaflet-fullscreen'].resolved).toMatch(/#[0-9a-f]{40}$/);
  });

  it('has integrity hashes for registry packages', () => {
    const missing = Object.entries(lock().packages)
      .filter(([k, v]) => k && v.resolved?.startsWith('https://registry.npmjs.org/') && !v.integrity)
      .map(([k]) => k);
    expect(missing).toEqual([]);
  });
});

describe('imports in src/', () => {
  const imports = bareImports();

  it('finds the imports (guards the scanner)', () => {
    expect(imports.size).toBeGreaterThan(20);
    expect(imports.has('knockout')).toBe(true);
    expect(imports.has('leaflet')).toBe(true);
  });

  it('only imports packages that are declared in package.json', () => {
    const names = new Set(Object.keys(declared()));
    const undeclared = [...imports].filter(([spec]) => !names.has(packageName(spec))).map(([spec, where]) => `${spec} (${where})`);
    expect(undeclared).toEqual([]);
  });

  it('only imports files that exist in node_modules', () => {
    const missing = [];
    for (const [spec, where] of imports) {
      const base = path.join(ROOT, 'node_modules', spec);
      const exists = ['', '.js', '/index.js', '/package.json'].some((ext) => fs.existsSync(base + ext) && fs.statSync(base + ext).isFile());
      if (!exists) missing.push(`${spec} (${where})`);
    }
    expect(missing).toEqual([]);
  });

  it('has no runtime dependency that nothing imports (unused leftovers)', () => {
    const used = new Set([...imports.keys()].map(packageName));
    // Used outside src/ imports: build tooling, CSS, or by webpack aliases / other packages.
    const allowed = new Set(['@babel/runtime', '@fontsource-variable/atkinson-hyperlegible-next', '@fortawesome/fontawesome-free', 'fontawesome7', 'leaflet-geosearch', 'leaflet-fullscreen', 'leaflet-routing-machine', 'leaflet.measure', 'nunjucks', 'remove', 'bootstrap', 'esri-leaflet-vector']);
    const unused = Object.keys(pkg().dependencies).filter((n) => !used.has(n) && !allowed.has(n));
    expect(unused).toEqual([]);
  });
});

describe('webpack config', () => {
  it('has alias targets that exist in node_modules', () => {
    for (const rel of ['node_modules/leaflet-geosearch/lib', 'node_modules/leaflet-geosearch/dist/geosearch.css']) {
      expect(fs.existsSync(path.join(ROOT, rel)), rel).toBe(true);
    }
  });
});
