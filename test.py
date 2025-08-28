#!/usr/bin/env python3
import os
import json
import re
from collections import defaultdict

import jsonschema_rs

# -----------------------------
# Paths (your originals)
# -----------------------------
SCHEMA_PATH = os.path.join(os.path.dirname(__file__), 'schema')
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), 'output')
ORIGINAL_SCHEMA = os.path.join(SCHEMA_PATH, 'opensidewalks.schema.json')
LINE_STRING_SCHEMA = os.path.join(OUTPUT_PATH, 'lineSchema.json')
POINT_SCHEMA = os.path.join(OUTPUT_PATH, 'pointsSchema.json')
POLY_SCHEMA = os.path.join(OUTPUT_PATH, 'PolygonSchema.json')

VALID_FILE = 'my_valid.geojson'
INVALID_FILE = 'my_invalid.geojson'


# -----------------------------
# I/O helpers
# -----------------------------
def load_json(path: str):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def load_osw_file(graph_geojson_path: str):
    return load_json(graph_geojson_path)


def load_osw_schema(schema_path: str):
    try:
        return load_json(schema_path)
    except Exception as e:
        raise Exception(f'Invalid or missing schema file: {e}')


# -----------------------------
# Error processing utilities
# -----------------------------
def _feature_index_from_error(err) -> int | None:
    """
    Return the index after 'features' in the instance path, else None.
    Works with jsonschema_rs errors.
    """
    path = list(getattr(err, "path", [])) or list(getattr(err, "instance_path", []))
    for i, seg in enumerate(path):
        if seg == "features" and i + 1 < len(path) and isinstance(path[i + 1], int):
            return path[i + 1]
    return None


def _clean_enum_message(err) -> str:
    """
    Build a compact enum message and strip the 'or N other candidates' suffix.
    """
    given = json.dumps(getattr(err, "instance", None))
    allowed = []
    try:
        allowed = list(getattr(err, "validator_value", [])) or []
    except Exception:
        allowed = []
    if allowed:
        preview = ', '.join(json.dumps(v) for v in allowed[:2])
        return f'{given} is not one of {preview}'
    # Fallback to trimming the library message
    msg = getattr(err, "message", "")
    msg = re.sub(r'\s*or\s+\d+\s+other candidates', '', msg)
    return msg.split('\n')[0]


def _pretty_message(err) -> str:
    if getattr(err, "validator", None) == "enum":
        return _clean_enum_message(err)
    # Trim any multi-line noise
    return getattr(err, "message", "").split('\n')[0]


def collect_feature_errors(validator, geojson):
    """
    Run validation and return a list of primary errors per feature:
    [{ "featureIndex": int|-1, "error": str }, ...]
    - Groups all errors by feature index
    - Prefers root-cause messages (enum/type/required) over noisy cascades (anyOf/dependencies)
    """
    raw_errors = list(validator.iter_errors(geojson))
    grouped = defaultdict(list)
    for e in raw_errors:
        idx = _feature_index_from_error(e)
        grouped[idx].append(e)

    def rank(e):
        v = getattr(e, "validator", "")
        return (
            0 if v == "enum" else
            1 if v in {"type", "required", "const"} else
            2 if v in {"pattern", "minimum", "maximum"} else
            3,
            len(getattr(e, "message", "")),
        )

    results = []
    for idx, errs in grouped.items():
        best = sorted(errs, key=rank)[0]
        results.append({
            "featureIndex": idx if idx is not None else -1,
            "error": _pretty_message(best),
        })

    results.sort(key=lambda r: (r["featureIndex"], r["error"]))
    return results


# -----------------------------
# Main
# -----------------------------
if __name__ == "__main__":
    # Choose which schema to use here; you can switch to POINT_SCHEMA/POLY_SCHEMA if needed.
    schema = load_osw_schema(LINE_STRING_SCHEMA)
    geojson_data = load_osw_file(VALID_FILE)

    validator = jsonschema_rs.Draft7Validator(schema)
    errors_out = collect_feature_errors(validator, geojson_data)

    # Print ALL errors (array of objects) in the requested format
    print(json.dumps(errors_out, ensure_ascii=False))
