import { baseTitle, collapseEditions, isStudioAlbum } from './discography';
import type { MbReleaseGroup } from './';

const rg = (id: string, title: string, date: string, extra: Partial<MbReleaseGroup> = {}): MbReleaseGroup => ({
  id,
  title,
  'first-release-date': date,
  'primary-type': 'Album',
  ...extra,
});

describe('baseTitle', () => {
  it('drops edition suffixes but keeps other brackets', () => {
    expect(baseTitle('The Sickness (25th Anniversary Edition)')).toBe('the sickness');
    expect(baseTitle('Evolution (Deluxe Edition)')).toBe('evolution');
    expect(baseTitle('Asylum [Remastered] (Deluxe Edition)')).toBe('asylum');
    expect(baseTitle('Songs (Of Love)')).toBe('songs (of love)');
  });
});

describe('isStudioAlbum', () => {
  it('excludes anything carrying a secondary type', () => {
    expect(isStudioAlbum(rg('1', 'A', '2000'))).toBe(true);
    expect(isStudioAlbum(rg('2', 'A Live', '2001', { 'secondary-types': ['Live'] }))).toBe(false);
    expect(isStudioAlbum(rg('3', 'A', '2001', { 'primary-type': 'Single' }))).toBe(false);
  });
});

describe('collapseEditions', () => {
  it('keeps one record per title, preferring the earliest and plainest', () => {
    const list = [
      rg('1', 'The Sickness (25th Anniversary Edition)', '2025'),
      rg('2', 'The Sickness', '2000'),
      rg('3', 'Divisive', '2022'),
      rg('4', 'Divisive', '2022'),
    ];
    expect(collapseEditions(list).map(x => x.id)).toEqual(['2', '3']);
  });

  it('does not merge a single into the album of the same name', () => {
    const list = [rg('1', 'Indestructible', '2008'), rg('2', 'Indestructible', '2008', { 'primary-type': 'Single' })];
    expect(collapseEditions(list)).toHaveLength(2);
  });
});
