/**
 * Mini App access gate — AUTHENTICATING / ACCESSO RISERVATO screens.
 */
import { AccessState } from './miniapp-access.js?v=2';
import { CONFIG } from './config.js?v=2';

const GATE_ID = 'miniappAccessGate';

function ensureGate() {
  let gate = document.getElementById(GATE_ID);
  if (gate) return gate;

  gate = document.createElement('div');
  gate.id = GATE_ID;
  gate.className = 'access-gate';
  gate.setAttribute('role', 'dialog');
  gate.setAttribute('aria-modal', 'true');
  gate.innerHTML = `
    <div class="access-gate__card">
      <div class="access-gate__panel access-gate__panel--auth" data-panel="auth">
        <p class="access-gate__icon" aria-hidden="true">🔐</p>
        <p class="access-gate__title">Autenticazione…</p>
        <p class="access-gate__sub">Verifica accesso al Casinò</p>
      </div>
      <div class="access-gate__panel access-gate__panel--denied" data-panel="denied" hidden>
        <p class="access-gate__icon" aria-hidden="true">🔒</p>
        <p class="access-gate__title">ACCESSO RISERVATO</p>
        <p class="access-gate__body">
          Questa Mini App può essere utilizzata esclusivamente
          nei gruppi autorizzati di CASINÒ by Rosa.<br><br>
          Apri il gioco direttamente dal gruppo Casinò
          per poter accedere.<br><br>
          Per informazioni o richieste contatta:<br>
          ${CONFIG.miniapp.ownerContactLabel}
        </p>
        <p class="access-gate__brand" aria-hidden="true">🎰 CASINÒ by Rosa</p>
        <a class="access-gate__cta" href="${CONFIG.miniapp.ownerContactUrl}" target="_blank" rel="noopener noreferrer">
          💬 CONTATTA IL PROPRIETARIO
        </a>
      </div>
    </div>
  `;
  document.body.prepend(gate);
  return gate;
}

function setPanel(gate, panel) {
  const auth = gate.querySelector('[data-panel="auth"]');
  const denied = gate.querySelector('[data-panel="denied"]');
  if (auth) auth.hidden = panel !== 'auth';
  if (denied) denied.hidden = panel !== 'denied';
}

export function showAccessGate(state) {
  const gate = ensureGate();
  gate.hidden = false;
  gate.dataset.state = state;

  if (state === AccessState.AUTHENTICATING) {
    setPanel(gate, 'auth');
    return;
  }

  if (state === AccessState.DENIED) {
    setPanel(gate, 'denied');
    return;
  }

  gate.hidden = true;
}

export function hideAccessGate() {
  const gate = document.getElementById(GATE_ID);
  if (gate) gate.hidden = true;
}

export function setGameVisible(rootSelector, visible) {
  const root = document.querySelector(rootSelector);
  if (!root) return;
  root.hidden = !visible;
  root.setAttribute('aria-hidden', visible ? 'false' : 'true');
}

export async function runAccessGate(telegram, appId, rootSelector) {
  setGameVisible(rootSelector, false);
  showAccessGate(AccessState.AUTHENTICATING);

  try {
    const { establishMiniappAccess } = await import('./miniapp-access.js?v=2');
    const state = await establishMiniappAccess(telegram, appId);

    if (state === AccessState.AUTHORIZED) {
      hideAccessGate();
      setGameVisible(rootSelector, true);
      return true;
    }

    showAccessGate(AccessState.DENIED);
    setGameVisible(rootSelector, false);
    return false;
  } catch (error) {
    console.error('[MINIAPP FRONTEND] access gate error', error?.name || error);
    showAccessGate(AccessState.DENIED);
    setGameVisible(rootSelector, false);
    return false;
  }
}
