# Gameplay Systems

[← Back to README](../../README.md)

## XP & Leveling

Every token you spend in Claude Code converts into XP for your active party. The formula mirrors the original Pokémon games with six experience groups (fast, medium-fast, medium-slow, slow, erratic, fluctuating). All party members receive full XP from each encounter — no splitting.

## Volume Tier

Session token consumption determines your current volume tier. Higher tiers multiply XP gain, encounter rate, and the chance of meeting rare Pokémon.

| Tier | Tokens | XP | Encounters | Rare chance |
| --- | --- | --- | --- | --- |
| Normal | 0+ | 1× | 1× | baseline |
| Heated | 10 000+ | 1.5× | 1.5× | higher |
| Intense | 40 000+ | 2.5× | 2.5× | much higher |
| Legendary | 100 000+ | 5× | 4× | highest |

## Rest Bonus

Come back after a break and your party earns bonus XP for a few turns.

| Away time | Multiplier | Duration |
| --- | --- | --- |
| 2–8 hours | 1.5× | 3 turns |
| 8–24 hours | 2× | 5 turns |
| 24+ hours | 3× | 10 turns |

## Encounters & Catching

Each `Stop` hook roll has a base 15% chance to trigger a wild encounter. Region level, achievements, and volume tier shift that rate. Catching costs Poké Balls — the cost scales exponentially with how hard a species is to catch (catch rate 255 → 1 ball, catch rate 3 → 82 balls).

## Battle

When you encounter a wild Pokémon, your lead party member fights it. Combat factors in type effectiveness, level, and stats. Winning earns XP and has a 20% chance to drop a Poké Ball; losing still gives a 5% drop chance.

## Evolution

Pokémon evolve when they meet specific conditions:

- **Level** — reaching a threshold level
- **Friendship** — reaching 220 friendship points
- **Trade** — triggered by achievement milestones (proxy for trading)
- **Item** — using a specific evolution item
- **Region** — being in a specific region

Some species have branching evolutions where you choose the path.

## Shiny Pokémon

Every encounter has a 1/512 chance to produce a shiny variant.

## Items

Poké Balls are the primary consumable. They drop from battles (20% on win, 5% on loss) and can be earned through Pokédex milestone rewards.

## Pokédex Milestones

Catching non-legendary Pokémon builds toward milestones. Each milestone rewards items and expands the legendary encounter pool.

## Achievements

Achievements unlock automatically when you hit thresholds across many categories: session count, token consumption, battles won, evolutions triggered, errors encountered, permissions granted, and more. Some achievements also grant encounter rate bonuses.

## Regions

Each generation has its own set of regions with level ranges and local encounter tables. Regions unlock as you progress, and you can move between unlocked regions freely. Your region determines which wild Pokémon appear.

## Generations

Tokénmon supports all nine Pokémon generations (1 025 species total). Each generation adds its own regions, encounter tables, and progression context.
