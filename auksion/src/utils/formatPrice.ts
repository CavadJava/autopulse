// `toLocaleString('az-AZ')` is CLDR-data-dependent — Node's bundled ICU (and
// some browsers) group thousands with '.' for az-AZ, not the space this app's
// design uses. Format deterministically instead of relying on runtime ICU data.
export function formatPrice(amount: number): string {
  return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
