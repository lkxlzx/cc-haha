/**
 * Provider types — preset-based provider configuration.
 *
 * Providers are stored in ~/.claude/cc-haha/providers.json as a lightweight index.
 * The active provider's env vars are written to ~/.claude/settings.json.
 */

import { z } from 'zod'

export const CLAUDE_OFFICIAL_PROVIDER_ID = 'claude-official'
export const OPENAI_OFFICIAL_PROVIDER_ID = 'openai-official'
export const GROK_OFFICIAL_PROVIDER_ID = 'grok-official'
export const PROVIDER_TOOL_SEARCH_OPT_IN_SCHEMA_VERSION = 4
export const PROVIDER_REQUEST_COMPATIBILITY_SCHEMA_VERSION = 5
export const PROVIDER_MODEL_CATALOG_SCHEMA_VERSION = 6
export const PROVIDER_KEY_POOL_SCHEMA_VERSION = 7
export const BUILT_IN_PROVIDER_IDS = [
  CLAUDE_OFFICIAL_PROVIDER_ID,
  OPENAI_OFFICIAL_PROVIDER_ID,
  GROK_OFFICIAL_PROVIDER_ID,
] as const

export function isBuiltInProviderId(id: string | null | undefined): boolean {
  return !!id && (BUILT_IN_PROVIDER_IDS as readonly string[]).includes(id)
}

export const ApiFormatSchema = z.enum([
  'anthropic',         // Native Anthropic Messages API (passthrough, no proxy)
  'openai_chat',       // OpenAI Chat Completions /v1/chat/completions
  'openai_responses',  // OpenAI Responses API /v1/responses
])
export type ApiFormat = z.infer<typeof ApiFormatSchema>

export const ProviderAuthStrategySchema = z.enum([
  'api_key',
  'auth_token',
  'auth_token_empty_api_key',
  'dual_same_token',
  'dual_dummy',
])
export type ProviderAuthStrategy = z.infer<typeof ProviderAuthStrategySchema>

export const ProviderRuntimeKindSchema = z.enum([
  'anthropic_compatible',
  'openai_oauth',
  'grok_oauth',
])
export type ProviderRuntimeKind = z.infer<typeof ProviderRuntimeKindSchema>

export const CustomRequestHeaderSchema = z.object({
  name: z.string().trim().min(1).max(128).regex(/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/),
  value: z.string().trim().max(1024),
})

export const ProviderApiKeySchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().max(80).optional(),
  apiKey: z.string().trim().min(1),
  // Optional per-key proxy. Supports http(s):// and socks4/5 with optional
  // user:password@ auth; an explicit empty string clears a saved proxy, an
  // omitted field keeps it.
  proxyUrl: z.union([
    z.literal(''),
    z.string().trim().max(512).regex(
      /^(https?|socks5h?|socks4a?):\/\/(\S+@)?\S+$/i,
    ),
  ]).optional(),
  // Per-key custom headers merged into upstream requests (auth/transport
  // headers are protected and cannot be overridden).
  customHeaders: z.array(CustomRequestHeaderSchema).max(32).optional(),
  enabled: z.boolean().default(true),
  weight: z.number().int().min(1).max(1000).default(1),
})

export const ProviderApiKeyInputSchema = ProviderApiKeySchema.extend({
  id: z.string().trim().min(1).optional(),
  // Remote browser edits receive redacted keys. Blank values are resolved
  // against the saved key with the same id inside ProviderService.
  apiKey: z.string().trim(),
})

export const ProviderLoadBalancingStrategySchema = z.enum([
  'round_robin',
  'weighted_round_robin',
  'failover',
])
export type ProviderLoadBalancingStrategy = z.infer<
  typeof ProviderLoadBalancingStrategySchema
>

export const ProviderLoadBalancingSchema = z.object({
  strategy: ProviderLoadBalancingStrategySchema.default('round_robin'),
})

export const ModelMappingSchema = z.object({
  main: z.string(),
  fable: z.string().optional(),
  haiku: z.string(),
  sonnet: z.string(),
  opus: z.string(),
})

export const Model1mSupportSchema = z.object({
  main: z.boolean(),
  haiku: z.boolean(),
  sonnet: z.boolean(),
  opus: z.boolean(),
})

