// ============================================================================
// BriefingScene — scenario summary screen
// ============================================================================
import Phaser from 'phaser';
import { CRT, FONT, textStyle, applyGlow, addScanlines, addVignette, blink } from '@/ui/CRTTheme';
import { CRATER_COORDS, RIDGE_EDGES } from '@/data/constants';
import type { GameMode, Side } from '@/types';

// ── BriefingScene local helpers ────────────────────────────────────────────
const ogreEntryRow = (col: number) => (col % 2 === 1) ? 21 : 20;

function drawHexFill(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number) {
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 3 * i;
    const hx = cx + r * Math.cos(a), hy = cy + r * Math.sin(a);
    i === 0 ? g.moveTo(hx, hy) : g.lineTo(hx, hy);
  }
  g.closePath();
  g.fillPath();
}

function drawHexStroke(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number) {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < 6; i++) {
    pts.push({ x: cx + r * Math.cos(Math.PI / 3 * i), y: cy + r * Math.sin(Math.PI / 3 * i) });
  }
  g.strokePoints(pts, true);
}

export class BriefingScene extends Phaser.Scene {
  constructor() {
    super({ key: 'briefing' });
  }

  create(): void {
    this.cameras.main.setBackgroundColor(CRT.BG);
    this.cameras.main.fadeIn(220, 7, 12, 7);
    addScanlines(this);
    addVignette(this);

    const w = this.scale.width;
    const h = this.scale.height;

    const mode = this.registry.get('gameMode') as GameMode | null;
    const side = this.registry.get('playerSide') as Side | null;

    const header = this.add
      .text(w / 2, 60, 'MISSION BRIEFING', textStyle(FONT.SIZES.XL, CRT.AMBER))
      .setOrigin(0.5);
    applyGlow(header, CRT.AMBER, 12);

    // Outer panel
    const panelX = 60;
    const panelY = 110;
    const panelW = w - 120;
    const panelH = h - 220;
    const panel = this.add.graphics();
    panel.fillStyle(CRT.BG_PANEL_HEX, 1);
    panel.fillRect(panelX, panelY, panelW, panelH);
    panel.lineStyle(1, CRT.BORDER_HEX, 1);
    panel.strokeRect(panelX, panelY, panelW, panelH);

    // Left: minimap (simple grid)
    const mapW = Math.min(panelW * 0.42, 320);
    const mapH = panelH - 40;
    const mx = panelX + 20;
    const my = panelY + 20;
    this.drawMiniMap(mx, my, mapW, mapH);

    // Right: text
    const tx = mx + mapW + 30;
    const ty = my;
    const tw = panelW - mapW - 70;

    const scenario = this.add
      .text(tx, ty, 'SCENARIO: MK.III STANDARD', textStyle(FONT.SIZES.L, CRT.GREEN))
      .setOrigin(0, 0);
    applyGlow(scenario, CRT.GREEN, 8);

    const briefing =
      'OGRE: 1x MK.III CYBERTANK\n' +
      '   1 MAIN BATTERY  /  2 SECONDARIES\n' +
      '   4 MISSILES  /  8 AP GUNS\n' +
      '   TREADS: 45  /  MOVE: M3\n' +
      '   ENTRY: SOUTHERN END (R21/R22)\n' +
      '\n' +
      'DEFENDER BUDGET:\n' +
      '   ARMOR  12 UNITS — HVY(1) MSL(1) GEV(1) HOW(1)\n' +
      '   INFANTRY  20 PT — 1PT/SQUAD, MAX 3 SQUADS/HEX\n' +
      '   ATK STACK: 1SQ=ATK1  2SQ=ATK2  3SQ=ATK3\n' +
      '\n' +
      'DEPLOYMENT ZONES:\n' +
      '   NORTHERN (R01-R07) — CP + DEFENDERS\n' +
      '   CENTRAL  (R08-R15) — DEFENDERS, ATK SUM ≤ 20\n' +
      '   SOUTHERN (R16-R21) — NO DEPLOY (OGRE CORRIDOR)\n' +
      '   CRATERS: NO ENTRY (BLOCK MOVEMENT)\n' +
      '\n' +
      'OBJECTIVE:\n' +
      '   OGRE: ADVANCE NORTH AND DESTROY THE CP.\n' +
      '   DEFENDER: PROTECT CP -OR- NEUTRALIZE OGRE.\n' +
      '\n' +
      'TERRAIN: CRATERS (+1 DEF), RIDGES (+1 DEF IF ATTACKER\n' +
      '   CROSSES RIDGE EDGE).  TURN LIMIT: 15.';

    this.add.text(tx, ty + 40, briefing, {
      ...textStyle(FONT.SIZES.S, CRT.GREEN),
      lineSpacing: 4,
      wordWrap: { width: tw },
    });

    // Mode / side line
    const modeLine = mode === 'versus'
      ? 'MODE: 2 PLAYERS (LOCAL HOTSEAT)'
      : `MODE: 1P vs AI (EASY)   YOU = ${side === 'ogre' ? 'OGRE' : 'DEFENDER'}`;
    this.add
      .text(w / 2, h - 110, modeLine, textStyle(FONT.SIZES.M, CRT.AMBER))
      .setOrigin(0.5);

    // Begin button
    const begin = this.add
      .text(w / 2, h - 60, '[ BEGIN ]', textStyle(FONT.SIZES.L, CRT.GREEN))
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    applyGlow(begin, CRT.GREEN, 12);
    blink(this, begin, 800, 0.4);

    begin.on('pointerover', () => {
      begin.setColor(CRT.AMBER);
      applyGlow(begin, CRT.AMBER, 14);
    });
    begin.on('pointerout', () => {
      begin.setColor(CRT.GREEN);
      applyGlow(begin, CRT.GREEN, 12);
    });
    begin.on('pointerdown', () => this.start());

    if (this.input.keyboard) {
      this.input.keyboard.on('keydown-ENTER', () => this.start());
      this.input.keyboard.on('keydown-SPACE', () => this.start());
      this.input.keyboard.on('keydown-ESC', () => this.scene.start('modeselect'));
    }
  }

