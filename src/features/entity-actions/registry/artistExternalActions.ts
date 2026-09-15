import React from 'react';
import { Share2, SquareArrowOutUpRight } from 'lucide-react-native';
import type { Artist } from '@/domain/entities/Artist';
import { iconSize } from '@/constants/design';
import type { ActionDef, BaseActionContext } from '../types';

/**
 * A browsed artist's options.
 *
 * Deliberately short: an artist nobody's server has cannot be played,
 * downloaded, queued or favourited, and every library action on
 * `artistActions` is one of those. What is left is what you can do with the
 * record itself — take it out of the app, or go to where it came from — which
 * is also what the external *album* sheet ends on, so the two read the same.
 *
 * **Want belongs here too, and is not built yet.** An artist want (Lidarr
 * monitors the artist; otherwise a bookmark that surfaces library arrivals) is
 * its own piece of work. When it lands it goes at the top of this list, above
 * `share`, matching `albumExternalActions` where Want leads — and it wires to
 * `useWantToggle` in `../shared/wantActions`, which already carries the one
 * Want/Unwant implementation and needs only an artist `WantUnit`.
 */
export interface ArtistExternalActionContext extends BaseActionContext {
  kind: 'artist';
  origin: 'external';
  artist: Artist;
  t: (key: string, opts?: Record<string, unknown>) => string;
  colors: { secondary: string };
  /** i18n key naming the source this artist has a public page on, or null. */
  webSourceNameKey: string | null;
  handlers: {
    share: () => void;
    openInSource: () => void;
  };
}

type Ctx = ArtistExternalActionContext;
const sz = iconSize.loader;

export const artistExternalActions: ActionDef<Ctx>[] = [
  // ← Want goes here when artist wants land; see the note above.
  {
    id: 'share',
    label: ctx => ctx.t('artistOptions.actions.share'),
    icon: ctx => React.createElement(Share2, { size: sz, color: ctx.colors.secondary }),
    visible: ctx => ctx.webSourceNameKey !== null,
    invoke: ctx => ctx.handlers.share(),
  },
  {
    id: 'openInSource',
    label: ctx => ctx.t('externalOptions.openInSource', {
      source: ctx.webSourceNameKey ? ctx.t(ctx.webSourceNameKey) : '',
    }),
    icon: ctx => React.createElement(SquareArrowOutUpRight, { size: sz, color: ctx.colors.secondary }),
    visible: ctx => ctx.webSourceNameKey !== null,
    invoke: ctx => ctx.handlers.openInSource(),
  },
];
