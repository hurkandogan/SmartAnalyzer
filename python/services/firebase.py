import os
import json
import firebase_admin
from firebase_admin import credentials
from firebase_admin import firestore
import logging

logger = logging.getLogger("smart_analyser.firebase")

_db = None

def init_firebase():
    global _db
    if _db is not None:
        return _db
        
    service_account_path = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
    if not service_account_path:
        logger.error("FIREBASE_SERVICE_ACCOUNT not found in environment variables.")
        return None
        
    try:
        if not firebase_admin._apps:
            cred = credentials.Certificate(service_account_path)
            firebase_admin.initialize_app(cred)
            logger.info("Firebase Admin SDK initialized in Python.")
            
        _db = firestore.client()
        return _db
    except Exception as e:
        logger.error(f"Error initializing Firebase: {e}")
        return None

def get_db():
    global _db
    if _db is None:
        return init_firebase()
    return _db