export const AutoCompactWindowSchema = z.number().int().min(16000).max(10000000)
export const ModelContextWindowsSchema = z.record(
  z.string().min(1),
  z.number().int().min(16000).max(10000000),
)
export const ProviderCatalogModelSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1).optional(),
  contextWindow: AutoCompactWindowSchema.optional(),
  supports1m: z.boolean().optional(),
  enabled: z.boolean().optional(),
})
export const ToolSearchEnabledSchema = z.boolean()
export const DisableExperimentalBetasSchema = z.boolean()
export const SupportsNestedToolResultMediaSchema = z.boolean()

const RequestCapabilitySchema = z.enum(['auto', 'supported', 'unsupported'])
const OutputTokenBudgetSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)

// These options describe this endpoint's contract, not capabilities inferred
// from a model name. Missing fields retain automatic behavior.
export const RequestCompatibilitySchema = z.object({
  maxOutputTokens: OutputTokenBudgetSchema.optional(),
  outputTokenLimit: OutputTokenBudgetSchema.optional(),
  outputTokenField: z.enum(['auto', 'max_tokens', 'max_completion_tokens', 'omit']).optional(),
  sampling: RequestCapabilitySchema.optional(),
  reasoning: RequestCapabilitySchema.optional(),
  parallelTools: RequestCapabilitySchema.optional(),
  structuredOutput: RequestCapabilitySchema.optional(),
}).passthrough()

export type RequestCompatibility = z.infer<typeof RequestCompatibilitySchema>

export const ImageGenerationConfigSchema = z.object({
  model: z.string().trim().min(1),
  baseUrl: z.string().trim().optional(),
  apiKey: z.string().trim().optional(),
})

export const SavedProviderSchema = z.object({
  id: z.string(),
  presetId: z.string(),
  name: z.string().min(1),
  apiKey: z.string(),
  apiKeys: z.array(ProviderApiKeySchema).optional(),
  loadBalancing: ProviderLoadBalancingSchema.optional(),
  authStrategy: ProviderAuthStrategySchema.optional(),
  baseUrl: z.string(),
  apiFormat: ApiFormatSchema.default('anthropic'),
  runtimeKind: ProviderRuntimeKindSchema.default('anthropic_compatible'),
  models: ModelMappingSchema,
  model1mSupport: Model1mSupportSchema.optional(),
  modelCatalog: z.array(ProviderCatalogModelSchema).optional(),
  autoCompactWindow: AutoCompactWindowSchema.optional(),
  modelContextWindows: ModelContextWindowsSchema.optional(),
  toolSearchEnabled: ToolSearchEnabledSchema.optional(),
  disableExperimentalBetas: DisableExperimentalBetasSchema.optional(),
  supportsNestedToolResultMedia: SupportsNestedToolResultMediaSchema.optional(),
  requestCompatibility: RequestCompatibilitySchema.optional(),
  imageGeneration: ImageGenerationConfigSchema.optional(),
  notes: z.string().optional(),
})

export const ProvidersIndexSchema = z.object({
  schemaVersion: z.number().int().positive().optional(),
  activeId: z.string().nullable(),
  providers: z.array(SavedProviderSchema),
  providerOrder: z.array(z.string()).default([]),
})

export const CreateProviderSchema = z.object({
  presetId: z.string().min(1),
  name: z.string().min(1),
  apiKey: z.string(),
  apiKeys: z.array(ProviderApiKeyInputSchema).optional(),
  loadBalancing: ProviderLoadBalancingSchema.optional(),
  authStrategy: ProviderAuthStrategySchema.optional(),
  baseUrl: z.string(),
  apiFormat: ApiFormatSchema.default('anthropic'),
  runtimeKind: ProviderRuntimeKindSchema.default('anthropic_compatible'),
  models: ModelMappingSchema,
  model1mSupport: Model1mSupportSchema.optional(),
  modelCatalog: z.array(ProviderCatalogModelSchema).optional(),
  autoCompactWindow: AutoCompactWindowSchema.optional(),
  modelContextWindows: ModelContextWindowsSchema.optional(),
  toolSearchEnabled: ToolSearchEnabledSchema.optional(),
  disableExperimentalBetas: DisableExperimentalBetasSchema.optional(),
  supportsNestedToolResultMedia: SupportsNestedToolResultMediaSchema.optional(),
  requestCompatibility: RequestCompatibilitySchema.optional(),
  imageGeneration: ImageGenerationConfigSchema.optional(),
  notes: z.string().optional(),
})

