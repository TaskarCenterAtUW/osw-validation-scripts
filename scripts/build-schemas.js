const fs = require('fs');
const path = require('path');

const defaultOutputDir = path.join(process.cwd(), 'output');

const DEFAULT_VERSION = '0.3';

const RENAME_MAP = {
  // _id: 'id',
  // _u_id: 'u_id', // uncomment if you want
  // _v_id: 'v_id', // uncomment if you want
};

const readJson = (p) => {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const deepClone = (x) => {
  return x == null ? x : JSON.parse(JSON.stringify(x));
}


const ensureArray = (x) => {
  if (Array.isArray(x)) return x;
  if (x == null) return [];
  return [x];
}

const geoTagToSimple = (s) => {
  // "GeoJSON.LineString" -> "LineString"
  const m = String(s || '').match(/GeoJSON\.(.+)$/);
  return m ? m[1] : String(s || '');
}

const parseGeometrySet = (geometryType) => {
  // geometryType may be "GeoJSON.Polygon | GeoJSON.MultiPolygon"
  const parts = String(geometryType || '')
    .split('|')
    .map(s => s.trim())
    .filter(Boolean)
    .map(geoTagToSimple);
  return new Set(parts);
}

const mergeEnums = (a, b) => {
  const A = Array.isArray(a) ? a : [];
  const B = Array.isArray(b) ? b : [];
  return Array.from(new Set([...A, ...B]));
}

const mergeNumericLimits = (dst, src, keyMin = 'minimum', keyMax = 'maximum') => {
  if (typeof src[keyMin] === 'number') {
    dst[keyMin] =
      typeof dst[keyMin] === 'number' ? Math.min(dst[keyMin], src[keyMin]) : src[keyMin];
  }
  if (typeof src[keyMax] === 'number') {
    dst[keyMax] =
      typeof dst[keyMax] === 'number' ? Math.max(dst[keyMax], src[keyMax]) : src[keyMax];
  }
}

const mergePropertySchemas = (acc, name, schema) => {
  if (!schema || typeof schema !== 'object') return;
  
  // normalize type to a single value if possible
  const incoming = deepClone(schema);
  const current = acc[name];
  
  if (!current) {
    acc[name] = incoming;
    return;
  }
  
  // Merge basic fields
  // - type: prefer identical; else leave as-is (you can enhance to union types if needed)
  if (incoming.type && current.type && incoming.type !== current.type) {
    // fallback: keep current.type (or you could make it an array union)
  }
  
  // - enum: union
  if (incoming.enum || current.enum) {
    current.enum = mergeEnums(current.enum, incoming.enum);
    current.type = current.type || incoming.type || 'string';
  }
  
  // - numeric/string bounds
  mergeNumericLimits(current, incoming, 'minimum', 'maximum');
  mergeNumericLimits(current, incoming, 'minLength', 'maxLength');
  
  // keep description if missing
  if (!current.description && incoming.description) current.description = incoming.description;
}

const positionSchema = () => {
  // Allow optional altitude as the third dimension while keeping lon/lat required
  return {
    type: 'array',
    minItems: 2,
    additionalItems: false,
    items: [
      {type: 'number', minimum: -180.0, maximum: 180.0}, // lon
      {type: 'number', minimum: -90.0, maximum: 90.0},   // lat
      {type: 'number'},                                  // optional elevation
    ],
  };
}

const geometrySchemaFor = (typeEnum) => {
  // typeEnum: array like ["LineString"] or ["Polygon","MultiPolygon"]
  const [first] = typeEnum;
  const base = {
    title: 'geometryObject',
    type: 'object',
    required: ['type', 'coordinates'],
    additionalProperties: false,
    properties: {
      type: {
        title: 'GeometryType',
        type: 'string',
        default: first,
        enum: typeEnum,
      },
      coordinates: {}, // filled per geometry kind below
    },
  };
  
  const pos = positionSchema();
  
  if (typeEnum.length === 1 && typeEnum[0] === 'Point') {
    base.properties.coordinates = deepClone(pos);
    return base;
  }
  
  if (typeEnum.length === 1 && typeEnum[0] === 'LineString') {
    base.properties.coordinates = {
      title: 'coordinates',
      type: 'array',
      minItems: 2,
      items: deepClone(pos),
    };
    return base;
  }
  
  // Polygon / MultiPolygon (support both if requested)
  // Polygon: [ [ [lon,lat], ... ] ]  (array of linear rings; ring has min 4 positions)
  // MultiPolygon: [ [ [ [lon,lat], ... ] ] ]
  // We'll use a schema that satisfies both if both appear.
  const ring = {
    type: 'array',
    minItems: 4,
    items: deepClone(pos),
  };
  const polygonCoords = {
    type: 'array',
    minItems: 1,
    items: ring,
  };
  const multiPolygonCoords = {
    type: 'array',
    minItems: 1,
    items: polygonCoords,
  };
  
  if (typeEnum.length === 1 && typeEnum[0] === 'Polygon') {
    base.properties.coordinates = polygonCoords;
  } else if (typeEnum.length === 1 && typeEnum[0] === 'MultiPolygon') {
    base.properties.coordinates = multiPolygonCoords;
  } else {
    // Both Polygon and MultiPolygon allowed: accept either shape via anyOf
    base.properties.coordinates = {
      anyOf: [polygonCoords, multiPolygonCoords],
    };
  }
  return base;
}

const featureCollectionTemplate = (geometryTypeEnum, propertiesSchema, options = {}) => {
  const { version = DEFAULT_VERSION, schemaName } = options;
  const versionTag = version || DEFAULT_VERSION;
  const baseName = schemaName || `${geometryTypeEnum[0].toLowerCase()}s`;
  const $id = `https://sidewalks.washington.edu/opensidewalks/${versionTag}/${baseName}.schema.json`;

  return {
    title: 'root',
    type: 'object',
    $id,
    $schema: 'http://json-schema.org/draft-07/schema#',
    required: ['type', 'features', '$schema'],
    additionalProperties: false,
    properties: {
      $schema: {
        description: 'A field for the schema id.',
        enum: [
          'https://sidewalks.washington.edu/opensidewalks/0.2/schema.json',
          'https://sidewalks.washington.edu/opensidewalks/0.3/schema.json',
        ],
        type: 'string',
      },
      dataSource: {
        additionalProperties: true,
        properties: {},
        type: 'object',
      },
      dataTimestamp: {
        format: 'date-time',
        type: 'string',
      },
      pipelineVersion: {
        additionalProperties: true,
        properties: {},
        type: 'object',
      },
      region: {
        ...geometrySchemaFor(['MultiPolygon']),
        description: 'MultiPolygon geometry object.',
      },
      type: {
        title: 'Feature Collection',
        type: 'string',
        default: 'FeatureCollection',
        enum: ['FeatureCollection'],
      },
      features: {
        title: 'features array',
        type: 'array',
        minItems: 1,
        additionalItems: false,
        items: {
          title: 'FeatureObject',
          type: 'object',
          required: ['type', 'geometry', 'properties'],
          additionalProperties: false,
          properties: {
            type: {
              title: 'FeatureType',
              type: 'string',
              default: 'Feature',
              enum: ['Feature'],
            },
            geometry: geometrySchemaFor(geometryTypeEnum),
            properties: propertiesSchema,
          },
        },
      },
    },
  };
}

const renameKey = (obj, from, to) => {
  if (from === to) return;
  if (Object.prototype.hasOwnProperty.call(obj, from)) {
    obj[to] = obj[from];
    delete obj[from];
  }
}

const aggregateForGroup = (items) => {
  const unionProperties = {};
  const anyOfBranches = [];
  let commonRequired = null;

  for (const item of items) {
    const props = item.properties || {};
    const propsCloned = deepClone(props);

    // optional renames (e.g., _id -> id)
    for (const [from, to] of Object.entries(RENAME_MAP)) {
      renameKey(propsCloned, from, to);
    }

    const requiredList = Array.isArray(item.required) ? Array.from(new Set(item.required)) : [];
    commonRequired = commonRequired == null
      ? Array.from(requiredList)
      : commonRequired.filter((r) => requiredList.includes(r));

    // merge prop schemas
    for (const [k, v] of Object.entries(propsCloned)) {
      mergePropertySchemas(unionProperties, k, v);
    }

    const patternProperties = item.patternProperties || {'^ext:.*$': {}};

    anyOfBranches.push({
      title: item.itemName || 'Fields',
      type: 'object',
      additionalProperties: item.additionalProperties === undefined ? false : item.additionalProperties,
      properties: propsCloned,
      required: requiredList,
      ...(patternProperties ? {patternProperties} : {}),
    });
  }

  const propertiesSchema = {
    title: 'propertiesObject',
    type: 'object',
    additionalProperties: false,
    properties: unionProperties,
    patternProperties: {
      '^ext:.*$': {},
    },
  };

  if (commonRequired && commonRequired.length) {
    propertiesSchema.required = commonRequired;
  }

  if (anyOfBranches.length) {
    propertiesSchema.anyOf = anyOfBranches;
  }

  return propertiesSchema;
}


const writeSchemaFile = (filename, schema) => {
  fs.writeFileSync(filename, JSON.stringify(schema, null, 2), 'utf8');
  console.log(`Wrote ${filename}`);
}


const normalizeName = (name) => String(name || '').replace(/Fields$/, '');

// Classification is driven by OSW 0.3 taxonomy:
// - Nodes/Edges/Zones are core network elements
// - Points/Lines/Polygons are adjacent/non-network entities
const NODE_FEATURES = new Set([
  'BareNode',
  'CurbRamp',
  'FlushCurb',
  'GenericCurb',
  'RaisedCurb',
  'RolledCurb',
]);

const EDGE_FEATURES = new Set([
  'Alley',
  'Crossing',
  'Driveway',
  'Footway',
  'LivingStreet',
  'ParkingAisle',
  'Pedestrian',
  'PrimaryStreet',
  'ResidentialStreet',
  'SecondaryStreet',
  'ServiceRoad',
  'Sidewalk',
  'Steps',
  'TertiaryStreet',
  'TrafficIsland',
  'TrunkRoad',
  'UnclassifiedRoad',
]);

const ZONE_FEATURES = new Set([
  'PedestrianZone',
]);

const ADJ_POINT_FEATURES = new Set([
  'Bench',
  'Bollard',
  'FireHydrant',
  'Manhole',
  'PowerPole',
  'StreetLamp',
  'Tree',
  'WasteBasket',
  'CustomPoint',
]);

const ADJ_LINE_FEATURES = new Set([
  'Fence',
  'TreeRow',
  'CustomLine',
]);

const ADJ_POLYGON_FEATURES = new Set([
  'Building',
  'Wood',
  'CustomPolygon',
]);

const buildSchemas = (inputFile, options = {}) => {
  const { version = DEFAULT_VERSION, outputDir = defaultOutputDir, writeLegacy = true } = options;
  const data = readJson(inputFile);
  if (!Array.isArray(data)) {
    console.error('Input must be an array of field objects.');
    process.exit(1);
  }
  
  const buckets = {
    Nodes: [],
    Edges: [],
    Zones: [],
    Points: [],
    Lines: [],
    Polygons: [],
    LineStringAll: [],
    PointAll: [],
    PolygonAll: [],
  };
  
  for (const entry of data) {
    const featureName = normalizeName(entry.featureName || entry.itemName);
    const geomSet = parseGeometrySet(entry.geometryType);
    
    if (geomSet.has('LineString')) buckets.LineStringAll.push(entry);
    if (geomSet.has('Point')) buckets.PointAll.push(entry);
    if (geomSet.has('Polygon') || geomSet.has('MultiPolygon')) buckets.PolygonAll.push(entry);
    
    if (NODE_FEATURES.has(featureName)) buckets.Nodes.push(entry);
    else if (EDGE_FEATURES.has(featureName)) buckets.Edges.push(entry);
    else if (ZONE_FEATURES.has(featureName)) buckets.Zones.push(entry);
    else if (ADJ_POINT_FEATURES.has(featureName)) buckets.Points.push(entry);
    else if (ADJ_LINE_FEATURES.has(featureName)) buckets.Lines.push(entry);
    else if (ADJ_POLYGON_FEATURES.has(featureName)) buckets.Polygons.push(entry);
  }
  
  const outputNames = {
    Nodes: `opensidewalks.nodes.schema-${version}.json`,
    Edges: `opensidewalks.edges.schema-${version}.json`,
    Zones: `opensidewalks.zones.schema-${version}.json`,
    Points: `opensidewalks.points.schema-${version}.json`,
    Lines: `opensidewalks.lines.schema-${version}.json`,
    Polygons: `opensidewalks.polygons.schema-${version}.json`,
    LineStringAll: `opensidewalks.line_all.schema-${version}.json`,
    PointAll: `opensidewalks.point_all.schema-${version}.json`,
    PolygonAll: `opensidewalks.polygon_all.schema-${version}.json`,
  };
  
  const legacyNames = {
    LineStringAll: 'lineSchema.json',
    PointAll: 'pointsSchema.json',
    PolygonAll: 'PolygonSchema.json',
  };
  
  const writeSchema = (key, schema) => {
    if (!schema) return;
    writeSchemaFile(path.join(outputDir, outputNames[key]), schema);
    if (writeLegacy && legacyNames[key]) {
      writeSchemaFile(path.join(outputDir, legacyNames[key]), schema);
    }
  };
  
  const maybeBuild = (key, geomEnum) => {
    const list = buckets[key];
    if (!list || !list.length) return;
    const properties = aggregateForGroup(list);
    const schema = featureCollectionTemplate(geomEnum, properties, {version, schemaName: key.toLowerCase()});
    writeSchema(key, schema);
  };
  
  maybeBuild('Nodes', ['Point']);
  maybeBuild('Edges', ['LineString']);
  maybeBuild('Zones', ['Polygon']);
  maybeBuild('Points', ['Point']);
  maybeBuild('Lines', ['LineString']);
  maybeBuild('Polygons', ['Polygon']);
  
  // Legacy combined schemas (all-by-geometry) to preserve previous behavior
  maybeBuild('LineStringAll', ['LineString']);
  maybeBuild('PointAll', ['Point']);
  maybeBuild('PolygonAll', ['Polygon']);
}

module.exports = {
  buildSchemas
};
