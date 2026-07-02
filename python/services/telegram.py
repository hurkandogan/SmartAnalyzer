import os
import httpx
import logging

logger = logging.getLogger("smart_analyser.telegram")

class TelegramService:
    def __init__(self, bot_token: str = None, chat_id: str = None):
        # Default to environment values if not explicitly passed
        self.bot_token = bot_token or os.getenv("TELEGRAM_PUBLIC_BOT_TOKEN")
        self.chat_id = chat_id or os.getenv("TELEGRAM_PUBLIC_CHANNEL_ID")
        
    async def send_message(self, text: str, parse_mode: str = "Markdown") -> bool:
        if not self.bot_token or not self.chat_id:
            logger.error("Telegram bot token or chat ID is missing.")
            return False
            
        url = f"https://api.telegram.org/bot{self.bot_token}/sendMessage"
        payload = {
            "chat_id": self.chat_id,
            "text": text,
            "parse_mode": parse_mode
        }
        
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(url, json=payload)
                if res.status_code == 200:
                    logger.info(f"Telegram message sent to {self.chat_id}")
                    return True
                else:
                    logger.error(f"Failed to send Telegram message: {res.text}")
                    if parse_mode and "can't parse entities" in res.text.lower():
                        logger.info("Retrying telegram message without parse_mode...")
                        payload_fallback = payload.copy()
                        payload_fallback.pop("parse_mode", None)
                        res_fallback = await client.post(url, json=payload_fallback)
                        if res_fallback.status_code == 200:
                            logger.info("Telegram message sent successfully as plain text fallback")
                            return True
                    return False
        except Exception as e:
            logger.error(f"Error sending Telegram message: {e}")
            return False
            
    async def send_document(self, file_path: str, caption: str = None, parse_mode: str = "Markdown") -> bool:
        if not self.bot_token or not self.chat_id:
            logger.error("Telegram bot token or chat ID is missing.")
            return False
            
        url = f"https://api.telegram.org/bot{self.bot_token}/sendDocument"
        
        if not os.path.exists(file_path):
            logger.error(f"File not found for Telegram upload: {file_path}")
            return False
            
        try:
            filename = os.path.basename(file_path)
            async with httpx.AsyncClient(timeout=30.0) as client:
                with open(file_path, "rb") as f:
                    files = {"document": (filename, f, "application/pdf")}
                    data = {"chat_id": self.chat_id}
                    if caption:
                        data["caption"] = caption
                        data["parse_mode"] = parse_mode
                        
                    res = await client.post(url, data=data, files=files)
                    if res.status_code == 200:
                        logger.info(f"Telegram document sent to {self.chat_id}")
                        return True
                    else:
                        logger.error(f"Failed to send Telegram document: {res.text}")
                        if parse_mode and "can't parse entities" in res.text.lower():
                            logger.info("Retrying telegram document without parse_mode in caption...")
                            data_fallback = data.copy()
                            data_fallback.pop("parse_mode", None)
                            f.seek(0)
                            files_fallback = {"document": (filename, f, "application/pdf")}
                            res_fallback = await client.post(url, data=data_fallback, files=files_fallback)
                            if res_fallback.status_code == 200:
                                logger.info("Telegram document sent successfully as plain text caption fallback")
                                return True
                        return False
        except Exception as e:
            logger.error(f"Error sending Telegram document: {e}")
            return False
