# OpenSidewalks Schema Tools

This project provides utilities for working with the **OpenSidewalks (OSW)** schema:

- Parsing the canonical `opensidewalks.schema.json` into grouped definitions.
- Building specialized JSON Schemas for **LineString**, **Point**, and **Polygon/MultiPolygon** features.
- Generating valid and invalid **sample GeoJSON** files from the schema.
- Validating GeoJSON feature collections against the generated schemas.

## Setup

**Node.js (Schema & Sample Generation)**
```bash
# Install dependencies
npm install
```

**Python (Validation)**
```bash
# Create venv (recommended)
python3 -m venv .venv
source .venv/bin/activate

# Install requirements
pip install -r requirements.txt
```

## Usage

### Parse & Build Schemas
Parses `opensidewalks.schema.json` into grouped schemas and writes results into `output/`.
```bash
node scripts/parse-osw-schema.js
```
This produces:

- `output/results.json` (expanded schema entries)
- `output/lineSchema.json`
- `output/pointsSchema.json`
- `output/PolygonSchema.json`

### Generate Sample GeoJSONs

`example.js` demonstrates creating valid and invalid sample files:
```bash
node example.js
```

Outputs:

- `my_valid.geojson`
- `my_invalid.geojson`

You can adjust:

- Number of features (`numFeatures`)
- Output filenames (`validOut`, `invalidOut`)
- Random seed (`seed`)
- Feature types (`Line`, `Point`, `Polygon` arrays)

### Validate GeoJSON Files

Validate a file against a schema using the high-performance Rust-backed `jsonschema-rs`:
```bash
python test.py
```

- By default, uses `output/lineSchema.json` and `my_valid.geojson`.
- Edit `test.py` to switch to `POINT_SCHEMA`, `POLY_SCHEMA`, or `INVALID_FILE`.

The output is a JSON array of errors:
```json
[
  { "featureIndex": 0, "error": "missing '_id'" },
  { "featureIndex": 2, "error": "\"bench\" is not one of \"lamp\", \"hydrant\"" }
]
```

### Customization

- `RENAME_MAP` in JS scripts allows renaming schema keys (e.g., `_id → id`).
- `DISCRIMINATORS` defines tags (`highway`, `amenity`, etc.) used for property dependencies.
- `test.py` prefers root-cause errors (`enum`, `type`, `required`) and collapses noisy cascades.


## Example Workflow
1. **Parse the OSW schema**:
   ```bash
   node scripts/parse-osw-schema.js
   ```
   
2. **Generate sample GeoJSON files**:
   ```bash
   node example.js
    ```

3. **Validate the generated files**:
   ```bash
   python test.py
   ```
   