export const UpdateProviderSchema = z.object({
  name: z.string().min(1).optional(),
  apiKey: z.string().optional(),
  apiKeys: z.array(ProviderApiKeyInputSchema).nullable().optional(),
  loadBalancing: ProviderLoadBalancingSchema.nullable().optional(),
  authStrategy: ProviderAuthStrategySchema.optional(),
  baseUrl: z.string().optional(),
  apiFormat: ApiFormatSchema.optional(),
  runtimeKind: ProviderRuntimeKindSchema.optional(),
  models: ModelMappingSchema.optional(),
  model1mSupport: Model1mSupportSchema.nullable().optional(),
  modelCatalog: z.array(ProviderCatalogModelSchema).nullable().optional(),
  autoCompactWindow: AutoCompactWindowSchema.nullable().optional(),
  modelContextWindows: ModelContextWindowsSchema.nullable().optional(),
  toolSearchEnabled: ToolSearchEnabledSchema.optional(),
  disableExperimentalBetas: DisableExperimentalBetasSchema.optional(),
  supportsNestedToolResultMedia: SupportsNestedToolResultMediaSchema.optional(),
  requestCompatibility: RequestCompatibilitySchema.nullable().optional(),
  imageGeneration: ImageGenerationConfigSchema.nullable().optional(),
  notes: z.string().optional(),
})

export const TestProviderSchema = z.object({
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  modelId: z.string().min(1),
  proxyUrl: z.union([
    z.literal(''),
    z.string().trim().max(512).regex(
      /^(https?|socks5h?|socks4a?):\/\/(\S+@)?\S+$/i,
    ),
  ]).optional(),
  customHeaders: z.array(CustomRequestHeaderSchema).max(32).optional(),
  authStrategy: ProviderAuthStrategySchema.optional(),
  apiFormat: ApiFormatSchema.default('anthropic'),
  supportsNestedToolResultMedia: SupportsNestedToolResultMediaSchema.optional(),
  requestCompatibility: RequestCompatibilitySchema.optional(),
})

export const ReorderProvidersSchema = z.object({
  // A permutation of the display provider ids, including built-in official providers.
  // The legacy saved-provider-only permutation is still accepted by ProviderService.
  orderedIds: z.array(z.string().min(1)).min(1),
})

// TypeScript types
export type ModelMapping = z.infer<typeof ModelMappingSchema>
export type Model1mSupport = z.infer<typeof Model1mSupportSchema>
export type ProviderCatalogModel = z.infer<typeof ProviderCatalogModelSchema>
export type ProviderApiKey = z.infer<typeof ProviderApiKeySchema>
export type ProviderApiKeyInput = z.infer<typeof ProviderApiKeyInputSchema>
export type ProviderLoadBalancing = z.infer<typeof ProviderLoadBalancingSchema>
export type ImageGenerationConfig = z.infer<typeof ImageGenerationConfigSchema>
export type SavedProvider = z.infer<typeof SavedProviderSchema>
export type ProvidersIndex = z.infer<typeof ProvidersIndexSchema>
export type CreateProviderInput = z.infer<typeof CreateProviderSchema>
export type UpdateProviderInput = z.infer<typeof UpdateProviderSchema>
export type TestProviderInput = z.infer<typeof TestProviderSchema>
export type ReorderProvidersInput = z.infer<typeof ReorderProvidersSchema>

export interface ProviderTestStepResult {
  success: boolean
  latencyMs: number
  error?: string
  modelUsed?: string
  httpStatus?: number
}

export interface ProviderTestResult {
  /** Step 1: Basic connectivity — API reachable, key valid, model exists */
  connectivity: ProviderTestStepResult
  /** Step 2: Proxy pipeline when the provider requires local request handling */
  proxy?: ProviderTestStepResult
}
