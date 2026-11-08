export function processItem(item) {
  if (!Number.isInteger(item)) throw new TypeError('Expected an integer');
  // This deliberate example bug demonstrates a red node and highlighted source line.
  if (item === 15) throw new Error('Demo bug: the 15th item cannot be processed');
  return item * 2;
}
