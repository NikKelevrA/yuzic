import { buildConnectionEntries, CONNECTION_GROUPS } from './catalog';

jest.mock('@/features/downloaders/registry', () => ({ useDownloaderStates: () => [] }));

const account = {
  id: 'account-one', group: 'accounts' as const, brandName: 'Account One',
  summaryKey: 'summary.account', route: '/settings/accountView' as never,
  isConnected: () => true,
  statusKeys: { connected: 'status.connected', disconnected: 'status.notConnected' },
};
const service = {
  id: 'service-one', group: 'services' as const, brandName: 'Service One',
  summaryKey: 'summary.service', route: '/settings/serviceView' as never,
  isConnected: () => false,
  statusKeys: { connected: 'status.ready', disconnected: 'status.notSetUp' },
};
const downloader = (id: string, isConnected: boolean) => ({
  def: { id, settingsRoute: `/settings/${id}View` },
  isConnected,
}) as never;

/**
 * Connections draws whatever the declarations say. These pin what the screen
 * used to hand-write per row: group, route, label and the status wording for
 * each state — for any declared integration, named or not.
 */
describe('buildConnectionEntries', () => {
  it('lists each declared integration, then each downloader, in a known group with its route', () => {
    const entries = buildConnectionEntries({
      integrations: [account, service],
      connected: [true, false],
      downloaders: [downloader('dl-one', true)],
    });

    const groups = new Set(CONNECTION_GROUPS.map(g => g.group));
    for (const entry of entries) expect(groups.has(entry.group)).toBe(true);
    expect(entries.map(e => [e.id, e.group, e.route])).toEqual([
      ['account-one', 'accounts', '/settings/accountView'],
      ['service-one', 'services', '/settings/serviceView'],
      ['dl-one', 'downloaders', '/settings/dl-oneView'],
    ]);
    expect(entries[0].label).toEqual({ text: 'Account One' });
  });

  it('words each entry from its own status keys', () => {
    const on = buildConnectionEntries({ integrations: [account, service], connected: [true, true], downloaders: [] });
    expect(on.map(e => e.statusKey)).toEqual(['status.connected', 'status.ready']);

    const off = buildConnectionEntries({ integrations: [account, service], connected: [false, false], downloaders: [downloader('dl-one', false)] });
    expect(off.map(e => e.statusKey)).toEqual(['status.notConnected', 'status.notSetUp', 'settings.connections.status.notSetUp']);
    expect(off.every(e => e.connected === false)).toBe(true);
  });
});
