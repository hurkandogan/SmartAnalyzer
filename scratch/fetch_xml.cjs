const admin = require('firebase-admin');
const fs = require('fs');
const https = require('https');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const FLEX_SEND_URL = 'https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService.SendRequest';
const FLEX_GET_URL = 'https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService.GetStatement';

async function fetchFromUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function fetchIBKRXml(queryId, token) {
  console.log('Sending flex request...');
  const sendRes = await fetchFromUrl(`${FLEX_SEND_URL}?t=${token}&q=${queryId}&v=3`);
  
  const refMatch = sendRes.match(/<ReferenceCode>(.*?)<\/ReferenceCode>/);
  if (!refMatch) {
    throw new Error('Could not get IBKR reference code. Response: ' + sendRes.slice(0, 200));
  }
  const referenceCode = refMatch[1];
  console.log('Reference code:', referenceCode);

  for (let attempt = 0; attempt < 5; attempt++) {
    await new Promise(r => setTimeout(r, attempt === 0 ? 1000 : 2000));
    console.log(`Polling attempt ${attempt + 1}...`);
    const getRes = await fetchFromUrl(`${FLEX_GET_URL}?q=${referenceCode}&t=${token}&v=3`);
    if (getRes.includes('<FlexQueryResponse')) {
      return getRes;
    }
    if (getRes.includes('ErrorCode=1019')) continue;
    throw new Error('IBKR error response: ' + getRes.slice(0, 300));
  }
  throw new Error('Timeout');
}

async function main() {
  const users = await db.collection('users').get();
  for (const doc of users.docs) {
    const config = await db.collection('users').doc(doc.id).collection('configuration').doc('main').get();
    if (config.exists) {
      const data = config.data();
      if (data.ibkr_query_id && data.ibkr_token) {
        console.log(`Found config for user ${doc.id}`);
        try {
          const xml = await fetchIBKRXml(data.ibkr_query_id, data.ibkr_token);
          fs.writeFileSync(`scratch/ibkr_${doc.id}.xml`, xml);
          console.log(`Saved XML for user ${doc.id}`);
        } catch (err) {
          console.error(`Error fetching XML for user ${doc.id}:`, err.message);
        }
      }
    }
  }
}

main().then(() => process.exit(0)).catch(console.error);
