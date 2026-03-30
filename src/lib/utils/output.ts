// ─── Output mode ─────────────────────────────────────────────────────────────

let jsonMode = false

/** Enable JSON output (--json flag) */
export function setJsonMode(enabled: boolean): void {
  jsonMode = enabled
}

/** Unified output for all commands — text by default, JSON with --json */
export function out(success: boolean, data: unknown): void {
  if (jsonMode) {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n')
    return
  }

  // Text mode
  if (!success) {
    const msg = typeof data === 'object' && data !== null && 'error' in data
      ? (data as { error: string }).error
      : JSON.stringify(data)
    process.stderr.write(`Error: ${msg}\n`)
    return
  }

  process.stdout.write(formatText(data) + '\n')
}

/** Assert -w and --sl are not both provided */
export function assertExclusiveWallet(opts: { wallet?: string; sl?: string }): void {
  if (opts.wallet && opts.sl) {
    out(false, { error: 'Options -w/--wallet and --sl are mutually exclusive. Use one or the other.' })
    process.exit(1)
  }
}

// ─── Text formatting ─────────────────────────────────────────────────────────

function formatText(data: unknown): string {
  if (data === null || data === undefined) return ''
  if (typeof data === 'string') return data
  if (typeof data === 'number' || typeof data === 'bigint') return String(data)
  if (typeof data === 'boolean') return String(data)

  if (Array.isArray(data)) {
    if (data.length === 0) return '(empty)'
    if (typeof data[0] === 'object' && data[0] !== null) {
      return formatTable(data as Record<string, unknown>[])
    }
    return data.map(String).join('\n')
  }

  if (typeof data === 'object') {
    return formatKeyValue(data as Record<string, unknown>)
  }

  return String(data)
}

/** Format object as padded key-value pairs */
function formatKeyValue(obj: Record<string, unknown>): string {
  const entries = Object.entries(obj)
  if (entries.length === 0) return ''
  const maxKeyLen = Math.max(...entries.map(([k]) => k.length))
  return entries
    .map(([key, val]) => {
      const padded = key.padEnd(maxKeyLen + 2)
      const valStr = typeof val === 'object' && val !== null
        ? JSON.stringify(val)
        : String(val)
      return `${padded}${valStr}`
    })
    .join('\n')
}

/** Format array of objects as aligned table */
function formatTable(rows: Record<string, unknown>[]): string {
  const keys = Object.keys(rows[0])
  const widths = keys.map(k =>
    Math.max(k.length, ...rows.map(r => String(r[k] ?? '').length))
  )
  const header = keys.map((k, i) => k.padEnd(widths[i])).join('  ')
  const separator = widths.map(w => '-'.repeat(w)).join('  ')
  const body = rows.map(row =>
    keys.map((k, i) => String(row[k] ?? '').padEnd(widths[i])).join('  ')
  ).join('\n')
  return `${header}\n${separator}\n${body}`
}
