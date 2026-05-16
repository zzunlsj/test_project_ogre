# Data Schema — OGRE Web Game

All constants below are **canonical**. Implementations live under `src/data/`.

## 1. OGRE Mk.III Full Stats

`src/data/ogreStats.ts`

```typescript
import type { OgreStats, OgreMovementBand } from '@/types';

export const OGRE_MK3: OgreStats = {
  id: 'ogre-mk3',
  mark: 'III',
  treads: 45,
  maxTreads: 45,
  movement: 3,
  facing: 4, // N
  col: 7,
  row: 0,
  neutralized: false,
  weapons: [
    { id: 'main-1',      type: 'main',      atk: 4, def: 3, range: 4, count: 1, remaining: 1, disabled: false },
    { id: 'secondary-1', type: 'secondary', atk: 3, def: 3, range: 3, count: 2, remaining: 2, disabled: false },
    { id: 'secondary-2', type: 'secondary', atk: 3, def: 3, range: 3, count: 2, remaining: 2, disabled: false },
    { id: 'missile-1',   type: 'missile',   atk: 6, def: 5, range: 5, count: 4, remaining: 4, disabled: false },
    { id: 'missile-2',   type: 'missile',   atk: 6, def: 5, range: 5, count: 4, remaining: 4, disabled: false },
    { id: 'missile-3',   type: 'missile',   atk: 6, def: 5, range: 5, count: 4, remaining: 4, disabled: false },
    { id: 'missile-4',   type: 'missile',   atk: 6, def: 5, range: 5, count: 4, remaining: 4, disabled: false },
    { id: 'ap-1',        type: 'ap',        atk: 1, def: 1, range: 1, count: 8, remaining: 8, disabled: false },
    { id: 'ap-2',        type: 'ap',        atk: 1, def: 1, range: 1, count: 8, remaining: 8, disabled: false },
    { id: 'ap-3',        type: 'ap',        atk: 1, def: 1, range: 1, count: 8, remaining: 8, disabled: false },
    { id: 'ap-4',        type: 'ap',        atk: 1, def: 1, range: 1, count: 8, remaining: 8, disabled: false },
    { id: 'ap-5',        type: 'ap',        atk: 1, def: 1, range: 1, count: 8, remaining: 8, disabled: false },
    { id: 'ap-6',        type: 'ap',        atk: 1, def: 1, range: 1, count: 8, remaining: 8, disabled: false },
    { id: 'ap-7',        type: 'ap',        atk: 1, def: 1, range: 1, count: 8, remaining: 8, disabled: false },
    { id: 'ap-8',        type: 'ap',        atk: 1, def: 1, range: 1, count: 8, remaining: 8, disabled: false },
  ],
};

/** Tread damage -> movement table (Pocket Edition). */
export const OGRE_MOVEMENT_TABLE: OgreMovementBand[] = [
  { treadMin: 41, treadMax: 45, movement: 3 },
  { treadMin: 31, treadMax: 40, movement: 2 },
  { treadMin: 21, treadMax: 30, movement: 2 },
  { treadMin: 11, treadMax: 20, movement: 1 },
  { treadMin: 6,  treadMax: 10, movement: 1 },
  { treadMin: 1,  treadMax: 5,  movement: 0 },
  { treadMin: 0,  treadMax: 0,  movement: 0 },
];

/** RAM result table: d6 1-3 = D, 4-6 = X */
export const OGRE_RAM_RESULT = ['D', 'D', 'D', 'X', 'X', 'X'] as const;

/** OGRE neutralized when all weapons disabled AND treads <= 5. */
export const OGRE_NEUTRALIZED_TREAD_THRESHOLD = 5;
```

## 2. Defender Unit Stats

`src/data/defenderUnits.ts`

```typescript
import type { DefenderUnitType } from '@/types';

export interface DefenderUnitTemplate {
  type: DefenderUnitType;
  label: string;
  atk: number;
  def: number;
  move: number;
  range: number;
  /** Armor slot cost (0 for INF / CP). */
  slots: number;
  /** Infantry-only point cost per squad (0 for non-INF). */
  infPoints: number;
  /** GEV-only secondary move. */
  secondaryMove?: number;
  /** HOW indirect-fire. */
  indirect?: boolean;
}

export const DEFENDER_UNITS: Record<DefenderUnitType, DefenderUnitTemplate> = {
  HVY: { type: 'HVY', label: 'Heavy Tank',   atk: 4, def: 3, move: 2, range: 2, slots: 3, infPoints: 0 },
  MSL: { type: 'MSL', label: 'Missile Tank', atk: 6, def: 2, move: 3, range: 4, slots: 2, infPoints: 0 },
  GEV: { type: 'GEV', label: 'GEV',          atk: 3, def: 2, move: 4, range: 2, slots: 2, infPoints: 0, secondaryMove: 2 },
  HOW: { type: 'HOW', label: 'Howitzer',     atk: 6, def: 1, move: 1, range: 8, slots: 2, infPoints: 0, indirect: true },
  INF: { type: 'INF', label: 'Infantry',     atk: 1, def: 1, move: 1, range: 1, slots: 0, infPoints: 2 },
  CP:  { type: 'CP',  label: 'Command Post', atk: 0, def: 3, move: 0, range: 0, slots: 0, infPoints: 0 },
};
```

