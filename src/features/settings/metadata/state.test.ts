import reducer, { migrateMetadataSettings, selectLastfmEnabled, setLastfmEnabled, type MetadataSettingsState } from './state';

const stateOf = (settingsMetadata: ReturnType<typeof reducer>) => ({ settingsMetadata });

/**
 * Last.fm used to be two switches: a bios entry on the Metadata screen and a
 * similar-artists flag whose only screen had been orphaned. Both send artist
 * names to Last.fm, so they are now one.
 */
describe('migrateMetadataSettings', () => {
  it('turns the merged switch on for someone who had Last.fm bios on', () => {
    const migrated = migrateMetadataSettings({
      metadataArtistInfoOrder: ['lastfm'],
      metadataArtistInfoEnabled: { lastfm: true },
      lastfmEnabled: false,
    });

    expect(migrated.lastfmEnabled).toBe(true);
    expect(migrated.metadataArtistInfoEnabled).toEqual({});
    expect(migrated.metadataArtistInfoOrder).toEqual(['lastfm']);
  });

  it('keeps it on for someone who had only the old similar-artists flag on', () => {
    expect(migrateMetadataSettings({ metadataArtistInfoEnabled: {}, lastfmEnabled: true }).lastfmEnabled).toBe(true);
  });

  it('leaves it off when neither was on, and passes a fresh install through', () => {
    expect(migrateMetadataSettings<Partial<MetadataSettingsState>>({ metadataArtistInfoEnabled: { lastfm: false } }).lastfmEnabled).toBe(false);
    expect(migrateMetadataSettings(undefined)).toBeUndefined();
  });
});

describe('setLastfmEnabled', () => {
  it('starts off, and turning it on puts Last.fm in the artist-info chain once', () => {
    let state = reducer(undefined, { type: '@@init' });
    expect(selectLastfmEnabled(stateOf(state))).toBe(false);

    state = reducer(state, setLastfmEnabled(true));
    state = reducer(state, setLastfmEnabled(false));
    state = reducer(state, setLastfmEnabled(true));

    expect(selectLastfmEnabled(stateOf(state))).toBe(true);
    expect(state.metadataArtistInfoOrder).toEqual(['lastfm']);
  });
});
