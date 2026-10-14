// Copy only the release source, never local secrets, caches, or unrelated files.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const destination = path.join(root, '.release-preflight', `source-${Date.now()}`);
const inputs = ['src', 'workers', 'prisma', 'public', 'tests', 'scripts', 'game-exports',
  'package.json', 'package-lock.json', 'next.config.mjs', 'next-env.d.ts',
  'tsconfig.json', 'tailwind.config.ts', 'postcss.config.mjs'];
fs.mkdirSync(destination, { recursive: true });
const manifest = [];
function copy(source, target) {
  const stat = fs.lstatSync(source);
  if (stat.isSymbolicLink()) throw new Error('Release sources must not contain links.');
  if (stat.isDirectory()) {
    fs.mkdirSync(target, { recursive: true });
    for (const name of fs.readdirSync(source)) copy(path.join(source, name), path.join(target, name));
    return;
  }
  if (!stat.isFile() || /^\.env/i.test(path.basename(source))) throw new Error('Excluded release input.');
  fs.copyFileSync(source, target);
  const bytes = fs.readFileSync(source);
  manifest.push({ path: path.relative(root, source).replaceAll('\\', '/'),
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length });
}
for (const name of inputs) copy(path.join(root, name), path.join(destination, name));
fs.writeFileSync(path.join(destination, 'source-manifest.json'), JSON.stringify(manifest, null, 2));
console.log(destination);
