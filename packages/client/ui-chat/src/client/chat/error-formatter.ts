/**
 * Error formatting and unwrapping helpers for LLM and agent failure messages.
 * Normalizes double-stringified JSON, extracts nested API error messages,
 * and clarifies stream interruption errors.
 */

export interface CleanedFailure {
  /** The human-readable message without JSON syntax or escaping. */
  clean: string
  /** Extracted HTTP/provider error code if present in the raw payload. */
  extractedCode?: string | number | undefined
  /** The original raw JSON string if unwrapping occurred, for expandable details. */
  rawJson?: string | undefined
  /** Identified category of failure. */
  category?: 'overloaded' | 'rate_limit' | 'stream_interrupted' | 'auth' | 'reasoning_required' | 'connection_refused' | 'context_length' | undefined
}

/**
 * Recursively parses JSON strings and unwraps common provider error envelopes:
 * - `{"error":{"message":"..."}}`
 * - `400: {"message":"..."}`
 * - Nested JSON strings: `{"error":{"message":"{\\"error\\":{\\"message\\":...}}"}}`
 */
export function extractCleanErrorMessage(raw: string): CleanedFailure {
  if (!raw || typeof raw !== 'string') {
    return { clean: '' }
  }

  let text = raw.trim()
  let extractedCode: string | number | undefined
  let wasJson = false

  // Detect HTTP status prefix like "400: { ... }" or "503: { ... }"
  const prefixMatch = text.match(/^(\d{3})\s*:\s*(\{.*\}|\[.*\])$/s)
  if (prefixMatch && prefixMatch[1] && prefixMatch[2]) {
    extractedCode = prefixMatch[1]
    text = prefixMatch[2].trim()
    wasJson = true
  }

  // Iteratively parse JSON strings (up to 4 levels for nested serialized payloads)
  for (let i = 0; i < 4; i++) {
    if ((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'))) {
      try {
        const parsed: unknown = JSON.parse(text)
        wasJson = true
        if (typeof parsed === 'string') {
          text = parsed.trim()
          continue
        }
        if (parsed && typeof parsed === 'object') {
          const obj = parsed as Record<string, unknown>
          const errorObj = typeof obj['error'] === 'object' && obj['error'] !== null
            ? (obj['error'] as Record<string, unknown>)
            : undefined

          const rawCode = (typeof obj['code'] === 'number' || typeof obj['code'] === 'string')
            ? obj['code']
            : (errorObj && (typeof errorObj['code'] === 'number' || typeof errorObj['code'] === 'string'))
              ? errorObj['code']
              : undefined

          if (rawCode !== undefined) {
            extractedCode = rawCode
          }

          const rawStatus = typeof obj['status'] === 'string'
            ? obj['status']
            : (errorObj && typeof errorObj['status'] === 'string')
              ? errorObj['status']
              : undefined

          if (rawStatus && !extractedCode) {
            extractedCode = rawStatus
          }

          const nestedCandidates = [
            errorObj?.['message'],
            errorObj?.['msg'],
            errorObj?.['detail'],
            typeof obj['error'] === 'string' ? obj['error'] : undefined,
            obj['message'],
            obj['msg'],
            obj['detail'],
            obj['description'],
          ]
          const nestedMsg = nestedCandidates.find((c): c is string => typeof c === 'string' && c.trim().length > 0)

          if (nestedMsg) {
            text = nestedMsg.trim()
            continue
          }
        }
      } catch {
        break
      }
    }
    break
  }

  const category = categorizeFailure(text, extractedCode)

  return {
    clean: text,
    extractedCode,
    rawJson: wasJson ? raw : undefined,
    category,
  }
}

/**
 * Classifies an error message into an actionable failure category.
 */
export function categorizeFailure(
  message: string,
  code?: unknown,
): CleanedFailure['category'] {
  if (code === 'AUTH' || code === 401 || code === '401' || code === 403 || code === '403') {
    return 'auth'
  }

  const lower = message.toLowerCase()

  if (
    lower.includes('high demand') ||
    lower.includes('temporarily unavailable') ||
    lower.includes('503') ||
    lower.includes('server is overloaded') ||
    lower.includes('service unavailable') ||
    code === 503 ||
    code === '503'
  ) {
    return 'overloaded'
  }

  if (
    lower.includes('rate limit') ||
    lower.includes('quota') ||
    lower.includes('429') ||
    lower.includes('too many requests') ||
    lower.includes('resource has been exhausted') ||
    code === 429 ||
    code === '429'
  ) {
    return 'rate_limit'
  }

  if (
    lower.includes('incomplete json segment') ||
    lower.includes('unexpected end of json') ||
    lower.includes('premature close') ||
    lower.includes('stream ended') ||
    lower.includes('stream was cut off')
  ) {
    return 'stream_interrupted'
  }

  if (
    lower.includes('reasoning is mandatory') ||
    lower.includes('thinking cannot be disabled') ||
    lower.includes('reasoning mode')
  ) {
    return 'reasoning_required'
  }

  if (
    lower.includes('econnrefused') ||
    lower.includes('failed to fetch') ||
    lower.includes('fetch failed') ||
    lower.includes('network error') ||
    lower.includes('connection refused')
  ) {
    return 'connection_refused'
  }

  if (
    lower.includes('context length') ||
    lower.includes('context window') ||
    lower.includes('maximum context') ||
    lower.includes('tokens exceeds')
  ) {
    return 'context_length'
  }

  if (
    lower.includes('api key') ||
    lower.includes('unauthorized') ||
    lower.includes('forbidden')
  ) {
    return 'auth'
  }

  return undefined
}

/**
 * Resolves a display-ready error message, unwrapping JSON envelopes and applying localized copy where appropriate.
 */
export function formatFailureMessage(
  message: string,
  code: unknown,
  t: (key: never) => string,
): { display: string; extractedCode?: string | number | undefined; rawJson?: string | undefined; category?: CleanedFailure['category'] } {
  if (code === 'AUTH') {
    return { display: t('message.failure.auth' as never), category: 'auth' }
  }

  const { clean, extractedCode, rawJson, category } = extractCleanErrorMessage(message)

  if (category === 'stream_interrupted') {
    return {
      display: t('message.failure.streamTruncated' as never),
      extractedCode,
      rawJson,
      category,
    }
  }

  return {
    display: clean || message,
    extractedCode,
    rawJson,
    category,
  }
}
