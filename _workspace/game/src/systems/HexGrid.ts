// ============================================================================
// HexGrid - flat-top, odd-q offset coordinates
// col % 2 === 1 -> y offset upward by R*sqrt(3)/2
// ============================================================================

import type { HexCoord, EdgeIndex } from '@/types';

const SQRT3 = Math.sqrt(3);

/** edge index (SE=0, S=1, SW=2, NW=3, N=4, NE=5) -> direction delta in offset coords */
function neighborDelta(col: number, edge: EdgeIndex): { dc: number; dr: number } {
  const oddCol = (col % 2 + 2) % 2 === 1;
  // flat-top, odd-q vertical layout (odd cols shifted UP)
  // For a flat-top hex with odd-q, neighbors of an even col c at row r:
  //   N (4): (c, r-1), S (1): (c, r+1)
  //   NE(5): (c+1, r-1), SE(0): (c+1, r)
  //   NW(3): (c-1, r-1), SW(2): (c-1, r)
  // For odd col c:
  //   N (4): (c, r-1), S (1): (c, r+1)
  //   NE(5): (c+1, r),   SE(0): (c+1, r+1)
  //   NW(3): (c-1, r),   SW(2): (c-1, r+1)
  if (!oddCol) {
    switch (edge) {
      case 0: return { dc: +1, dr:  0 };
      case 1: return { dc:  0, dr: +1 };
      case 2: return { dc: -1, dr:  0 };
      case 3: return { dc: -1, dr: -1 };
      case 4: return { dc:  0, dr: -1 };
      case 5: return { dc: +1, dr: -1 };
    }
  } else {
    switch (edge) {
      case 0: return { dc: +1, dr: +1 };
      case 1: return { dc:  0, dr: +1 };
      case 2: return { dc: -1, dr: +1 };
      case 3: return { dc: -1, dr:  0 };
      case 4: return { dc:  0, dr: -1 };
      case 5: return { dc: +1, dr:  0 };
    }
  }
}

/** Reverse of an edge: opposite side of the shared border. */
function oppositeEdge(e: EdgeIndex): EdgeIndex {
  return ((e + 3) % 6) as EdgeIndex;
}

export class HexGrid {
  readonly cols = 15;
  readonly rows = 22;

  /** flat-top hex center; col%2===1 shifts y UP by half row height */
  hexCenter(col: number, row: number, R: number, ox: number, oy: number): [number, number] {
    const x = ox + col * R * 1.5;
    const yBase = oy + row * R * SQRT3;
    const y = (col % 2 === 1) ? yBase - R * SQRT3 * 0.5 : yBase;
    return [x, y];
  }

