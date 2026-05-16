// ============================================================================
// CombatEffects - Phaser port of preview/effects.html
// Renders missile/gun/infantry/ram attack animations + NE/D/X hit effects.
// ============================================================================

import Phaser from 'phaser';

type WeaponType = 'missile' | 'gun' | 'infantry' | 'ram';
type Outcome = 'NE' | 'D' | 'X';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  blur: number;
  char: string | null;
}

type Overlay =
  | { type: 'ring'; x: number; y: number; t: number; maxT: number; maxR: number; color: string }
  | { type: 'flash'; x: number; y: number; t: number; maxT: number; color: string }
  | { type: 'spikes'; x: number; y: number; t: number; maxT: number; count: number; length: number; color: string }
  | { type: 'text'; x: number; y: number; t: number; maxT: number; text: string; color: string; size: number }
  | { type: 'badge'; x: number; y: number; t: number; maxT: number; text: string; color: string };

interface Projectile {
  type: 'missile' | 'shell';
  x: number;
  y: number;
  angle: number;
  tLinear: number;
  trail: { x: number; y: number; a: number; speed?: number }[];
  done: boolean;
}

const HEX_R = 52; // visual size for muzzle/contact offsets (matches effects.html)

function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }
function randRange(a: number, b: number): number { return a + Math.random() * (b - a); }
function randItem<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

// Convert "#RRGGBB" or "#RRGGBBAA" to canvas-style string usable by Phaser via setStrokeStyle/fillStyle hex.
function colorToHex(color: string): number {
  // Strip alpha if present, return numeric
  const c = color.replace('#', '').slice(0, 6);
  return parseInt(c, 16);
}
function colorAlpha(color: string): number {
  const c = color.replace('#', '');
  if (c.length === 8) return parseInt(c.slice(6, 8), 16) / 255;
  return 1;
}

export class CombatEffects {
  private scene: Phaser.Scene;
  private gfx: Phaser.GameObjects.Graphics;
  private textObjs: Phaser.GameObjects.Text[] = [];

  private particles: Particle[] = [];
  private overlays: Overlay[] = [];
  private projectile: Projectile | null = null;

  // RAM-driven token offsets (rendered by GameScene reading these)
  public srcOffset = { x: 0, y: 0 };
  public tgtOffset = { x: 0, y: 0 };
  public ramActive = false;
  public ramSrcBase = { x: 0, y: 0 };
  public ramTgtBase = { x: 0, y: 0 };

  private animating = false;
  private timers: Phaser.Time.TimerEvent[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.gfx = scene.add.graphics();
    this.gfx.setDepth(500);
  }

  isAnimating(): boolean { return this.animating; }

  fire(
    weapon: WeaponType,
    src: { x: number; y: number },
    tgt: { x: number; y: number },
    result: Outcome,
    onDone?: () => void,
  ): void {
    this.animating = true;

    const onHit = (x: number, y: number) => {
      if (result === 'NE') {
        this.hitNE(x, y);
        this.delay(1200, () => this.finish(onDone));
      } else if (result === 'D') {
        this.hitDisabled(x, y);
        this.delay(1800, () => this.finish(onDone));
      } else {
        this.hitDestroyed(x, y, () => this.finish(onDone));
      }
    };

    if (weapon === 'missile') this.animateMissile(src, tgt, onHit);
    else if (weapon === 'gun') this.animateGun(src, tgt, onHit);
    else if (weapon === 'infantry') this.animateInfantry(src, tgt, onHit);
    else if (weapon === 'ram') this.animateRam(src, tgt, onHit);
  }

  private finish(onDone?: () => void): void {
    this.animating = false;
    this.ramActive = false;
    this.srcOffset = { x: 0, y: 0 };
    this.tgtOffset = { x: 0, y: 0 };
    onDone && onDone();
  }

  private delay(ms: number, fn: () => void): void {
    const t = this.scene.time.delayedCall(ms, fn);
    this.timers.push(t);
  }

