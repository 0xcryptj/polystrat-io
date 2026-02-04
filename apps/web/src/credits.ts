export type Credit = {
  id: string;
  name: string;
  author: string;
  license: string;
  sourceUrl: string;
};

// For now this is static; when we integrate a real upstream strategy,
// we should generate this from strategies/*/meta.json at build time.
export const CREDITS: Credit[] = [];
