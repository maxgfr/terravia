# Terravia

A creature-collecting RPG set in a procedurally generated world. It runs entirely in
your browser — no server, no account, no install: **https://maxgfr.github.io/terravia**

Every creature, type, move and region is original. Terravia borrows the genre, not the
work of anyone else.

## Play

Leave the hamlet with one of three creatures, head north catching and battling your way
through a world laid out by your seed, and beat every arena champion. The last badge
opens the sanctum, where the creatures that appear nowhere else can finally be caught.

| | |
|---|---|
| **Keyboard** | Arrows or WASD to move · `Enter` / `E` to talk, read, pick up · `Escape` or `M` for the menu |
| **Mouse** | Click a tile and the walk there happens on its own, around whatever is in the way · click a character or the water to go over and interact · click any row, creature or attack to pick it |
| **Touch** | A D-pad and two buttons appear on devices without a mouse |
| **Settings** | Language, help and the encyclopedia sit directly in the title screen and the pause menu |

The interface is available in English and French. English is the default; French is a
complete translation, not a partial one.

## What makes it different

**The whole run fits in a seed.** Not just the scenery: the seed decides how long the
journey is (8 to 12 regions), which places you cross and in what order, how many arenas
stand in your way and what each champion specialises in, and which three creatures you
get to choose from. Terrain, contents and every character's position follow. What the
seed does *not* touch are the invariants that keep a run playable — a hamlet to start
in, a village to restock at, arenas spaced far enough apart to grow between them, and a
starting region that never counters the creature you picked. Sharing a seed shares an
adventure, not a backdrop.

**A save file is a few kilobytes.** Because the world rebuilds itself from the seed, a
save holds only the seed and your state: position, team, storage, bag, progress. Not a
single tile. A test verifies that a reloaded game regenerates region 2 byte for byte.

**The art is a versioned artifact.** Sprites are neither hand-drawn nor generated at
runtime: `npm run art` produces them deterministically and writes PNGs into `public/art/`,
which are committed. You can look at them on GitHub, retouch one by hand, and see an art
diff in review. Continuous integration regenerates them and fails if the committed files
have drifted.

## Content

40 creatures across 17 evolution lines · 12 elemental types with four immunities ·
53 moves · 16 passive talents · 8 to 12 regions per run · two or three arenas · a
day/night cycle that changes which creatures appear · fishing, once you find the rod.

Each creature carries **genes** rolled at birth and **training points** earned in
battle, so two specimens of the same species are never interchangeable.

The Terradex can be completed. Every species is catchable somewhere — the three
one-of-a-kind creatures show themselves only in the sanctum, which opens after the last
champion falls.

## Getting started

```bash
npm install
npm run dev        # development server
npm test           # test suite
npm run art        # regenerate the sprites into public/art/
npm run build      # typecheck + production build
```

Node 22.6+ is required: the art tools are written in TypeScript and executed directly by
Node, with no compilation step and no dependencies.

## How the code is organised

Three layers, each testable on its own:

| Directory | Role |
|---|---|
| `src/data/` | Pure content: types, moves, species, items, talents. No logic. |
| `src/world/`, `src/battle/`, `src/save/` | Pure engine: no DOM, fully tested. |
| `src/core/`, `src/ui/`, `src/scenes/` | Presentation: canvas, input, rendering. Decides no rules. |
| `tools/art/` | Sprite generator (Node, zero dependencies, hand-written PNG encoder). |

The rule that holds it together: **the battle screen knows no battle rules**. The engine
returns a list of events (`damage`, `faint`, `message`) that the interface replays as
animation. A whole battle is therefore testable without a browser, and replays
identically.

## Save and trade

The game saves itself in your browser as you play. From the menu you can export it as a
JSON file and import it back — by file picker, by dropping the file anywhere on the page,
or by pasting raw JSON. An invalid import shows the precise error (`unknown move:
frostbolt`) and **never overwrites the game in progress**: a confirmation screen
summarises the save first. A migration registry is in place from version 1, so the format
can evolve without breaking existing games.

You can also export a single creature — you pick which one — and import it into another
game. The save tab pairs each export with its import, and the two creature entries only
accept creature files: hand one a game save and it points you at the entry that takes it.
Dropping a file on the page stays permissive and sorts the two out on its own.

> **On trading:** with no server, nothing stops someone editing a file to hand themselves
> a level 100 creature. The checksum detects a corrupted file, not a dishonest one.
> Terravia is a single-player game — trading is sharing between people who trust each
> other.

## Tests

321 tests, run in continuous integration before every deploy. The useful ones don't check
details, they check **invariants** — which matters more now that the world itself varies:

- no seed produces a region whose exit is unreachable — verified across 60 seeds;
- every generated run has the shape of a playable adventure: a hamlet first, a sanctum
  last, arenas spaced apart with distinct specialities, no cave as the opening region,
  levels that never go backwards — checked over 120 seeds;
- **every starter is viable on its own first route** — none is countered by the local
  fauna, and none is too frail to trade blows, measured over 30 worlds;
- no region shows a creature out of proportion with its level, and none shows so few
  species that it feels repetitive;
- every species in the Terradex is catchable somewhere, so its counter never promises a
  total you cannot reach;
- **the last champion falls in over 90 % of worlds** to a level-appropriate team of six,
  and still beats one that stayed ten levels behind — measured by simulating the whole
  trainer battle against the champion the world actually generated;
- no trainer fields a creature that should have evolved at that level, no champion
  fields the same creature twice, and its team spans several levels so that thin
  lineages still contribute their middle stages;
- fishing brings up river fauna and only with the rod; the Waking Stone evolves the
  creature you point it at and refuses when none can; the map screen stays shut until
  you find the map;
- a battle interrupted by closing the tab comes back exactly as it was;
- a click walks the player to the tile, around whatever blocks the straight line, and
  stops beside a character to talk instead of on top of them;
- every battle terminates, whichever two creatures are involved;
- **no move ever damages the creature that used it**, except the two that declare recoil
  and say so — checked across all 53 moves over twenty rolls each, so nothing hides in a
  rare branch;
- the shake lands on whoever is taking the hit in the line currently on screen, never on
  the attacker;
- an exported then reimported game returns an identical state, and the world rebuilds
  byte for byte from the seed;
- every character in the game's text exists in the font, in both languages.

A smoke test drives the screens against a simulated canvas — start-up, starter choice,
walking, menus, a full battle — and measures every string drawn, so text that runs
outside the frame fails the build instead of shipping.

## Deliberate limitations

- **No building interiors.** Doors are scenery and services keep an outdoor stall.
  Modelling interiors would have doubled the world code for little gain.
- **No pixel-perfect scaling on phones.** The canvas scales by whole numbers on an
  ordinary display, so pixels stay square. On a high-density one it does not: rounding
  down cost a third of the content size, and at three physical pixels per CSS pixel the
  irregularity is invisible where the lost legibility was not.
- **Trading is trust-based**, as described above.

## Licence

MIT for the code. Creatures, names, designs and setting are original, same licence.
