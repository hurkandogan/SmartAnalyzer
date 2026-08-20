import { adminDb } from '@/lib/firebase-admin'; // Adjust path if needed
// This is just a script to check if we can reach python
async function main() {
  const enrichPayload = [{ symbol: 'RKLB', currency: 'USD', exchange: 'SMART', secType: 'STK' }];
  const enrichRes = await fetch(`http://127.0.0.1:8000/api/enrich-symbols`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbols: enrichPayload })
  });
  const data = await enrichRes.json();
  console.log("Response:", data);
}
main().catch(console.error);
