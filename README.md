# Terravia

A creature-collecting RPG set in a procedurally generated world. It runs entirely in
your browser — no server, no account, no install: **https://maxgfr.github.io/terravia**

Every creature, type, move and region is original. Terravia borrows the genre, not the
work of anyone else.

## Play

Leave the hamlet with one creature, cross seven regions catching and battling your way
north, and beat the arena champion.

| | |
|---|---|
| **Keyboard** | Arrows or WASD to move · `Enter` / `E` to talk, read, pick up · `Escape` or `M` for the menu |
| **Touch** | A D-pad and two buttons appear on devices without a mouse |
| **Settings** | The ⚙ button, top right, on every screen — language, and how to play |

The interface is available in English and French. English is the default; French is a
complete translation, not a partial one.

## What makes it different

**The whole world fits in a seed.** The region topology is fixed — it carries the
progression: rising difficulty, a shop halfway, the boss at the end. Everything else —
biome, terrain shape, contents, where every character stands — is derived from your
game's seed. No two runs look alike, and sharing a seed shares a world.

**A save file is a few kilobytes.** Because the world rebuilds itself from the seed, a
save holds only the seed and your state: position, team, storage, bag, progress. Not a
single tile. A test verifies that a reloaded game regenerates region 2 byte for byte.

**The art is a versioned artifact.** Sprites are neither hand-drawn nor generated at
runtime: `npm run art` produces them deterministically and writes PNGs into `public/art/`,
which are committed. You can look at them on GitHub, retouch one by hand, and see an art
diff in review. Continuous integration regenerates them and fails if the committed files
have drifted.

## Content

30 creatures across 12 evolution lines · 12 elemental types with four immunities ·
53 moves · 16 passive talents · 8 regions · a day/night cycle that changes which
creatures appear.

Each creature carries **genes** rolled at birth and **training points** earned in
battle, so two specimens of the same species are never interchangeable.

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

You can also export a single creature and import it into another game.

> **On trading:** with no server, nothing stops someone editing a file to hand themselves
> a level 100 creature. The checksum detects a corrupted file, not a dishonest one.
> Terravia is a single-player game — trading is sharing between people who trust each
> other.

## Tests

220 tests, run in continuous integration before every deploy. The useful ones don't check
details, they check **invariants**:

- no seed produces a region whose exit is unreachable — verified across 60 seeds;
- every battle terminates, whichever two creatures are involved;
- an exported then reimported game returns an identical state, and the world rebuilds
  byte for byte from the seed;
- every character in the game's text exists in the font, in both languages;
- a starter wins more than 60 % of its battles on the first route, and the champion is a
  genuine wall at level 12 while remaining beatable at 42.

A smoke test drives the screens against a simulated canvas — start-up, starter choice,
walking, menus, a full battle — and measures every string drawn, so text that runs
outside the frame fails the build instead of shipping.

## Deliberate limitations

- **No building interiors.** Doors are scenery and services keep an outdoor stall.
  Modelling interiors would have doubled the world code for little gain.
- **Integer scaling only.** The canvas scales by whole numbers so pixels stay square,
  which leaves some margin on screens around 360 px wide.
- **Trading is trust-based**, as described above.

## Licence

MIT for the code. Creatures, names, designs and setting are original, same licence.
