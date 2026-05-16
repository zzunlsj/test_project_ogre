// ============================================================================
// SideSelectScene — 1P chooses to play as OGRE or DEFENDER
// ============================================================================
import Phaser from 'phaser';
import { CRT, FONT, textStyle, applyGlow, addScanlines, addVignette } from '@/ui/CRTTheme';
import type { GameMode, Side } from '@/types';

interface Choice {
  side: Side;
  label: string;
  desc: string;
  iconKey: string;
}

export class SideSelectScene extends Phaser.Scene {
  private choices: Choice[] = [];
  private cards: Phaser.GameObjects.Container[] = [];
  private cursor = 0;

  constructor() {
    super({ key: 'sideselect' });
  }

  create(): void {
    this.cameras.main.setBackgroundColor(CRT.BG);
    this.cameras.main.fadeIn(220, 7, 12, 7);
    addScanlines(this);
    addVignette(this);

    const w = this.scale.width;
    const h = this.scale.height;

    const header = this.add
      .text(w / 2, 80, 'SELECT SIDE', textStyle(FONT.SIZES.XL, CRT.AMBER))
      .setOrigin(0.5);
    applyGlow(header, CRT.AMBER, 12);

    this.choices = [
      {
        side: 'ogre',
        label: 'PLAY AS OGRE',
        desc: '1 CYBERTANK Mk.III\nCRUSH THE DEFENSE LINE.\nREACH THE COMMAND POST.',
        iconKey: 'ogre_mk3_crt',
      },
      {
        side: 'defender',
        label: 'PLAY AS DEFENDER',
        desc: 'ARMOR + INFANTRY + CP\nSURVIVE AND DISABLE THE OGRE.\nDEFEND COMMAND POST.',
        iconKey: 'heavy_tank_crt',
      },
    ];

    const cardW = 320;
    const cardH = 240;
    const gap = 40;
    const totalW = cardW * 2 + gap;
    const startX = w / 2 - totalW / 2 + cardW / 2;
    const cy = h / 2 + 20;

    this.choices.forEach((ch, i) => {
      const cx = startX + i * (cardW + gap);
      this.cards.push(this.makeCard(cx, cy, cardW, cardH, ch));
    });

    this.setCursor(0);

    if (this.input.keyboard) {
      this.input.keyboard.on('keydown-LEFT', () => this.move(-1));
      this.input.keyboard.on('keydown-RIGHT', () => this.move(1));
      this.input.keyboard.on('keydown-ENTER', () => this.activate());
      this.input.keyboard.on('keydown-SPACE', () => this.activate());
      this.input.keyboard.on('keydown-ESC', () => this.scene.start('modeselect'));
    }
  }

  private makeCard(cx: number, cy: number, w: number, h: number, ch: Choice): Phaser.GameObjects.Container {
    const c = this.add.container(cx, cy);
    const bg = this.add.graphics();
    bg.fillStyle(CRT.BG_PANEL_HEX, 1);
    bg.fillRect(-w / 2, -h / 2, w, h);
    bg.lineStyle(1, CRT.BORDER_HEX, 1);
    bg.strokeRect(-w / 2, -h / 2, w, h);
    c.add(bg);

    // Icon
    if (this.textures.exists(ch.iconKey)) {
      const icon = this.add.image(0, -h / 2 + 70, ch.iconKey).setOrigin(0.5);
      icon.setDisplaySize(80, 80);
      c.add(icon);
    } else {
      const placeholder = this.add
        .text(0, -h / 2 + 70, ch.side === 'ogre' ? '[ OGRE ]' : '[ DEF ]', textStyle(FONT.SIZES.L, CRT.GREEN))
        .setOrigin(0.5);
      c.add(placeholder);
    }

    const lbl = this.add
      .text(0, -10, ch.label, textStyle(FONT.SIZES.M, CRT.GREEN))
      .setOrigin(0.5);
    applyGlow(lbl, CRT.GREEN, 8);
    c.add(lbl);

    const desc = this.add
      .text(0, 60, ch.desc, {
        ...textStyle(FONT.SIZES.S, CRT.GREEN_DIM),
        align: 'center',
        wordWrap: { width: w - 30 },
      })
      .setOrigin(0.5);
    c.add(desc);

    const hit = this.add.rectangle(0, 0, w, h, 0x000000, 0.001).setInteractive({ useHandCursor: true });
    c.add(hit);
    hit.on('pointerover', () => {
      const idx = this.cards.indexOf(c);
      if (idx >= 0) this.setCursor(idx);
    });
    hit.on('pointerdown', () => this.pick(ch.side));

    (c as any)._bg = bg;
    (c as any)._lbl = lbl;
    (c as any)._w = w;
    (c as any)._h = h;
    return c;
  }

  private setCursor(i: number): void {
    this.cursor = (i + this.choices.length) % this.choices.length;
    this.cards.forEach((card, idx) => {
      const sel = idx === this.cursor;
      const bg = (card as any)._bg as Phaser.GameObjects.Graphics;
      const lbl = (card as any)._lbl as Phaser.GameObjects.Text;
      const W = (card as any)._w as number;
      const H = (card as any)._h as number;
      bg.clear();
      bg.fillStyle(sel ? CRT.GREEN_DEEP_HEX : CRT.BG_PANEL_HEX, sel ? 0.55 : 1);
      bg.fillRect(-W / 2, -H / 2, W, H);
      bg.lineStyle(sel ? 2 : 1, sel ? CRT.AMBER_HEX : CRT.BORDER_HEX, 1);
      bg.strokeRect(-W / 2, -H / 2, W, H);
      lbl.setColor(sel ? CRT.AMBER : CRT.GREEN);
      applyGlow(lbl, sel ? CRT.AMBER : CRT.GREEN, sel ? 14 : 6);
    });
  }

  private move(dir: number): void {
    this.setCursor(this.cursor + dir);
  }

  private activate(): void {
    const ch = this.choices[this.cursor];
    if (ch) this.pick(ch.side);
  }

  private pick(side: Side): void {
    const mode: GameMode = side === 'ogre' ? 'solo-ogre' : 'solo-defender';
    this.registry.set('gameMode', mode);
    this.registry.set('playerSide', side);
    this.cameras.main.fadeOut(220, 7, 12, 7);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('briefing'));
  }
}
