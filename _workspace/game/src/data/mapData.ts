import type { HexMap, HexCell, EdgeIndex } from '@/types';

// Zone 구분: Northern=R01-R07(row 0-6), Central=R08-R15(row 7-14), Southern=R16-R22(row 15-21)

// 크레이터 좌표 (0-index col,row)
const CRATER_SET = new Set<string>([
  '2,2', '12,2', '13,2',
  '9,3',
  '4,4',
  '13,5',
  '0,6', '8,6', '14,6',
  '5,7',
  '1,8', '12,8',
  '5,10', '6,10',
  '2,11',
  '8,12', '13,12',
]);

// 능선 데이터: key='col,row' → edgeIdx[]
// EdgeIdx convention: SE=0, S=1, SW=2, NW=3, N=4, NE=5
// 같은 헥스에 여러 edge가 있는 경우 배열로 합침
const RIDGE_MAP = new Map<string, EdgeIndex[]>([
  // R01 (row 0)
  ['0,0', [0]],
  ['7,0', [0]],
  // R02 (row 1)
  ['0,1', [5]],
  ['4,1', [5]],
  ['5,1', [1]],
  ['6,1', [2]],
  // R03 (row 2)
  ['8,2', [5, 1]],
  // R04 (row 3)
  ['2,3', [0]],
  ['3,3', [1, 0]],
  ['8,3', [1, 0]],
  ['11,3', [1]],
  ['12,3', [2]],
  // R06 (row 5)
  ['2,5', [1]],
  ['6,5', [2]],
  ['8,5', [0]],
  ['10,5', [0]],
  ['11,5', [1]],
  // R07 (row 6)
  ['1,6', [0]],
  ['5,6', [0]],
  ['6,6', [1]],
  ['10,6', [1, 0, 2]],
  // R08 (row 7)
  ['2,7', [0]],
  ['3,7', [0]],
  ['7,7', [0]],
  ['13,7', [1]],
  // R09 (row 8)
  ['2,8', [0]],
  // R10 (row 9)
  ['1,9', [0]],
  ['2,9', [1]],
  ['8,9', [5]],
  // R11 (row 10)
  ['1,10', [0]],
  ['2,10', [5, 2]],
  ['10,10', [1, 0, 2]],
  // R12 (row 11)
  ['1,11', [5]],
  ['7,11', [5, 0]],
  ['9,11', [1, 0]],
  // R13 (row 12)
  ['4,12', [0]],
  ['5,12', [1]],
  ['6,12', [5, 0]],
  // R14 (row 13)
  ['4,13', [5]],
  // R15 (row 14)
  ['2,14', [1, 0]],
  ['6,14', [0]],
  ['7,14', [1]],
  ['8,14', [1, 2]],
  ['9,14', [0]],
  ['12,14', [1, 0]],
  ['13,14', [1]],
]);

/**
 * Determine if a (col,row) coordinate is a valid hex cell on the map.
 * R22 (row=21) only has hexes for odd col (col%2===1). All other rows valid.
 */
export function isValidHex(col: number, row: number): boolean {
  if (col < 0 || col >= 15 || row < 0 || row >= 22) return false;
  if (row === 21 && col % 2 === 0) return false;
  return true;
}

/**
 * Build the full 15x22 hex map with terrain and zone metadata.
 */
export function buildMap(): HexMap {
  const cells: HexCell[][] = [];
  for (let col = 0; col < 15; col++) {
    cells[col] = [];
    for (let row = 0; row < 22; row++) {
      const key = `${col},${row}`;
      const zone: HexCell['zone'] =
        row <= 6 ? 'northern' : row <= 14 ? 'central' : 'southern';

      if (!isValidHex(col, row)) {
        // R22 짝수 col 자리: 마커 셀로 채워두되 이후 로직에서 무시
        cells[col][row] = {
          coord: { col, row },
          terrain: { type: 'plain' },
          zone,
        };
        continue;
      }

      if (CRATER_SET.has(key)) {
        cells[col][row] = {
          coord: { col, row },
          terrain: { type: 'crater' },
          zone,
        };
      } else if (RIDGE_MAP.has(key)) {
        const edges = RIDGE_MAP.get(key) as EdgeIndex[];
        cells[col][row] = {
          coord: { col, row },
          terrain: { type: 'ridge', ridgeEdges: [...edges] },
          zone,
        };
      } else {
        cells[col][row] = {
          coord: { col, row },
          terrain: { type: 'plain' },
          zone,
        };
      }
    }
  }
  return { width: 15, height: 22, cells };
}

export const MAP_DATA: HexMap = buildMap();
