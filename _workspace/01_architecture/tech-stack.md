# Tech Stack — OGRE Web Game

## 1. Selected Stack

| Layer        | Choice                  | Version  | Rationale                                                                  |
|--------------|-------------------------|----------|----------------------------------------------------------------------------|
| Game engine  | Phaser                  | ^3.70    | Mature 2D engine with built-in scene manager, scale modes, EventEmitter, input. WebGL+Canvas fallback covers Safari 15+. |
| Language     | TypeScript              | ^5.3     | Strict types let 5 agents work in parallel without API drift.              |
| Build        | Vite                    | ^5.0     | Fast HMR for dev, ESBuild prod build, native ESM, simple static-deploy output. |
| Hosting      | GitHub Pages (static)   | -        | Single `dist/` upload, base path `./` already configured.                  |
| Font         | Share Tech Mono         | Google   | CRT/terminal aesthetic, free, swap-safe via `font-display: swap`.          |
| Module fmt   | ESM                     | -        | `"type": "module"` everywhere, tree-shakable.                              |
| Lint/format  | (deferred to v0.2)      | -        | Out of scope for the v0.1 architecture milestone.                          |

## 2. Why Not...

- **Pixi.js bare**: lacks scene manager + tween + audio in one package; we'd reinvent Phaser.
- **React + Canvas**: VDOM is dead weight when 60fps is the target.
- **Webpack/Parcel**: Vite's cold-start and config simplicity is significantly better for a small game.
- **WASM/Rust**: overkill for a turn-based game with < 200 sprites.

## 3. Project Layout

```
ogre-web-game/
  package.json
  tsconfig.json
  vite.config.ts
  index.html
  preview/
    assets/                 # SVG units (publicDir target)
      ogre_mk3.svg
      heavy_tank.svg
      missile_tank.svg
      gev.svg
      howitzer.svg
      infantry_1.svg
      infantry_2.svg
      infantry_3.svg
      cp.svg
  src/
    main.ts                 # Phaser.Game bootstrap
    config/
      gameConfig.ts
      palette.ts
      layout.ts
    types/
      index.ts              # all interfaces from module-interfaces.md
    data/
      ogreStats.ts
      defenderUnits.ts
      crt.ts
      map.ts
      scenario.ts
    systems/
      HexGrid.ts
      Pathfinder.ts
      CombatResolver.ts
      DiceHold.ts
      TurnController.ts
      AIController.ts
      VictoryChecker.ts
      EventBus.ts
    scenes/
      BootScene.ts
      PreloadScene.ts
      TitleScene.ts
      MainMenuScene.ts
      ModeSelectScene.ts
      SideSelectScene.ts
      BriefingScene.ts
      SetupScene.ts
      GameScene.ts
      UIScene.ts
      GameOverScene.ts
    ui/
      HudPanel.ts
      OgreDamagePanel.ts
      DiceHoldGauge.ts
      UnitTooltip.ts
      CrtFilter.ts           # post-processing shader
  dist/                      # build output (gitignored)
```

## 4. Build Pipeline

```
dev:   vite --host             # localhost:5173 + LAN IP for tablet/phone testing
build: tsc --noEmit && vite build
       -> dist/index.html, dist/assets/*.js, dist/assets/*.svg
preview: vite preview          # local smoke test of prod build
deploy:  copy dist/* to gh-pages branch (manual or CI later)
```

`tsc --noEmit` runs first as a type gate; Vite handles transpilation via ESBuild for speed. `manualChunks` splits Phaser into its own chunk so app code rebuilds stay tiny.

## 5. Browser Support Matrix

| Browser     | Minimum | Tested      | Notes                                  |
|-------------|---------|-------------|----------------------------------------|
| Chrome      | 90+     | latest      | Primary dev target.                    |
| Safari      | 15+     | iOS 15+     | WebGL2 supported; CRT shader fallback. |
| Firefox     | 90+     | latest      | -                                      |
| Edge        | 90+     | latest      | Chromium, same as Chrome.              |

## 6. Performance Strategy

- **One canvas, two scenes**: `GameScene` + `UIScene` parallel, `UIScene` only redraws on event.
- **Sprite atlas**: PNG-embedded SVGs are loaded as textures once in `PreloadScene`.
- **No per-frame allocations**: combat, pathfinding use object pools.
- **Pathfinding cache**: invalidated only on phase change.
- **CRT effect**: GLSL post-process pipeline on Phaser 3.60+, single shader pass.

## 7. Risk / Mitigation

| Risk                                    | Mitigation                                              |
|-----------------------------------------|---------------------------------------------------------|
| Phaser bundle (~400 KB gzip) too heavy  | Code-split via `manualChunks`; lazy-load is not needed at this size. |
| Mobile portrait layout cramped          | Slide-in side panels documented in `module-interfaces.md` (`PanelLayout`). |
| iOS Safari WebGL quirks                 | Auto-fallback to Canvas in `gameConfig.ts` (`type: Phaser.AUTO`).  |
| Touch + mouse parity                    | Use Phaser unified pointer events, no DOM-only listeners. |
| Strict TS slowing iteration             | `tsc --noEmit` only blocks `build`, not `dev`.           |

## 8. Out of Scope (v0.1)

- Online multiplayer (versus is local-only).
- Save/Resume (key reserved: `ogre.save.v1`).
- Localization (English + Korean strings will be hardcoded for v0.1).
- Audio (CRT bleeps optional, deferred).
- Accessibility audit (planned v0.2).
