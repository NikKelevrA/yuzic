import { isVirtualCatalogId } from './virtualCatalogId';

describe('isVirtualCatalogId', () => {
  it('recognizes every shape a catalog bridge mints', () => {
    expect(isVirtualCatalogId('mb-artist-70248960-cb53-4ea4-943a-edb18f7d336f')).toBe(true);
    expect(isVirtualCatalogId('mb-rg-72d15666-c1cd-410c-b89a-a7eae9e5afbe')).toBe(true);
    expect(isVirtualCatalogId('mb-f7e38d44-e6a3-4b0a-9f1a-6a0f8a1f0c2e')).toBe(true); // bare recording-mbid shape
  });

  it('leaves a real server-native id alone', () => {
    expect(isVirtualCatalogId('al5bcEV9ImEdQ5oWuIq6o5')).toBe(false); // Navidrome's own base62 id shape
    expect(isVirtualCatalogId('')).toBe(false);
  });
});
