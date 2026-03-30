/**
 * x402 Facilitator client — Merchant-side HMAC auth + verify/settle
 *
 * For Resource Server developers who need to:
 *   1. Verify payment payloads from users (POST /v2/verify)
 *   2. Settle payments on-chain (POST /v2/settle)
 *
 * Authentication: HMAC-SHA256 with Access Key + Secret Key
 * Keys are obtained from https://morph-rails.morph.network/x402
 */
import { createHmac } from 'crypto'
import { MORPH_FACILITATOR } from './client.js'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FacilitatorCredentials {
  accessKey: string  // morph_ak_...
  secretKey: string  // morph_sk_...
}

export interface VerifyRequest {
  x402Version: number
  paymentPayload: Record<string, unknown>
  paymentRequirements: Record<string, unknown>
}

export interface VerifyResponse {
  isValid: boolean
  invalidReason: string
  payer: string
}

export interface SettleResponse {
  success: boolean
  errorReason: string
  payer: string
  transaction: string
  network: string
}

// ─── HMAC Signing ────────────────────────────────────────────────────────────

/**
 * Recursively sort all keys in an object lexicographically.
 * Required because JSON.stringify preserves insertion order.
 */
function sortObject(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(sortObject)
  }
  if (obj !== null && typeof obj === 'object') {
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
      sorted[key] = sortObject((obj as Record<string, unknown>)[key])
    }
    return sorted
  }
  return obj
}

/**
 * Build HMAC sign content per Morph x402 spec.
 *
 * Sign map structure:
 *   MORPH-ACCESS-KEY, MORPH-ACCESS-TIMESTAMP, MORPH-ACCESS-METHOD,
 *   MORPH-ACCESS-PATH, query params (flattened), MORPH-ACCESS-BODY
 *
 * All keys recursively sorted → compact JSON → HMAC-SHA256 → Base64
 */
function buildSignContent(
  accessKey: string,
  timestamp: string,
  method: string,
  path: string,
  body?: unknown,
): string {
  const signMap: Record<string, unknown> = {
    'MORPH-ACCESS-KEY': accessKey,
    'MORPH-ACCESS-TIMESTAMP': timestamp,
    'MORPH-ACCESS-METHOD': method,
    'MORPH-ACCESS-PATH': path,
  }

  if (body !== undefined && body !== null) {
    signMap['MORPH-ACCESS-BODY'] = body
  }

  return JSON.stringify(sortObject(signMap))
}

/** Compute HMAC-SHA256 signature */
function computeSignature(secretKey: string, content: string): string {
  const hmac = createHmac('sha256', secretKey)
  hmac.update(content)
  return hmac.digest('base64')
}

// ─── API Calls ───────────────────────────────────────────────────────────────

/** Make an HMAC-authenticated request to Morph Facilitator */
async function facilitatorRequest<T>(
  creds: FacilitatorCredentials,
  endpoint: string,
  body: unknown,
): Promise<T> {
  const timestamp = Date.now().toString()
  const method = 'POST'
  const path = `/x402${endpoint}` // Full path including gateway prefix

  const signContent = buildSignContent(creds.accessKey, timestamp, method, path, body)
  const signature = computeSignature(creds.secretKey, signContent)

  const res = await fetch(`${MORPH_FACILITATOR}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'MORPH-ACCESS-KEY': creds.accessKey,
      'MORPH-ACCESS-TIMESTAMP': timestamp,
      'MORPH-ACCESS-SIGN': signature,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  })

  const data = await res.json()

  if (!res.ok) {
    const reason = (data as Record<string, unknown>)['invalidReason']
      ?? (data as Record<string, unknown>)['errorReason']
      ?? `HTTP ${res.status}`
    throw new Error(`Facilitator error: ${reason}`)
  }

  return data as T
}

/** Verify a payment payload (does NOT settle on-chain) */
export async function verifyPayment(
  creds: FacilitatorCredentials,
  payload: Record<string, unknown>,
  requirements: Record<string, unknown>,
): Promise<VerifyResponse> {
  return facilitatorRequest<VerifyResponse>(creds, '/v2/verify', {
    x402Version: 2,
    paymentPayload: payload,
    paymentRequirements: requirements,
  })
}

/** Settle a payment on-chain (transfers USDC from payer to merchant) */
export async function settlePayment(
  creds: FacilitatorCredentials,
  payload: Record<string, unknown>,
  requirements: Record<string, unknown>,
): Promise<SettleResponse> {
  return facilitatorRequest<SettleResponse>(creds, '/v2/settle', {
    x402Version: 2,
    paymentPayload: payload,
    paymentRequirements: requirements,
  })
}