## 3. CRT (Combat Results Table) — Pocket Edition

`src/data/crt.ts`

```typescript
import type { CrtRatioKey, CrtRow } from '@/types';

/** d6 1..6 -> NE | D | X. Index 0 = die face 1. */
export const CRT: Record<CrtRatioKey, CrtRow> = {
  '1:3-': ['NE', 'NE', 'NE', 'NE', 'NE', 'D'],
  '1:2':  ['NE', 'NE', 'NE', 'NE', 'D',  'D'],
  '1:1':  ['NE', 'NE', 'NE', 'D',  'D',  'X'],
  '2:1':  ['NE', 'NE', 'D',  'D',  'X',  'X'],
  '3:1':  ['NE', 'D',  'D',  'X',  'X',  'X'],
  '4:1+': ['D',  'X',  'X',  'X',  'X',  'X'],
};

/** Ridge bonus shifts ratio one column LEFT (defender-favorable). */
export const RATIO_ORDER: CrtRatioKey[] = ['1:3-', '1:2', '1:1', '2:1', '3:1', '4:1+'];

export function ratioFromAtkDef(atk: number, def: number): CrtRatioKey {
  if (def <= 0) return '4:1+';
  const r = atk / def;
  if (r >= 4)  return '4:1+';
  if (r >= 3)  return '3:1';
  if (r >= 2)  return '2:1';
  if (r >= 1)  return '1:1';
  if (r >= 0.5) return '1:2';
  return '1:3-';
}

export function applyRidgeBonus(ratio: CrtRatioKey): CrtRatioKey {
  const idx = RATIO_ORDER.indexOf(ratio);
  return RATIO_ORDER[Math.max(0, idx - 1)];
}
```

## 4. Terrain Effects

| Terrain    | Move Cost | Defense Bonus            | Notes                                      |
|------------|-----------|--------------------------|--------------------------------------------|
| `plain`    | 1         | none                     | Default.                                   |
| `crater`   | +1 (=2)   | +1 column on CRT         | Cannot be entered by HOW (immobile anyway).|
| `ridge`    | 1         | +1 column when defender behind ridge edge facing attacker | Edge-based, not hex-based.    |

Implementation note: `ridge` is per-edge, not per-hex. A hex with `ridgeEdges: [4]` has a ridge on its **north** edge only; movement across that edge costs the same but combat across it grants the defender the bonus.

## 5. Map Crater Coordinates (0-index col,row)

`src/data/map.ts`

```typescript
import type { HexCoord, EdgeIndex } from '@/types';

export const CRATER_COORDS: HexCoord[] = [
  { col: 2,  row: 2  },
  { col: 12, row: 2  },
  { col: 13, row: 2  },
  { col: 9,  row: 3  },
  { col: 4,  row: 4  },
  { col: 13, row: 5  },
  { col: 0,  row: 6  },
  { col: 8,  row: 6  },
  { col: 14, row: 6  },
  { col: 5,  row: 7  },
  { col: 1,  row: 8  },
  { col: 12, row: 8  },
  { col: 5,  row: 10 },
  { col: 6,  row: 10 },
  { col: 2,  row: 11 },
  { col: 8,  row: 12 },
  { col: 13, row: 12 },
];
```

## 6. Map Ridge Edges (60 entries, [col, row, edgeIdx])

EdgeIdx convention: `SE=0, S=1, SW=2, NW=3, N=4, NE=5`.

