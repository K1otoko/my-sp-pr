import { z } from 'zod';
import { AppError } from '../utils/app-error.js';

const relativePath = z.string().min(1).max(256).refine((value) => {
  const segments = value.split('/');
  return /^[A-Za-z0-9_./-]+$/u.test(value)
    && segments.every((segment) => segment !== '' && segment !== '..' && segment !== '.');
}, '必须是仓库内相对路径');
const healthPath = z.string().regex(/^\/[A-Za-z0-9_./-]*$/u).max(256)
  .refine((value) => !value.includes('//') && !value.split('/').some((part) => part === '.' || part === '..'));
const ref = z.string().regex(/^[A-Za-z0-9._/-]{1,255}$/u)
  .refine((value) => !value.includes('..') && !value.startsWith('/') && !value.endsWith('/'));
const unitId = z.string().regex(/^[a-z][a-z0-9-]{1,63}$/u);
const variableSchema = z.strictObject({
  name: z.string().regex(/^[A-Z][A-Z0-9_]{1,127}$/u),
  scope: z.enum(['build', 'runtime', 'migration']),
  required: z.boolean(),
  sensitive: z.boolean(),
  description: z.string().min(1).max(256),
});
const unitShape = {
  id: unitId,
  name: z.string().min(1).max(80),
  kind: z.enum(['frontend', 'service']),
  preset: z.enum(['pnpm-vite-static-v1', 'pnpm-node-service-v1']),
  packageName: z.string().regex(/^@[a-z0-9-]+\/[a-z0-9-]+$/u),
  packagePath: relativePath,
  artifactPath: relativePath,
  migration: z.boolean(),
  variables: z.array(variableSchema).max(100),
};
const v1Unit = z.strictObject({
  ...unitShape, defaultRef: ref, healthPath, internalReadyPath: healthPath.optional(),
}).transform((unit) => ({
  ...unit,
  targetRole: unit.kind === 'frontend' ? 'frontend' as const : 'backend' as const,
  dependencies: [] as string[],
  migrationPaths: unit.migration ? [`${unit.packagePath}/drizzle`] : [],
  health: { publicPath: unit.healthPath, internalReadyPath: unit.internalReadyPath },
}));
const v2Unit = z.strictObject({
  ...unitShape,
  defaultRef: ref.optional(),
  targetRole: z.enum(['frontend', 'backend']),
  dependencies: z.array(unitId).max(100),
  migrationPaths: z.array(relativePath).max(100),
  health: z.strictObject({ publicPath: healthPath, internalReadyPath: healthPath.optional() }),
}).transform((unit) => ({
  ...unit, healthPath: unit.health.publicPath, internalReadyPath: unit.health.internalReadyPath,
}));
const manifestSchema = z.union([
  z.strictObject({ version: z.literal(1), units: z.array(v1Unit).min(1).max(100) }),
  z.strictObject({ version: z.literal(2), units: z.array(v2Unit).min(1).max(100) }),
]).superRefine((manifest, context) => {
  const ids = new Set(manifest.units.map((unit) => unit.id));
  const invalid = (message: string) => context.addIssue({ code: 'custom', path: ['units'], message });
  if (ids.size !== manifest.units.length) invalid('unit ID 不能重复');
  for (const unit of manifest.units) {
    const expectedPreset = unit.kind === 'frontend' ? 'pnpm-vite-static-v1' : 'pnpm-node-service-v1';
    if (unit.preset !== expectedPreset) invalid('项目类型与 preset 不匹配');
    if (unit.kind === 'frontend' && (unit.migration || unit.internalReadyPath)) {
      invalid('前端项目不能声明迁移或内部就绪路径');
    }
    if (unit.variables.some((variable) => variable.scope === 'build' && variable.sensitive)) {
      invalid('构建变量不能声明为敏感值');
    }
    const names = unit.variables.map((variable) => variable.name);
    if (new Set(names).size !== names.length) invalid('环境变量名称不能重复');
    if (unit.targetRole !== (unit.kind === 'frontend' ? 'frontend' : 'backend')) invalid('targetRole 不匹配');
    if (unit.migration !== (unit.migrationPaths.length > 0)) invalid('migrationPaths 与迁移能力不匹配');
    if (new Set(unit.migrationPaths).size !== unit.migrationPaths.length) invalid('迁移路径重复');
    if (new Set(unit.dependencies).size !== unit.dependencies.length
      || unit.dependencies.some((id) => !ids.has(id))) invalid('依赖重复或不存在');
  }
  try { manifestWaves(manifest.units); } catch { invalid('依赖不能包含环'); }
});

export function manifestWaves(units: { id: string; dependencies: string[] }[]): string[][] {
  const completed = new Set<string>();
  const waves: string[][] = [];
  while (completed.size < units.length) {
    const wave = units.filter((unit) => !completed.has(unit.id)
      && unit.dependencies.every((id) => completed.has(id))).map((unit) => unit.id);
    if (!wave.length) throw new Error('依赖环或未知依赖');
    waves.push(wave);
    wave.forEach((id) => completed.add(id));
  }
  return waves;
}

export type DeployManifest = z.infer<typeof manifestSchema>;
export type DeployManifestUnit = DeployManifest['units'][number];

export function parseDeployManifest(source: string): DeployManifest {
  try {
    return manifestSchema.parse(JSON.parse(source));
  } catch {
    throw new AppError(422, 'MANIFEST_INVALID', 'deploy.manifest.json 格式无效');
  }
}
