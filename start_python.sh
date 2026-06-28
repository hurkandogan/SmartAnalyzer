#!/bin/bash
# SmartAnalyser Python Backend Starter

# Get directory of this script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

cd "$SCRIPT_DIR/python"

echo "============================================="
echo "Starting SmartAnalyser Python Bridge Backend..."
echo "Using uv to run Python..."
echo "============================================="

# Run the python app
uv run python main.py
