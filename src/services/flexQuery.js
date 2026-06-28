import https from 'node:https';
import { parseStringPromise } from 'xml2js';
import { logger } from '../utils/logger.js';

function requestData(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'SmartAnalyser' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

export async function fetchAndParseFlexQuery(token, queryId) {
  logger.info(`Sending Request for Flex Query ID: ${queryId}...`);
  const reqUrl = `https://ndcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService.SendRequest?t=${token}&q=${queryId}&v=3`;
  
  try {
    const res1 = await requestData(reqUrl);
    
    // Extract ReferenceCode
    const match = res1.match(/<ReferenceCode>([^<]+)<\/ReferenceCode>/);
    if (!match) {
      throw new Error(`Failed to get ReferenceCode. Response was: ${res1}`);
    }
    
    const referenceCode = match[1];
    logger.info(`Got Reference Code: ${referenceCode}. Waiting 10 seconds for report generation...`);
    
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    logger.info(`Fetching Flex Statement...`);
    const getUrl = `https://ndcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService.GetStatement?q=${referenceCode}&t=${token}&v=3`;
    
    const xmlData = await requestData(getUrl);
    
    const result = await parseStringPromise(xmlData, { explicitArray: false });
    
    const flexStatements = result?.FlexQueryResponse?.FlexStatements?.FlexStatement;
    if (!flexStatements) {
      throw new Error('No FlexStatement found in XML');
    }
    
    return flexStatements;
    
  } catch (err) {
    logger.error(`Error in fetchAndParseFlexQuery: ${err.message}`);
    throw err;
  }
}
