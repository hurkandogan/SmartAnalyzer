import { runMarketWeather } from './jobs/marketWeather.js';

async function main() {
  console.log("Testing Market Weather...");
  try {
    await runMarketWeather();
    console.log("Market Weather test completed successfully.");
  } catch (error) {
    console.error("Market Weather test failed:", error);
  }
}

main();
