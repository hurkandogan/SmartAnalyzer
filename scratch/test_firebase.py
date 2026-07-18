import firebase_admin
from firebase_admin import credentials, firestore
import os

print("Initializing Firebase...")
cred = credentials.Certificate('firebase-service-account.json')
firebase_admin.initialize_app(cred)
db = firestore.client()

print("Testing write...")
doc_ref = db.collection('test_col').doc('test_doc')
doc_ref.set({'hello': 'world'})
print("Write successful!")