  /** 6 vertices for a flat-top hex starting at angle 0 (east). */
  hexPoints(cx: number, cy: number, R: number): { x: number; y: number }[] {
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const ang = (Math.PI / 3) * i;
      pts.push({ x: cx + R * Math.cos(ang), y: cy + R * Math.sin(ang) });
    }
    return pts;
  }

  offsetToCube(col: number, row: number): { x: number; y: number; z: number } {
    const x = col;
    const z = row - ((col - (col & 1)) >> 1);
    const y = -x - z;
    return { x, y, z };
  }

  cubeToOffset(x: number, _y: number, z: number): { col: number; row: number } {
    const col = x;
    const row = z + ((x - (x & 1)) >> 1);
    return { col, row };
  }

  distance(a: HexCoord, b: HexCoord): number {
    const ca = this.offsetToCube(a.col, a.row);
    const cb = this.offsetToCube(b.col, b.row);
    return Math.max(Math.abs(ca.x - cb.x), Math.abs(ca.y - cb.y), Math.abs(ca.z - cb.z));
  }

  isValid(col: number, row: number): boolean {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return false;
    // flat-top odd-q: row 21(R22)은 0-index 홀수 col(col%2===1)만 유효
    // 0-index 짝수 col(1-index 홀수 C01,C03...)은 row 20(R21)이 마지막 유효 행
    if (row === 21 && col % 2 === 0) return false;
    return true;
  }

  inBounds(c: HexCoord): boolean {
    return this.isValid(c.col, c.row);
  }

  neighbors(coord: HexCoord): HexCoord[] {
    const out: HexCoord[] = [];
    for (let e = 0 as EdgeIndex; e < 6; e++) {
      const d = neighborDelta(coord.col, e as EdgeIndex);
      const nc = coord.col + d.dc;
      const nr = coord.row + d.dr;
      if (this.isValid(nc, nr)) out.push({ col: nc, row: nr });
    }
    return out;
  }

  /** Get edge index from `from` toward `to` (must be adjacent). */
  edgeBetween(from: HexCoord, to: HexCoord): EdgeIndex | -1 {
    for (let e = 0 as EdgeIndex; e < 6; e++) {
      const d = neighborDelta(from.col, e as EdgeIndex);
      if (from.col + d.dc === to.col && from.row + d.dr === to.row) return e as EdgeIndex;
    }
    return -1;
  }

  /** BFS reachable. Crater hexes cannot be entered. Blockers occupy a hex (cannot stop there).
   *  passThroughSet: hexes that may be traversed but cannot be stopped on (friendly units).
   *  ridgeMap + canCrossRidge: if canCrossRidge=false, units cannot move across a ridge edge.
   */
  reachable(
    from: HexCoord,
    movePoints: number,
    craterSet: Set<string> = new Set(),
    blockerSet: Set<string> = new Set(),
    passThroughSet: Set<string> = new Set(),
    ridgeMap: Map<string, Set<number>> = new Map(),
    canCrossRidge: boolean = true
  ): HexCoord[] {
    const key = (c: HexCoord) => `${c.col},${c.row}`;
    const dist = new Map<string, number>();
    const out: HexCoord[] = [];
    dist.set(key(from), 0);

    const queue: { coord: HexCoord; cost: number }[] = [{ coord: from, cost: 0 }];
    while (queue.length) {
      queue.sort((a, b) => a.cost - b.cost);
      const cur = queue.shift()!;
      for (const nb of this.neighbors(cur.coord)) {
        const k = key(nb);
        if (blockerSet.has(k)) continue;
        // Crater: cannot enter at all
        if (craterSet.has(k)) continue;
        // Ridge: units without canCrossRidge cannot cross a ridge edge
        if (!canCrossRidge && ridgeMap.size > 0) {
          let ridgeBlocks = false;
          for (let e = 0; e < 6; e++) {
            const d = neighborDelta(cur.coord.col, e as EdgeIndex);
            if (cur.coord.col + d.dc === nb.col && cur.coord.row + d.dr === nb.row) {
              // e = cur → nb 방향의 엣지
              const srcKey = `${cur.coord.col},${cur.coord.row}`;
              const srcSet = ridgeMap.get(srcKey);
              if (srcSet && srcSet.has(e)) { ridgeBlocks = true; break; }
              // 반대: 도착 헥스에서 반대 방향 엣지 확인
              const revE = (e + 3) % 6;
              const dstKey = `${nb.col},${nb.row}`;
              const dstSet = ridgeMap.get(dstKey);
              if (dstSet && dstSet.has(revE)) { ridgeBlocks = true; }
              break;
            }
          }
          if (ridgeBlocks) continue;
        }
        const total = cur.cost + 1;  // uniform cost; craters are blocked entirely
        if (total > movePoints) continue;
        if (dist.has(k) && dist.get(k)! <= total) continue;
        dist.set(k, total);
        queue.push({ coord: nb, cost: total });
      }
    }
    for (const [k, _v] of dist) {
      if (k === key(from)) continue;
      // Pass-through hexes are traversable but cannot be a final stopping point
      if (passThroughSet.has(k)) continue;
      const [c, r] = k.split(',').map(Number);
      out.push({ col: c, row: r });
    }
    return out;
  }

  /** Compute a path from `from` to `to` using same costs as reachable().
   *  Returns sequence of hexes (excluding `from`, including `to`) or null if unreachable.
   */
  path(
    from: HexCoord,
    to: HexCoord,
    movePoints: number,
    craterSet: Set<string> = new Set(),
    blockerSet: Set<string> = new Set(),
    passThroughSet: Set<string> = new Set(),
    ridgeMap: Map<string, Set<number>> = new Map(),
    canCrossRidge: boolean = true
  ): HexCoord[] | null {
    const key = (c: HexCoord) => `${c.col},${c.row}`;
    const targetK = key(to);
    const dist = new Map<string, number>();
    const prev = new Map<string, HexCoord>();
    dist.set(key(from), 0);

    const queue: { coord: HexCoord; cost: number }[] = [{ coord: from, cost: 0 }];
    while (queue.length) {
      queue.sort((a, b) => a.cost - b.cost);
      const cur = queue.shift()!;
      if (key(cur.coord) === targetK) break;
      for (const nb of this.neighbors(cur.coord)) {
        const k = key(nb);
        if (blockerSet.has(k)) continue;
        // Crater: cannot enter at all
        if (craterSet.has(k)) continue;
        // Ridge edge restriction
        if (!canCrossRidge && ridgeMap.size > 0) {
          let ridgeBlocks = false;
          for (let e = 0; e < 6; e++) {
            const d = neighborDelta(cur.coord.col, e as EdgeIndex);
            if (cur.coord.col + d.dc === nb.col && cur.coord.row + d.dr === nb.row) {
              const srcKey = `${cur.coord.col},${cur.coord.row}`;
              const srcSet = ridgeMap.get(srcKey);
              if (srcSet && srcSet.has(e)) { ridgeBlocks = true; break; }
              const revE = (e + 3) % 6;
              const dstKey = `${nb.col},${nb.row}`;
              const dstSet = ridgeMap.get(dstKey);
              if (dstSet && dstSet.has(revE)) { ridgeBlocks = true; }
              break;
            }
          }
          if (ridgeBlocks) continue;
        }
        const total = cur.cost + 1;
        if (total > movePoints) continue;
        if (dist.has(k) && dist.get(k)! <= total) continue;
        // passThroughSet is allowed unless this is the final target
        if (passThroughSet.has(k) && k !== targetK) {
          // permit traversal
        }
        dist.set(k, total);
        prev.set(k, cur.coord);
        queue.push({ coord: nb, cost: total });
      }
    }
    if (!dist.has(targetK)) return null;
    const out: HexCoord[] = [];
    let cur: HexCoord | undefined = to;
    while (cur && !(cur.col === from.col && cur.row === from.row)) {
      out.unshift(cur);
      cur = prev.get(key(cur));
    }
    return out;
  }

  /** All hexes within `range` distance (inclusive). */
  inRange(from: HexCoord, range: number): HexCoord[] {
    const out: HexCoord[] = [];
    for (let c = 0; c < this.cols; c++) {
      for (let r = 0; r < this.rows; r++) {
        const target = { col: c, row: r };
        const d = this.distance(from, target);
        if (d > 0 && d <= range) out.push(target);
      }
    }
    return out;
  }

  /**
   * Ridge bonus: defender benefits if attacker crosses ridge edge into defender's hex.
   * Ridge edges live on a hex; we check both perspectives:
   *  - defender hex has ridge on the edge facing attacker
   *  - OR attacker hex has ridge on the edge facing defender
   */
  hasRidgeBonus(
    attacker: HexCoord,
    defender: HexCoord,
    ridgeEdges: Map<string, Set<number>>
  ): boolean {
    if (this.distance(attacker, defender) !== 1) return false;
    const edgeAtoD = this.edgeBetween(attacker, defender);
    const edgeDtoA = this.edgeBetween(defender, attacker);
    if (edgeAtoD === -1 || edgeDtoA === -1) return false;

    const attackerKey = `${attacker.col},${attacker.row}`;
    const defenderKey = `${defender.col},${defender.row}`;
    const aRidges = ridgeEdges.get(attackerKey);
    const dRidges = ridgeEdges.get(defenderKey);
    if (aRidges && aRidges.has(edgeAtoD)) return true;
    if (dRidges && dRidges.has(edgeDtoA)) return true;
    return false;
  }

  /** Helper: build ridge map from raw [col,row,edge] entries */
  static buildRidgeMap(
    entries: { col: number; row: number; edge: EdgeIndex }[]
  ): Map<string, Set<number>> {
    const m = new Map<string, Set<number>>();
    for (const e of entries) {
      const k = `${e.col},${e.row}`;
      if (!m.has(k)) m.set(k, new Set());
      m.get(k)!.add(e.edge);
    }
    return m;
  }

  /** Helper: build crater set */
  static buildCraterSet(entries: HexCoord[]): Set<string> {
    return new Set(entries.map((c) => `${c.col},${c.row}`));
  }

  /** Pixel -> nearest hex (rough; uses round on cube coords) */
  pixelToHex(px: number, py: number, R: number, ox: number, oy: number): HexCoord {
    const fx = (px - ox) / (R * 1.5);
    const col = Math.round(fx);
    const yShift = (col % 2 === 1) ? R * SQRT3 * 0.5 : 0;
    const row = Math.round((py - oy + yShift) / (R * SQRT3));
    return { col, row };
  }
}

export const neighborDeltaForTest = neighborDelta;
export const oppositeEdgeForTest = oppositeEdge;
