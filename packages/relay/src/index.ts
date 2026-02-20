/**
 * Cloudflare Worker entry point for the Claude on Mobile relay.
 *
 * Responsibilities:
 *  - Upgrade WebSocket connections and route them to the AgentRegistry
 *    Durable Object (singleton "relay").
 *  - Serve a /health endpoint for uptime checks.
 *
 * The relay is intentionally stateless and content-blind — it only forwards
 * bytes between authenticated agents and mobile clients.
 */
import { AgentRegistry } from './AgentRegistry';

export { AgentRegistry };

export interface Env {
  AGENT_REGISTRY: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // ── Health check ─────────────────────────────────────────────────────────
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', ts: Date.now() }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ── WebSocket upgrade → Durable Object ───────────────────────────────────
    if (request.headers.get('Upgrade') === 'websocket') {
      // All WS connections share a single DO instance ("relay" is a stable key)
      const id = env.AGENT_REGISTRY.idFromName('relay');
      const stub = env.AGENT_REGISTRY.get(id);
      return stub.fetch(request);
    }

    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
