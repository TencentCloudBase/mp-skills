#!/usr/bin/env node
/**
 * Zero-dependency bundler for mp-skills
 * Bundles ALL dependencies (commander, enquirer, nanospinner, etc.) into dist/cli.js
 * so the published npm package has NO runtime dependencies.
 *
 * Only Node.js built-in modules and packages with native deps are externalized.
 */

// ── 第 1 步：生成内联模板数据 ──
await import('./gen-templates.mjs');

// ── 第 2 步：生成内联官方 skill 数据（ALL IN ONE，避免运行时 git clone）──
try {
  await import('./gen-skills-data.mjs');
} catch (err) {
  console.warn('  ! 生成内联 skill 数据失败（跳过，运行时将回退到 git clone）:', err.message);
}

// 格式化生成的模板数据（确保 CI format:check 通过）
import { execSync } from 'node:child_process';
try {
  execSync('npx prettier --write src/lib/templates-data.ts src/lib/skills-data.ts', { stdio: 'ignore', timeout: 30000 });
} catch {
  // prettier 不可用时忽略
}

import * as esbuild from 'esbuild';

// Node.js built-ins — these CANNOT be bundled and must stay external
const NODE_BUILTINS = [
  'fs',
  'path',
  'os',
  'url',
  'child_process',
  'util',
  'stream',
  'events',
  'http',
  'https',
  'crypto',
  'buffer',
  'tty',
  'readline',
  'module',
  'constants',
  'assert',
  'dns',
  'net',
  'tls',
  'zlib',
  'querystring',
];

// Transitive optional deps that won't be called at runtime
const UNREACHABLE_EXTERNALS = [
  '@aws-sdk/client-s3',
  '@aws-sdk/credential-providers',
];

const externals = [...NODE_BUILTINS, ...UNREACHABLE_EXTERNALS];

await esbuild.build({
  entryPoints: ['src/cli.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  outfile: 'dist/cli.cjs',
  external: externals,
  banner: {
    js: `#!/usr/bin/env node --no-deprecation
// Shim import.meta.url for CJS — esbuild replaces the reference at build time.
// __filename is the absolute path to the bundled file, so "file://" + __filename
// produces a valid file URL that createRequire() and fileURLToPath() can consume.
var __import_meta_url__ = "file://" + __filename;`,
  },
  // esbuild define replaces import.meta.url with the variable defined in the banner
  define: {
    'import.meta.url': '__import_meta_url__',
  },
  minify: true,
  sourcemap: false,
  legalComments: 'none',
  treeShaking: true,
});

console.log('* dist/cli.cjs bundled (zero-dependency)');
