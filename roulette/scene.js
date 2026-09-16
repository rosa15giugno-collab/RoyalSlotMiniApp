/**
 * Roulette Mini App — explicit scene state machine (pure, testable).
 */
export const Scene = Object.freeze({
  BETTING: 'BETTING',
  SPINNING: 'SPINNING',
  RESULT: 'RESULT',
  AUTH_ERROR: 'AUTH_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
});

export function canStartSpin(scene) {
  return scene === Scene.BETTING;
}

export function isBusyScene(scene) {
  return scene === Scene.SPINNING || scene === Scene.NETWORK_ERROR;
}

/** After valid API payload → cinematic spin. */
export function sceneAfterPayload() {
  return Scene.SPINNING;
}

/** After wheel animation settles → result. */
export function sceneAfterAnimation() {
  return Scene.RESULT;
}

/** Winning marks (is-hit / is-miss / result glow) only after the ball has settled. */
export function canRevealWinningMarks(scene) {
  return scene === Scene.RESULT;
}

/** After NUOVA PUNTATA — keep chip denomination, clear table bets + pending + result. */
export function bettingResetPatch() {
  return {
    scene: Scene.BETTING,
    bets: [],
    betType: null,
    targetNumber: null,
    pending: null,
    lastPayload: null,
    animating: false,
  };
}