  // -------------------------------------------------------------------------
  // Update loop (called each frame from GameScene.update)
  // -------------------------------------------------------------------------
  update(delta: number): void {
    // Trail fade
    if (this.projectile && !this.projectile.done) {
      this.projectile.trail.forEach(pt => { pt.a -= 0.04; });
      this.projectile.trail = this.projectile.trail.filter(p => p.a > 0);
    }

    this.updateParticles(delta);
    this.updateOverlays(delta);
    this.render();
  }

  private updateParticles(dt: number): void {
    this.particles = this.particles.filter(p => {
      p.life -= dt;
      p.x += p.vx * dt * 0.06;
      p.y += p.vy * dt * 0.06;
      p.vy += dt * 0.04;
      return p.life > 0;
    });
  }

  private updateOverlays(dt: number): void {
    this.overlays = this.overlays.filter(o => { o.t += dt; return o.t < o.maxT; });
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------
  private render(): void {
    this.gfx.clear();
    // Clean up text overlays
    for (const t of this.textObjs) t.destroy();
    this.textObjs = [];

    this.drawProjectile();
    this.drawParticles();
    this.drawOverlays();
  }

  private drawParticles(): void {
    const g = this.gfx;
    for (const p of this.particles) {
      const a = clamp(p.life / p.maxLife, 0, 1);
      const colHex = colorToHex(p.color);
      const colA = colorAlpha(p.color) * a;

      if (p.char) {
        // Text particles via Phaser.Text
        const t = this.scene.add.text(p.x, p.y, p.char, {
          fontFamily: '"Share Tech Mono", monospace',
          fontSize: `${p.size}px`,
          color: '#' + p.color.replace('#','').slice(0,6),
          fontStyle: 'bold',
        }).setOrigin(0.5, 0.5).setAlpha(a).setDepth(501);
        this.textObjs.push(t);
      } else {
        g.fillStyle(colHex, colA);
        g.fillCircle(p.x, p.y, Math.max(0.5, p.size * a));
      }
    }
  }

  private drawOverlays(): void {
    const g = this.gfx;
    for (const o of this.overlays) {
      const p = o.t / o.maxT;
      const colHex = colorToHex(o.color);

      if (o.type === 'ring') {
        const r = o.maxR * p;
        const alpha = 1 - p;
        g.lineStyle(2, colHex, alpha);
        g.strokeCircle(o.x, o.y, r);
      } else if (o.type === 'flash') {
        const alpha = 1 - p;
        const r = 60 * (1 - p * 0.5);
        // Approximate radial gradient with stacked circles
        for (let i = 4; i >= 0; i--) {
          const f = i / 4;
          g.fillStyle(colHex, alpha * (1 - f) * 0.55);
          g.fillCircle(o.x, o.y, r * (0.3 + f * 0.7));
        }
      } else if (o.type === 'spikes') {
        const alpha = 1 - p;
        g.lineStyle(2, colHex, alpha);
        for (let i = 0; i < o.count; i++) {
          const a = (Math.PI * 2 / o.count) * i;
          const len = o.length * (1 - p * 0.4);
          g.lineBetween(
            o.x + Math.cos(a) * 6,
            o.y + Math.sin(a) * 6,
            o.x + Math.cos(a) * len,
            o.y + Math.sin(a) * len,
          );
        }
      } else if (o.type === 'text') {
        const alpha = p < 0.2 ? p / 0.2 : p > 0.7 ? 1 - (p - 0.7) / 0.3 : 1;
        const yOff = -20 * p;
        const t = this.scene.add.text(o.x, o.y + yOff, o.text, {
          fontFamily: '"Share Tech Mono", monospace',
          fontSize: `${o.size}px`,
          color: '#' + o.color.replace('#','').slice(0,6),
          fontStyle: 'bold',
        }).setOrigin(0.5, 0.5).setAlpha(alpha).setDepth(502);
        this.textObjs.push(t);
      } else if (o.type === 'badge') {
        const alpha = p < 0.15 ? p / 0.15 : p > 0.75 ? 1 - (p - 0.75) / 0.25 : 1;
        const t = this.scene.add.text(o.x, o.y, o.text, {
          fontFamily: '"Share Tech Mono", monospace',
          fontSize: '13px',
          color: '#' + o.color.replace('#','').slice(0,6),
          backgroundColor: '#000000',
          padding: { left: 10, right: 10, top: 4, bottom: 4 },
          fontStyle: 'bold',
        }).setOrigin(0.5, 0.5).setAlpha(alpha).setDepth(502);
        this.textObjs.push(t);
        // Border via gfx
        const w = t.width, h = t.height;
        g.lineStyle(1.5, colHex, alpha);
        g.strokeRect(o.x - w/2, o.y - h/2, w, h);
      }
    }
  }

  private drawProjectile(): void {
    const g = this.gfx;
    if (!this.projectile || this.projectile.done) return;
    const { type, x, y, angle, tLinear, trail } = this.projectile;

    // Trail
    trail.forEach((pt, i) => {
      if (pt.a <= 0) return;
      const frac = i / trail.length;
      const colHex = type === 'shell' ? 0x88CC44 : 0x00CC00;
      g.fillStyle(colHex, Math.max(0, pt.a) * 0.7);
      g.fillCircle(pt.x, pt.y, 1.5 + frac * 2.5);
    });

    if (type === 'missile') {
      // Glow + body + arrowhead + engine glow
      // outer glow
      const glowR = 12 + tLinear * 10;
      for (let i = 3; i >= 0; i--) {
        const f = i / 3;
        g.fillStyle(0xFFFFAA, (0.85 * (1 - f)) * 0.4);
        const gx = x + Math.cos(angle) * 4;
        const gy = y + Math.sin(angle) * 4;
        g.fillCircle(gx, gy, glowR * (0.4 + f * 0.6));
      }
      // body line (rotated)
      const bodyLen = 19;
      const bx1 = x + Math.cos(angle) * (-10);
      const by1 = y + Math.sin(angle) * (-10);
      const bx2 = x + Math.cos(angle) * 9;
      const by2 = y + Math.sin(angle) * 9;
      g.lineStyle(2.5, 0xCCFFCC, 1);
      g.lineBetween(bx1, by1, bx2, by2);
      // arrowhead (triangle)
      const ax = x + Math.cos(angle) * 16;
      const ay = y + Math.sin(angle) * 16;
      const perpx = -Math.sin(angle);
      const perpy = Math.cos(angle);
      g.fillStyle(0xFFFFFF, 1);
      g.beginPath();
      g.moveTo(bx2 + perpx * (-3), by2 + perpy * (-3));
      g.lineTo(ax, ay);
      g.lineTo(bx2 + perpx * 3, by2 + perpy * 3);
      g.closePath();
      g.fillPath();
      // tail fins
      g.lineStyle(1.5, 0x33FF33, 1 - tLinear * 0.4);
      g.lineBetween(bx1, by1, x + Math.cos(angle) * (-15) + perpx * (-5), y + Math.sin(angle) * (-15) + perpy * (-5));
      g.lineBetween(bx1, by1, x + Math.cos(angle) * (-15) + perpx * 5,  y + Math.sin(angle) * (-15) + perpy * 5);
      // engine glow
      const eg_x = x + Math.cos(angle) * (-12);
      const eg_y = y + Math.sin(angle) * (-12);
      const glowR2 = 6 + tLinear * 10;
      const intensity = Math.round(100 + tLinear * 155);
      const engineHex = (255 << 16) | (255 << 8) | intensity;
      for (let i = 3; i >= 0; i--) {
        const f = i / 3;
        g.fillStyle(engineHex, (0.6 + tLinear * 0.4) * (1 - f) * 0.5);
        g.fillCircle(eg_x, eg_y, glowR2 * (0.3 + f * 0.7));
      }
    } else if (type === 'shell') {
      const cosA = Math.cos(angle), sinA = Math.sin(angle);
      const px = -sinA, py = cosA;
      const fwd = (d: number, side: number = 0) => ({
        x: x + cosA * d + px * side,
        y: y + sinA * d + py * side,
      });

      // Glow
      const glowR = 14 + tLinear * 8;
      const glowC = fwd(6);
      for (let i = 3; i >= 0; i--) {
        const f = i / 3;
        g.fillStyle(0xFFFFAA, (0.85 * (1 - f)) * 0.35);
        g.fillCircle(glowC.x, glowC.y, glowR * (0.3 + f * 0.7));
      }

      // 약협 (cartridge)
      const c1 = fwd(-14, -4.5);
      const c2 = fwd(5,   -4);
      const c3 = fwd(5,    4);
      const c4 = fwd(-14,  4.5);
      g.fillStyle(0x88CC44, 1);
      g.beginPath();
      g.moveTo(c1.x, c1.y); g.lineTo(c2.x, c2.y); g.lineTo(c3.x, c3.y); g.lineTo(c4.x, c4.y);
      g.closePath(); g.fillPath();

      // 탄두 (warhead triangle)
      const w1 = fwd(5, -4);
      const w2 = fwd(20, 0);
      const w3 = fwd(5,  4);
      g.fillStyle(0xDDFFD0, 1);
      g.beginPath();
      g.moveTo(w1.x, w1.y); g.lineTo(w2.x, w2.y); g.lineTo(w3.x, w3.y);
      g.closePath(); g.fillPath();

      // 림 (rim)
      const r1 = fwd(-17, -3.5);
      const r2 = fwd(-13, -3.5);
      const r3 = fwd(-13,  3.5);
      const r4 = fwd(-17,  3.5);
      g.fillStyle(0xBBFFBB, 1);
      g.beginPath();
      g.moveTo(r1.x, r1.y); g.lineTo(r2.x, r2.y); g.lineTo(r3.x, r3.y); g.lineTo(r4.x, r4.y);
      g.closePath(); g.fillPath();

      // 경계선
      g.lineStyle(1, 0x66FF66, 1);
      g.lineBetween(c2.x, c2.y, c3.x, c3.y);
    }
  }

  // -------------------------------------------------------------------------
  // Particle / overlay helpers
  // -------------------------------------------------------------------------
  private addParticle(x: number, y: number, vx: number, vy: number,
                       life: number, color: string, size: number, blur = 6, char: string | null = null): void {
    this.particles.push({ x, y, vx, vy, life, maxLife: life, color, size, blur, char });
  }

  private spawnExplosion(x: number, y: number, count: number, colors: string[],
                          minSpd: number, maxSpd: number, chars: string[] | null,
                          sizeRange: [number, number]): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = randRange(minSpd, maxSpd);
      this.addParticle(x, y,
        Math.cos(angle) * spd, Math.sin(angle) * spd,
        randRange(400, 900),
        randItem(colors),
        randRange(sizeRange[0], sizeRange[1]),
        10,
        chars ? randItem(chars) : null);
    }
  }

  private addRing(x: number, y: number, maxR: number, duration: number, color: string): void {
    this.overlays.push({ type: 'ring', x, y, t: 0, maxT: duration, maxR, color });
  }
  private addText(x: number, y: number, text: string, duration: number, color: string, size = 16): void {
    this.overlays.push({ type: 'text', x, y, t: 0, maxT: duration, text, color, size });
  }
  private addBadge(x: number, y: number, text: string, duration: number, color: string): void {
    this.overlays.push({ type: 'badge', x, y, t: 0, maxT: duration, text, color });
  }
  private addFlash(x: number, y: number, duration: number, color: string): void {
    this.overlays.push({ type: 'flash', x, y, t: 0, maxT: duration, color });
  }
  private addSpikes(x: number, y: number, count: number, length: number, duration: number, color: string): void {
    this.overlays.push({ type: 'spikes', x, y, t: 0, maxT: duration, count, length, color });
  }

  // -------------------------------------------------------------------------
  // Hit effects
  // -------------------------------------------------------------------------
  private hitNE(x: number, y: number): void {
    this.addRing(x, y, 45, 600, '#007700');
    this.addRing(x, y, 30, 400, '#00AA00');
    this.addText(x, y - 65, 'NO EFFECT', 1000, '#007700', 13);
  }

  private hitDisabled(x: number, y: number): void {
    this.addFlash(x, y, 400, '#FFAA00');
    this.addSpikes(x, y, 8, 40, 500, '#FFAA00');
    this.addRing(x, y, 50, 700, '#FFAA00');
    this.spawnExplosion(x, y, 20, ['#FFAA00','#FF8800','#FFCC44'], 40, 100, null, [2, 5]);
    this.addBadge(x, y - 72, 'DISABLED', 1400, '#FFAA00');
    for (let i = 0; i < 12; i++) {
      this.delay(i * 60, () => {
        const a = Math.random() * Math.PI * 2;
        const s = randRange(15, 40);
        this.addParticle(x + randRange(-8,8), y + randRange(-8,8),
          Math.cos(a)*s, Math.sin(a)*s - 40,
          randRange(600,1000), '#FFAA0066', randRange(8,16), 4, null);
      });
    }
  }

  private hitDestroyed(x: number, y: number, onDone?: () => void): void {
    this.addFlash(x, y, 600, '#FF3300');
    this.addFlash(x, y, 300, '#FFAA00');

    [0, 120, 250].forEach(d => {
      this.delay(d, () => {
        this.addRing(x, y, 30 + d, 700, '#FF3300');
        this.addRing(x, y, 50 + d * 0.5, 900, '#FF6600');
      });
    });

    this.addSpikes(x, y, 12, 55, 400, '#FF6600');
    this.delay(150, () => this.addSpikes(x, y, 8, 40, 350, '#FFAA00'));

    this.spawnExplosion(x, y, 18, ['#FF3300','#FF6600','#FFAA00'], 60, 140,
      ['*', '+', '×', '✕', '◉'], [14, 22]);
    this.spawnExplosion(x, y, 30, ['#FF3300','#FF5500','#FFCC00'], 50, 120,
      null, [2, 6]);

    for (let i = 0; i < 20; i++) {
      this.delay(i * 50, () => {
        const a = Math.random() * Math.PI * 2;
        this.addParticle(x + randRange(-12,12), y + randRange(-12,12),
          Math.cos(a)*randRange(10,30), Math.sin(a)*randRange(10,30) - 50,
          randRange(800,1400), '#FF330044', randRange(10,22), 4, null);
      });
    }

    this.addBadge(x, y - 76, 'DESTROYED', 1800, '#FF3300');
    this.delay(2000, () => onDone && onDone());
  }

  // -------------------------------------------------------------------------
  // Weapon animations
  // -------------------------------------------------------------------------
  private animateMissile(src: { x: number; y: number }, tgt: { x: number; y: number }, onHit: (x: number, y: number) => void): void {
    const TRAVEL = 1100;
    const start = performance.now();
    let hitDone = false;

    const sx = src.x + HEX_R * 0.95 * Math.sign(tgt.x - src.x || 1);
    const ex = tgt.x - HEX_R * 0.95 * Math.sign(tgt.x - src.x || 1);
    const sy = src.y, ey = tgt.y;
    const angle = Math.atan2(ey - sy, ex - sx);

    for (let i = 0; i < 10; i++) {
      const a = Math.PI + randRange(-0.4, 0.4);
      this.addParticle(src.x+randRange(-4,4), src.y+randRange(-4,4),
        Math.cos(a)*randRange(20,60), Math.sin(a)*randRange(20,60),
        randRange(350,700), '#33FF3355', randRange(8,18), 4, null);
    }
    this.addFlash(src.x, src.y, 160, '#FFFFAA');
    this.addSpikes(src.x, src.y, 6, 28, 200, '#CCFF88');

    this.projectile = { type: 'missile', x: sx, y: sy, angle, tLinear: 0, trail: [], done: false };

    const frame = () => {
      const elapsed = performance.now() - start;
      const tLinear = clamp(elapsed / TRAVEL, 0, 1);
      const tAccel = Math.pow(tLinear, 1.8);
      const mx = lerp(sx, ex, tAccel);
      const my = lerp(sy, ey, tAccel);

      if (this.projectile && !this.projectile.done) {
        this.projectile.x = mx;
        this.projectile.y = my;
        this.projectile.tLinear = tLinear;
        this.projectile.trail.push({ x: mx, y: my, a: 1.0, speed: tLinear });
        if (this.projectile.trail.length > 60) this.projectile.trail.shift();
      }

      if (tLinear < 0.95 && tLinear > 0.05 && Math.random() < 0.4) {
        const ba = angle + Math.PI + randRange(-0.25, 0.25);
        this.addParticle(mx, my, Math.cos(ba)*lerp(15,5,tLinear)+randRange(-4,4),
          Math.sin(ba)*lerp(15,5,tLinear)+randRange(-4,4),
          randRange(150,320), '#33FF3333', randRange(4,10), 3, null);
      }

      if (tLinear >= 1 && !hitDone) {
        hitDone = true;
        if (this.projectile) this.projectile.done = true;
        onHit(tgt.x, tgt.y);
        return;
      }
      if (tLinear < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  private animateGun(src: { x: number; y: number }, tgt: { x: number; y: number }, onHit: (x: number, y: number) => void): void {
    const TRAVEL = 720;
    const start = performance.now();
    let hitDone = false;

    this.addFlash(src.x, src.y, 180, '#EEFFCC');
    this.addSpikes(src.x, src.y, 8, 38, 200, '#FFFF99');
    this.addRing(src.x, src.y, 35, 300, '#CCFFCC');
    [0,60,120].forEach(d => this.delay(d, () => this.addRing(src.x, src.y, 22, 250, '#33FF3388')));

    for (let i = 0; i < 6; i++) {
      this.addParticle(src.x + randRange(-5,5), src.y + randRange(-5,5),
        randRange(-20,20), randRange(-50,-20),
        randRange(400,700), '#33FF3333', randRange(10,18), 3, null);
    }

    const dirSign = Math.sign(tgt.x - src.x || 1);
    const startX = src.x + HEX_R * dirSign;
    const endX = tgt.x - HEX_R * dirSign;

    this.projectile = { type: 'shell', x: startX, y: src.y, angle: 0, tLinear: 0, trail: [], done: false };

    const frame = () => {
      const elapsed = performance.now() - start;
      const t = clamp(elapsed / TRAVEL, 0, 1);
      const mx = lerp(startX, endX, t);
      const arcY = -40 * Math.sin(Math.PI * t);
      const my = lerp(src.y, tgt.y, t) + arcY;
      const nextT = Math.min(t + 0.05, 1);
      const nx = lerp(startX, endX, nextT);
      const ny = lerp(src.y, tgt.y, nextT) - 40 * Math.sin(Math.PI * nextT);
      const angle = Math.atan2(ny - my, nx - mx);

      if (this.projectile && !this.projectile.done) {
        this.projectile.x = mx;
        this.projectile.y = my;
        this.projectile.angle = angle;
        this.projectile.tLinear = t;
        this.projectile.trail.push({ x: mx, y: my, a: 1.0 });
        if (this.projectile.trail.length > 25) this.projectile.trail.shift();
      }

      if (t >= 1 && !hitDone) {
        hitDone = true;
        if (this.projectile) this.projectile.done = true;
        onHit(tgt.x, tgt.y);
        return;
      }
      if (t < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  private animateInfantry(src: { x: number; y: number }, tgt: { x: number; y: number }, onHit: (x: number, y: number) => void): void {
    const TRAVEL = 350;
    const start = performance.now();
    let hitDone = false;

    const burstCount = 5;
    const spread = 22;
    const dirSign = Math.sign(tgt.x - src.x || 1);
    const bullets: { src: { x: number; y: number }, tgt: { x: number; y: number }, delay: number }[] = [];

    for (let i = 0; i < burstCount; i++) {
      const delay = i * 40;
      const spreadY = (i - burstCount/2) * (spread / burstCount);
      const bSrc = { x: src.x + HEX_R*0.85*dirSign, y: src.y + spreadY };
      const bTgt = { x: tgt.x - HEX_R*0.85*dirSign, y: tgt.y + spreadY * 0.3 + randRange(-10,10) };
      bullets.push({ src: bSrc, tgt: bTgt, delay });

      this.delay(delay, () => {
        this.addFlash(bSrc.x, bSrc.y, 120, '#CCFFCC');
        this.addSpikes(bSrc.x, bSrc.y, 4, 18, 150, '#EEFFEE');
      });
    }

    const frame = () => {
      const elapsed = performance.now() - start;

      // Render bullet traces directly into gfx (single-frame draws — no persistence)
      // We approximate by spawning short-lived particles for trail visibility.
      bullets.forEach(b => {
        const bt = clamp((elapsed - b.delay) / TRAVEL, 0, 1);
        if (bt <= 0 || bt >= 1) return;
        const bx = lerp(b.src.x, b.tgt.x, bt);
        const by = lerp(b.src.y, b.tgt.y, bt);
        // bullet tracer particle
        this.addParticle(bx, by, 0, 0, 80, '#CCFFCC', 1.6, 6, null);
      });

      const allDone = bullets.every(b => (elapsed - b.delay) >= TRAVEL);
      if (allDone && !hitDone) {
        hitDone = true;
        onHit(tgt.x, tgt.y);
        return;
      }
      if (!hitDone) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  private animateRam(src: { x: number; y: number }, tgt: { x: number; y: number }, onHit: (x: number, y: number) => void): void {
    const CHARGE_MS = 360;
    const GRIND_MS = 760;
    const RETURN_MS = 300;

    this.ramActive = true;
    this.ramSrcBase = { x: src.x, y: src.y };
    this.ramTgtBase = { x: tgt.x, y: tgt.y };

    const dirSign = Math.sign(tgt.x - src.x || 1);
    const startX = src.x;
    const contactX = tgt.x - HEX_R * dirSign;

    let grindStart = 0;
    let lastJolt = 0;
    let hitFired = false;
    let phase: 'charge' | 'grind' | 'return' = 'charge';
    const t0 = performance.now();

    const spawnContactSparks = (cx: number, cy: number, intensity: number) => {
      const cnt = Math.round(8 + intensity * 8);
      for (let i = 0; i < cnt; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = randRange(50, 100 + intensity * 60);
        this.addParticle(cx + randRange(-8, 8), cy + randRange(-10, 10),
          Math.cos(a) * s, Math.sin(a) * s - 25,
          randRange(150, 380 + intensity * 80),
          randItem(['#FFFFFF','#CCFFCC','#AAFFAA','#FFFFAA','#88FF88']),
          randRange(2, 4 + intensity * 3), 12, null);
      }
      this.addFlash(cx, cy, 55 + intensity * 65, '#FFFFFF');
      this.addFlash(cx, cy, 30 + intensity * 40, '#AAFFAA');
    };

    this.addFlash(src.x, src.y, 160, '#AAFFAA');
    this.addSpikes(src.x, src.y, 8, 30, 220, '#88FF88');
    for (let i = 0; i < 8; i++) {
      const a = Math.PI + randRange(-0.3, 0.3);
      this.addParticle(src.x + randRange(-6, 6), src.y + randRange(-6, 6),
        Math.cos(a) * randRange(30, 70), Math.sin(a) * randRange(15, 35),
        randRange(250, 500), '#33FF3344', randRange(6, 14), 4, null);
    }

    const frame = () => {
      const now = performance.now();
      const elapsed = now - t0;

      if (phase === 'charge') {
        const t = clamp(elapsed / CHARGE_MS, 0, 1);
        const tEase = Math.pow(t, 1.5);
        this.srcOffset.x = lerp(startX, contactX, tEase) - src.x;
        this.srcOffset.y = 0;

        if (t > 0.12 && t < 0.96 && Math.random() < 0.65) {
          this.addParticle(
            src.x + this.srcOffset.x - HEX_R * 0.7 * dirSign + randRange(-6, 6),
            src.y + randRange(-HEX_R * 0.35, HEX_R * 0.35),
            randRange(-70, -25) * dirSign, randRange(-5, 5),
            randRange(80, 200), '#33FF3333', randRange(5, 13), 3, null);
        }

        if (t >= 1) {
          phase = 'grind';
          grindStart = now;
          lastJolt = now - 999;
        }
      } else if (phase === 'grind') {
        const gt = clamp((now - grindStart) / GRIND_MS, 0, 1);
        const intensity = 1.0 - gt * 0.35;

        const micro = 2.8 * intensity;
        this.srcOffset.x = (contactX - src.x) + randRange(-micro, micro);
        this.srcOffset.y = randRange(-micro * 0.6, micro * 0.6);
        this.tgtOffset.x = randRange(-micro * 0.55, micro * 0.55);
        this.tgtOffset.y = randRange(-micro * 0.45, micro * 0.45);

        if (now - lastJolt > 58 + randRange(0, 20)) {
          lastJolt = now;
          const jolt = (7 + randRange(0, 5)) * intensity;
          this.srcOffset.x = (contactX - src.x) + randRange(-jolt, jolt);
          this.srcOffset.y = randRange(-jolt * 0.5, jolt * 0.5);
          this.tgtOffset.x = randRange(-jolt * 0.5, jolt * 0.5);
          this.tgtOffset.y = randRange(-jolt * 0.4, jolt * 0.4);

          const cx = (contactX + HEX_R * dirSign + tgt.x - HEX_R * dirSign) * 0.5 + randRange(-10, 10);
          spawnContactSparks(cx, src.y + randRange(-14, 14), intensity * 0.75);

          if (Math.random() < 0.4) {
            this.addParticle(cx, src.y,
              randRange(-60, 60), randRange(-80, -20),
              randRange(300, 600),
              randItem(['#FFFFFF','#AAFFAA','#FFFF88']),
              randRange(12, 18), 8,
              randItem(['✕','×','*','▓','▒']));
          }
        }

        if (Math.random() < 0.3) {
          const cx = contactX + HEX_R * dirSign + randRange(-4, 4);
          const cy = src.y + randRange(-HEX_R * 0.6, HEX_R * 0.6);
          this.addParticle(cx, cy,
            randRange(-15, 15), randRange(-30, 10),
            randRange(100, 280), '#FFFFAA66', randRange(3, 7), 6, null);
        }

        if (gt >= 1 && !hitFired) {
          hitFired = true;
          spawnContactSparks((contactX + HEX_R * dirSign + tgt.x - HEX_R * dirSign) * 0.5, src.y, 1.5);
          this.tgtOffset = { x: 0, y: 0 };
          onHit(tgt.x, tgt.y);
          phase = 'return';
        }
      } else if (phase === 'return') {
        const rt = clamp((now - grindStart - GRIND_MS) / RETURN_MS, 0, 1);
        const ease = 1 - Math.pow(1 - rt, 2);
        this.srcOffset.x = lerp(contactX - src.x, 0, ease);
        this.srcOffset.y = 0;

        if (rt >= 1) {
          this.srcOffset = { x: 0, y: 0 };
          this.ramActive = false;
          return;
        }
      }

      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
}
