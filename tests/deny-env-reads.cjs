// Test/build preloader: fail before any library can read a real .env file.
const fs = require('node:fs');
const { syncBuiltinESMExports } = require('node:module');
const guard = (path) => { if (/(?:^|[\\/])\.env[^\\/]*$/i.test(String(path))) throw new Error('Environment-file reads are disabled in this isolated check.'); };
for (const name of ['readFileSync','readFile','createReadStream','openSync','open']) {
  const original = fs[name];
  fs[name] = function(path, ...args) { guard(path); return original.call(this,path,...args); };
}
for (const name of ['readFile','open']) {
  const original = fs.promises[name];
  fs.promises[name] = async function(path, ...args) { guard(path); return original.call(this,path,...args); };
}
syncBuiltinESMExports();
