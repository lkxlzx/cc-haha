import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ProviderService } from '../services/providerService.js'
import { resetSettingsCache } from '../../utils/settings/settingsCache.js'
import type { CreateProviderInput } from '../types/provider.js'
import { handleProxyRequest } from './handler.js'

describe('proxy key-pool routing', () => {
  let fixture: string
  let previous: string | undefined

  beforeEach(async () => {
    fixture = await mkdtemp(join(tmpdir(), 'handler-key-pool-'))
    previous = process.env.CLAUDE_CONFIG_DIR
    process.env.CLAUDE_CONFIG_DIR = fixture
    resetSettingsCache()
  })

  afterEach(async () => {
    if (previous === undefined) delete process.env.CLAUDE_CONFIG_DIR
    else process.env.CLAUDE_CONFIG_DIR = previous
    resetSettingsCache()
    await rm(fixture, { recursive: true, force: true })
  })

  function providerInput(options: {
    apiFormat?: 'anthropic' | 'openai_chat'
    strategy: 'round_robin' | 'weighted_round_robin' | 'failover'
    supportsNestedToolResultMedia?: boolean
  }): CreateProviderInput {
    return {
      presetId: 'custom',
      name: 'Key pool fixture',
      apiKey: '',
      apiKeys: [
        { id: 'key-a', apiKey: 'secret-a', enabled: true, weight: 1 },
        { id: 'key-b', apiKey: 'secret-b', enabled: true, weight: 1 },
      ],
      loadBalancing: { strategy: options.strategy },
      baseUrl: 'https://fixture.invalid',
      apiFormat: options.apiFormat ?? 'openai_chat',
      ...(options.supportsNestedToolResultMedia !== undefined
        ? { supportsNestedToolResultMedia: options.supportsNestedToolResultMedia }
        : {}),
      models: { main: 'fixture', haiku: 'fixture', sonnet: 'fixture', opus: 'fixture' },
    }
  }

  function makeRequest(providerId: string, stream = false): Request {
    return new Request(`http://localhost/proxy/providers/${providerId}/v1/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'fixture',
        max_tokens: 64,
        stream,
        messages: [{ role: 'user', content: 'fixture' }],
      }),
    })
  }

  function successfulChatResponse(): Response {
    return Response.json({
      id: 'chatcmpl-fixture',
      object: 'chat.completion',
      created: 0,
      model: 'fixture',
      choices: [{
        index: 0,
        message: { role: 'assistant', content: 'ok' },
        finish_reason: 'stop',
      }],
    })
  }

  test('round-robins separate logical requests across enabled keys', async () => {
    const provider = await new ProviderService().addProvider(providerInput({
      strategy: 'round_robin',
    }))
    const authorizations: Array<string | null> = []
    const fetchMock = spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      authorizations.push(new Headers(init?.headers).get('authorization'))
      return successfulChatResponse()
    })

    try {
      expect((await handleProxyRequest(makeRequest(provider.id), new URL(makeRequest(provider.id).url))).status).toBe(200)
      expect((await handleProxyRequest(makeRequest(provider.id), new URL(makeRequest(provider.id).url))).status).toBe(200)
      expect(authorizations).toEqual(['Bearer secret-a', 'Bearer secret-b'])
    } finally {
      fetchMock.mockRestore()
    }
  })

  test('retries the same logical request with another key after an auth failure', async () => {
    const provider = await new ProviderService().addProvider(providerInput({
      strategy: 'failover',
    }))
    const authorizations: Array<string | null> = []
    const fetchMock = spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      const authorization = new Headers(init?.headers).get('authorization')
      authorizations.push(authorization)
      if (authorization === 'Bearer secret-a') {
        return Response.json({ error: { message: 'invalid key' } }, { status: 401 })
      }
      return successfulChatResponse()
    })

    try {
      const request = makeRequest(provider.id)
      const response = await handleProxyRequest(request, new URL(request.url))

      expect(response.status).toBe(200)
      expect(authorizations).toEqual(['Bearer secret-a', 'Bearer secret-b'])
    } finally {
      fetchMock.mockRestore()
    }
  })

  test('honors rate-limit cooldown on the next logical request', async () => {
    const provider = await new ProviderService().addProvider(providerInput({
      strategy: 'failover',
    }))
    const authorizations: Array<string | null> = []
    const fetchMock = spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      const authorization = new Headers(init?.headers).get('authorization')
      authorizations.push(authorization)
      if (authorization === 'Bearer secret-a') {
        return Response.json(
          { error: { message: 'slow down' } },
          { status: 429, headers: { 'retry-after': '60' } },
        )
      }
      return successfulChatResponse()
    })

    try {
      const firstRequest = makeRequest(provider.id)
      expect((await handleProxyRequest(firstRequest, new URL(firstRequest.url))).status).toBe(200)
      const secondRequest = makeRequest(provider.id)
      expect((await handleProxyRequest(secondRequest, new URL(secondRequest.url))).status).toBe(200)

      expect(authorizations).toEqual([
        'Bearer secret-a',
        'Bearer secret-b',
        'Bearer secret-b',
      ])
    } finally {
      fetchMock.mockRestore()
    }
  })

  test('rotates a streaming request before the response body is exposed', async () => {
    const provider = await new ProviderService().addProvider(providerInput({
      apiFormat: 'anthropic',
      strategy: 'failover',
      supportsNestedToolResultMedia: false,
    }))
    const authorizations: Array<string | null> = []
    const fetchMock = spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      const authorization = new Headers(init?.headers).get('authorization')
      authorizations.push(authorization)
      if (authorization === 'Bearer secret-a') {
        return Response.json({ error: { message: 'invalid key' } }, { status: 401 })
      }
      return new Response(
        'event: message_start\ndata: {"type":"message_start"}\n\n',
        { headers: { 'Content-Type': 'text/event-stream' } },
      )
    })

    try {
      const request = makeRequest(provider.id, true)
      const response = await handleProxyRequest(request, new URL(request.url))

      expect(response.status).toBe(200)
      expect(await response.text()).toContain('event: message_start')
      expect(authorizations).toEqual(['Bearer secret-a', 'Bearer secret-b'])
    } finally {
      fetchMock.mockRestore()
    }
  })

  test('does not replay a streaming request after SSE delivery starts', async () => {
    const provider = await new ProviderService().addProvider(providerInput({
      apiFormat: 'anthropic',
      strategy: 'failover',
      supportsNestedToolResultMedia: false,
    }))
    const authorizations: Array<string | null> = []
    const fetchMock = spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      authorizations.push(new Headers(init?.headers).get('authorization'))
      let sent = false
      return new Response(new ReadableStream<Uint8Array>({
        pull(controller) {
          if (!sent) {
            sent = true
            controller.enqueue(new TextEncoder().encode(
              'event: message_start\ndata: {"type":"message_start"}\n\n',
            ))
            return
          }
          controller.error(new Error('stream failed after headers'))
        },
      }), {
        headers: { 'Content-Type': 'text/event-stream' },
      })
    })

    try {
      const request = makeRequest(provider.id, true)
      const response = await handleProxyRequest(request, new URL(request.url))
      const reader = response.body!.getReader()

      expect(response.status).toBe(200)
      expect(new TextDecoder().decode((await reader.read()).value)).toContain('event: message_start')
      await expect(reader.read()).rejects.toThrow('stream failed after headers')
      expect(authorizations).toEqual(['Bearer secret-a'])
    } finally {
      fetchMock.mockRestore()
    }
  })

  test('routes upstream through the proxy configured on the selected key', async () => {
    const provider = await new ProviderService().addProvider({
      presetId: 'custom',
      name: 'Key proxy fixture',
      apiKey: '',
      apiKeys: [
        { id: 'key-a', apiKey: 'secret-a', proxyUrl: 'socks5://user:pass@127.0.0.1:1080', enabled: true, weight: 1 },
        { id: 'key-b', apiKey: 'secret-b', enabled: true, weight: 1 },
      ],
      loadBalancing: { strategy: 'failover' },
      baseUrl: 'https://fixture.invalid',
      apiFormat: 'openai_chat',
      models: { main: 'fixture', haiku: 'fixture', sonnet: 'fixture', opus: 'fixture' },
    })
    const proxies: Array<string | undefined> = []
    const fetchMock = spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      proxies.push((init as { proxy?: string } | undefined)?.proxy)
      return successfulChatResponse()
    })

    try {
      const request = makeRequest(provider.id)
      expect((await handleProxyRequest(request, new URL(request.url))).status).toBe(200)
      // failover picks key-a first, so the upstream call must carry its proxy.
      expect(proxies[0]).toBe('socks5://user:pass@127.0.0.1:1080')
    } finally {
      fetchMock.mockRestore()
    }
  })

  test('injects per-key custom headers without overriding protected auth headers', async () => {
    const provider = await new ProviderService().addProvider({
      presetId: 'custom',
      name: 'Custom header fixture',
      apiKey: '',
      apiKeys: [
        {
          id: 'key-a',
          apiKey: 'secret-a',
          enabled: true,
          weight: 1,
          customHeaders: [
            { name: 'X-Tenant', value: 'acme' },
            { name: 'Authorization', value: 'Bearer evil' },
          ],
        },
        { id: 'key-b', apiKey: 'secret-b', enabled: true, weight: 1 },
      ],
      loadBalancing: { strategy: 'failover' },
      baseUrl: 'https://fixture.invalid',
      apiFormat: 'openai_chat',
      models: { main: 'fixture', haiku: 'fixture', sonnet: 'fixture', opus: 'fixture' },
    })
    const headers: Array<Headers> = []
    const fetchMock = spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      headers.push(new Headers((init as { headers?: HeadersInit } | undefined)?.headers))
      return successfulChatResponse()
    })

    try {
      const request = makeRequest(provider.id)
      expect((await handleProxyRequest(request, new URL(request.url))).status).toBe(200)
      // failover picks key-a first: its custom header rides along, while the
      // protected auth header keeps the real key.
      expect(headers[0].get('x-tenant')).toBe('acme')
      expect(headers[0].get('authorization')).toBe('Bearer secret-a')
    } finally {
      fetchMock.mockRestore()
    }
  })

  test('explains how to enable proxy routing for a single enabled key', async () => {
    const provider = await new ProviderService().addProvider(providerInput({
      apiFormat: 'anthropic',
      strategy: 'failover',
    }))
    // A single enabled key with the default supportsNestedToolResultMedia=true
    // cannot be routed through the proxy; the error should hint at the fix.
    const single = await new ProviderService().updateProvider(provider.id, {
      apiKeys: [
        { id: 'key-a', apiKey: 'secret-a', enabled: true, weight: 1 },
        { id: 'key-b', apiKey: 'secret-b', enabled: false, weight: 1 },
      ],
    })
    expect(single.apiKeys).toHaveLength(2)

    const request = makeRequest(provider.id)
    const response = await handleProxyRequest(request, new URL(request.url))

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.message).toContain('proxy not needed')
    expect(body.error.message).toContain('Enable at least one more key')
  })
})
