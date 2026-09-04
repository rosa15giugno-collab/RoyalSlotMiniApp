export const BETS = [100, 500, 1000];
export const DEFAULT_BET = 100;

export const SUIT_SYMBOL = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
};

export const RED_SUITS = new Set(['hearts', 'diamonds']);

export const ERROR_COPY = {
  INSUFFICIENT_BALANCE: 'Chips insufficienti',
  INVALID_BET: 'Puntata non valida',
  ROUND_NOT_FOUND: 'Mano non trovata',
  ROUND_ALREADY_SETTLED: 'Mano già conclusa',
  ROUND_NOT_OWNER: 'Questa mano non è tua',
  INVALID_ACTION: 'Azione non valida',
  ROUND_IN_PROGRESS: 'Hai già una mano in corso',
  NETWORK_ERROR: 'Errore di rete. Riprova.',
  CONNECTION_INTERRUPTED: 'Connessione interrotta. Verifico la mano…',
  USER_NOT_FOUND: 'Utente non trovato',
};
