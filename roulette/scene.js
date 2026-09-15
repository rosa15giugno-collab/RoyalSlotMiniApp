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

/** After NUOVA PUNTATA — keep bet amount, clear selection + pending + result. */
export function bettingResetPatch() {
  return {
    scene: Scene.BETTING,
    betType: null,
    targetNumber: null,
    pending: null,
    lastPayload: null,
    animating: false,
  };
}
