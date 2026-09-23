import process from 'node:process';

const state = process.argv[2];
const description = process.argv[3] ?? state;
if (!['queued', 'in_progress', 'success', 'failure', 'error', 'inactive'].includes(state)) {
  throw new Error('GitHub deployment status 无效');
}
const repository = process.env.GITHUB_REPOSITORY;
const deploymentId = process.env.GITHUB_DEPLOYMENT_ID;
const token = process.env.GITHUB_TOKEN;
if (!repository || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository)
  || !deploymentId || !/^[0-9]+$/u.test(deploymentId) || !token) {
  throw new Error('缺少 GitHub deployment status 参数');
}
const api = process.env.GITHUB_API_URL ?? 'https://api.github.com';
const logUrl = process.env.GITHUB_RUN_ID
  ? `${process.env.GITHUB_SERVER_URL ?? 'https://github.com'}/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`
  : undefined;
const response = await fetch(`${api}/repos/${repository}/deployments/${deploymentId}/statuses`, {
  method: 'POST',
  headers: {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': 'my-sp-pr-deploy',
    'X-GitHub-Api-Version': '2022-11-28',
  },
  body: JSON.stringify({
    state,
    description: description.slice(0, 140),
    log_url: logUrl,
    auto_inactive: state === 'success',
  }),
  signal: AbortSignal.timeout(10_000),
});
if (!response.ok) throw new Error(`GitHub deployment status 更新失败（HTTP ${response.status}）`);
console.log(`[deploy-status] ${state}`);
