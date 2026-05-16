// ============================================================================
// PreloadScene — loads SVG assets and applies CRT green colorization
// ============================================================================
import Phaser from 'phaser';
import { CRT, FONT, textStyle, applyGlow } from '@/ui/CRTTheme';

const ASSET_KEYS = [
  'ogre_mk3',
  'heavy_tank',
  'missile_tank',
  'gev',
  'howitzer',
  'infantry_1',
  'infantry_2',
  'infantry_3',
  'cp',
];

export class PreloadScene extends Phaser.Scene {
  private barFill?: Phaser.GameObjects.Graphics;
  private percentText?: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'preload' });
  }

  preload(): void {
    this.cameras.main.setBackgroundColor(CRT.BG);
    this.drawLoadingUI();

    this.load.on('progress', (p: number) => this.updateBar(p));
    this.load.on('complete', () => this.updateBar(1));

    // Try to load SVG assets — gracefully ignore failures so the rest of the
    // pipeline still functions when SVGs are missing during early dev.
    ASSET_KEYS.forEach(key => {
      this.load.image(key, `${key}.svg`);
    });

    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      // eslint-disable-next-line no-console
      console.warn(`[preload] missing asset: ${file.key}`);
    });
  }

  create(): void {
    this.colorizeSVGTextures();
    // Brief delay so the bar's "100%" is visible
    this.time.delayedCall(220, () => this.scene.start('title'));
  }

  // --------------------------------------------------------------------------

  private drawLoadingUI(): void {
    const w = this.scale.width;
    const h = this.scale.height;

    const title = this.add
      .text(w / 2, h / 2 - 60, 'OGRE MK.III', textStyle(FONT.SIZES.XXL, CRT.GREEN))
      .setOrigin(0.5);
    applyGlow(title, CRT.GREEN, 14);

    const sub = this.add
      .text(w / 2, h / 2 - 18, 'INITIALIZING TACTICAL SYSTEMS...', textStyle(FONT.SIZES.S, CRT.GREEN_DIM))
      .setOrigin(0.5);
    applyGlow(sub, CRT.GREEN, 4);

    const barW = 360;
    const barH = 14;
    const bx = w / 2 - barW / 2;
    const by = h / 2 + 12;

    const border = this.add.graphics();
    border.lineStyle(1, CRT.BORDER_HEX, 1);
    border.strokeRect(bx - 2, by - 2, barW + 4, barH + 4);
    border.lineStyle(1, CRT.GREEN_DEEP_HEX, 0.5);
    border.strokeRect(bx, by, barW, barH);

    this.barFill = this.add.graphics();

    this.percentText = this.add
      .text(w / 2, by + barH + 16, '0%', textStyle(FONT.SIZES.S, CRT.GREEN_DIM))
      .setOrigin(0.5);
  }

  private updateBar(p: number): void {
    if (!this.barFill || !this.percentText) return;
    const w = this.scale.width;
    const h = this.scale.height;
    const barW = 360;
    const barH = 14;
    const bx = w / 2 - barW / 2;
    const by = h / 2 + 12;

    this.barFill.clear();
    this.barFill.fillStyle(CRT.GREEN_HEX, 0.85);
    this.barFill.fillRect(bx, by, barW * p, barH);

    this.percentText.setText(`${Math.floor(p * 100)}%`);
  }

  /**
   * Convert each loaded SVG into a CRT-green silhouette.
   * Bright pixels become transparent, dark pixels become various intensities of #33FF33.
   */
  private colorizeSVGTextures(): void {
    // Produce WHITE silhouette textures so Phaser setTint(color) yields the desired
    // color via multiplicative tint. Bright SVG background → transparent.
    // Dark SVG content → varying-alpha white pixels (CRT phosphor look preserved).
    const SIZE = 128;
    ASSET_KEYS.forEach(key => {
      if (!this.textures.exists(key)) return;
      try {
        const src = this.textures.get(key).getSourceImage() as HTMLImageElement;
        if (!src) return;

        const off = document.createElement('canvas');
        off.width = SIZE;
        off.height = SIZE;
        const oc = off.getContext('2d');
        if (!oc) return;
        oc.clearRect(0, 0, SIZE, SIZE);
        oc.drawImage(src, 0, 0, SIZE, SIZE);

        const imgData = oc.getImageData(0, 0, SIZE, SIZE);
        const d = imgData.data;
        for (let i = 0; i < d.length; i += 4) {
          const a = d[i + 3];
          if (a === 0) continue;
          const lum = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255;
          if (lum > 0.80) {
            d[i + 3] = 0;
          } else {
            const intensity = Math.pow(1 - lum, 0.65);
            d[i] = 255;
            d[i + 1] = 255;
            d[i + 2] = 255;
            d[i + 3] = Math.min(255, Math.round(180 + 75 * intensity));
          }
        }
        oc.putImageData(imgData, 0, 0);
        if (this.textures.exists(`${key}_crt`)) {
          this.textures.remove(`${key}_crt`);
        }
        this.textures.addCanvas(`${key}_crt`, off);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn(`[preload] colorize failed for ${key}:`, e);
      }
    });
  }
}
