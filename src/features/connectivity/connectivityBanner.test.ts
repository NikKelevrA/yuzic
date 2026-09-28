import { connectivityBanner } from './connectivityBanner'

/**
 * Home announced only the case NetInfo already makes obvious, and stayed quiet
 * for the one worth announcing.
 */

describe('connectivityBanner', () => {
  it('says nothing while the server can be asked', () => {
    expect(connectivityBanner({ isOffline: false, serverReachable: true })).toBeNull()
  })

  // The case Home was silent for: signal is fine, the server is not, and every
  // discovery shelf removes itself because each one is a request.
  it('names the server when the device is online and it is not', () => {
    expect(connectivityBanner({ isOffline: false, serverReachable: false })).toBe('serverUnreachable')
  })

  it('says offline when there is no network', () => {
    expect(connectivityBanner({ isOffline: true, serverReachable: false })).toBe('offline')
  })

  // "Can't reach your server" would send someone to check a server that is
  // fine; no network is the cause and the one worth reporting.
  it('prefers offline when both are true', () => {
    expect(connectivityBanner({ isOffline: true, serverReachable: false })).not.toBe('serverUnreachable')
  })
})