```typescript
export interface RidgeEdge { col: number; row: number; edge: EdgeIndex; }

export const RIDGE_EDGES: RidgeEdge[] = [
  { col: 0,  row: 0,  edge: 0 }, { col: 7,  row: 0,  edge: 0 },
  { col: 0,  row: 1,  edge: 5 }, { col: 4,  row: 1,  edge: 5 },
  { col: 5,  row: 1,  edge: 1 }, { col: 6,  row: 1,  edge: 2 },
  { col: 8,  row: 2,  edge: 5 }, { col: 8,  row: 2,  edge: 1 },
  { col: 2,  row: 3,  edge: 0 }, { col: 3,  row: 3,  edge: 1 },
  { col: 3,  row: 3,  edge: 0 }, { col: 8,  row: 3,  edge: 1 },
  { col: 8,  row: 3,  edge: 0 }, { col: 11, row: 3,  edge: 1 },
  { col: 12, row: 3,  edge: 2 }, { col: 2,  row: 5,  edge: 1 },
  { col: 6,  row: 5,  edge: 2 }, { col: 8,  row: 5,  edge: 0 },
  { col: 10, row: 5,  edge: 0 }, { col: 11, row: 5,  edge: 1 },
  { col: 1,  row: 6,  edge: 0 }, { col: 5,  row: 6,  edge: 0 },
  { col: 6,  row: 6,  edge: 1 }, { col: 10, row: 6,  edge: 1 },
  { col: 10, row: 6,  edge: 0 }, { col: 10, row: 6,  edge: 2 },
  { col: 2,  row: 7,  edge: 0 }, { col: 3,  row: 7,  edge: 0 },
  { col: 7,  row: 7,  edge: 0 }, { col: 13, row: 7,  edge: 1 },
  { col: 2,  row: 8,  edge: 0 }, { col: 1,  row: 9,  edge: 0 },
  { col: 2,  row: 9,  edge: 1 }, { col: 8,  row: 9,  edge: 5 },
  { col: 1,  row: 10, edge: 0 }, { col: 2,  row: 10, edge: 5 },
  { col: 2,  row: 10, edge: 2 }, { col: 10, row: 10, edge: 1 },
  { col: 10, row: 10, edge: 0 }, { col: 10, row: 10, edge: 2 },
  { col: 1,  row: 11, edge: 5 }, { col: 7,  row: 11, edge: 5 },
  { col: 7,  row: 11, edge: 0 }, { col: 9,  row: 11, edge: 1 },
  { col: 9,  row: 11, edge: 0 }, { col: 4,  row: 12, edge: 0 },
  { col: 5,  row: 12, edge: 1 }, { col: 6,  row: 12, edge: 5 },
  { col: 6,  row: 12, edge: 0 }, { col: 4,  row: 13, edge: 5 },
  { col: 2,  row: 14, edge: 1 }, { col: 2,  row: 14, edge: 0 },
  { col: 6,  row: 14, edge: 0 }, { col: 7,  row: 14, edge: 1 },
  { col: 8,  row: 14, edge: 1 }, { col: 8,  row: 14, edge: 2 },
  { col: 9,  row: 14, edge: 0 }, { col: 12, row: 14, edge: 1 },
  { col: 12, row: 14, edge: 0 }, { col: 13, row: 14, edge: 1 },
];
```

## 7. Map Zones

```typescript
export const ZONE_ROWS = {
  northern: { rowMin: 0,  rowMax: 6  }, // R01-R07
  central:  { rowMin: 7,  rowMax: 14 }, // R08-R15
  southern: { rowMin: 15, rowMax: 21 }, // R16-R22
} as const;

export const MAP_DIMENSIONS = { width: 15, height: 22 } as const;
```

## 8. Standard Scenario (Mk.III)

`src/data/scenario.ts`

```typescript
import type { ScenarioConfig } from '@/types';

export const STANDARD_SCENARIO: Omit<ScenarioConfig, 'map'> = {
  id: 'mk3-standard',
  ogreMark: 'III',
  ogreEntryRow: 0,        // R01
  cpAllowedRows: [7, 10], // R08-R11 (0-index 7..10)
  defenderZones: ['southern', 'central'],
  budget: {
    infantryPoints: 20,   // 1 squad = 2 pts
    armorSlots: 12,
  },
  turnLimit: undefined,   // play until victory condition
};
```

## 9. Victory Conditions

| Side     | Wins When                                                                |
|----------|--------------------------------------------------------------------------|
| OGRE     | CP destroyed (state === 'dead').                                         |
| Defender | OGRE neutralized: all weapons `disabled === true` AND `treads <= 5`.     |
| Defender | (Optional) CP survives until `turn > turnLimit` if `turnLimit` is set.   |

## 10. CRT Style Palette (for ui-engineer reference)

```typescript
export const CRT_PALETTE = {
  bg:      '#070C07',
  fg:      '#33FF33', // primary green
  fgDim:   '#00AA00',
  warn:    '#FFAA00',
  danger:  '#FF3333',
  scanline:'#000000',
} as const;
```

## 11. Dice Hold Wave Speeds

```typescript
export const WAVE_SPEEDS = {
  slow:   { multiplier: 0.8, frequencyHz: 1.6 },
  normal: { multiplier: 1.0, frequencyHz: 2.0 },
  fast:   { multiplier: 1.2, frequencyHz: 2.4 },
} as const;

export const DICE_BIAS_RANGE = 0.3; // +/- max bias applied to roll
```
