/** Minimal HTTP utilities built on native fetch */

export async function httpGet<T = unknown>(url: string, params?: Record<string, string>): Promise<T> {
  const fullUrl = params ? `${url}?${new URLSearchParams(params)}` : url
  const res = await fetch(fullUrl, { signal: AbortSignal.timeout(30000) })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status} ${res.statusText}${body ? `: ${body.slice(0, 200)}` : ''}`)
  }
  return res.json() as Promise<T>
}

export async function httpPost<T = unknown>(
  url: string,
  body: unknown,
  headers?: Record<string, string>,
): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status} ${res.statusText}${text ? `: ${text.slice(0, 200)}` : ''}`)
  }
  return res.json() as Promise<T>
}
