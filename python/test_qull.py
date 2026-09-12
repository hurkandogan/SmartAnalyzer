import sys
import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '.env'))

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from jobs.qullamaggie_job import main
import logging

logging.basicConfig(level=logging.INFO)
main()