  private drawMiniMap(x: number, y: number, w: number, h: number): void {
    const COLS = 15, ROWS = 22;
    const SQRT3 = Math.sqrt(3);

    // R 계산 (폭/높이 기준, 미니맵용 최대 14px)
    const R = Math.min(
      (w - 2) / ((COLS - 1) * 1.5 + 2),
      (h - 2) / ((ROWS - 0.5) * SQRT3),
      14,
    );
    const OX = x + (w - ((COLS - 1) * R * 1.5 + 2 * R)) / 2 + R;
    const OY = y + R * SQRT3;

    const hexCenter = (col: number, row: number): [number, number] => {
      const hx = OX + col * R * 1.5;
      const yOff = (col % 2 === 1) ? -R * SQRT3 * 0.5 : 0;
      return [hx, OY + row * R * SQRT3 + yOff];
    };

    const isValid = (col: number, row: number): boolean => {
      if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return false;
      if (row === 21 && col % 2 === 0) return false;
      return true;
    };

    const g = this.add.graphics();

    // 배경
    g.fillStyle(CRT.BG_HEX, 1);
    g.fillRect(x, y, w, h);

    const craterSet = new Set(CRATER_COORDS.map(c => `${c.col},${c.row}`));

    // 헥사 그리기
    for (let col = 0; col < COLS; col++) {
      for (let row = 0; row < ROWS; row++) {
        if (!isValid(col, row)) continue;
        const [cx, cy] = hexCenter(col, row);

        // 존 fill
        let fillColor = 0x001200;
        let fillAlpha = 0.8;
        if (row <= 6)       { fillColor = 0x1A0E00; fillAlpha = 0.7; } // Northern: amber tint
        else if (row <= 14) { fillColor = 0x000818; fillAlpha = 0.8; } // Central: blue tint
        if (row >= ogreEntryRow(col)) { fillColor = 0x200000; fillAlpha = 0.9; }
        if (craterSet.has(`${col},${row}`)) { fillColor = 0x100500; fillAlpha = 1.0; }

        g.fillStyle(fillColor, fillAlpha);
        drawHexFill(g, cx, cy, R);

        g.lineStyle(0.5, 0x1E3A1E, 0.5);
        drawHexStroke(g, cx, cy, R);

        // 크레이터 표시
        if (craterSet.has(`${col},${row}`)) {
          g.fillStyle(0xFFAA00, 0.35);
          g.fillCircle(cx, cy, R * 0.5);
          g.lineStyle(0.5, 0xFFAA00, 0.6);
          g.strokeCircle(cx, cy, R * 0.35);
        }
      }
    }

    // 능선 (3틱)
    for (const e of RIDGE_EDGES) {
      if (!isValid(e.col, e.row)) continue;
      const [cx, cy] = hexCenter(e.col, e.row);
      const R88 = R * 0.88;
      const a1 = Math.PI / 3 * e.edge;
      const a2 = Math.PI / 3 * ((e.edge + 1) % 6);
      const v1x = cx + R88 * Math.cos(a1), v1y = cy + R88 * Math.sin(a1);
      const v2x = cx + R88 * Math.cos(a2), v2y = cy + R88 * Math.sin(a2);
      const dx = v2x - v1x, dy = v2y - v1y;
      const el = Math.sqrt(dx * dx + dy * dy) || 1;
      const px = -dy / el, py = dx / el;
      const tl = R * 0.10;
      g.lineStyle(0.8, 0x00CC00, 0.8);
      for (let i = 1; i <= 3; i++) {
        const t = i / 4;
        const cx2 = v1x + dx * t, cy2 = v1y + dy * t;
        g.lineBetween(cx2 - px * tl, cy2 - py * tl, cx2 + px * tl, cy2 + py * tl);
      }
    }

    // 존 경계선
    g.lineStyle(1, 0xFFAA00, 0.6);
    const [, y7] = hexCenter(7, 7);
    const [, y6] = hexCenter(7, 6);
    const divY1 = (y7 + y6) / 2;
    g.lineBetween(x, divY1, x + w, divY1);
    g.lineStyle(1, 0x4466FF, 0.5);
    const [, y15] = hexCenter(7, 15);
    const [, y14] = hexCenter(7, 14);
    const divY2 = (y15 + y14) / 2;
    g.lineBetween(x, divY2, x + w, divY2);

    // OGRE 진입 삼각형 (하단)
    const [, yBot] = hexCenter(7, 21);
    g.fillStyle(0xFF3300, 1);
    g.fillTriangle(x + w / 2, yBot + R * 0.6, x + w / 2 - R * 0.5, yBot, x + w / 2 + R * 0.5, yBot);

    // 라벨
    const fs = Math.max(8, R * 0.7);
    const [, yN] = hexCenter(7, 3);
    const [, yC] = hexCenter(7, 10);
    const [, yS] = hexCenter(7, 17);
    this.add.text(x + w / 2, yN, 'N  CP',  { fontFamily: FONT.MONO, fontSize: `${fs}px`, color: '#FFAA00' }).setOrigin(0.5);
    this.add.text(x + w / 2, yC, 'C  ≤20', { fontFamily: FONT.MONO, fontSize: `${fs}px`, color: '#4466FF' }).setOrigin(0.5);
    this.add.text(x + w / 2, yS, 'S',      { fontFamily: FONT.MONO, fontSize: `${fs}px`, color: '#33FF33' }).setOrigin(0.5);
    this.add.text(x + w / 2, yBot + R * 1.0, 'OGRE', { fontFamily: FONT.MONO, fontSize: `${fs}px`, color: '#FF3300' }).setOrigin(0.5);
  }

  private start(): void {
    this.cameras.main.fadeOut(220, 7, 12, 7);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('setup'));
  }
}
