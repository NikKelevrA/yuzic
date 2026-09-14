import type { Song } from "@/domain/entities/Song";
import type { Provenance } from "@/domain/identity/Provenance";
import { requireProvenance, type MediaBrowserClient } from "../client";
import { mapSong } from "../mapSong";
import { MediaBrowserItem, MediaBrowserItemsResponse } from "../types";

type GetInstantMixResult = Song[];

function parseInstantMixResponse(text: string): MediaBrowserItemsResponse {
  const trimmed = text.trim();
  if (trimmed.startsWith("data:")) {
    const commaIdx = trimmed.indexOf(",");
    if (commaIdx >= 0) {
      const decoded = decodeURIComponent(trimmed.slice(commaIdx + 1).trim());
      return JSON.parse(decoded);
    }
  }
  return JSON.parse(trimmed);
}

async function fetchInstantMix(
  client: MediaBrowserClient,
  itemId: string,
  limit = 50
) {
  const path = `/Items/${itemId}/InstantMix?UserId=${client.userId}&Limit=${limit}`;
  const text = await client.requestText(path, {
    headers: { "Content-Type": "application/json" },
  });
  return parseInstantMixResponse(text);
}

function normalizeItem(s: MediaBrowserItem, client: MediaBrowserClient, provenance: Provenance): Song | null {
  if (!s?.Id || s.Type !== "Audio") return null;
  return mapSong(s, { provenance, brand: client.brand });
}

export async function getInstantMix(
  client: MediaBrowserClient,
  itemId: string,
  limit = 50
): Promise<GetInstantMixResult> {
  const raw = await fetchInstantMix(client, itemId, limit);
  const items = raw?.Items ?? [];
  const provenance = requireProvenance(client);
  return items
    .map((s) => normalizeItem(s, client, provenance))
    .filter((s): s is Song => s !== null);
}
