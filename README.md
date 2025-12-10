# OpenSidewalks Schema Tools

This project provides utilities for working with the **OpenSidewalks (OSW)** schema (now targeting `opensidewalks.schema-0.3.json`):

- Parse the canonical schema into grouped definitions.
- Build specialized JSON Schemas for the core network (`nodes`, `edges`, `zones`) and adjacent features (`points`, `lines`, `polygons`), plus legacy combined outputs.
- Generate valid and invalid **sample GeoJSON** files from the schema.
- Validate GeoJSON feature collections against both the original schema and the split schemas.

## Setup

**Node.js (Schema & Sample Generation)**
```bash
# Install dependencies
npm install
```

**Python (Validation)**
```bash
# Create venv (recommended)
python -m venv .venv
source .venv/bin/activate

# Install requirements
pip install -r requirements.txt
```

## Usage

### Parse & Build Schemas (OSW 0.3)
Parses `schema/opensidewalks.schema-0.3.json` into grouped schemas and writes results into `output/`.
```bash
node scripts/parse-osw-schema.js
```
This produces:

- `output/results.json` (expanded schema entries)
- Core network schemas:
  - `output/opensidewalks.nodes.schema-0.3.json`
  - `output/opensidewalks.edges.schema-0.3.json`
  - `output/opensidewalks.zones.schema-0.3.json`
- Adjacent feature schemas:
  - `output/opensidewalks.points.schema-0.3.json`
  - `output/opensidewalks.lines.schema-0.3.json`
  - `output/opensidewalks.polygons.schema-0.3.json`
- Legacy all-geometry splits (preserves prior behavior):
  - `output/lineSchema.json`, `output/pointsSchema.json`, `output/PolygonSchema.json`

### Generate Sample GeoJSONs

`example.js` demonstrates creating valid and invalid sample files (covering all 0.3 tags, including custom and Tree/Wood variants):
```bash
node example.js
```

Outputs:

- Core network fixtures: `samples_nodes_valid.geojson`, `samples_nodes_invalid.geojson`, `samples_edges_valid.geojson`, `samples_edges_invalid.geojson`, `samples_zones_valid.geojson`, `samples_zones_invalid.geojson`
- Adjacent fixtures: `samples_points_valid.geojson`, `samples_points_invalid.geojson`, `samples_lines_valid.geojson`, `samples_lines_invalid.geojson`, `samples_polygons_valid.geojson`, `samples_polygons_invalid.geojson`

You can adjust:

- Number of features (`numFeatures`)
- Output filenames (`validOut`, `invalidOut`)
- Random seed (`seed`)
- Feature tags to include (`tags` argument)

### Validate GeoJSON Files

Validate a file against a schema using the high-performance Rust-backed `jsonschema-rs`:
```bash
python test.py
```

- By default, uses `output/opensidewalks.edges.schema-0.3.json` and `samples_edges_valid.geojson`.
- Edit `test.py` to switch to nodes/zones/adjacent samples (`POINT_SCHEMA`, `POLY_SCHEMA`, or `INVALID_FILE`).

The output is a JSON array of errors:
```json
[
  { "featureIndex": 0, "error": "missing '_id'" },
  { "featureIndex": 2, "error": "\"bench\" is not one of \"lamp\", \"hydrant\"" }
]
```

You can also validate against both the source schema and the split schemas in one go:
```bash
python scripts/validate_geojson.py path/to/data.geojson
```
This will report errors for `schema/opensidewalks.schema-0.3.json` and for the appropriate split schema chosen by geometry type and tag heuristics (nodes/edges/zones vs adjacent). Exits non-zero on any failure.

### Split Schema Regression Tests

Run the lightweight regression tests to regenerate the split schemas and validate the bundled sample GeoJSON fixtures:
```bash
python -m unittest tests/test_split_schemas.py
```
This will re-run `scripts/parse-osw-schema.js`, confirm the 0.3 split schemas exist, and assert that the valid samples pass while the invalid samples fail with specific instance paths.

### Customization

- `RENAME_MAP` in JS scripts allows renaming schema keys (e.g., `_id → id`).
- `test.py` prefers root-cause errors (`enum`, `type`, `required`) and collapses noisy cascades.


## Example Workflow (OSW 0.3)
1. **Parse the OSW schema into split schemas**  
   ```bash
   node scripts/parse-osw-schema.js
   ```

2. **Generate sample GeoJSON files**  
   ```bash
   node example.js
   ```

3. **Validate a dataset against the split schemas**  
   ```bash
   python test.py
   ```

4. **Validate a dataset against both source + split schemas**  
   ```bash
   python scripts/validate_geojson.py path/to/data.geojson
   ```
   
