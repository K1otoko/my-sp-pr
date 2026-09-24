import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { manifestWaves, parseDeployManifest } from './manifest.mjs';

const manifest = parseDeployManifest(await readFile(process.argv[2] ?? 'deploy.manifest.json', 'utf8'));
process.stdout.write(`[deploy-manifest] V${manifest.version} ${manifest.units.length} 个 unit 校验通过；依赖波次：${JSON.stringify(manifestWaves(manifest.units))}\n`);
