import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { manifestWaves, parseDeployManifest } from '../deploy/manifest.js';

export async function verifyManifest(root: string) {
  // Dynamic import keeps the portable runner module out of the backend compilation boundary.
  const portable = await import(pathToFileURL(`${root}/scripts/deploy/manifest.mjs`).href) as {
    parseDeployManifest: (source: string) => unknown;
  };
  const source = await readFile(`${root}/deploy.manifest.json`, 'utf8');
  const valid = JSON.parse(source);
  const v1 = {
    version: 1,
    units: valid.units.map((unit: Record<string, unknown>) => {
      const rest = { ...unit };
      const paths = rest.health as { publicPath: string; internalReadyPath?: string };
      for (const key of ['targetRole', 'dependencies', 'migrationPaths', 'health']) delete rest[key];
      return { ...rest, defaultRef: 'master', healthPath: paths.publicPath, internalReadyPath: paths.internalReadyPath };
    }),
  };
  for (const input of [valid, v1]) {
    const text = JSON.stringify(input);
    assert.deepEqual(JSON.parse(JSON.stringify(parseDeployManifest(text))),
      JSON.parse(JSON.stringify(portable.parseDeployManifest(text))));
  }
  const mutate = (update: (input: typeof valid) => void) => {
    const input = structuredClone(valid);
    update(input);
    const text = JSON.stringify(input);
    assert.throws(() => parseDeployManifest(text));
    assert.throws(() => portable.parseDeployManifest(text));
  };
  for (const packagePath of ['/abs', '../outside', 'a/../b', './a', 'a//b', 'a/', 'a\\b', 'C:/root']) {
    mutate((input) => { input.units[0].packagePath = packagePath; });
  }
  mutate((input) => { input.units.push(input.units[0]); });
  mutate((input) => { input.units[0].dependencies = ['unknown']; });
  mutate((input) => { input.units[0].dependencies = [input.units[0].id]; });
  mutate((input) => { input.units[0].dependencies = ['gateway', 'gateway']; });
  mutate((input) => { input.units[3].dependencies = ['pr-chat-web']; });
  mutate((input) => { input.units[0].targetRole = 'backend'; });
  mutate((input) => { input.units[0].preset = 'shell'; });
  mutate((input) => { input.units[0].command = 'anything'; });
  mutate((input) => { input.units[4].migrationPaths = []; });
  mutate((input) => { input.units[0].variables[0].sensitive = true; });
  mutate((input) => { input.units[0].variables.push(input.units[0].variables[0]); });
  mutate((input) => { input.units[0].health.publicPath = '//foreign'; });
  mutate((input) => { input.units[0].defaultRef = '../master'; });
  assert.deepEqual(manifestWaves(parseDeployManifest(source).units), [
    ['pr-chat-api', 'pr-auth-api', 'pr-admin-api'], ['gateway'], ['pr-chat-web', 'pr-admin-web', 'pr-sso-web'],
  ]);
  console.log('[admin-verify] PASS V1/V2 parser parity, paths, presets, variables, dependencies and three-wave DAG.');
}
