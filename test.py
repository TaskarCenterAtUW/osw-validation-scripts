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
    """Return the feature index derived from the instance path if present."""
    path = list(getattr(err, "instance_path", []))
    for i, seg in enumerate(path):
        if seg == "features" and i + 1 < len(path) and isinstance(path[i + 1], int):
            return path[i + 1]
    return None


def _clean_enum_message(err) -> str:
    """Return a compact enum error message."""
    msg = getattr(err, "message", "")
    msg = re.sub(r'\s*or\s+\d+\s+other candidates', '', msg)
    return msg.split('\n')[0]
    msg = re.sub(r"\s*or\s+\d+\s+other candidates", "", msg)
    return msg.split("\n")[0]


def _pretty_message(err, schema) -> str:
    kind = type(getattr(err, "kind", object())).__name__.split("_")[-1]
    if kind == "Enum":
        return _clean_enum_message(err)
    if kind == "AnyOf":
        # walk schema to gather required fields in anyOf branches
        sub = schema
        try:
            for seg in getattr(err, "schema_path", []):
                sub = sub[seg]
            required = set()
            if isinstance(sub, list):
                stack = list(sub)
                while stack:
                    cur = stack.pop()
                    if isinstance(cur, dict):
                        if isinstance(cur.get("required"), list):
                            required.update(cur["required"])
                        for key in ("allOf", "anyOf", "oneOf"):
                            if isinstance(cur.get(key), list):
                                stack.extend(cur[key])
            if required:
                props = ", ".join(sorted(required))
                return f"must include one of: {props}"
        except Exception:
            pass
    return getattr(err, "message", "").split("\n")[0]


def collect_feature_errors(validator, geojson, schema):
    """Validate and return a list of representative errors per feature."""
    raw_errors = list(validator.iter_errors(geojson))
    grouped = defaultdict(list)
    for e in raw_errors:
        idx = _feature_index_from_error(e)
        grouped[idx].append(e)

    def rank(e):
        kind = type(getattr(e, "kind", object())).__name__.split("_")[-1]
        return (
            0 if kind == "Enum" else
            1 if kind in {"Type", "Required", "Const"} else
            2 if kind in {"Pattern", "Minimum", "Maximum"} else
            3,
            len(getattr(e, "message", "")),
        )

    results = []
    for idx, errs in grouped.items():
        best = sorted(errs, key=rank)[0]
        results.append({
            "featureIndex": idx if idx is not None else -1,
            "error": _pretty_message(best, schema),
        })

    results.sort(key=lambda r: (r["featureIndex"], r["error"]))
    return results


# -----------------------------
# Main
# -----------------------------
if __name__ == "__main__":
    # Choose which schema to use here; you can switch to POINT_SCHEMA/POLY_SCHEMA if needed.
    schema = load_osw_schema(ORIGINAL_SCHEMA)
    geojson_data = load_osw_file(INVALID_FILE)

    validator = jsonschema_rs.Draft7Validator(schema)
    errors_out = collect_feature_errors(validator, geojson_data, schema)

    # Print ALL errors (array of objects) in the requested format
    print(json.dumps(errors_out, ensure_ascii=False))
