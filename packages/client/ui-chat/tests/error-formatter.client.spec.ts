import { describe, expect, it } from 'vitest'
import {
  categorizeFailure,
  formatFailureMessage,
} from '../src/client/chat/error-formatter.ts'

describe('error-formatter', () => {
  const mockT = (key: string): string => {
    switch (key) {
      case 'message.failure.auth':
        return 'API key is invalid'
      case 'message.failure.streamTruncated':
        return 'Stream response was cut off before completion (Incomplete JSON segment at the end)'
      case 'message.failure.rawDetails':
        return 'Raw error details'
      default:
        return key
    }
  }

  it('unwraps double-stringified 503 high demand JSON payload', () => {
    const raw = JSON.stringify({
      error: {
        message: JSON.stringify({
          error: {
            code: 503,
            message: 'This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.',
            status: 'UNAVAILABLE',
          },
        }),
        code: 503,
        status: 'Service Unavailable',
      },
    })

    const result = formatFailureMessage(raw, undefined, mockT)
    expect(result.display).toBe(
      'This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.',
    )
    expect(result.extractedCode).toBe(503)
    expect(result.category).toBe('overloaded')
    expect(result.rawJson).toBe(raw)
  })

  it('unwraps 400 prefix with JSON payload (e.g. reasoning mandatory)', () => {
    const raw = '400: {"message":"Reasoning is mandatory for this endpoint and cannot be disabled.","code":400,"metadata":{"provider_name":null}}'
    const result = formatFailureMessage(raw, undefined, mockT)
    expect(result.display).toBe('Reasoning is mandatory for this endpoint and cannot be disabled.')
    expect(result.extractedCode).toBe(400)
    expect(result.category).toBe('reasoning_required')
  })

  it('clarifies stream interruption / incomplete JSON errors', () => {
    const raw = 'Incomplete JSON segment at the end'
    const result = formatFailureMessage(raw, undefined, mockT)
    expect(result.display).toBe('Stream response was cut off before completion (Incomplete JSON segment at the end)')
    expect(result.category).toBe('stream_interrupted')
  })

  it('preserves plain strings verbatim without modifying them', () => {
    expect(formatFailureMessage('plugin exploded', undefined, mockT).display).toBe('plugin exploded')
    expect(formatFailureMessage('upstream 503', 'SERVER', mockT).display).toBe('upstream 503')
  })

  it('preserves AUTH code behavior', () => {
    const result = formatFailureMessage('ignored raw', 'AUTH', mockT)
    expect(result.display).toBe('API key is invalid')
    expect(result.category).toBe('auth')
  })

  it('categorizes rate limits (429)', () => {
    const raw = '{"error":{"message":"Rate limit exceeded for model: requests per minute (RPM) cap reached","code":429}}'
    const result = formatFailureMessage(raw, undefined, mockT)
    expect(result.display).toBe('Rate limit exceeded for model: requests per minute (RPM) cap reached')
    expect(result.extractedCode).toBe(429)
    expect(result.category).toBe('rate_limit')
  })

  it('categorizes local provider connection errors', () => {
    const raw = 'fetch failed: connect ECONNREFUSED 127.0.0.1:11434'
    const category = categorizeFailure(raw)
    expect(category).toBe('connection_refused')
  })
})
