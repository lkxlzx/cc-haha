import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'

import { handleProxyRequest } from '../proxy/handler.js'
import { ProviderService } from '../services/providerService.js'
import { resetProviderKeyPoolState } from '../services/providerKeyPool.js'
import { resetSettingsCache } from '../../utils/settings/settingsCache.js'

let tmpDir: string
let originalConfigDir: string | undefined

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'proxy-key-pool-test-'))
  originalConfigDir = process.env.CLAUDE_CONFIG_DIR
  process.env.CLAUDE_CONFIG_DIR = tmpDir
  resetSettingsCache()
  resetProviderKeyPoolState()
})

afterEach(async () => {
  if (originalConfigDir !== undefined) process.env.CLAUDE_CONFIG_DIR = originalConfigDir
  else delete process.env.CLAUDE_CONFIG_DIR
  resetSettingsCache()
  resetProviderKeyPoolState()
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined)
})

async function sendMessages(
  proxy: ReturnType<typeof Bun.serve>,
  providerId: string,
  sessionId: string,
): Promise<Response> {
  return fetch(new URL(`/proxy/providers/${providerId}/v1/messages`, proxy.url), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-claude-code-session-id': sessionId,
    },
    body: JSON.stringify({
      model: 'fixture-model',
      max_tokens: 32,
      messages: [{ role: 'user', content: 'ok' }],
    }),
    signal: AbortSignal.timeout(5_000),
  })
}

describe('proxy key pool', () => {
  test('keeps a session on one key and applies that key headers', async () => {
    const received: Array<{ key: string; trace: string | null }> = []
    const upstream = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      async fetch(request) {
        received.push({
          key: request.headers.get('x-api-key') ?? '',
          trace: request.headers.get('x-key-trace'),
        })
        return Response.json({ type: 'message', content: [{ type: 'text', text: 'ok' }] })
      },
    })
    const proxy = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch: request => handleProxyRequest(request, new URL(request.url)),
    })

    try {
      const provider = await new ProviderService().addProvider({
        presetId: 'custom',
        name: 'Pooled',
        baseUrl: upstream.url.origin,
        apiKey: '',
        apiFormat: 'anthropic',
        authStrategy: 'api_key',
        models: { main: 'fixture-model', haiku: '', sonnet: '', opus: '' },
        keyPool: {
          mode: 'session_sticky',
          keys: [
            { id: 'a', label: 'A', apiKey: 'sk-key-a', enabled: true, weight: 1, headers: { 'X-Key-Trace': 'a' } },
            { id: 'b', label: 'B', apiKey: 'sk-key-b', enabled: true, weight: 1, headers: { 'X-Key-Trace': 'b' } },
          ],
        },
      })

      for (let i = 0; i < 4; i++) {
        const response = await sendMessages(proxy, provider.id, 'session-A')
        expect(response.status).toBe(200)
        await response.text()
      }

      const keys = new Set(received.map((entry) => entry.key))
      expect(keys.size).toBe(1)
      const selectedKey = received[0]!.key
      for (const entry of received) {
        expect(entry.key).toBe(selectedKey)
        expect(entry.trace).toBe(selectedKey === 'sk-key-a' ? 'a' : 'b')
      }
    } finally {
      proxy.stop(true)
      upstream.stop(true)
    }
  })

  test('applies the legacy key proxy headers and accepts anthropic via forceProxy', async () => {
    let trace: string | null = null
    const upstream = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      async fetch(request) {
        trace = request.headers.get('x-legacy-trace')
        return Response.json({ type: 'message', content: [{ type: 'text', text: 'ok' }] })
      },
    })
    const proxy = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch: request => handleProxyRequest(request, new URL(request.url)),
    })

    try {
      const provider = await new ProviderService().addProvider({
        presetId: 'custom',
        name: 'Legacy key',
        baseUrl: upstream.url.origin,
        apiKey: 'sk-legacy',
        apiFormat: 'anthropic',
        authStrategy: 'api_key',
        models: { main: 'fixture-model', haiku: '', sonnet: '', opus: '' },
        apiKeyConfig: { name: 'Main', headers: { 'X-Legacy-Trace': 'legacy' } },
      })

      const response = await sendMessages(proxy, provider.id, 'session-legacy')
      expect(response.status).toBe(200)
      await response.text()
      expect(trace).toBe('legacy')
    } finally {
      proxy.stop(true)
      upstream.stop(true)
    }
  })
})