// Shiny pokemon key utilities
// Shiny variants are stored with a "_shiny" suffix (e.g., "460_shiny")

export const SHINY_SUFFIX = '_shiny';

export function isShinyKey(key: string): boolean {
  return key.endsWith(SHINY_SUFFIX);
}

export function toBaseId(key: string): string {
  return isShinyKey(key) ? key.slice(0, -SHINY_SUFFIX.length) : key;
}

export function toShinyKey(id: string): string {
  return isShinyKey(id) ? id : id + SHINY_SUFFIX;
}
