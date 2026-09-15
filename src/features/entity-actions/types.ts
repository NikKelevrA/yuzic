import type { ReactNode } from 'react';

/**
 * The four entity kinds the options sheets cover. `song` and `album` each
 * have a `library`/`external` variant (see `origin` on the context types
 * below) because those two sheets render genuinely different content for
 * the two cases — not just a different action list, but a different header,
 * snap points, and info section. `artist` and `playlist` have no external
 * variant: an `Artist`/`Playlist` domain entity is always the one shape.
 */
type EntityKind = 'song' | 'album' | 'artist' | 'playlist';

type EntityOrigin = 'library' | 'external';

/** Common fields every per-kind action context carries. */
export interface BaseActionContext {
  kind: EntityKind;
  origin: EntityOrigin;
  /** Dismisses the owning BottomSheetModal. */
  close: () => void;
}

/**
 * A declarative action description. `TCtx` is the specific per-kind context
 * shape (see `registry/*Actions.ts`) the predicates and `invoke` run against.
 *
 * Nothing here does the work itself — `invoke` looks up a handler already
 * built (with all its hook-derived data) on the context by `useEntityActions`.
 * The registry only says *when* an action is visible/enabled and *what* it
 * looks like; the one shared implementation for each behaviour lives in
 * `shared/*.ts` and is wired into the context's `handlers` bag.
 */
export interface ActionDef<TCtx extends BaseActionContext> {
  /** Stable id, unique within a kind's action list. */
  id: string;
  /** i18n key for the row label; may depend on context (e.g. starred vs not). */
  label: (ctx: TCtx) => string;
  icon: (ctx: TCtx) => ReactNode;
  /** Whether the row renders at all for this entity + app state. */
  visible: (ctx: TCtx) => boolean;
  /** Whether the row responds to presses. Defaults to true when omitted. */
  enabled?: (ctx: TCtx) => boolean;
  /** Row shows a spinner in place of its icon. */
  loading?: (ctx: TCtx) => boolean;
  /** Fades the label only (e.g. "Downloaded", already-complete states). */
  dimLabel?: (ctx: TCtx) => boolean;
  /** Fades the whole row (e.g. playback actions while songs are loading). */
  dimRow?: (ctx: TCtx) => boolean;
  /** Overrides the row's label color (e.g. destructive red for Delete). */
  labelColor?: (ctx: TCtx) => string | undefined;
  trailing?: (ctx: TCtx) => ReactNode;
  testID?: (ctx: TCtx) => string | undefined;
  invoke: (ctx: TCtx) => void | Promise<void>;
}

/** What `useEntityActions` hands the sheet shell to render, one per row. */
export interface ResolvedAction {
  id: string;
  label: string;
  icon: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  dimLabel?: boolean;
  dimRow?: boolean;
  labelColor?: string;
  trailing?: ReactNode;
  testID?: string;
}

function resolveAction<TCtx extends BaseActionContext>(
  def: ActionDef<TCtx>,
  ctx: TCtx
): ResolvedAction | null {
  if (!def.visible(ctx)) return null;
  const enabled = def.enabled ? def.enabled(ctx) : true;
  return {
    id: def.id,
    label: def.label(ctx),
    icon: def.icon(ctx),
    onPress: () => void def.invoke(ctx),
    disabled: !enabled,
    loading: def.loading ? def.loading(ctx) : false,
    dimLabel: def.dimLabel ? def.dimLabel(ctx) : false,
    dimRow: def.dimRow ? def.dimRow(ctx) : false,
    labelColor: def.labelColor ? def.labelColor(ctx) : undefined,
    trailing: def.trailing ? def.trailing(ctx) : undefined,
    testID: def.testID ? def.testID(ctx) : undefined,
  };
}

/** Resolves an ordered action list, dropping the ones that aren't visible. */
export function resolveActions<TCtx extends BaseActionContext>(
  defs: ActionDef<TCtx>[],
  ctx: TCtx
): ResolvedAction[] {
  const out: ResolvedAction[] = [];
  for (const def of defs) {
    const resolved = resolveAction(def, ctx);
    if (resolved) out.push(resolved);
  }
  return out;
}
