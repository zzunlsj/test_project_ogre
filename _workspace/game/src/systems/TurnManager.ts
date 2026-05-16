// ============================================================================
// TurnManager - phase FSM with EventEmitter notifications
// ============================================================================

import Phaser from 'phaser';
import type { TurnPhase, Side } from '@/types';
import { EVENTS } from '@/types';

export class TurnManager {
  private phase: TurnPhase = 'ogre-move';
  private turnNumber = 1;
  private bus: Phaser.Events.EventEmitter;
  private hasGev = true;
  private ramDeclared = false;

  constructor(bus: Phaser.Events.EventEmitter) {
    this.bus = bus;
  }

  getPhase(): TurnPhase { return this.phase; }
  getTurn(): number { return this.turnNumber; }
  getSide(): Side {
    return (this.phase.startsWith('ogre-')) ? 'ogre' : 'defender';
  }

  setHasGev(b: boolean): void { this.hasGev = b; }
  declareRam(): void { this.ramDeclared = true; }

  advance(): void {
    const prev = this.phase;
    this.phase = this.next(prev);
    if (this.phase === 'ogre-move' && prev !== 'ogre-move') {
      this.turnNumber++;
    }
    this.ramDeclared = false;
    this.emitChanged(prev, this.phase);
  }

  forceGameOver(_winner: Side): void {
    const prev = this.phase;
    this.phase = 'game-over';
    this.emitChanged(prev, this.phase);
  }

  private next(p: TurnPhase): TurnPhase {
    switch (p) {
      case 'ogre-move':       return 'ogre-attack';
      case 'ogre-attack':     return this.ramDeclared ? 'ogre-ram' : 'defender-move';
      case 'ogre-ram':        return 'defender-move';
      // GEV PRE-MOVE 제거: GEV는 defender-move 페이즈에서 이동, 공격 후 GEV POST-MOVE
      case 'defender-move':   return 'defender-attack';
      case 'defender-attack': return this.hasGev ? 'gev-postmove' : 'ogre-move';
      case 'gev-postmove':    return 'ogre-move';
      case 'game-over':       return 'game-over';
    }
  }

  private emitChanged(from: TurnPhase, to: TurnPhase): void {
    this.bus.emit(EVENTS.TURN_PHASE_CHANGED, {
      turn: this.turnNumber,
      from,
      to,
      side: this.getSide(),
      activePlayer: this.getSide(),
      phase: to,
    });
  }
}
