# README / Marketplace Refresh Design

## Summary

Refresh Tokénmon's public-facing documentation and metadata so the project reads like a polished product instead of a feature dump. The new main positioning centers the habit loop and brand identity:

> Spend Tokens. Train Pokémon. Hit the Limit.

The documentation should present English as the main landing experience, provide a Korean entry point with the same structure, keep both READMEs concise, and move detailed explanations into mirrored `docs/en/*` and `docs/ko/*` pages. Marketplace and package metadata should also be updated to match the current product scope and avoid outdated Gen 4 / Sinnoh-only framing.

## Goals

- Make the first impression stronger and more cohesive across README, marketplace metadata, and package metadata.
- Keep `README.md` focused on positioning, quick onboarding, and navigation.
- Provide `README.ko.md` as a Korean landing page with the same information architecture as English.
- Split long-form explanations into mirrored English/Korean docs trees.
- Reflect the current reality of the project: broad generation support, Braille as the primary recommended display mode, and other display modes handled more carefully.
- Promote the provided hero image as a first-class brand asset in both READMEs.

## Non-Goals

- Reworking product behavior, hook behavior, or runtime UX.
- Fixing renderer bugs as part of this documentation pass.
- Creating a full docs portal or docs site generator.
- Documenting every implementation detail inside the root README files.

## Product Positioning

Tokénmon should read as a Claude Code gamification plugin built around a Pokémon-flavored training loop, not just as a technical utility. The top-level story is:

- token spend becomes progression,
- progression becomes training,
- training creates a loop that drives focus and repetition.

The README tone should therefore be:

- emotionally strong in the hero section,
- product-oriented in the supporting copy,
- explicit enough about features to feel real and useful.

Marketplace copy should be more concise and practical than the hero copy, but still preserve the Pokémon identity.

## Information Architecture

### Root entry points

- `README.md` — English main landing page
- `README.ko.md` — Korean main landing page

These two files must use the same section order and link structure.

### Detailed documentation

English and Korean docs must mirror each other structurally:

- `docs/en/overview.md`
- `docs/en/commands.md`
- `docs/en/generations.md`
- `docs/en/display-modes.md`
- `docs/ko/overview.md`
- `docs/ko/commands.md`
- `docs/ko/generations.md`
- `docs/ko/display-modes.md`

The mirrored structure is mandatory so both languages remain maintainable and predictable.

## README Structure

Both `README.md` and `README.ko.md` should follow this exact structure:

1. Hero image
2. Project title
3. Catchphrase
4. Short product introduction
5. CTA links
6. What It Is
7. Core Features
8. Install
9. Core Commands
10. Documentation
11. Development / License

### Hero

The provided image should be added to the repository as an official asset and displayed at the top of both READMEs.

Recommended hero order:

1. hero image,
2. `Tokénmon (tkm)`,
3. `Spend Tokens. Train Pokémon. Hit the Limit.`,
4. 2–3 lines of supporting copy,
5. CTA links.

### CTA Links

English README:
- `Install`
- `Commands`
- `한국어 README`

Korean README:
- `설치`
- `명령어`
- `English README`

### What stays in README

- high-level product explanation,
- core feature summary,
- quick install,
- a small set of representative commands,
- links to detailed documentation,
- language switching links.

### What moves out of README

- long command reference,
- long per-generation explanations,
- detailed renderer support notes,
- extensive troubleshooting prose,
- implementation-deep descriptions better suited to docs pages.

## Detailed Docs Scope

### `overview`

Purpose:
- explain Tokénmon's loop,
- describe how status line, hooks, XP, party, and progression fit together,
- give readers a mental model of the product.

### `commands`

Purpose:
- organize command reference by category,
- provide examples,
- keep README command content short.

### `generations`

Purpose:
- explain multi-generation support,
- clarify generation switching and data scope,
- remove the outdated Gen 4-only impression.

### `display-modes`

Purpose:
- explain how Tokénmon can be displayed,
- frame Braille as the primary recommended experience,
- document the current support state of other display modes without overpromising.

## Messaging for Display Modes

Documentation should reflect current product reality.

- README should present Braille as the primary / recommended experience.
- README may mention other display modes, but should not foreground them as equally polished.
- The detailed support status, limitations, and expectations for non-Braille modes should live in `display-modes`.

This keeps the landing page confident while remaining honest in detailed docs.

## Metadata Refresh Scope

The refresh includes:

- `README.md`
- `README.ko.md`
- `.claude-plugin/marketplace.json`
- `.claude-plugin/plugin.json`
- `package.json`

### Marketplace metadata goals

- remove stale Gen 4 / Sinnoh-only framing,
- describe Tokénmon as a Claude Code gamification plugin with a Pokémon training loop,
- improve search relevance with better tags/keywords.

### Plugin metadata goals

- remain concise,
- sound clear in plugin lists,
- preserve product identity without trying to carry the full README voice.

### Package metadata goals

- optimize for clarity and discoverability,
- use a more practical description than README hero copy,
- align with the current supported scope.

## Copy Strategy

### Tone

Hero copy:
- brand-forward,
- energetic,
- concise.

Body copy:
- product-page style,
- balanced between fun and utility,
- less meme-like than the hero.

Korean copy:
- uses the same structure as English,
- may be slightly more explanatory in wording,
- must not diverge in information architecture.

### Positioning hierarchy

1. hero establishes identity,
2. supporting copy explains the loop,
3. feature section proves utility,
4. install section reduces friction,
5. docs section handles depth.

## Asset Handling

The provided brand image should be committed into the repository as a stable asset for documentation use.

Requirements:
- use a repository-relative path,
- place it in a location suitable for long-term docs usage,
- make sure both READMEs can reference it cleanly,
- avoid hotlinking or temporary external URLs.

## Success Criteria

This refresh is successful if:

- the first screen clearly communicates what Tokénmon is,
- the catchphrase and hero image create a stronger brand impression,
- readers can quickly find install steps and key commands,
- the READMEs feel concise instead of bloated,
- English and Korean entry points have mirrored structure,
- detailed explanations live in mirrored docs trees,
- metadata no longer suggests the plugin is Gen 4 / Sinnoh only,
- display-mode messaging accurately reflects Braille-first reality.

## Risks and Mitigations

### Risk: README becomes too thin
Mitigation: keep quick install, core features, and representative commands in README so it still stands alone.

### Risk: English and Korean drift apart
Mitigation: enforce mirrored filenames, section order, and navigation structure.

### Risk: copy overpromises non-Braille support
Mitigation: keep Braille-first messaging in README and put support-state nuance in `display-modes`.

### Risk: metadata and docs diverge again later
Mitigation: align marketplace/plugin/package messaging around one shared product statement during the refresh.

## Implementation Boundary

This design covers documentation architecture, copy direction, metadata direction, and hero asset placement only. It does not authorize product logic changes. Any content edits should stay within the approved structure and messaging rules above.
