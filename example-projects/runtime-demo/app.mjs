// A small working application to demonstrate VibeBlocks tracing.
import { processItem } from './worker.mjs';

let item = 0;
console.log('Demo running. Open the map and click Trace to watch code activity.');
const interval = setInterval(() => {
  item += 1;
  if (item === 5) globalThis.__vibeblocksTrace?.mark('Reached item 5', import.meta.url);
  console.log('Processing item', item);
  try {
    processItem(item);
  } catch (error) {
    clearInterval(interval);
    // Show how caught errors can be reported without changing app error handling.
    globalThis.__vibeblocksTrace?.error(error);
    console.error('Example bug:', error.message);
    process.exitCode = 1;
  }
}, Number(process.env.VIBEBLOCKS_DEMO_MS ?? 800));
