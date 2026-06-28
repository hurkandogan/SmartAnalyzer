import time
import hashlib
import hmac
import base64
import urllib.parse
import httpx
import logging
from typing import Dict, List, Any, Optional

logger = logging.getLogger("smart_analyser.kraken")

KRAKEN_SYMBOL_MAP = {
    "XXBT": "BTC", "XBT": "BTC", "BTC": "BTC",
    "XXBT.S": "BTC", "XBT.S": "BTC", "BTC.S": "BTC",
    "BT.B": "BTC", "XBT.B": "BTC", "XBT.F": "BTC",
    "XETH": "ETH", "ETH": "ETH", "XETH.S": "ETH",
    "ETH2.S": "ETH", "ETH.S": "ETH", "ETH.B": "ETH", "ETH.F": "ETH",
    "XXRP": "XRP", "XRP": "XRP", "XRP.S": "XRP", "XXRP.S": "XRP",
    "XLTC": "LTC", "LTC": "LTC",
    "XADA": "ADA", "ADA": "ADA",
    "XDOT": "DOT", "DOT": "DOT", "DOT.S": "DOT", "DOT28.S": "DOT",
    "XXLM": "XLM", "XLM": "XLM",
    "EIGEN": "EIGEN",
    "ZUSD": "USD", "USD": "USD",
    "ZEUR": "EUR", "EUR": "EUR",
    "ZGBP": "GBP", "GBP": "GBP"
}

DUST_THRESHOLDS = {
    "BTC": 0.00001,
    "ETH": 0.0001,
    "default": 0.001
}

class KrakenService:
    def __init__(self, api_key: str = "", api_secret: str = ""):
        self.api_key = api_key
        self.api_secret = api_secret
        self.base_url = "https://api.kraken.com"
        self.last_nonce = 0

    def _get_nonce(self) -> str:
        candidate = int(time.time() * 1000) * 1000000
        if self.last_nonce >= candidate:
            self.last_nonce += 1
        else:
            self.last_nonce = candidate
        return str(self.last_nonce)

    def _create_signature(self, path: str, nonce: str, post_data: str) -> str:
        # hashDigest = sha256(nonce + postData)
        message = nonce + post_data
        sha256_hash = hashlib.sha256(message.encode()).digest()
        
        # hmacInput = path + sha256_hash
        hmac_input = path.encode() + sha256_hash
        
        # signature = hmac_sha512(hmac_input, secret_base64)
        secret_bytes = base64.b64decode(self.api_secret)
        mac = hmac.new(secret_bytes, hmac_input, hashlib.sha512)
        return base64.b64encode(mac.digest()).decode()

    async def _private_request(self, method: str, params: Dict[str, Any] = None) -> Dict[str, Any]:
        if params is None:
            params = {}
        path = f"/0/private/{method}"
        nonce = self._get_nonce()
        
        # Prepare body and signature
        body_params = {"nonce": nonce, **params}
        post_data = urllib.parse.urlencode(body_params)
        signature = self._create_signature(path, nonce, post_data)
        
        headers = {
            "API-Key": self.api_key,
            "API-Sign": signature,
            "Content-Type": "application/x-www-form-urlencoded"
        }
        
        async with httpx.AsyncClient() as client:
            res = await client.post(f"{self.base_url}{path}", content=post_data, headers=headers)
            res.raise_for_status()
            data = res.json()
            if data.get("error"):
                raise Exception(f"Kraken private error: {', '.join(data['error'])}")
            return data["result"]

    async def _public_request(self, method: str, params: Dict[str, Any] = None) -> Dict[str, Any]:
        if params is None:
            params = {}
        path = f"/0/public/{method}"
        
        async with httpx.AsyncClient() as client:
            res = await client.get(f"{self.base_url}{path}", params=params)
            res.raise_for_status()
            data = res.json()
            if data.get("error"):
                raise Exception(f"Kraken public error: {', '.join(data['error'])}")
            return data["result"]

    def _map_symbol(self, kraken_key: str) -> str:
        if kraken_key in KRAKEN_SYMBOL_MAP:
            return KRAKEN_SYMBOL_MAP[kraken_key]
        # Fallback strip prefix X or Z
        if len(kraken_key) > 3 and (kraken_key.startswith("X") or kraken_key.startswith("Z")):
            if kraken_key[1:] in KRAKEN_SYMBOL_MAP:
                return KRAKEN_SYMBOL_MAP[kraken_key[1:]]
            return kraken_key[1:]
        return kraken_key

    async def get_balances(self) -> Dict[str, float]:
        if not self.api_key or not self.api_secret:
            logger.warning("Kraken credentials missing. Skipping balance check.")
            return {}
        
        try:
            raw = await self._private_request("Balance")
            aggregated = {}
            for kraken_key, amount in raw.items():
                symbol = self._map_symbol(kraken_key)
                val = float(amount)
                if val <= 0:
                    continue
                aggregated[symbol] = aggregated.get(symbol, 0.0) + val
                
            # Filter out dust
            filtered = {}
            for symbol, amount in aggregated.items():
                # Skip fiat balances in portfolio holdings count (except maybe USD if we need cash,
                # but the original Node version skipped fiat or only fetched asset holdings)
                if symbol in ["USD", "EUR", "GBP"]:
                    # Keep fiat cash if needed, but original js comments say: "skips fiat"
                    continue
                threshold = DUST_THRESHOLDS.get(symbol, DUST_THRESHOLDS["default"])
                if amount >= threshold:
                    filtered[symbol] = amount
                else:
                    logger.info(f"Kraken: skipping dust balance {symbol} = {amount}")
            return filtered
        except Exception as e:
            logger.error(f"Error fetching Kraken balances: {e}")
            return {}

    async def get_crypto_prices(self, pairs: List[str]) -> Dict[str, float]:
        try:
            raw = await self._public_request("Ticker", {"pair": ",".join(pairs)})
            prices = {}
            for pair, data in raw.items():
                # data["c"][0] is the last trade closed price
                prices[pair] = float(data["c"][0])
            return prices
        except Exception as e:
            logger.error(f"Error fetching Kraken ticker: {e}")
            return {}
