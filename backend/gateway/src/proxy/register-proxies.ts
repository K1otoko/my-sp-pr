import type { ClientRequest, IncomingMessage } from 'node:http';
import type { Express } from 'express';
import { createProxyMiddleware, debugProxyErrorsPlugin, proxyEventsPlugin } from 'http-proxy-middleware';
import { authProtocolRoutes, expressPath, fullPath, serviceContracts, type Operation } from '../api/index.js';
import { env } from '../config/env.js';
import { upstreams } from '../config/upstreams.js';
import { proxyError } from './proxy-error.js';

type Transfer = {
  ended: boolean;
  clientIp: string;
  outgoing?: ClientRequest;
  incoming?: IncomingMessage;
  finish: () => void;
  cancel: () => void;
  fail: (timeout: boolean) => void;
};

export function registerProxies(app: Express) {
  for (const service of Object.values(serviceContracts)) {
    if (service.service === 'gateway') continue;
    const transfers = new WeakMap<IncomingMessage, Transfer>();
    const proxy = createProxyMiddleware({
      target: upstreams[service.service],
      changeOrigin: true,
      proxyTimeout: ['pr-auth', 'pr-admin'].includes(service.service)
        ? env.authFlowTimeoutMs : env.upstreamTimeoutMs,
      // 使用自定义错误响应；保留代理事件和底层 error 监听。
      ejectPlugins: true,
      plugins: [debugProxyErrorsPlugin, proxyEventsPlugin],
      on: {
        proxyReq(outgoing, request) {
          const transfer = transfers.get(request);
          if (!transfer || transfer.ended) {
            outgoing.destroy();
            return;
          }
          transfer.outgoing = outgoing;
          outgoing.once('timeout', () => transfer.fail(true));
          outgoing.setHeader('X-Request-Id', request.headers['x-request-id'] as string);
          if (service.service === 'pr-auth') {
            const publicOrigin = new URL(env.ssoOrigin);
            outgoing.setHeader('Host', publicOrigin.host);
            outgoing.setHeader('X-Forwarded-Host', publicOrigin.host);
            outgoing.setHeader('X-Forwarded-Proto', publicOrigin.protocol.slice(0, -1));
            outgoing.setHeader('X-Forwarded-For', transfer.clientIp);
          }
        },
        proxyRes(incoming, request) {
          const transfer = transfers.get(request);
          if (!transfer || transfer.ended) {
            incoming.destroy();
            return;
          }
          transfer.incoming = incoming;
          incoming.headers['x-request-id'] = request.headers['x-request-id'];
          // 浏览器跨域策略只由 gateway 配置。
          for (const key of Object.keys(incoming.headers)) {
            if (key.startsWith('access-control-')) delete incoming.headers[key];
          }
          incoming.once('aborted', () => transfer.fail(false));
          incoming.once('error', () => transfer.fail(false));
        },
        error(error, request) {
          const code = (error as NodeJS.ErrnoException).code;
          transfers.get(request)?.fail(code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT');
        },
      },
    });

    const routes = (Object.values(service.apiContract) as Operation[])
      .filter((operation) => operation.exposure === 'public')
      .map((operation) => ({
        method: operation.method,
        path: fullPath(service, operation),
        timeoutMs: ['completeAuthPortal', 'completeAdminAuthLogin'].includes(operation.operationId)
          ? env.authFlowTimeoutMs : env.upstreamTimeoutMs,
      }));
    if (service.service === 'pr-auth') {
      routes.push(...authProtocolRoutes.map(({ method, path }) => ({ method, path, timeoutMs: env.upstreamTimeoutMs })));
    }
    for (const operation of routes) {
      // 完整路径匹配，不挂载会截掉前缀的 Router，不修改 req.url 或 body。
      app[operation.method](expressPath(operation.path), (request, response, next) => {
        response.locals.targetService = service.service;
        const clear = () => {
          clearTimeout(timer);
          request.off('aborted', transfer.cancel);
          response.off('finish', transfer.finish);
          response.off('close', transfer.cancel);
        };
        const stop = () => {
          if (transfer.ended) return false;
          transfer.ended = true;
          clear();
          return true;
        };
        const destroyUpstream = () => {
          transfer.outgoing?.destroy();
          transfer.incoming?.destroy();
        };
        const transfer: Transfer = {
          ended: false,
          clientIp: String(response.locals.clientIp ?? request.socket.remoteAddress),
          finish() { stop(); },
          cancel() {
            if (!stop()) return;
            response.locals.errorCode = 'CLIENT_ABORTED';
            destroyUpstream();
          },
          fail(timeout) {
            if (!stop()) return;
            proxyError(response, timeout);
            destroyUpstream();
          },
        };
        const timer = setTimeout(() => transfer.fail(true), operation.timeoutMs);
        timer.unref();
        transfers.set(request, transfer);
        request.once('aborted', transfer.cancel);
        response.once('finish', transfer.finish);
        response.once('close', transfer.cancel);
        void Promise.resolve(proxy(request, response, next)).catch(() => transfer.fail(false));
      });
    }
  }
}
