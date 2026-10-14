const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { resolve, join } = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');
const repo = process.argv[2] || resolve(__dirname, '..');
const testFile = process.argv[3] || join(repo, 'tests/game-build-routes.test.mts');
const scratch = mkdtempSync(join(tmpdir(), 'duckmole-route-tests-'));
const env = Object.fromEntries(['SystemRoot','WINDIR','TEMP','TMP','USERPROFILE','COMSPEC','PATHEXT'].filter(key => process.env[key]).map(key => [key,process.env[key]]));
Object.assign(env, { NODE_ENV:'production', NEXT_TELEMETRY_DISABLED:'1', TSX_TSCONFIG_PATH:join(repo,'tsconfig.json'), DUCKMOLE_TEST_SOURCE_ROOT:repo, NODE_OPTIONS:`--require "${join(repo,'tests/deny-env-reads.cjs').replaceAll('\\','/')}"` });
try {
  const result = spawnSync(process.execPath, ['--import', pathToFileURL(join(repo,'node_modules/tsx/dist/loader.mjs')).href, '--experimental-test-module-mocks', '--test', '--test-concurrency=1', testFile], { cwd:scratch, env, stdio:'inherit', windowsHide:true });
  process.exitCode = result.status ?? 1;
} finally { rmSync(scratch, { recursive:true, force:true }); }
