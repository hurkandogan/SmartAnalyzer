import { getWatchlist } from './src/services/firebase.js';

(async () => {
  const items = await getWatchlist();
  const rklb = items.find(i => i.symbol === 'RKLB');
  console.log(rklb);
  process.exit(0);
})();
