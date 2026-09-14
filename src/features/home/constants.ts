import { spacing } from '@/constants/design'

/**
 * Shared layout constants for horizontal explore section grids.
 *
 * `SECTION_H_PADDING` is the one home inset. It had three definitions — this
 * one as a literal 16, `sectionStyles`' as `spacing.page`, and a 12 that
 * QuickPicks and the section empty state each declared for themselves — so an
 * empty shelf sat 4pt further in than the shelf it replaced. The lint rule
 * could not see any of it: it reads a literal, not an identifier.
 */
export const SECTION_H_PADDING = spacing.page
export const SECTION_GRID_GAP = spacing.md
export const SECTION_VISIBLE_ITEMS = 2.5

/**
 * Shared stale-time values for Deezer explore section queries.
 * Charts/releases refresh every 6h; personalised discovery every 12h.
 */
export const STALE_DEEZER_CHARTS = 1000 * 60 * 60 * 6    // 6h
export const STALE_DEEZER_DISCOVERY = 1000 * 60 * 60 * 12 // 12h

/** How many related artists Home asks for, and from how many seeds. */
export const HOME_RELATED_ARTIST_LIMIT = 40
export const HOME_SEED_ARTISTS = 4
export const HOME_RELATED_PER_SEED = 12
export const HOME_GENRE_ARTIST_LIMIT = 40

/** Quick picks: pages of four, three pages, drawn from a pool twice that size, decaying over a week. */
export const QUICK_PICKS_PAGE_SIZE = 4
const QUICK_PICKS_TOTAL_PAGES = 3
const QUICK_PICKS_TOTAL = QUICK_PICKS_PAGE_SIZE * QUICK_PICKS_TOTAL_PAGES
export const QUICK_PICKS_CANDIDATE_POOL = QUICK_PICKS_TOTAL * 2
export const QUICK_PICKS_DECAY_MS = 7 * 24 * 60 * 60 * 1000
export const QUICK_PICKS_PEEK = 28
