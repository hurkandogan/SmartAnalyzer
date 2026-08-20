import firebase_admin
from firebase_admin import credentials, firestore

cred = credentials.Certificate('/home/hurkan/Desktop/projects/SmartAnalyser/serviceAccountKey.json')
firebase_admin.initialize_app(cred)

db = firestore.client()
users = db.collection('users').stream()
for user in users:
    print(f"User: {user.id}")
    config_doc = db.collection('users').document(user.id).collection('config').document('main').get()
    if config_doc.exists:
        print(f"  Config: {config_doc.to_dict()}")
