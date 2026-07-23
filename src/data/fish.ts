// Fish data — loaded from public/data/fish.json at boot.
// Consumers read FISH_DATA[index].heal to get the HP restore value.

export interface FishDef {
  name: string;
  heal: number;
}

// Fallback values — used if the JSON file is missing or malformed.
const FALLBACK: FishDef[] = [
  { name: '鲤鱼', heal: 15 },
  { name: '鳟鱼', heal: 20 },
  { name: '金鱼', heal: 30 },
];

// Mutable array — mutated in-place by applyFishData so existing imports stay live.
export const FISH_DATA: FishDef[] = [...FALLBACK];

export function applyFishData(json: unknown): void {
  const rows = (json as { fish?: unknown[] } | null)?.fish;
  if (!Array.isArray(rows) || rows.length === 0) return; // keep fallback
  const next: FishDef[] = rows.map((r: any) => ({
    name: typeof r?.name === 'string' ? r.name : '鱼',
    heal: Math.max(0, Math.round(Number(r?.heal ?? 10))),
  }));
  if (next.length === 0) return;
  FISH_DATA.length = 0;
  FISH_DATA.push(...next);
}
