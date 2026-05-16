// ============================================================================
// MainMenuScene — primary menu (NEW GAME / CREDITS)
// ============================================================================
import Phaser from 'phaser';
import { CRT, FONT, textStyle, applyGlow, addScanlines, addVignette, blink } from '@/ui/CRTTheme';

interface MenuItem {
  label: string;
  action: () => void;
}

export class MainMenuScene extends Phaser.Scene {
  private items: MenuItem[] = [];
  private texts: Phaser.GameObjects.Text[] = [];
  private cursor = 0;
  private creditsOverlay?: Phaser.GameObjects.Container;

  constructor() {
    super({ key: 'mainmenu' });
  }

  create(): void {
    this.cameras.main.setBackgroundColor(CRT.BG);
    this.cameras.main.fadeIn(280, 7, 12, 7);
    addScanlines(this);
    addVignette(this);

    const w = this.scale.width;
    const h = this.scale.height;

    const title = this.add
      .text(w / 2, 90, 'O G R E', textStyle(FONT.SIZES.TITLE, CRT.GREEN))
      .setOrigin(0.5);
    applyGlow(title, CRT.GREEN, 18);

    const sub = this.add
      .text(w / 2, 150, 'MAIN MENU', textStyle(FONT.SIZES.M, CRT.AMBER))
      .setOrigin(0.5);
    applyGlow(sub, CRT.AMBER, 8);

    this.items = [
      { label: 'NEW GAME', action: () => this.gotoMode() },
      { label: 'CREDITS', action: () => this.showCredits() },
    ];

    const cy = h / 2 + 20;
    this.items.forEach((it, i) => {
      const t = this.add
        .text(w / 2, cy + i * 44, `  ${it.label}  `, textStyle(FONT.SIZES.L, CRT.GREEN))
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      applyGlow(t, CRT.GREEN, 6);

      t.on('pointerover', () => this.setCursor(i));
      t.on('pointerdown', () => this.activate());
      this.texts.push(t);
    });

    this.setCursor(0);

    if (this.input.keyboard) {
      this.input.keyboard.on('keydown-UP', () => this.move(-1));
      this.input.keyboard.on('keydown-DOWN', () => this.move(1));
      this.input.keyboard.on('keydown-W', () => this.move(-1));
      this.input.keyboard.on('keydown-S', () => this.move(1));
      this.input.keyboard.on('keydown-ENTER', () => this.activate());
      this.input.keyboard.on('keydown-SPACE', () => this.activate());
    }

    const hint = this.add
      .text(w / 2, h - 40, 'UP/DOWN  +  ENTER', textStyle(FONT.SIZES.S, CRT.GREEN_DIM))
      .setOrigin(0.5);
    blink(this, hint, 1100, 0.35);
  }

  private setCursor(i: number): void {
    this.cursor = (i + this.items.length) % this.items.length;
    this.texts.forEach((t, idx) => {
      const sel = idx === this.cursor;
      t.setText(sel ? `> ${this.items[idx].label} <` : `  ${this.items[idx].label}  `);
      t.setColor(sel ? CRT.AMBER : CRT.GREEN);
      applyGlow(t, sel ? CRT.AMBER : CRT.GREEN, sel ? 12 : 6);
    });
  }

  private move(dir: number): void {
    this.setCursor(this.cursor + dir);
  }

  private activate(): void {
    this.items[this.cursor]?.action();
  }

  private gotoMode(): void {
    this.cameras.main.fadeOut(220, 7, 12, 7);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('modeselect'));
  }

  private showCredits(): void {
    if (this.creditsOverlay) return;
    const w = this.scale.width;
    const h = this.scale.height;
    const c = this.add.container(w / 2, h / 2);
    c.setDepth(2000);

    const bg = this.add.graphics();
    bg.fillStyle(CRT.BG_HEX, 0.96);
    bg.fillRect(-220, -120, 440, 240);
    bg.lineStyle(1, CRT.BORDER_HEX, 1);
    bg.strokeRect(-220, -120, 440, 240);
    c.add(bg);

    c.add(this.add.text(0, -90, 'CREDITS', textStyle(FONT.SIZES.L, CRT.AMBER)).setOrigin(0.5));
    c.add(this.add.text(0, -50, 'BASED ON OGRE BY STEVE JACKSON', textStyle(FONT.SIZES.S, CRT.GREEN)).setOrigin(0.5));
    c.add(this.add.text(0, -28, 'PHASER 3 + TYPESCRIPT IMPLEMENTATION', textStyle(FONT.SIZES.S, CRT.GREEN_DIM)).setOrigin(0.5));
    c.add(this.add.text(0, 10, 'CRT THEME / DICE HOLD: UI ENGINEER', textStyle(FONT.SIZES.S, CRT.GREEN_DIM)).setOrigin(0.5));
    c.add(this.add.text(0, 32, 'GAMEPLAY / AI: GAMEPLAY ENGINEER', textStyle(FONT.SIZES.S, CRT.GREEN_DIM)).setOrigin(0.5));

    const close = this.add
      .text(0, 80, '[ CLOSE ]', textStyle(FONT.SIZES.M, CRT.AMBER))
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => {
      this.creditsOverlay?.destroy();
      this.creditsOverlay = undefined;
    });
    c.add(close);

    this.creditsOverlay = c;
  }
}
