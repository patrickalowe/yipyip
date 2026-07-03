/**
 * The isolated plugin child bootstrap (#plugins, M1).
 *
 * Runs as a forked node process (`dist/nest/plugins/runtime/plugin-host-entry.js`)
 * with a scrubbed env — NO JWT_SECRET, NO db path, NO inherited process.env. It
 * loads the plugin's own code and turns every ctx call into an RPC message to
 * the parent, which is the only side holding real capabilities.
 *
 * MUST NOT import any privileged server module (db, config, websocket). Its only
 * imports are the pure protocol + SDK.
 */

import path from 'node:path';
import net from 'node:net';
import { createRequire } from 'node:module';
import { createPluginContext, type ChildTransport, type PluginContext, type PluginDefinition } from './plugin-sdk';
import type { Envelope, RpcError } from '../protocol/envelope';

const pluginId = process.argv[2] || process.env.TREK_PLUGIN_ID || 'unknown';
const pluginDir = process.argv[3] || '';

let pluginConfig: Record<string, unknown> = {};

const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
let seq = 0;

function send(msg: Envelope): void {
  process.send?.(msg);
}

const transport: ChildTransport = {
  rpc(method, params) {
    return new Promise((resolve, reject) => {
      const id = `${++seq}`;
      pending.set(id, { resolve, reject });
      send({ k: 'req', id, method, params });
    });
  },
  emit(topic, data) {
    send({ k: 'evt', topic, data });
  },
};

let def: PluginDefinition | null = null;
let ctx: PluginContext | null = null;

async function boot(config: Record<string, unknown>): Promise<void> {
  try {
    // createRequire works whether this bootstrap runs as CJS (prod dist) or ESM
    // (tsx in tests), so `require` being undefined in ESM never bites us.
    const entry = path.join(pluginDir, 'server', 'index.js');
    const requirePlugin = createRequire(entry);
    const mod = requirePlugin(entry);
    def = mod && mod.default ? (mod.default as PluginDefinition) : (mod as PluginDefinition);
    ctx = createPluginContext(pluginId, config, transport);
    if (typeof def.onLoad === 'function') await def.onLoad(ctx);
    // Report the declared routes (with their index = routeId) and job ids so the
    // host can proxy HTTP and schedule jobs without re-parsing the manifest.
    const routes = (def.routes ?? []).map((r, i) => ({ i, method: r.method, path: r.path, auth: r.auth !== false }));
    const jobs = (def.jobs ?? []).map((j) => j.id);
    send({ k: 'evt', topic: 'loaded', data: { routes, jobs } });
    // An immediate first heartbeat confirms liveness without waiting a full interval.
    send({ k: 'evt', topic: 'heartbeat', data: { rss: process.memoryUsage().rss } });
  } catch (e) {
    send({ k: 'evt', topic: 'load-error', data: { message: errMsg(e), stack: errStack(e) } });
  }
}

/** Handle a host→child request: run a declared route or job with the plugin ctx. */
async function handleInvoke(req: { id: string; method: string; params: Record<string, unknown> }): Promise<void> {
  const respond = (ok: boolean, payload: unknown) =>
    send(
      ok
        ? { k: 'res', id: req.id, ok: true, result: payload }
        : { k: 'res', id: req.id, ok: false, error: { code: 'PLUGIN_ERROR', message: String(payload) } },
    );
  try {
    if (!def || !ctx) throw new Error('plugin not loaded');
    // A per-invocation ctx tagged with this invoke's id, so the host binds trip
    // reads to the invocation's authenticated user (routes) / refuses them (jobs).
    const invCtx = createPluginContext(pluginId, pluginConfig, transport, req.id);
    if (req.method === 'invoke.route') {
      const routeId = req.params.routeId as number;
      const route = def.routes?.[routeId];
      if (!route) throw new Error(`no route ${routeId}`);
      const pluginReq = req.params.req as Parameters<NonNullable<typeof route.handler>>[0];
      const result = await route.handler(pluginReq, invCtx);
      respond(true, result);
    } else if (req.method === 'invoke.job') {
      const jobId = req.params.jobId as string;
      const job = def.jobs?.find((j) => j.id === jobId);
      if (!job) throw new Error(`no job ${jobId}`);
      await job.handler(invCtx);
      respond(true, { ok: true });
    } else {
      respond(false, `unknown invoke ${req.method}`);
    }
  } catch (e) {
    respond(false, errMsg(e));
  }
}

async function shutdown(): Promise<void> {
  try {
    if (def && typeof def.onUnload === 'function' && ctx) await def.onUnload(ctx);
  } catch {
    /* best effort */
  }
  clearInterval(heartbeat);
  process.exit(0);
}

