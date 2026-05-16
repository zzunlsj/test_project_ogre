// ============================================================================
// LayoutManager.ts — device-specific UI panel layouts
// ============================================================================
import type { DeviceLayout } from '@/types';

export interface PanelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface UILayout {
  device: DeviceLayout;
  orientation: 'landscape' | 'portrait';
  leftPanel: PanelRect;
  mapArea: PanelRect;
  rightPanel: PanelRect;
  bottomBar: PanelRect;
}

export class LayoutManager {
  /** Detect the device class from screen dimensions. */
  static detect(width: number, _height: number): DeviceLayout {
    if (width >= 1200) return 'desktop';
    if (width >= 768) return 'tablet';
    return 'mobile';
  }

  static orientation(width: number, height: number): 'landscape' | 'portrait' {
    return width >= height ? 'landscape' : 'portrait';
  }

  /** Compute panel rectangles for the current screen size. */
  static getPanels(screenW: number, screenH: number): UILayout {
    const device = this.detect(screenW, screenH);
    const orientation = this.orientation(screenW, screenH);

    if (device === 'desktop') {
      const leftW  = 270;   // 180 × 1.5
      const rightW = 390;   // 260 × 1.5
      const bottomH = 56;
      const topY = 0;
      const mapH = screenH - bottomH;
      return {
        device,
        orientation,
        leftPanel: { x: 0, y: topY, w: leftW, h: mapH },
        mapArea: { x: leftW, y: topY, w: Math.max(200, screenW - leftW - rightW), h: mapH },
        rightPanel: { x: screenW - rightW, y: topY, w: rightW, h: mapH },
        bottomBar: { x: 0, y: screenH - bottomH, w: screenW, h: bottomH },
      };
    }

    if (device === 'tablet') {
      const leftW  = 225;   // 150 × 1.5
      const rightW = 330;   // 220 × 1.5
      const bottomH = 48;
      const mapH = screenH - bottomH;
      return {
        device,
        orientation,
        leftPanel: { x: 0, y: 0, w: leftW, h: mapH },
        mapArea: { x: leftW, y: 0, w: Math.max(200, screenW - leftW - rightW), h: mapH },
        rightPanel: { x: screenW - rightW, y: 0, w: rightW, h: mapH },
        bottomBar: { x: 0, y: screenH - bottomH, w: screenW, h: bottomH },
      };
    }

    // Mobile portrait: top mini-bar + map + bottom mini-bar; side panels collapsed
    const topH = 60;
    const bottomH = 80;
    const mapH = screenH - topH - bottomH;
    return {
      device,
      orientation,
      leftPanel: { x: 0, y: topH, w: 0, h: mapH }, // collapsed (slide-in)
      mapArea: { x: 0, y: topH, w: screenW, h: mapH },
      rightPanel: { x: screenW, y: topH, w: 0, h: mapH }, // collapsed
      bottomBar: { x: 0, y: screenH - bottomH, w: screenW, h: bottomH },
    };
  }

  /** Whether 2-player versus mode should rotate the opposite panel 180°. */
  static shouldRotateOpposite(mode: 'solo-ogre' | 'solo-defender' | 'versus'): boolean {
    return mode === 'versus';
  }
}
