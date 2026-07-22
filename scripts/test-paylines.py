"""Test payline configuration — run: python scripts/test-paylines.py"""

PAYLINES = {
    "h-top": ("Riga superiore", "horizontal", [(0, 0), (1, 0), (2, 0)]),
    "h-mid": ("Riga centrale", "horizontal", [(0, 1), (1, 1), (2, 1)]),
    "h-bot": ("Riga inferiore", "horizontal", [(0, 2), (1, 2), (2, 2)]),
    "v-left": ("Colonna sinistra", "vertical", [(0, 0), (0, 1), (0, 2)]),
    "v-mid": ("Colonna centrale", "vertical", [(1, 0), (1, 1), (1, 2)]),
    "v-right": ("Colonna destra", "vertical", [(2, 0), (2, 1), (2, 2)]),
    "d-tl-br": ("Diagonale TL-BR", "diagonal", [(0, 0), (1, 1), (2, 2)]),
    "d-tr-bl": ("Diagonale TR-BL", "diagonal", [(2, 0), (1, 1), (0, 2)]),
}

PAYLINES_BY_BET = {
    250: ["h-top", "h-mid", "h-bot"],
    500: ["h-top", "h-mid", "h-bot", "v-left", "v-mid", "v-right"],
    1000: ["h-top", "h-mid", "h-bot", "v-left", "v-mid", "v-right", "d-tl-br", "d-tr-bl"],
}

SAMPLE_GRID = [
    ["cherry", "cherry", "cherry"],
    ["bell", "cherry", "star"],
    ["cherry", "cherry", "cherry"],
]


def main() -> None:
    print("=== ROYAL SLOT — Test linee vincenti ===\n")

    for bet, line_ids in PAYLINES_BY_BET.items():
        print(f"PUNTATA {bet} CHIP — {len(line_ids)} linee controllate:")
        winners = []

        for index, line_id in enumerate(line_ids, start=1):
            name, line_type, coords = PAYLINES[line_id]
            symbols = [SAMPLE_GRID[reel][row] for reel, row in coords]
            is_win = symbols[0] == symbols[1] == symbols[2]
            status = f"VINCENTE ({symbols[0].upper()} x3)" if is_win else "nessuna combinazione"
            print(f"  {index}. [{line_type}] {name} ({line_id}) -> {status}")
            if is_win:
                winners.append(name)

        if winners:
            print(f"  -> Combinazioni rilevate: {', '.join(winners)}")
        else:
            print("  -> Combinazioni rilevate: nessuna")
        print()

    print("Griglia di test (rullo → righe top|mid|bot):")
    for reel_index, column in enumerate(SAMPLE_GRID, start=1):
        print(f"  Rullo {reel_index}: {' | '.join(column)}")


if __name__ == "__main__":
    main()
