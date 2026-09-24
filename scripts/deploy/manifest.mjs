// Dependency-free runner parser. Keep acceptance/normalization in parity with the Admin parser.
function check(condition) {
  if (!condition) throw new Error('deploy.manifest.json 格式无效');
}
function object(value, keys) {
  check(value && typeof value === 'object' && !Array.isArray(value));
  check(Object.keys(value).every((key) => keys.includes(key)));
}
function text(value, max, pattern) {
  check(typeof value === 'string' && value.length > 0 && value.length <= max);
  if (pattern) check(pattern.test(value));
}
function list(value, max = 100) {
  check(Array.isArray(value) && value.length <= max);
}
function relativePath(value) {
  text(value, 256, /^[A-Za-z0-9_./-]+$/u);
  check(value.split('/').every((part) => part !== '' && part !== '.' && part !== '..'));
}
function healthPath(value) {
  text(value, 256, /^\/[A-Za-z0-9_./-]*$/u);
  check(!value.includes('//') && !value.split('/').some((part) => part === '.' || part === '..'));
}
function ref(value) {
  text(value, 255, /^[A-Za-z0-9._/-]+$/u);
  check(!value.includes('..') && !value.startsWith('/') && !value.endsWith('/'));
}
const idPattern = /^[a-z][a-z0-9-]{1,63}$/u;

export function manifestWaves(units) {
  const completed = new Set();
  const waves = [];
  while (completed.size < units.length) {
    const wave = units.filter((unit) => !completed.has(unit.id)
      && unit.dependencies.every((id) => completed.has(id))).map((unit) => unit.id);
    check(wave.length > 0);
    waves.push(wave);
    wave.forEach((id) => completed.add(id));
  }
  return waves;
}

export function parseDeployManifest(source) {
  const manifest = JSON.parse(source);
  object(manifest, ['version', 'units']);
  check(manifest.version === 1 || manifest.version === 2);
  list(manifest.units);
  check(manifest.units.length > 0);
  const units = manifest.units.map((unit) => {
    object(unit, [
      'id', 'name', 'kind', 'preset', 'packageName', 'packagePath', 'artifactPath', 'defaultRef', 'migration', 'variables',
      ...(manifest.version === 1 ? ['healthPath', 'internalReadyPath']
        : ['targetRole', 'dependencies', 'migrationPaths', 'health']),
    ]);
    text(unit.id, 64, idPattern);
    text(unit.name, 80);
    check(['frontend', 'service'].includes(unit.kind));
    check(unit.preset === (unit.kind === 'frontend' ? 'pnpm-vite-static-v1' : 'pnpm-node-service-v1'));
    text(unit.packageName, Infinity, /^@[a-z0-9-]+\/[a-z0-9-]+$/u);
    relativePath(unit.packagePath);
    relativePath(unit.artifactPath);
    if (manifest.version === 1 || unit.defaultRef !== undefined) ref(unit.defaultRef);
    check(typeof unit.migration === 'boolean');
    list(unit.variables);
    for (const variable of unit.variables) {
      object(variable, ['name', 'scope', 'required', 'sensitive', 'description']);
      text(variable.name, 128, /^[A-Z][A-Z0-9_]{1,127}$/u);
      text(variable.description, 256);
      check(['build', 'runtime', 'migration'].includes(variable.scope));
      check(typeof variable.required === 'boolean' && typeof variable.sensitive === 'boolean');
      check(variable.scope !== 'build' || !variable.sensitive);
    }
    check(new Set(unit.variables.map((variable) => variable.name)).size === unit.variables.length);
    let normalized;
    if (manifest.version === 1) {
      normalized = {
        ...unit,
        targetRole: unit.kind === 'frontend' ? 'frontend' : 'backend',
        dependencies: [],
        migrationPaths: unit.migration ? [`${unit.packagePath}/drizzle`] : [],
        health: { publicPath: unit.healthPath, internalReadyPath: unit.internalReadyPath },
      };
    } else {
      object(unit.health, ['publicPath', 'internalReadyPath']);
      list(unit.dependencies);
      unit.dependencies.forEach((id) => text(id, 64, idPattern));
      list(unit.migrationPaths);
      unit.migrationPaths.forEach(relativePath);
      normalized = { ...unit, healthPath: unit.health.publicPath, internalReadyPath: unit.health.internalReadyPath };
    }
    healthPath(normalized.healthPath);
    if (normalized.internalReadyPath !== undefined) healthPath(normalized.internalReadyPath);
    check(normalized.targetRole === (unit.kind === 'frontend' ? 'frontend' : 'backend'));
    check(unit.kind !== 'frontend' || (!unit.migration && !normalized.internalReadyPath));
    check(unit.migration === (normalized.migrationPaths.length > 0));
    check(new Set(normalized.migrationPaths).size === normalized.migrationPaths.length);
    check(new Set(normalized.dependencies).size === normalized.dependencies.length);
    return normalized;
  });
  const ids = new Set(units.map((unit) => unit.id));
  check(ids.size === units.length);
  check(units.every((unit) => unit.dependencies.every((id) => ids.has(id))));
  manifestWaves(units);
  return { version: manifest.version, units };
}
