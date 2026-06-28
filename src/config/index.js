import 'dotenv/config';

export const config = {
  PORT: parseInt(process.env.PORT || '3500'),

  // IBKR TWS
  IBKR_HOST: process.env.IBKR_HOST || '127.0.0.1',
  IBKR_PORT: parseInt(process.env.IBKR_PORT || '7496'),
  IBKR_CLIENT_ID: parseInt(process.env.IBKR_CLIENT_ID || '1'),

  // Firebase
  FIREBASE_USER_ID: process.env.FIREBASE_USER_ID,
  FIREBASE_SERVICE_ACCOUNT:
    process.env.FIREBASE_SERVICE_ACCOUNT || './serviceAccountKey.json',

  // Kraken
  KRAKEN_API_KEY: process.env.KRAKEN_API_KEY,
  KRAKEN_API_SECRET: process.env.KRAKEN_API_SECRET,

  // Twelve Data
  TWELVE_DATA_API_KEY: process.env.TWELVE_DATA_API_KEY,
};
