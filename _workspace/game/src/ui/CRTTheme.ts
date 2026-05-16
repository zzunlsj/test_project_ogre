// ============================================================================
// CRTTheme.ts — Apple II Green Phosphor CRT theme constants
// ============================================================================
import Phaser from 'phaser';

export const CRT = {
  // Hex strings (CSS / Phaser text color)
  GREEN:      '#33FF33',
  GREEN_DIM:  '#00CC00',
  GREEN_DARK: '#00AA00',
  GREEN_DEEP: '#007700',
  AMBER:      '#FFAA00',
  AMBER_DIM:  '#CC7700',
  RED:        '#FF3300',
  RED_DIM:    '#AA2200',
  WHITE:      '#E0FFE0',
  BG:         '#070C07',
  BG_PANEL:   '#0C120C',
  BG_DEEP:    '#040604',
  BORDER:     '#1A3A1A',
  BORDER_DIM: '#0D1A0D',

  // Phaser numeric (for graphics, fillStyle, lineStyle)
  GREEN_HEX:      0x33FF33,
  GREEN_DIM_HEX:  0x00CC00,
  GREEN_DARK_HEX: 0x00AA00,
  GREEN_DEEP_HEX: 0x007700,
  AMBER_HEX:      0xFFAA00,
  RED_HEX:        0xFF3300,
  BG_HEX:         0x070C07,
  BG_PANEL_HEX:   0x0C120C,
  BORDER_HEX:     0x1A3A1A,
  BORDER_DIM_HEX: 0x0D1A0D,
} as const;

export const FONT = {
  MONO: '"Share Tech Mono", "Courier New", monospace',
  SIZES: { XS: 9, S: 11, M: 14, L: 18, XL: 24, XXL: 36, TITLE: 64 },
} as const;

/** Standard CRT text style. */
export function textStyle(
  size: number = FONT.SIZES.M,
  color: string = CRT.GREEN,
): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: FONT.MONO,
    fontSize: `${size}px`,
    color,
    resolution: 2,
  };
}

/** Glowing text style — shadow simulates phosphor bloom. */
export function glowTextStyle(
  size: number = FONT.SIZES.M,
  color: string = CRT.GREEN,
  blur: number = 8,
): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: FONT.MONO,
    fontSize: `${size}px`,
    color,
    resolution: 2,
    shadow: {
      offsetX: 0,
      offsetY: 0,
      color,
      blur,
      stroke: false,
      fill: true,
    },
  };
}

/** Apply a glow shadow to an existing text object. */
export function applyGlow(
  text: Phaser.GameObjects.Text,
  color: string = CRT.GREEN,
  blur: number = 8,
): void {
  text.setShadow(0, 0, color, blur, false, true);
}

/** Draw a CRT-style panel border (hollow rectangle with double line). */
export function drawPanelBorder(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  color: number = CRT.BORDER_HEX,
): void {
  g.lineStyle(1, color, 1);
  g.strokeRect(x, y, w, h);
  g.lineStyle(1, color, 0.4);
  g.strokeRect(x + 2, y + 2, w - 4, h - 4);
}

/** Draw a filled CRT panel background. */
export function drawPanelBg(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: number = CRT.BG_PANEL_HEX,
  border: number = CRT.BORDER_HEX,
): void {
  g.fillStyle(fill, 0.92);
  g.fillRect(x, y, w, h);
  g.lineStyle(1, border, 1);
  g.strokeRect(x, y, w, h);
}

/** Make a text element blink between full/dim opacity. */
export function blink(
  scene: Phaser.Scene,
  obj: Phaser.GameObjects.Components.AlphaSingle,
  period: number = 600,
  dim: number = 0.25,
): Phaser.Tweens.Tween {
  return scene.tweens.add({
    targets: obj,
    alpha: { from: 1, to: dim },
    duration: period,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });
}

/** Add scanline overlay across the entire screen. */
export function addScanlines(
  scene: Phaser.Scene,
  alpha: number = 0.10,
): Phaser.GameObjects.Graphics {
  const w = scene.scale.width;
  const h = scene.scale.height;
  const g = scene.add.graphics();
  g.lineStyle(1, 0x000000, alpha);
  for (let y = 0; y < h; y += 3) {
    g.lineBetween(0, y, w, y);
  }
  g.setScrollFactor(0);
  g.setDepth(10000);
  return g;
}

/** Add a subtle CRT vignette / corner glow. */
export function addVignette(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  const w = scene.scale.width;
  const h = scene.scale.height;
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.55);
  // crude vignette: dark border bands
  g.fillRect(0, 0, w, 8);
  g.fillRect(0, h - 8, w, 8);
  g.fillRect(0, 0, 8, h);
  g.fillRect(w - 8, 0, 8, h);
  g.setScrollFactor(0);
  g.setDepth(9999);
  return g;
}

/** Pulse a glow color on a text element via tween. */
export function pulseGlow(
  scene: Phaser.Scene,
  text: Phaser.GameObjects.Text,
  minBlur: number = 4,
  maxBlur: number = 14,
  duration: number = 900,
): void {
  const data = { blur: minBlur };
  scene.tweens.add({
    targets: data,
    blur: maxBlur,
    duration,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
    onUpdate: () => {
      const c = (text.style.color as string) ?? CRT.GREEN;
      text.setShadow(0, 0, c, data.blur, false, true);
    },
  });
}

/** Convenient mapping from CrtResult to color. */
export const RESULT_COLOR: Record<string, string> = {
  NE: CRT.GREEN,
  D: CRT.AMBER,
  X: CRT.RED,
};
