// ============================================================================
// SetupScene — defender unit deployment phase (hex map parity with GameScene)
// ============================================================================
import Phaser from 'phaser';
import { CRT, FONT, textStyle, applyGlow, addScanlines, addVignette } from '@/ui/CRTTheme';
import { CRATER_COORDS, RIDGE_EDGES } from '@/data/constants';
import type { DefenderUnitType, GameMode, Side } from '@/types';

// Palette unit type extended with 'OGRE' (placement-only marker, not a defender)
type PaletteUnitType = DefenderUnitType | 'OGRE';

interface PaletteItem {
  type: PaletteUnitType;
  label: string;
  cost: number;          // armor slots OR infantry points (per squad)
  isInfantry: boolean;
  isCp: boolean;
  isOgre: boolean;
  remaining: number;     // visual cap (per scenario)
}

interface PlacedUnit {
  type: PaletteUnitType;
  col: number;
  row: number;
  squads?: 1 | 2 | 3;   // infantry only: 1~3 stacked squads
}

// Versus mode placement stage: 'defender' first, then 'ogre'
type VersusStage = 'defender' | 'ogre';

const COLS = 15;
const ROWS = 22;
const SQRT3 = Math.sqrt(3);

// 존 경계 (0-index row)
const ZONE_NORTH_END     = 6;  // row 0-6  : NORTHERN — CP 배치 가능
const ZONE_CENTRAL_START = 7;
const ZONE_CENTRAL_END   = 14; // row 7-14 : CENTRAL  — ATK 합 ≤ 20

// flat-top odd-q : OGRE 진입 행 (각 컬럼의 마지막 유효 행)
const ogreEntryRow = (col: number): number => (col % 2 === 1) ? 21 : 20;
const isOgreEntry  = (col: number, row: number): boolean => row >= ogreEntryRow(col);

// 유닛 ATK (Central 존 합산)
const UNIT_ATK: Record<DefenderUnitType, number> = {
  HVY: 4, MSL: 6, GEV: 3, HOW: 6, INF: 1, CP: 0,
};

// Stored versus-mode defender placements (when transitioning to OGRE stage)
// kept on instance — see SetupScene state.

const CENTRAL_ATK_LIMIT = 20;

// 유닛 → SVG 키 매핑
const SVG_KEY: Record<DefenderUnitType, string> = {
  HVY: 'heavy_tank',
  MSL: 'missile_tank',
  GEV: 'gev',
  HOW: 'howitzer',
  INF: 'infantry_3', // INF는 squads 별로 후처리
  CP:  'cp',
};

export class SetupScene extends Phaser.Scene {
  // Hex map layout
  private R = 22;
  private OX = 0;
  private OY = 0;
  private minR = 6;

  // Pan / drag state
  private panX = 0;
  private panY = 0;
  private isPanning = false;
  private lastDragX = 0;
  private lastDragY = 0;

  // Map area constants (set in create())
  private FOOTER_H = 140;
  private HEADER_H = 60;
  private LEFT_OFFSET = 50;
  private RIGHT_OFFSET = 16;

  private mapG!: Phaser.GameObjects.Graphics;
  private ridgeG!: Phaser.GameObjects.Graphics;
  private placedG!: Phaser.GameObjects.Graphics;
  private placedObjs: Phaser.GameObjects.GameObject[] = [];
  private mapTexts: Phaser.GameObjects.Text[] = [];

  private placedUnits: PlacedUnit[] = [];
  private craterSet = new Set<string>();
  private ridgeMap  = new Map<string, Set<number>>();

  private palette: PaletteItem[] = [];
  private paletteUI: Phaser.GameObjects.Container[] = [];
  private selectedType: PaletteUnitType | null = null;
  private cursorIdx = 0;

  private armorSlotsLeft = 12;
  private infPointsLeft = 20;

  // Side-aware setup state
  private setupSide: Side = 'defender';            // which side is currently being placed
  private versusStage: VersusStage = 'defender';   // versus mode 2-stage tracking
  private storedDefenderPlacements: PlacedUnit[] = [];  // versus: stash after defender stage
  private ogrePlacement: { col: number; row: number } | null = null;

