// Upstream (vendored) minimal SMA crossover logic.
// Keep this file untouched after vendoring.

export type SmaState = {
  values: number[];
};

export function initState(): SmaState {
  return { values: [] };
}

export function pushPrice(state: SmaState, price: number, max: number) {
  state.values.push(price);
  if (state.values.length > max) state.values.splice(0, state.values.length - max);
}

export function sma(values: number[], n: number): number | null {
  if (values.length < n) return null;
  const slice = values.slice(values.length - n);
  const sum = slice.reduce((a, b) => a + b, 0);
  return sum / n;
}
