import { serverFeatureStatus } from './serverFeatureStatus'
import { ServerFeatureUnavailableError } from '@/providers/contracts/ServerAdapter'

/**
 * The order of the ladder in front of radio, podcasts and shares.
 *
 * Three screens each wrote it out and Radio's copy was missing a rung: a
 * server that does not do radio at all was reported as a failed load, with a
 * retry that could never work.
 */

const base = {
  rows: [] as unknown[],
  isLoading: false,
  isError: false,
  error: undefined as unknown,
  serverReachable: true,
}

describe('serverFeatureStatus', () => {
  it('shows the rows once there are some', () => {
    expect(serverFeatureStatus({ ...base, rows: [1] })).toBe('ready')
  })

  it('says the list is empty once it is known to be', () => {
    expect(serverFeatureStatus(base)).toBe('empty')
  })

  it('waits rather than calling it empty while loading', () => {
    expect(serverFeatureStatus({ ...base, isLoading: true })).toBe('loading')
  })

  // The rung Radio was missing. Asking again cannot give a server a surface it
  // does not have, so this must win over the generic failure that offers one.
  it('separates "this server does not do that" from "that did not work"', () => {
    const unavailable = { ...base, isError: true, error: new ServerFeatureUnavailableError('radio') }
    expect(serverFeatureStatus(unavailable)).toBe('unavailable')

    const failed = { ...base, isError: true, error: new Error('Network request failed') }
    expect(serverFeatureStatus(failed)).toBe('failed')
  })

  it('leads with offline when there is nothing and no way to get any', () => {
    expect(serverFeatureStatus({ ...base, serverReachable: false })).toBe('offline')
  })

  // Anything already fetched is still worth showing with the server away.
  it('keeps showing rows it already has while the server is out of reach', () => {
    expect(serverFeatureStatus({ ...base, rows: [1], serverReachable: false })).toBe('ready')
  })
})