  private budgetText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private confirmBtn!: Phaser.GameObjects.Text;
  private centralAtkText!: Phaser.GameObjects.Text;
  private titleText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'setup' });
  }

  create(): void {
    this.cameras.main.setBackgroundColor(CRT.BG);
    this.cameras.main.fadeIn(220, 7, 12, 7);
    addScanlines(this);
    addVignette(this);

    const w = this.scale.width;
    const h = this.scale.height;

    // ── Init crater / ridge data ──
    this.craterSet = new Set(CRATER_COORDS.map(c => `${c.col},${c.row}`));
    this.ridgeMap = new Map<string, Set<number>>();
    for (const e of RIDGE_EDGES) {
      const k = `${e.col},${e.row}`;
      if (!this.ridgeMap.has(k)) this.ridgeMap.set(k, new Set());
      this.ridgeMap.get(k)!.add(e.edge);
    }

    // ── Determine which side is being placed (mode + playerSide) ──
    const mode = this.registry.get('gameMode') as GameMode | null;
    const playerSide = this.registry.get('playerSide') as Side | null;
    if (mode === 'versus') {
      this.versusStage = 'defender';   // start with defender stage in versus
      this.setupSide = 'defender';
    } else if (playerSide === 'ogre') {
      this.setupSide = 'ogre';
    } else {
      this.setupSide = 'defender';
    }

    this.initPaletteForSide();
    this.placedUnits = [];
    this.ogrePlacement = null;

    this.titleText = this.add
      .text(w / 2, 30, this.titleForSide(), textStyle(FONT.SIZES.L, CRT.AMBER))
      .setOrigin(0.5);

    // ── Map area: header(60) ~ palette top(h-140) ──
    const HEADER = 60;
    const FOOTER = 140;
    const LEFT_OFFSET  = 50;   // 행번호 표시 여유
    const RIGHT_OFFSET = 16;
    const TOP_OFFSET   = HEADER + 24; // 열번호 표시 여유
    this.HEADER_H = HEADER;
    this.FOOTER_H = FOOTER;
    this.LEFT_OFFSET = LEFT_OFFSET;
    this.RIGHT_OFFSET = RIGHT_OFFSET;
    const usableW = w - LEFT_OFFSET - RIGHT_OFFSET;
    const usableH = h - FOOTER - TOP_OFFSET;

    // minR: 맵 전체가 화면에 들어오는 최소 R
    const rByW = (usableW - 2) / ((COLS - 1) * 1.5 + 2);
    const rByH = (usableH - SQRT3 * 2) / ((ROWS - 0.5) * SQRT3);
    this.minR = Math.max(6, Math.min(rByW, rByH));
    this.R = this.minR;   // 초기 R = 맵 전체 보이는 크기

    const mapPixW = (COLS - 1) * this.R * 1.5 + 2 * this.R;
    this.OX = LEFT_OFFSET + (usableW - mapPixW) / 2 + this.R;
    this.OY = TOP_OFFSET + this.R * SQRT3;

    // Graphics layers
    this.mapG = this.add.graphics();
    this.ridgeG = this.add.graphics();
    this.placedG = this.add.graphics();

    this.drawMap();
    this.drawRowColLabels();

    // ── Click hit area covering the map region ──
    const hitX = LEFT_OFFSET;
    const hitY = TOP_OFFSET - 4;
    const hitW = usableW;
    const hitH = usableH + 8;
    const hit = this.add
      .rectangle(hitX + hitW / 2, hitY + hitH / 2, hitW, hitH, 0x000000, 0.001)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.leftButtonDown()) this.onMapClick(p.x, p.y);
    });

    this.buildPalette(w, h);

    // Budget
    this.budgetText = this.add
      .text(40, h - 48, this.budgetString(), textStyle(FONT.SIZES.S, CRT.GREEN))
      .setOrigin(0, 0.5);
    applyGlow(this.budgetText, CRT.GREEN, 6);

    // Central ATK counter
    this.centralAtkText = this.add
      .text(40, h - 68, this.centralAtkString(), textStyle(FONT.SIZES.S, CRT.AMBER))
      .setOrigin(0, 0.5);

    this.hintText = this.add
      .text(w / 2, h - 80, 'SELECT A UNIT, THEN TAP A HEX.  INF: CLICK SAME HEX TO STACK (MAX 3).', textStyle(FONT.SIZES.S, CRT.GREEN_DIM))
      .setOrigin(0.5);

    this.confirmBtn = this.add
      .text(w - 40, h - 48, '[ CONFIRM ]', textStyle(FONT.SIZES.M, CRT.AMBER))
      .setOrigin(1, 0.5)
      .setInteractive({ useHandCursor: true });
    applyGlow(this.confirmBtn, CRT.AMBER, 8);
    this.confirmBtn.on('pointerdown', () => this.confirm());

    if (this.input.keyboard) {
      this.input.keyboard.on('keydown-LEFT',  () => this.cyclePalette(-1));
      this.input.keyboard.on('keydown-RIGHT', () => this.cyclePalette(1));
      this.input.keyboard.on('keydown-ENTER', () => this.confirm());
      this.input.keyboard.on('keydown-ESC',   () => this.scene.start('briefing'));
    }

    // ── Map pan / zoom (GameScene parity) ──
    this.game.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (ptr.rightButtonDown() || ptr.middleButtonDown()) {
        this.isPanning = true;
        this.lastDragX = ptr.x;
        this.lastDragY = ptr.y;
      }
    });
    this.input.on('pointermove', (ptr: Phaser.Input.Pointer) => {
      if (this.isPanning && (ptr.rightButtonDown() || ptr.middleButtonDown())) {
        this.panX += ptr.x - this.lastDragX;
        this.panY += ptr.y - this.lastDragY;
        this.lastDragX = ptr.x;
        this.lastDragY = ptr.y;
        this.clampPan();
        this.redrawMap();
      }
    });
    this.input.on('pointerup', () => { this.isPanning = false; });
    this.input.on('pointerupoutside', () => { this.isPanning = false; });

    this.input.on('wheel', (ptr: Phaser.Input.Pointer, _objs: any, _dx: number, dy: number) => {
      const factor = dy > 0 ? (1 / 1.15) : 1.15;
      const oldR = this.R;
      const newR = Math.max(this.minR, Math.min(28, oldR * factor));
      if (newR === oldR) return;
      // Cursor-anchored zoom: keep hex under cursor fixed
      this.OX = ptr.x - (ptr.x - this.OX) * (newR / oldR);
      this.OY = ptr.y - (ptr.y - this.OY) * (newR / oldR);
      this.R = newR;
      this.clampPan();
      this.redrawMap();
    });

    // NOTE: 1P-OGRE 모드에서는 방어군 배치를 사람이 수행하지 않으므로 OGRE 진입 헥스만 배치.
    // 1P-DEFENDER 모드에서는 OGRE 위치 고정(createOgreMk3 기본값).
    this.applyHintForSide();
  }

  /** Hint message for current setup side */
  private applyHintForSide(): void {
    if (this.setupSide === 'ogre') {
      this.hintText.setText('PLACE OGRE AT THE SOUTHERN ENTRY HEX (RED).');
      this.hintText.setColor(CRT.AMBER);
    } else {
      this.hintText.setText('SELECT A UNIT, THEN TAP A HEX.  CLICK PLACED UNIT TO REMOVE.  INF STACK MAX 3.');
      this.hintText.setColor(CRT.GREEN_DIM);
    }
  }

  /** Title string for current stage */
  private titleForSide(): string {
    if (this.setupSide === 'ogre') return 'OGRE DEPLOYMENT';
    return 'DEFENDER DEPLOYMENT';
  }

  /** Build palette items for current setup side */
  private initPaletteForSide(): void {
    if (this.setupSide === 'ogre') {
      this.palette = [
        { type: 'OGRE', label: 'OGRE', cost: 0, isInfantry: false, isCp: false, isOgre: true, remaining: 1 },
      ];
      this.armorSlotsLeft = 0;
      this.infPointsLeft = 0;
    } else {
      this.palette = [
        { type: 'HVY', label: 'HVY', cost: 1, isInfantry: false, isCp: false, isOgre: false, remaining: 12 },
        { type: 'MSL', label: 'MSL', cost: 1, isInfantry: false, isCp: false, isOgre: false, remaining: 12 },
        { type: 'GEV', label: 'GEV', cost: 1, isInfantry: false, isCp: false, isOgre: false, remaining: 12 },
        { type: 'HOW', label: 'HOW', cost: 1, isInfantry: false, isCp: false, isOgre: false, remaining: 12 },
        { type: 'INF', label: 'INF', cost: 1, isInfantry: true,  isCp: false, isOgre: false, remaining: 20 },
        { type: 'CP',  label: 'CP',  cost: 0, isInfantry: false, isCp: true,  isOgre: false, remaining: 1 },
      ];
      this.armorSlotsLeft = 12;
      this.infPointsLeft = 20;
    }
  }

  // --------------------------------------------------------------------------
  // 헥스 수학
  // --------------------------------------------------------------------------
  private hexCenter(col: number, row: number): [number, number] {
    const x = this.OX + col * this.R * 1.5 + this.panX;
    const yOff = (col % 2 === 1) ? -this.R * SQRT3 * 0.5 : 0;
    const y = this.OY + row * this.R * SQRT3 + yOff + this.panY;
    return [x, y];
  }

  private hexPoints(cx: number, cy: number, R: number): { x: number; y: number }[] {
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const ang = (Math.PI / 3) * i;
      pts.push({ x: cx + R * Math.cos(ang), y: cy + R * Math.sin(ang) });
    }
    return pts;
  }

  private isValidHex(col: number, row: number): boolean {
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return false;
    if (row === 21 && col % 2 === 0) return false; // R22 짝수 col 무효
    return true;
  }

  private pixelToHex(px: number, py: number): { col: number; row: number } | null {
    const col = Math.round((px - this.OX - this.panX) / (this.R * 1.5));
    if (col < 0 || col >= COLS) return null;
    const yOff = (col % 2 === 1) ? -this.R * SQRT3 * 0.5 : 0;
    const row = Math.round((py - this.OY - this.panY - yOff) / (this.R * SQRT3));
    if (row < 0 || row >= ROWS) return null;
    if (!this.isValidHex(col, row)) return null;
    return { col, row };
  }

  // --------------------------------------------------------------------------
  // Pan clamping (GameScene parity) — keep map within usable area
  // --------------------------------------------------------------------------
  private clampPan(): void {
    const pad = 8;
    const fullH = (ROWS + 0.5) * this.R * SQRT3 + pad * 2;
    const fullW = (COLS - 1) * this.R * 1.5 + 2 * this.R + pad * 2;
    const usableH = this.scale.height - this.FOOTER_H;
    const usableW = this.scale.width - this.LEFT_OFFSET - this.RIGHT_OFFSET;
    const maxPanY = Math.max(0, fullH - usableH);
    this.panY = Math.max(-maxPanY, Math.min(0, this.panY));
    if (fullW > usableW) {
      const excess = (fullW - usableW) / 2 + pad;
      const leftExtra = Math.max(28, this.R * 2.2);
      this.panX = Math.max(-(excess + leftExtra), Math.min(excess + pad * 2, this.panX));
    } else {
      this.panX = 0;
    }
  }

  /** Re-draw all map content after pan / zoom. */
  private redrawMap(): void {
    for (const t of this.mapTexts) t.destroy();
    this.mapTexts = [];
    this.drawMap();
    this.drawRowColLabels();
    this.refreshPlaced();
  }

  // --------------------------------------------------------------------------
  // 맵 렌더링 (헥사 그리드)
  // --------------------------------------------------------------------------
  private drawMap(): void {
    const g = this.mapG;
    g.clear();
    this.ridgeG.clear();

    for (let col = 0; col < COLS; col++) {
      for (let row = 0; row < ROWS; row++) {
        if (!this.isValidHex(col, row)) continue;
        const [cx, cy] = this.hexCenter(col, row);
        const key = `${col},${row}`;

        // ── 존 색상 ──
        let fillHex = 0x001200; let fillAlpha = 0.55; // default green-tint
        if (row <= ZONE_NORTH_END) {
          fillHex = 0xFFAA00; fillAlpha = 0.08;       // NORTHERN amber (CP + 방어군 배치 가능)
        } else if (row >= ZONE_CENTRAL_START && row <= ZONE_CENTRAL_END) {
          fillHex = 0x001040; fillAlpha = 0.35;       // CENTRAL blue (ATK ≤ 20)
        } else if (row >= 15 && row < ogreEntryRow(col)) {
          fillHex = 0x202020; fillAlpha = 0.55;       // SOUTHERN grey (배치 불가)
        }
        // OGRE 진입 헥스 빨강
        if (isOgreEntry(col, row)) { fillHex = 0xFF3300; fillAlpha = 0.40; }
        // 크레이터 우선 (어두운 톤)
        if (this.craterSet.has(key)) { fillHex = 0x120500; fillAlpha = 0.92; }

        const pts = this.hexPoints(cx, cy, this.R - 0.8);
        g.fillStyle(fillHex, fillAlpha);
        g.beginPath();
        g.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < 6; i++) g.lineTo(pts[i].x, pts[i].y);
        g.closePath();
        g.fillPath();

        // 헥스 테두리
        g.lineStyle(0.9, 0x1E3A1E, 1);
        g.strokePoints(pts, true);

        // 크레이터 디테일
        if (this.craterSet.has(key)) this.drawCrater(g, cx, cy, this.R);
      }
    }

    // ── 능선 ──
    for (const [k, edges] of this.ridgeMap) {
      const [cs, rs] = k.split(',').map(Number);
      if (!this.isValidHex(cs, rs)) continue;
      const [cx, cy] = this.hexCenter(cs, rs);
      for (const e of edges) {
        this.drawRidgeline(this.ridgeG, cx, cy, this.R, e);
      }
    }

    // ── 존 레이블 (중앙) ──
    const [, yN] = this.hexCenter(7, 3);
    const [, yC] = this.hexCenter(7, 11);
    const [, yS] = this.hexCenter(7, 18);
    const [zx]   = this.hexCenter(7, 3);
    const zFs = Math.max(10, this.R * 0.75);
    this.mapTexts.push(
      this.add.text(zx, yN, 'NORTHERN', { fontFamily: '"Share Tech Mono", monospace', fontSize: `${zFs}px`, color: '#FFAA00' })
        .setOrigin(0.5, 0.5).setAlpha(0.30),
    );
    this.mapTexts.push(
      this.add.text(zx, yC, 'CENTRAL', { fontFamily: '"Share Tech Mono", monospace', fontSize: `${zFs}px`, color: '#4466FF' })
        .setOrigin(0.5, 0.5).setAlpha(0.35),
    );
    this.mapTexts.push(
      this.add.text(zx, yS, 'SOUTHERN (NO DEPLOY)', { fontFamily: '"Share Tech Mono", monospace', fontSize: `${zFs}px`, color: '#666666' })
        .setOrigin(0.5, 0.5).setAlpha(0.55),
    );
  }

  private drawCrater(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number): void {
    // 1) amber 반투명 원형 그라데이션 (5개 스택)
    for (let i = 4; i >= 0; i--) {
      const f = i / 4;
      g.fillStyle(0xFFAA00, 0.20 * (1 - f));
      g.fillCircle(x, y, r * 0.5 * (0.3 + f * 0.7));
    }
    // 2) 내부 작은 원
    g.lineStyle(Math.max(1, r * 0.07), 0xFFAA00, 0.8);
    g.strokeCircle(x, y, r * 0.35);
    // 3) 헥스 외곽 amber
    const ptsOuter = this.hexPoints(x, y, r - 2);
    g.lineStyle(Math.max(1, r * 0.07), 0xFFAA00, 0.7);
    g.strokePoints(ptsOuter, true);
  }

  private drawRidgeline(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, edgeIdx: number): void {
    const R88 = r * 0.88;
    const a1 = (Math.PI / 3) * edgeIdx;
    const a2 = (Math.PI / 3) * ((edgeIdx + 1) % 6);
    const v1x = R88 * Math.cos(a1), v1y = R88 * Math.sin(a1);
    const v2x = R88 * Math.cos(a2), v2y = R88 * Math.sin(a2);
    const dx = v2x - v1x, dy = v2y - v1y;
    const el = Math.sqrt(dx * dx + dy * dy) || 1;
    const px = -dy / el, py = dx / el;
    const tickLen = r * 0.10;
    const lw = Math.max(1, r * 0.07);

    g.lineStyle(lw, 0x00CC00, 1);
    for (let i = 1; i <= 3; i++) {
      const t = i / 4;
      const cx = x + v1x + dx * t;
      const cy = y + v1y + dy * t;
      g.lineBetween(cx - px * tickLen, cy - py * tickLen, cx + px * tickLen, cy + py * tickLen);
    }
  }

  // --------------------------------------------------------------------------
  // 행/열 번호 라벨 (맵 바깥)
  // --------------------------------------------------------------------------
  private drawRowColLabels(): void {
    const labelStyle = {
      fontFamily: '"Share Tech Mono", monospace',
      fontSize: '9px',
      color: '#007700',
    };

    // 열 번호: 맵 상단 위에
    for (let col = 0; col < COLS; col++) {
      const [cx] = this.hexCenter(col, 0);
      const yOff = (col % 2 === 1) ? -this.R * SQRT3 * 0.5 : 0;
      const cy = this.OY + yOff - this.R * SQRT3 * 0.9 + this.panY;
      this.mapTexts.push(
        this.add.text(cx, cy, `C${String(col + 1).padStart(2, '0')}`, labelStyle)
          .setOrigin(0.5, 1),
      );
    }

    // 행 번호: 맵 왼쪽 (col 0 = 짝수 col 기준 y)
    for (let row = 0; row < ROWS; row++) {
      const [, cy] = this.hexCenter(0, row);
      const cx = this.OX - this.R * 1.2 + this.panX;
      this.mapTexts.push(
        this.add.text(cx, cy, `R${String(row + 1).padStart(2, '0')}`, labelStyle)
          .setOrigin(1, 0.5),
      );
    }
  }

  // --------------------------------------------------------------------------
  private buildPalette(w: number, h: number): void {
    const py = h - 130;
    const slotW = 100;
    const gap = 12;
    const totalW = this.palette.length * slotW + (this.palette.length - 1) * gap;
    const startX = w / 2 - totalW / 2;

    this.palette.forEach((p, i) => {
      const cx = startX + i * (slotW + gap);
      const c = this.add.container(cx + slotW / 2, py + 30);

      const bg = this.add.graphics();
      bg.fillStyle(CRT.BG_PANEL_HEX, 1);
      bg.fillRect(-slotW / 2, -30, slotW, 60);
      bg.lineStyle(1, CRT.BORDER_HEX, 1);
      bg.strokeRect(-slotW / 2, -30, slotW, 60);
      c.add(bg);

      const label = this.add.text(0, -14, p.label, textStyle(FONT.SIZES.M, CRT.GREEN)).setOrigin(0.5);
      const costStr = p.isCp ? 'FIXED'
        : p.isInfantry ? `${p.cost}pt/squad`
        : `${p.cost}sl`;
      const cost = this.add.text(0, 6, costStr, textStyle(FONT.SIZES.XS, CRT.GREEN_DIM)).setOrigin(0.5);
      const left = this.add.text(0, 22, `x${p.remaining}`, textStyle(FONT.SIZES.XS, CRT.AMBER)).setOrigin(0.5);
      c.add(label); c.add(cost); c.add(left);

      const hit = this.add.rectangle(0, 0, slotW, 60, 0x000000, 0.001)
        .setInteractive({ useHandCursor: true });
      c.add(hit);
      hit.on('pointerdown', () => this.selectPalette(i));
      hit.on('pointerover',  () => this.highlightPalette(i, true));
      hit.on('pointerout',   () => this.highlightPalette(i, false));

      (c as any)._bg    = bg;
      (c as any)._label = label;
      (c as any)._left  = left;
      this.paletteUI.push(c);
    });

    this.selectPalette(0);
  }

  private highlightPalette(i: number, on: boolean): void {
    if (this.cursorIdx === i) return;
    const c  = this.paletteUI[i];
    const bg = (c as any)._bg as Phaser.GameObjects.Graphics;
    bg.clear();
    bg.fillStyle(on ? CRT.GREEN_DEEP_HEX : CRT.BG_PANEL_HEX, on ? 0.5 : 1);
    bg.fillRect(-50, -30, 100, 60);
    bg.lineStyle(1, on ? CRT.GREEN_HEX : CRT.BORDER_HEX, 1);
    bg.strokeRect(-50, -30, 100, 60);
  }

  private selectPalette(i: number): void {
    this.cursorIdx = i;
    this.selectedType = this.palette[i].type;
    this.paletteUI.forEach((c, idx) => {
      const sel   = idx === i;
      const bg    = (c as any)._bg as Phaser.GameObjects.Graphics;
      const label = (c as any)._label as Phaser.GameObjects.Text;
      bg.clear();
      bg.fillStyle(sel ? CRT.AMBER_HEX : CRT.BG_PANEL_HEX, sel ? 0.18 : 1);
      bg.fillRect(-50, -30, 100, 60);
      bg.lineStyle(sel ? 2 : 1, sel ? CRT.AMBER_HEX : CRT.BORDER_HEX, 1);
      bg.strokeRect(-50, -30, 100, 60);
      label.setColor(sel ? CRT.AMBER : CRT.GREEN);
      applyGlow(label, sel ? CRT.AMBER : CRT.GREEN, sel ? 10 : 4);
    });
  }

  private cyclePalette(dir: number): void {
    this.selectPalette((this.cursorIdx + dir + this.palette.length) % this.palette.length);
  }

  // --------------------------------------------------------------------------
  // 클릭 처리
  // --------------------------------------------------------------------------
  private onMapClick(px: number, py: number): void {
    const hex = this.pixelToHex(px, py);
    if (!hex) return;
    const { col, row } = hex;

    // ── OGRE 배치 모드 ──
    if (this.setupSide === 'ogre') {
      this.handleOgreClick(col, row);
      return;
    }

    if (!this.selectedType) {
      // 팔레트 선택 없을 때 — 클릭된 헥스의 유닛 취소만 시도
      this.tryCancelAt(col, row, null);
      return;
    }

    const item = this.palette[this.cursorIdx];

    // ── 클릭된 헥스에 이미 유닛 존재 → 취소 처리 (보병 사이클 포함) ──
    const existingHere = this.placedUnits.find(u => u.col === col && u.row === row);
    if (existingHere) {
      // 보병이며 현재 선택도 INF면 → 우선 스택 추가 시도가 가능하므로 아래 로직 진행
      // 그 외 — 취소
      if (!(existingHere.type === 'INF' && item.type === 'INF')) {
        this.tryCancelAt(col, row, item.type);
        return;
      }
    }

    // ── OGRE 진입 헥스 금지 ──
    if (isOgreEntry(col, row)) {
      this.flashHint(
        `OGRE ENTRY HEX — CANNOT DEPLOY HERE.  (${col % 2 === 1 ? 'R22' : 'R21'})`,
        CRT.RED,
      );
      return;
    }

    // ── 크레이터 헥스 금지 ──
    if (this.craterSet.has(`${col},${row}`)) {
      this.flashHint('CANNOT DEPLOY ON CRATER.', CRT.RED);
      return;
    }

    // ── 방어군은 Southern 존(row 15+) 배치 불가 ──
    if (row > ZONE_CENTRAL_END) {
      this.flashHint('DEFENDERS CANNOT DEPLOY IN SOUTHERN ZONE.', CRT.RED);
      return;
    }

    // ── CP는 NORTHERN 존(row 0-6)에만 ──
    if (item.isCp && row > ZONE_NORTH_END) {
      this.flashHint('CP MUST BE IN NORTHERN ZONE (ROWS 1-7).', CRT.RED);
      return;
    }

    // ── 보병 스택 처리 (같은 헥스에 최대 3스쿼드) ──
    if (item.isInfantry) {
      const existingInf = this.placedUnits.find(
        u => u.col === col && u.row === row && u.type === 'INF',
      );
      if (existingInf) {
        const current = existingInf.squads ?? 1;
        // 3스쿼드 상태에서 클릭 → 전체 제거 + 환불 (1→2→3→취소 순환)
        if (current >= 3) {
          const idx = this.placedUnits.findIndex(
            u => u.col === col && u.row === row && u.type === 'INF',
          );
          if (idx !== -1) {
            this.placedUnits.splice(idx, 1);
            this.infPointsLeft += current * item.cost;
            item.remaining += current;
            this.refreshPlaced();
            this.refreshPaletteCounts();
            this.budgetText.setText(this.budgetString());
            this.centralAtkText.setText(this.centralAtkString());
          }
          return;
        }
        if (this.infPointsLeft < item.cost) {
          this.flashHint('INSUFFICIENT INF POINTS.', CRT.RED);
          return;
        }
        if (item.remaining <= 0) {
          this.flashHint('NO MORE INF SQUADS IN BUDGET.', CRT.RED);
          return;
        }
        // Central 존 ATK 한도 확인 (스쿼드 추가 시 +1)
        if (row >= ZONE_CENTRAL_START && row <= ZONE_CENTRAL_END) {
          if (this.centralZoneAtk() + 1 > CENTRAL_ATK_LIMIT) {
            this.flashHint(`CENTRAL ZONE ATK LIMIT REACHED (MAX ${CENTRAL_ATK_LIMIT}).`, CRT.RED);
            return;
          }
        }
        existingInf.squads = (current + 1) as 1 | 2 | 3;
        this.infPointsLeft -= item.cost;
        item.remaining -= 1;
        this.refreshPlaced();
        this.refreshPaletteCounts();
        this.budgetText.setText(this.budgetString());
        this.centralAtkText.setText(this.centralAtkString());
        return;
      }
      // 같은 헥스에 다른 유닛이 있으면 금지
      if (this.placedUnits.some(u => u.col === col && u.row === row)) {
        this.flashHint('HEX OCCUPIED.', CRT.RED);
        return;
      }
    } else {
      if (this.placedUnits.some(u => u.col === col && u.row === row)) {
        this.flashHint('HEX OCCUPIED.', CRT.RED);
        return;
      }
    }

    // ── 예산 ──
    if (item.remaining <= 0) {
      this.flashHint('NO MORE OF THIS UNIT.', CRT.RED);
      return;
    }
    if (item.isInfantry && this.infPointsLeft < item.cost) {
      this.flashHint('INSUFFICIENT INF POINTS.', CRT.RED);
      return;
    }
    if (!item.isInfantry && !item.isCp && this.armorSlotsLeft < item.cost) {
      this.flashHint('INSUFFICIENT ARMOR SLOTS.', CRT.RED);
      return;
    }

    // ── Central 존 ATK 한도 ──
    if (!item.isCp && row >= ZONE_CENTRAL_START && row <= ZONE_CENTRAL_END) {
      const addAtk = item.isInfantry ? 1 : (UNIT_ATK[item.type] ?? 0);
      if (this.centralZoneAtk() + addAtk > CENTRAL_ATK_LIMIT) {
        this.flashHint(
          `CENTRAL ZONE ATK LIMIT REACHED (MAX ${CENTRAL_ATK_LIMIT}).  CURRENT: ${this.centralZoneAtk()}`,
          CRT.RED,
        );
        return;
      }
    }

    // ── 배치 ──
    const newUnit: PlacedUnit = {
      type: item.type, col, row,
      squads: item.isInfantry ? 1 : undefined,
    };
    this.placedUnits.push(newUnit);
    item.remaining -= 1;
    if (item.isInfantry) this.infPointsLeft -= item.cost;
    else if (!item.isCp) this.armorSlotsLeft -= item.cost;

    this.refreshPlaced();
    this.refreshPaletteCounts();
    this.budgetText.setText(this.budgetString());
    this.centralAtkText.setText(this.centralAtkString());
  }

  // --------------------------------------------------------------------------
  // OGRE 배치 (1P-DEFENDER 모드 외에는 사람이 직접 배치)
  // --------------------------------------------------------------------------
  private handleOgreClick(col: number, row: number): void {
    // 클릭이 기존 OGRE 위면 → 취소
    if (this.ogrePlacement && this.ogrePlacement.col === col && this.ogrePlacement.row === row) {
      this.ogrePlacement = null;
      this.placedUnits = this.placedUnits.filter(u => u.type !== 'OGRE');
      const ogreItem = this.palette.find(p => p.isOgre);
      if (ogreItem) ogreItem.remaining = 1;
      this.refreshPlaced();
      this.refreshPaletteCounts();
      return;
    }
    // OGRE 진입 헥스에만 배치
    if (!isOgreEntry(col, row)) {
      this.flashHint('OGRE MUST BE ON A SOUTHERN ENTRY HEX (RED).', CRT.RED);
      return;
    }
    // 한 번에 1개만
    if (this.ogrePlacement) {
      // 다른 진입 헥스 클릭 — 위치 변경
      this.placedUnits = this.placedUnits.filter(u => u.type !== 'OGRE');
    }
    this.ogrePlacement = { col, row };
    this.placedUnits.push({ type: 'OGRE', col, row });
    const ogreItem = this.palette.find(p => p.isOgre);
    if (ogreItem) ogreItem.remaining = 0;
    this.refreshPlaced();
    this.refreshPaletteCounts();
  }

  /** Click on occupied hex → cancel/refund.
   *  expectedType: type currently selected in palette (drives INF cycle vs full remove).
   *  null = no palette selected (still allow removal).
   */
  private tryCancelAt(col: number, row: number, expectedType: PaletteUnitType | null): void {
    const idx = this.placedUnits.findIndex(u => u.col === col && u.row === row);
    if (idx < 0) return;
    const unit = this.placedUnits[idx];
    const tmpl = this.palette.find(p => p.type === unit.type);
    if (!tmpl) return;

    if (unit.type === 'INF') {
      // INF: cycle 3→2→1→remove
      const sq = unit.squads ?? 1;
      if (sq > 1) {
        unit.squads = (sq - 1) as 1 | 2 | 3;
        this.infPointsLeft += tmpl.cost;
        tmpl.remaining += 1;
      } else {
        this.placedUnits.splice(idx, 1);
        this.infPointsLeft += tmpl.cost;
        tmpl.remaining += 1;
      }
    } else {
      // 비보병: 즉시 제거 + 환불
      this.placedUnits.splice(idx, 1);
      if (tmpl.isInfantry) {
        this.infPointsLeft += tmpl.cost;
      } else if (!tmpl.isCp) {
        this.armorSlotsLeft += tmpl.cost;
      }
      tmpl.remaining += 1;
    }

    // expectedType 미사용 변수 경고 회피
    void expectedType;

    this.refreshPlaced();
    this.refreshPaletteCounts();
    this.budgetText.setText(this.budgetString());
    this.centralAtkText.setText(this.centralAtkString());
  }

  // --------------------------------------------------------------------------
  private centralZoneAtk(): number {
    return this.placedUnits
      .filter(u => u.row >= ZONE_CENTRAL_START && u.row <= ZONE_CENTRAL_END)
      .reduce((sum, u) => {
        if (u.type === 'OGRE') return sum;
        if (u.type === 'INF') return sum + (u.squads ?? 1);
        if (u.type === 'CP')  return sum;
        return sum + (UNIT_ATK[u.type as DefenderUnitType] ?? 0);
      }, 0);
  }

  private centralAtkString(): string {
    const cur = this.centralZoneAtk();
    const over = cur > CENTRAL_ATK_LIMIT;
    return `CENTRAL ATK: ${cur}/${CENTRAL_ATK_LIMIT}${over ? '  !! OVER LIMIT' : ''}`;
  }

  // --------------------------------------------------------------------------
  // 배치 유닛 렌더링 (SVG _crt 텍스처)
  // --------------------------------------------------------------------------
  private refreshPlaced(): void {
    this.placedG.clear();
    this.placedObjs.forEach(o => o.destroy());
    this.placedObjs = [];

    this.placedUnits.forEach(u => {
      const [cx, cy] = this.hexCenter(u.col, u.row);
      const r = this.R;
      const tw = r * 1.10;
      const th = r * 1.10;

      // SVG key 선택 (INF는 squads 별, OGRE는 ogre_mk3)
      let svgKey: string;
      if (u.type === 'OGRE') {
        svgKey = 'ogre_mk3';
      } else if (u.type === 'INF') {
        const sq = u.squads ?? 1;
        svgKey = sq === 1 ? 'infantry_1' : sq === 2 ? 'infantry_2' : 'infantry_3';
      } else {
        svgKey = SVG_KEY[u.type as DefenderUnitType];
      }
      // Phaser 숫자형 (Graphics lineStyle / setTint 용)
      const colorHex: number = (u.type === 'CP' || u.type === 'OGRE') ? CRT.AMBER_HEX : CRT.GREEN_HEX;
      // CSS 문자열 (Text color 용)
      const colorStr: string = (u.type === 'CP' || u.type === 'OGRE') ? CRT.AMBER : CRT.GREEN;

      // 셀 배경 — 게임과 동일한 둥근 사각형 토큰
      const g = this.add.graphics();
      g.fillStyle(0x030803, 1);
      g.fillRoundedRect(cx - tw / 2, cy - th / 2, tw, th, r * 0.10);
      g.lineStyle(Math.max(1.2, r * 0.09), colorHex, 1);
      g.strokeRoundedRect(cx - tw / 2, cy - th / 2, tw, th, r * 0.10);
      this.placedObjs.push(g);

      // SVG 이미지 (_crt 텍스처, 게임 타일과 동일)
      const crtKey = `${svgKey}_crt`;
      if (this.textures.exists(crtKey)) {
        const img = this.add.image(cx, cy, crtKey);
        const iw = tw * 0.92;
        img.setDisplaySize(iw, iw);
        img.setOrigin(0.5);
        img.setTint(colorHex);   // 숫자형으로 전달
        this.placedObjs.push(img);
      } else {
        // Fallback 텍스트
        let lbl: string = String(u.type);
        if (u.type === 'INF' && u.squads && u.squads > 1) lbl = `I${u.squads}`;
        const txt = this.add.text(cx, cy, lbl, {
          fontFamily: '"Share Tech Mono", monospace',
          fontSize: `${Math.max(7, r * 0.38)}px`,
          color: colorStr,       // 문자열로 전달
          fontStyle: 'bold',
        }).setOrigin(0.5);
        this.placedObjs.push(txt);
      }
    });
  }

  private refreshPaletteCounts(): void {
    this.paletteUI.forEach((c, idx) => {
      const left = (c as any)._left as Phaser.GameObjects.Text;
      left.setText(`x${this.palette[idx].remaining}`);
    });
  }

  private budgetString(): string {
    if (this.setupSide === 'ogre') {
      return `OGRE PLACED: ${this.ogrePlacement ? 'YES' : 'NO'}`;
    }
    const defCount = this.placedUnits.filter(u => u.type !== 'OGRE').length;
    return `INF PT ${this.infPointsLeft}/20   ARMOR ${this.armorSlotsLeft}/12 units   PLACED ${defCount}`;
  }

  private flashHint(msg: string, color: string): void {
    this.hintText.setText(msg).setColor(color);
    applyGlow(this.hintText, color, 8);
    this.tweens.add({
      targets: this.hintText,
      alpha: { from: 1, to: 0.4 },
      duration: 220,
      yoyo: true,
      onComplete: () => this.hintText.setAlpha(1),
    });
  }

  // --------------------------------------------------------------------------
  private confirm(): void {
    const mode = this.registry.get('gameMode') as GameMode | null;
    const playerSide = this.registry.get('playerSide') as Side | null;

    // ── OGRE 배치 스테이지 검증 ──
    if (this.setupSide === 'ogre') {
      if (!this.ogrePlacement) {
        this.flashHint('PLACE OGRE BEFORE STARTING.', CRT.RED);
        return;
      }
      // versus 모드: defender 단계는 이미 storedDefenderPlacements 에 저장됨
      const defenderPlacements = (mode === 'versus')
        ? this.storedDefenderPlacements
        : []; // 1P-OGRE: AI autoPlace

      this.cameras.main.fadeOut(280, 7, 12, 7);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('game', {
          mode:               mode ?? 'solo-ogre',
          playerSide:         playerSide ?? 'ogre',
          ogrePlacement:      this.ogrePlacement,
          defenderPlacements,
        });
        this.scene.launch('ui');
      });
      return;
    }

    // ── 방어군 배치 스테이지 검증 ──
    const defenderUnits = this.placedUnits.filter(u => u.type !== 'OGRE');
    if (!defenderUnits.find(u => u.type === 'CP')) {
      this.flashHint('CP IS REQUIRED. PLACE IT IN NORTHERN ZONE (ROWS 1-7).', CRT.RED);
      return;
    }
    if (defenderUnits.length < 4) {
      this.flashHint('PLACE MORE UNITS BEFORE STARTING.', CRT.AMBER);
      return;
    }
    if (this.centralZoneAtk() > CENTRAL_ATK_LIMIT) {
      this.flashHint(`CENTRAL ZONE ATK EXCEEDS LIMIT (${this.centralZoneAtk()}/${CENTRAL_ATK_LIMIT}).`, CRT.RED);
      return;
    }

    // versus 모드 → OGRE 배치 단계로 전환
    if (mode === 'versus') {
      this.storedDefenderPlacements = defenderUnits.slice();
      this.setupSide = 'ogre';
      this.versusStage = 'ogre';
      this.swapToOgreStage();
      return;
    }

    // 1P-DEFENDER: 즉시 게임 시작 (OGRE 위치는 기본값)
    this.cameras.main.fadeOut(280, 7, 12, 7);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('game', {
        mode:               mode ?? 'solo-defender',
        playerSide:         playerSide ?? 'defender',
        ogrePlacement:      null,
        defenderPlacements: defenderUnits,
      });
      this.scene.launch('ui');
    });
  }

  /** Versus mode: defender 단계 끝 → OGRE 단계 화면으로 전환 (in-place) */
  private swapToOgreStage(): void {
    void this.versusStage; // tracked for future stage logic
    // 팔레트 UI 제거 후 재구축
    for (const c of this.paletteUI) c.destroy();
    this.paletteUI = [];
    this.cursorIdx = 0;
    this.selectedType = null;
    this.initPaletteForSide();
    this.buildPalette(this.scale.width, this.scale.height);
    this.titleText.setText(this.titleForSide());
    this.applyHintForSide();
    this.budgetText.setText(this.budgetString());
    this.centralAtkText.setText(this.centralAtkString());
    this.refreshPlaced();
  }
}