process.on('message', (raw: unknown) => {
  const msg = raw as Envelope;
  if (!msg || typeof msg !== 'object') return;
  if (msg.k === 'req') {
    // A host→child invoke (route / job).
    void handleInvoke({ id: msg.id, method: msg.method, params: (msg.params ?? {}) as Record<string, unknown> });
    return;
  }
  if (msg.k === 'res') {
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.ok) {
      p.resolve(msg.result);
    } else {
      const em = (msg as RpcError).error;
      p.reject(new Error(`${em.code}: ${em.message}`));
    }
    return;
  }
  if (msg.k === 'evt') {
    if (msg.topic === 'init') {
      const d = msg.data as { config?: Record<string, unknown>; egress?: string[] };
      pluginConfig = d.config ?? {};
      installEgressGuard(d.egress ?? []);
      void boot(pluginConfig);
    } else if (msg.topic === 'shutdown') void shutdown();
  }
});

/**
 * Restrict the plugin's outbound network to its declared egress hosts. With no
 * declared egress, ALL outbound is blocked. Wildcards like `*.host` match any
 * subdomain.
 *
 * Two layers, so a plugin can't just sidestep `fetch` with a raw socket:
 *  1. `globalThis.fetch` is wrapped (undici path).
 *  2. `net.Socket.prototype.connect` is wrapped — the single TCP choke point that
 *     node:http / node:https / node:net / node:tls all funnel through — so
 *     `require('node:https').request(...)` is subject to the same allowlist.
 * Under the OS permission model the child also cannot spawn a fresh process or
 * load a native addon to escape these wrappers. This is strong defense in depth;
 * a kernel/network-namespace guarantee still belongs to the container runtime.
 */
function installEgressGuard(egress: string[]): void {
  const patterns = egress.map((h) => h.trim().toLowerCase()).filter(Boolean);
  const allowed = (hostname: string): boolean => {
    const h = hostname.toLowerCase();
    return patterns.some((p) => (p.startsWith('*.') ? h === p.slice(2) || h.endsWith(p.slice(1)) : h === p));
  };

  const realFetch = globalThis.fetch;
  if (typeof realFetch === 'function') {
    globalThis.fetch = ((input: unknown, init?: unknown) => {
      const url = typeof input === 'string' ? input : (input as { url?: string })?.url ?? String(input);
      let host: string;
      try {
        host = new URL(url).hostname;
      } catch {
        return Promise.reject(new Error('egress: invalid url'));
      }
      if (!allowed(host)) return Promise.reject(new Error(`egress: ${host} is not in the plugin's declared hosts`));
      return (realFetch as (i: unknown, n: unknown) => Promise<unknown>)(input, init);
    }) as typeof fetch;
  }

  // TCP choke point: http/https/net/tls all end up here. A unix-socket (path)
  // connect is local IPC, not network egress, so it's left alone.
  const proto = net.Socket.prototype as unknown as { connect: (...a: unknown[]) => unknown };
  const realConnect = proto.connect;
  proto.connect = function (this: unknown, ...args: unknown[]): unknown {
    const first = args[0];
    let host: string | undefined;
    if (first && typeof first === 'object') {
      const o = first as { host?: string; path?: string };
      if (o.path) return realConnect.apply(this, args); // unix socket — local
      host = o.host ?? 'localhost';
    } else if (typeof first === 'number' || typeof first === 'string') {
      // connect(port[, host]) — a numeric-only path connects to localhost.
      host = typeof args[1] === 'string' ? (args[1] as string) : 'localhost';
    }
    if (host && !allowed(host)) {
      throw new Error(`egress: ${host} is not in the plugin's declared hosts`);
    }
    return realConnect.apply(this, args);
  };
}

// Ask the host for the init payload (instance config), then wait for it.
send({ k: 'evt', topic: 'hello', data: {} });

// Liveness — unref so it never keeps the process alive on its own.
const heartbeat = setInterval(() => {
  send({ k: 'evt', topic: 'heartbeat', data: { rss: process.memoryUsage().rss } });
}, 5000);
heartbeat.unref?.();

// A plugin that throws asynchronously must not take the host down — it only
// crashes THIS child, which the supervisor detects and restarts/disables.
process.on('uncaughtException', (e) => {
  send({ k: 'evt', topic: 'load-error', data: { message: errMsg(e), stack: errStack(e) } });
  process.exit(1);
});
process.on('unhandledRejection', (e) => {
  send({ k: 'evt', topic: 'load-error', data: { message: errMsg(e), stack: errStack(e) } });
  process.exit(1);
});

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
function errStack(e: unknown): string | undefined {
  return e instanceof Error ? e.stack : undefined;
}
