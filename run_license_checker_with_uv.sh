#!/bin/bash
# This script sets up a dedicated Python environment using uv,
# installs openpyxl, and then runs the process_licenses.py script.

set -e # Exit immediately if a command exits with a non-zero status.

VENV_DIR=".venv_license_script"
PYTHON_EXEC_PATH="$VENV_DIR/bin/python" # Corrected variable name for clarity
SCRIPT_TO_RUN="process_licenses.py"
REQUIREMENTS="openpyxl"

echo "--- Setting up uv environment to run $SCRIPT_TO_RUN ---"

# 1. Create a virtual environment using uv
if [ -d "$VENV_DIR" ]; then
    echo "Virtual environment '$VENV_DIR' already exists. Using existing one (or re-creating if stale)."
    # uv venv will typically ensure it's usable or quickly recreate if needed
    uv venv "$VENV_DIR" --seed # Add --seed to ensure pip/setuptools are present if re-creating
else
    echo "Creating virtual environment '$VENV_DIR'..."
    uv venv "$VENV_DIR" --seed
fi

# 2. Install dependencies using uv pip
echo "Installing dependencies ($REQUIREMENTS) into '$VENV_DIR'..."
# Ensure the python executable path is correctly used by uv pip
uv pip install "$REQUIREMENTS" --python "$PYTHON_EXEC_PATH"

# 3. Run the Python script using uv run
echo "Running script '$SCRIPT_TO_RUN' with uv..."
uv run --python "$PYTHON_EXEC_PATH" "$SCRIPT_TO_RUN"

echo "--- Script $SCRIPT_TO_RUN finished. ---"
echo "Output should be in licenses_report.xlsx (if the script ran successfully)." 