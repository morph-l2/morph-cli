import { describe, it, expect, vi, beforeEach } from 'vitest'
import { out, setJsonMode } from '../../src/lib/utils/output.js'

describe('out() — text mode (default)', () => {
  beforeEach(() => setJsonMode(false))

  it('writes key-value pairs for objects', () => {
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    out(true, { name: 'test', address: '0xabc' })
    const written = spy.mock.calls[0][0] as string
    spy.mockRestore()

    expect(written).toContain('name')
    expect(written).toContain('test')
    expect(written).toContain('address')
    expect(written).toContain('0xabc')
  })

  it('writes error to stderr on failure', () => {
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    out(false, { error: 'not found' })
    const written = spy.mock.calls[0][0] as string
    spy.mockRestore()

    expect(written).toContain('Error: not found')
  })

  it('output ends with newline', () => {
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    out(true, { foo: 'bar' })
    const written = spy.mock.calls[0][0] as string
    spy.mockRestore()

    expect(written.endsWith('\n')).toBe(true)
  })

  it('formats arrays as table', () => {
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    out(true, [{ a: '1', b: '2' }, { a: '3', b: '4' }])
    const written = spy.mock.calls[0][0] as string
    spy.mockRestore()

    expect(written).toContain('a')
    expect(written).toContain('b')
    expect(written).toContain('-')
  })
})

describe('out() — JSON mode (--json)', () => {
  beforeEach(() => setJsonMode(true))

  it('writes valid JSON to stdout', () => {
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    out(true, { foo: 'bar' })
    const written = spy.mock.calls[0][0] as string
    spy.mockRestore()

    const parsed = JSON.parse(written)
    expect(parsed).toEqual({ foo: 'bar' })
  })

  it('writes error JSON to stdout on failure', () => {
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    out(false, { error: 'not found' })
    const written = spy.mock.calls[0][0] as string
    spy.mockRestore()

    const parsed = JSON.parse(written)
    expect(parsed.error).toBe('not found')
  })

  it('output ends with newline', () => {
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    out(true, null)
    const written = spy.mock.calls[0][0] as string
    spy.mockRestore()

    expect(written.endsWith('\n')).toBe(true)
  })
})
