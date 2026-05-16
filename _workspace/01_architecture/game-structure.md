# Game Structure — OGRE Web Game

## 1. Scene Flow

```
BootScene
   |  (preload manifest -> load assets)
   v
PreloadScene
   |  (assets ready)
   v
TitleScene  ----------------+
   |  press start           |
   v                        |
MainMenuScene               |
   |  "New Game"            |
   v                        |
ModeSelectScene  (1P / 2P)  |
   |                        |
   +-- 1P --> SideSelectScene (OGRE / Defender)
   |             |
   +-- 2P -------+
                 v
            BriefingScene
                 |
                 v
            SetupScene  (defender placement, point budget)
                 |  start
                 v
            GameScene + UIScene  (parallel)
                 |  victory / defeat
                 v
            GameOverScene
                 |  retry / menu
                 +--> MainMenuScene
```

## 2. Scene Responsibilities & Class Names

| Scene Key      | Class               | Responsibility                                                                  |
|----------------|---------------------|---------------------------------------------------------------------------------|
| `boot`         | `BootScene`         | Set scale mode, load minimal logo + font. Detect device layout (PC/Tablet/Mobile). |
| `preload`      | `PreloadScene`      | Load all SVG units, audio (if any), CRT shader, font (`Share Tech Mono`).      |
| `title`        | `TitleScene`        | Apple II boot animation, "PRESS START".                                         |
| `menu`         | `MainMenuScene`     | New Game / Continue / Options / Credits.                                        |
| `mode-select`  | `ModeSelectScene`   | Choose `solo-ogre` / `solo-defender` / `versus`.                                |
| `side-select`  | `SideSelectScene`   | (1P only) Pick OGRE or Defender side; AI takes the other.                       |
| `briefing`     | `BriefingScene`     | Scenario text, victory conditions, turn limit.                                  |
| `setup`        | `SetupScene`        | Defender placement w/ point budget (20 inf pts, 12 armor slots). CP locked R08-R11. |
| `game`         | `GameScene`         | Hex map render, unit sprites, turn loop, input router, combat resolution.       |
| `ui`           | `UIScene`           | Overlay HUD: turn indicator, OGRE damage panel, dice-hold gauge, action buttons.|
| `game-over`    | `GameOverScene`     | Show outcome (CP destroyed / OGRE neutralized / turn-limit), Retry / Menu.      |

`GameScene` and `UIScene` run **in parallel** (Phaser `scene.launch`) so the HUD never re-renders the world.

## 3. Turn Sequence (Finite State Machine)

`TurnPhase` values drive the `GameScene` state machine:

```
ogre-move        -> ogre-attack   (player ends move)
ogre-attack      -> ogre-ram      (player chooses RAM) OR -> defender-move
ogre-ram         -> defender-move (resolve ram, spend treads)
defender-move    -> gev-premove   (auto if any GEV moved & wants to fight)
gev-premove      -> defender-attack
defender-attack  -> gev-postmove  (auto if any GEV is alive & has secondary move)
gev-postmove     -> ogre-move     (loop, turn counter +1)
* any phase     -> game-over     (victory check after each resolution)
```

Victory checks are evaluated at the END of every phase via `GameRules.checkVictory(state)`.

## 4. Cross-Scene EventEmitter Contract

A singleton `Phaser.Events.EventEmitter` is exposed as `game.registry.events` (or imported as `bus`) so `GameScene` and `UIScene` stay decoupled.

### Emit (GameScene -> UIScene)

| Event                  | Payload                                       | When                                |
|------------------------|-----------------------------------------------|-------------------------------------|
| `turn:phase-changed`   | `{ phase: TurnPhase, turn: number, side }`    | After every phase transition.        |
| `unit:selected`        | `{ unitId, type, stats }`                     | Player taps a unit.                  |
| `unit:moved`           | `{ unitId, from: HexCoord, to: HexCoord }`    | Move resolved.                       |
| `unit:destroyed`       | `{ unitId, by: string }`                      | After CRT result `X`.                |
| `unit:disabled`        | `{ unitId }`                                  | After CRT result `D`.                |
| `ogre:weapon-damaged`  | `{ weaponId, type }`                          | OGRE weapon destroyed.               |
| `ogre:treads-changed`  | `{ remaining, movement }`                     | Treads take damage; movement re-calc.|
| `combat:declared`      | `{ attackers, target, ratio }`                | Player committed attack.             |
| `combat:resolved`      | `CombatResult`                                | After dice hold + roll.              |
| `dice:wave-tick`       | `{ value, color }`                            | 60Hz during hold gauge UI.           |
| `dice:hold`            | `DiceHoldResult`                              | Player tapped/released.              |
| `victory`              | `{ winner: 'ogre' \| 'defender', reason }`    | Game over trigger.                   |

### Listen (UIScene -> GameScene)

| Event                      | Payload                          | Effect                            |
|----------------------------|----------------------------------|-----------------------------------|
| `ui:end-phase`             | `void`                           | Force advance current phase.       |
| `ui:declare-attack`        | `{ attackerIds, targetId }`      | Build combat, show CRT preview.    |
| `ui:confirm-attack`        | `void`                           | Start dice-hold gauge.             |
| `ui:dice-tap`              | `{ timestamp }`                  | Lock wave value -> bias.           |
| `ui:select-unit`           | `{ unitId }`                     | Highlight + show valid moves.      |
| `ui:move-unit`             | `{ unitId, to: HexCoord }`       | Validate + execute move.           |
| `ui:declare-ram`           | `{ targetId }`                   | OGRE-only RAM action.              |
| `ui:undo`                  | `void`                           | Undo last reversible action.       |
| `ui:pause`                 | `void`                           | Open pause overlay.                |

## 5. Module Boundaries

```
src/
  main.ts                  # bootstrap Phaser.Game
  config/
    gameConfig.ts          # Phaser.Types.Core.GameConfig
    palette.ts             # CRT colors (#33FF33 etc.)
    layout.ts              # DeviceLayout breakpoints
  scenes/                  # one .ts per scene above
  systems/
    HexGrid.ts             # axial<->offset, neighbor, distance, line-of-sight
    Pathfinder.ts          # A* over hex with terrain cost
    CombatResolver.ts      # CRT lookup + bias application
    DiceHold.ts            # sine-wave gauge state
    TurnController.ts      # FSM, phase transitions
    AIController.ts        # easy AI for solo modes
    VictoryChecker.ts      # win-condition evaluator
  data/
    ogreStats.ts           # OGRE_MK3 constant
    defenderUnits.ts       # DEFENDER_UNITS lookup
    crt.ts                 # CRT table
    map.ts                 # crater + ridge data
    scenario.ts            # STANDARD_SCENARIO budgets
  types/                   # interfaces from module-interfaces.md
  ui/
    HudPanel.ts
    OgreDamagePanel.ts
    DiceHoldGauge.ts
    UnitTooltip.ts
```

## 6. Performance Budget

| Metric                              | Target                          |
|-------------------------------------|---------------------------------|
| Frame rate                          | 60 fps sustained on mid-tier laptop / iPad Air |
| Initial JS bundle (gzip)            | < 600 KB (Phaser ~400 KB + game ~200 KB) |
| Time to Interactive (LH mobile)     | < 3.5 s on 4G                   |
| Lighthouse Performance              | 80+                             |
| Hex map redraw                      | event-driven only, no per-frame redraw |
| Sprite count cap                    | < 200 active GameObjects        |

## 7. Save / Resume (out of scope for v0.1)

Hooks reserved on `localStorage` key `ogre.save.v1` for future patches; not wired in v0.1.
