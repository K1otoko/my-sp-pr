import { z } from 'zod';
import { AppError } from '../utils/app-error.js';

const relativePath = z.string().min(1).max(256).refine((value) => {
  const segments = value.split('/');
  return !value.startsWith('/') && !value.includes('\\') && !segments.includes('..') && !segments.includes('.');
}, '必须是仓库内相对路径');
const variableSchema = z.strictObject({
  name: z.string().regex(/^[A-Z][A-Z0-9_]{1,127}$/u),
  scope: z.enum(['build', 'runtime', 'migration']),
  required: z.boolean(),
  sensitive: z.boolean(),
  description: z.string().min(1).max(256),
});
const unitSchema = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9-]{1,63}$/u),
  name: z.string().min(1).max(80),
  kind: z.enum(['frontend', 'service']),
  preset: z.enum(['pnpm-vite-static-v1', 'pnpm-node-service-v1']),
  packageName: z.string().regex(/^@[a-z0-9-]+\/[a-z0-9-]+$/u),
  packagePath: relativePath,
  artifactPath: relativePath,
  defaultRef: z.string().min(1).max(255),
  migration: z.boolean(),
  healthPath: z.string().startsWith('/').max(256),
  internalReadyPath: z.string().startsWith('/').max(256).optional(),
  variables: z.array(variableSchema).max(100),
}).superRefine((unit, context) => {
  const expectedPreset = unit.kind === 'frontend' ? 'pnpm-vite-static-v1' : 'pnpm-node-service-v1';
  if (unit.preset !== expectedPreset) {
    context.addIssue({ code: 'custom', path: ['preset'], message: '项目类型与 preset 不匹配' });
  }
  if (unit.kind === 'frontend' && (unit.migration || unit.internalReadyPath)) {
    context.addIssue({ code: 'custom', path: ['migration'], message: '前端项目不能声明迁移或内部就绪路径' });
  }
  if (unit.variables.some((variable) => variable.scope === 'build' && variable.sensitive)) {
    context.addIssue({ code: 'custom', path: ['variables'], message: '构建变量会进入客户端制品，不能声明为敏感值' });
  }
  const names = unit.variables.map((variable) => variable.name);
  if (new Set(names).size !== names.length) {
    context.addIssue({ code: 'custom', path: ['variables'], message: '环境变量名称不能重复' });
  }
});
const manifestSchema = z.strictObject({
  version: z.literal(1),
  units: z.array(unitSchema).min(1).max(100),
}).superRefine((manifest, context) => {
  const ids = manifest.units.map((unit) => unit.id);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: 'custom', path: ['units'], message: 'unit ID 不能重复' });
  }
});

export type DeployManifest = z.infer<typeof manifestSchema>;
export type DeployManifestUnit = z.infer<typeof unitSchema>;

export function parseDeployManifest(source: string): DeployManifest {
  try {
    return manifestSchema.parse(JSON.parse(source));
  } catch {
    throw new AppError(422, 'MANIFEST_INVALID', 'deploy.manifest.json 格式无效');
  }
}
