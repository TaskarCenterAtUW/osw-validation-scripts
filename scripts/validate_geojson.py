#!/usr/bin/env python3
"""
Validate a GeoJSON FeatureCollection against the OSW 0.3 source schema and the
derived split schema (line/point/polygon) to confirm parity.

Usage:
  python scripts/validate_geojson.py path/to/data.geojson
"""

import argparse
import json
import os
import sys

import jsonschema_rs

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCHEMA_DIR = os.path.join(ROOT, "schema")
OUTPUT_DIR = os.path.join(ROOT, "output")

SOURCE_SCHEMA = os.path.join(SCHEMA_DIR, "opensidewalks.schema-0.3.json")
SCHEMA_CANDIDATES = {
    "edges": [
        os.path.join(SCHEMA_DIR, "schema.edge.0.3.json"),
        # os.path.join(OUTPUT_DIR, "opensidewalks.lines.schema-0.3.json"),
        # os.path.join(OUTPUT_DIR, "lineSchema.json"),
    ],
    "lines": [
        os.path.join(OUTPUT_DIR, "opensidewalks.lines.schema-0.3.json"),
        # os.path.join(OUTPUT_DIR, "lineSchema.json"),
    ],
    "nodes": [
        os.path.join(OUTPUT_DIR, "opensidewalks.nodes.schema-0.3.json"),
        # os.path.join(OUTPUT_DIR, "opensidewalks.points.schema-0.3.json"),
        # os.path.join(OUTPUT_DIR, "pointsSchema.json"),
    ],
    "points": [
        os.path.join(OUTPUT_DIR, "opensidewalks.points.schema-0.3.json"),
        # os.path.join(OUTPUT_DIR, "pointsSchema.json"),
    ],
    "zones": [
        os.path.join(OUTPUT_DIR, "opensidewalks.zones.schema-0.3.json"),
        # os.path.join(OUTPUT_DIR, "opensidewalks.polygons.schema-0.3.json"),
        # os.path.join(OUTPUT_DIR, "PolygonSchema.json"),
    ],
    "polygons": [
        os.path.join(OUTPUT_DIR, "opensidewalks.polygons.schema-0.3.json"),
        # os.path.join(OUTPUT_DIR, "PolygonSchema.json"),
    ],
}


def first_existing(candidates):
    for p in candidates:
        if os.path.exists(p):
            return p
    return None


def load_json(path: str):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def detect_split_schema(data) -> str:
    """Return a best-effort schema key: nodes/edges/zones/points/lines/polygons/mixed/unknown."""
    types = set()
    for feat in data.get("features", []):
        geom = (feat.get("geometry") or {}).get("type")
        if geom:
            types.add(geom)

    if not types:
        return "unknown"
    if len(types) > 1:
        return "mixed"

    g = types.pop()
    # Heuristics to distinguish core vs adjacent
    props_list = [f.get("properties", {}) for f in data.get("features", [])]

    if g == "Point":
        node_hint = any(
            ("kerb" in p) or (p.get("barrier") == "kerb") or ("_u_id" in p) or ("_v_id" in p)
            for p in props_list
        )
        return "nodes" if node_hint else "points"

    if g in {"LineString", "MultiLineString"}:
        edge_hint = any(
            any(tag in p for tag in ("highway", "service", "footway")) for p in props_list
        )
        return "edges" if edge_hint else "lines"

    if g in {"Polygon", "MultiPolygon"}:
        zone_hint = any(("_w_id" in p) or (p.get("highway") == "pedestrian") for p in props_list)
        return "zones" if zone_hint else "polygons"

    return "unknown"


def iter_errors(data, schema_path):
    schema = load_json(schema_path)
    validator = jsonschema_rs.Draft7Validator(schema)
    for err in validator.iter_errors(data):
        yield err


def collect_messages(errors):
    out = []
    for e in errors:
        msg = getattr(e, "message", "")
        path = "/".join(str(p) for p in getattr(e, "instance_path", []))
        out.append(f"{path or '<root>'}: {msg}")
    return out


def main():
    parser = argparse.ArgumentParser(description="Validate GeoJSON against OSW 0.3 source and split schemas.")
    parser.add_argument("geojson", help="Path to GeoJSON FeatureCollection")
    args = parser.parse_args()

    data = load_json(args.geojson)

    # Validate against source schema
    source_errors = list(iter_errors(data, SOURCE_SCHEMA))

    # Pick split schema based on geometry types
    kind = detect_split_schema(data)
    split_path = first_existing(SCHEMA_CANDIDATES.get(kind, []))
    split_errors = list(iter_errors(data, split_path)) if split_path else [f"Unsupported or mixed geometry type: {kind}"]

    print("=== Source schema (opensidewalks.schema-0.3.json) ===")
    if not source_errors:
        print("PASS")
    else:
        for m in collect_messages(source_errors):
            print(f"- {m}")

    print("\n=== Split schema ({}) ===".format(split_path if split_path else "n/a"))
    if not split_errors:
        print("PASS")
    elif isinstance(split_errors[0], str):
        print(f"- {split_errors[0]}")
        # pass
    else:
        for m in collect_messages(split_errors):
            print(f"- {m}")

    if source_errors or (split_errors and not isinstance(split_errors[0], str)) or (
        split_errors and isinstance(split_errors[0], str)
    ):
        sys.exit(1)


if __name__ == "__main__":
    main()
