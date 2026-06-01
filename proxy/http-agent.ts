import http from 'http';
import https from 'https';
import fetch, { RequestInfo, RequestInit, Response } from 'node-fetch';

/**
 * Persistent keepalive HTTP(S) agents for all backend (lomod) requests.
 *
 * Without keepalive, node-fetch opens a fresh TCP (and TLS, for https) connection
 * per request. When browsing a timeline the proxy fires thousands of tiny thumbnail
 * requests at the backend; in remote mode the per-request handshake dominates total
 * latency. Reusing sockets removes that overhead.
 *
 * Agent selection is by URL protocol only, so this works identically for local
 * (`http://localhost:8000`) and remote (`http(s)://…`) backends — no hardcoded host.
 */
const MAX_SOCKETS = (() => {
  const parsed = Number(process.env.LOMO_MAX_SOCKETS);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 64;
})();

export const httpAgent = new http.Agent({ keepAlive: true, keepAliveMsecs: 30_000, maxSockets: MAX_SOCKETS });
export const httpsAgent = new https.Agent({ keepAlive: true, keepAliveMsecs: 30_000, maxSockets: MAX_SOCKETS });

function agentFor(parsedUrl: URL): http.Agent {
  return parsedUrl.protocol === 'https:' ? httpsAgent : httpAgent;
}

/**
 * Drop-in replacement for node-fetch that reuses keepalive sockets.
 * Callers may still override `agent` via init if ever needed.
 */
export function lomoFetch(url: RequestInfo, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { agent: agentFor, ...init });
}
