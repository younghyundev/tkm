import type { VolumeTier, VolumeTierName, RarityWeights } from './types.js';

const TIERS: VolumeTier[] = [
  {
    name: 'normal',
    minTokens: 0,
    xpMultiplier: 1.0,
    encounterMultiplier: 1.0,
    rarityWeights: { common: 0.55, uncommon: 0.30, rare: 0.13, legendary: 0.015, mythical: 0.005 },
  },
  {
    name: 'heated',
    minTokens: 10_000,
    xpMultiplier: 1.5,
    encounterMultiplier: 1.5,
    rarityWeights: { common: 0.40, uncommon: 0.25, rare: 0.26, legendary: 0.045, mythical: 0.015 },
  },
  {
    name: 'intense',
    minTokens: 40_000,
    xpMultiplier: 2.5,
    encounterMultiplier: 2.5,
    rarityWeights: { common: 0.20, uncommon: 0.20, rare: 0.52, legendary: 0.15, mythical: 0.05 },
  },
  {
    name: 'legendary',
    minTokens: 100_000,
    xpMultiplier: 5.0,
    encounterMultiplier: 4.0,
    rarityWeights: { common: 0.05, uncommon: 0.15, rare: 1.04, legendary: 0.30, mythical: 0.10 },
  },
];

const NORMAL_LEGENDARY_WEIGHT = TIERS[0].rarityWeights.legendary; // 0.015

export function getVolumeTier(deltaTokens: number): VolumeTier {
  if (deltaTokens <= 0) return TIERS[0];
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (deltaTokens >= TIERS[i].minTokens) return TIERS[i];
  }
  return TIERS[0];
}

export function getLegendaryPoolMultiplier(tier: VolumeTier): number {
  return tier.rarityWeights.legendary / NORMAL_LEGENDARY_WEIGHT;
}

export function getVolumeTierByName(name: string | null | undefined): VolumeTier {
  if (!name) return TIERS[0];
  const found = TIERS.find(t => t.name === name);
  return found ?? TIERS[0];
}
