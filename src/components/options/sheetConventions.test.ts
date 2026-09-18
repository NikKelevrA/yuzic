import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '../..');

/**
 * The sheets that are deliberately their own design, and why.
 *
 * The first two are long-standing non-goals: `PlaylistList` is a full-height
 * picker with its own chrome (it replaces the handle with a close button), and
 * `SelectionBottomSheet` is a search-and-pick list. The onboarding scheme
 * sheet is the third: onboarding is a permanently dark flow drawn from
 * `onDark`, so a sheet that followed the app's light theme would be a white
 * card on a black screen. Its structural props — dynamic sizing, the shared
 * backdrop, stacking — match everything else; only its colours don't.
 */
const DELIBERATELY_DISTINCT = [
  'components/PlaylistList.tsx',
  'components/SelectionBottomSheet.tsx',
  'features/onboarding/address/index.tsx',
];

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name) ? [full] : [];
  });
}

/** A file that actually renders a sheet, not one that merely names the type
 *  in a `forwardRef<BottomSheetModal, …>`. */
function rendersASheet(source: string): boolean {
  return /<BottomSheetModal\s*$/m.test(source) || /<BottomSheetModal\s+\w+=/.test(source);
}

/**
 * `path.relative` answers in the platform's separator, and the exemption list
 * above is written with `/` like every other path in this repository. On
 * Windows the two never matched, so all three deliberately-distinct sheets
 * were asserted against the shared scaffold and the suite failed four tests
 * that CI — on Linux — reported green. A check that is red only on one
 * person's machine is a check they learn to scroll past.
 */
const posix = (file: string) => file.split(path.sep).join('/');

const allSheets = sourceFiles(SRC)
  .filter(file => rendersASheet(fs.readFileSync(file, 'utf8')))
  .map(file => posix(path.relative(SRC, file)))
  .sort();

const sheets = allSheets.filter(file => !DELIBERATELY_DISTINCT.includes(file));

const read = (file: string) => fs.readFileSync(path.join(SRC, file), 'utf8');

/**
 * Every sheet is the same sheet.
 *
 * Six of them had grown their own answer to the same four questions — a raw
 * `colors.card` background that ignored the user's corner radius, a snap point
 * expressed as a percentage of the screen the content had no say in, a
 * backdrop that wasn't the shared one (so Android's back button went to the
 * screen underneath), padding that ended flush with the home indicator. None
 * of it was visible in isolation; all of it was visible opening two sheets in
 * a row.
 */
describe('bottom sheet conventions', () => {
  it('finds the sheets to check', () => {
    expect(sheets.length).toBeGreaterThan(10);
  });

  /**
   * The exemption list has to keep naming real files, or it is a guard that
   * guards nothing — which is how this suite came to fail on Windows while
   * passing in CI. A renamed or deleted sheet makes its entry dead, and a dead
   * entry is indistinguishable from a working one until the sheet it was
   * meant to cover comes back under a new name and is quietly held to a
   * scaffold it was deliberately excused from.
   */
  it.each(DELIBERATELY_DISTINCT)('%s is still a sheet worth excusing', file => {
    expect(allSheets).toContain(file);
  });

  it.each(sheets)('%s draws the shared surface', file => {
    expect(read(file)).toContain('useOptionSheetBackground');
  });

  it.each(sheets)('%s uses the shared backdrop', file => {
    expect(read(file)).toContain('renderBackdrop');
  });

  it.each(sheets)('%s keeps the handle', file => {
    expect(read(file)).toContain('handleIndicatorStyle');
  });

  /**
   * A percentage is the caller guessing at the height of content it does not
   * lay out. It is right for a sheet that is a scrolling list of unknown
   * length (an options sheet over a long info section, lyrics, the output
   * picker while it scans) and wrong for a fixed stack of rows, which is what
   * every sheet converted here had.
   */
  it.each(sheets)('%s sizes itself by its content or scrolls', file => {
    const source = read(file);
    const dynamic = /enableDynamicSizing(?!=\{false\})/.test(source);
    const scrolls = source.includes('BottomSheetScrollView') || source.includes('BottomSheetFlatList');
    expect(dynamic || scrolls).toBe(true);
  });
});
