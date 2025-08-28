const fs = require('fs');
const path = require('path');

const outputDir = path.join(process.cwd(), 'output');

const RENAME_MAP = {
  // _id: 'id',
  // _u_id: 'u_id', // uncomment if you want
  // _v_id: 'v_id', // uncomment if you want
};

const DISCRIMINATORS = new Set([
  'highway',
  'footway',
  'service',
  'barrier',
  'amenity',
  'power',
  'man_made',
]);


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
  return {
    type: 'array',
    additionalItems: false,
    items: [
      {type: 'number', minimum: -180.0, maximum: 180.0}, // lon
      {type: 'number', minimum: -90.0, maximum: 90.0},   // lat
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

const featureCollectionTemplate = (geometryTypeEnum, propertiesObj, dependenciesObj) => {
  return {
    title: 'root',
    type: 'object',
    required: ['type', 'features'],
    additionalProperties: false,
    properties: {
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
          required: ['type', 'geometry'],
          additionalProperties: false,
          properties: {
            type: {
              title: 'FeatureType',
              type: 'string',
              default: 'Feature',
              enum: ['Feature'],
            },
            geometry: geometrySchemaFor(geometryTypeEnum),
            properties: {
              title: 'propertiesObject',
              type: 'object',
              additionalProperties: false,
              properties: propertiesObj,
              ...(Object.keys(dependenciesObj || {}).length
                ? {dependencies: dependenciesObj}
                : {}),
            },
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
  // Union of property schemas
  const properties = {};
  
  // dependencies builder:
  // deps[propName] -> array of "contexts"
  // where a context is an array of [{ required:[tag], properties:{ [tag]:{type:'string', const: 'val'} } }, ...]
  const deps = {};
  
  for (const item of items) {
    const props = item.properties || {};
    const propsCloned = deepClone(props);
    
    // optional renames (e.g., _id -> id)
    for (const [from, to] of Object.entries(RENAME_MAP)) {
      renameKey(propsCloned, from, to);
    }
    
    // merge prop schemas
    for (const [k, v] of Object.entries(propsCloned)) {
      mergePropertySchemas(properties, k, v);
    }
    
    // collect discriminator conditions for this item (single-valued enums only)
    const discriminatorClauses = [];
    for (const tag of DISCRIMINATORS) {
      const tagSchema = propsCloned[tag];
      const enums = tagSchema && Array.isArray(tagSchema.enum) ? tagSchema.enum : null;
      if (enums && enums.length === 1) {
        const val = enums[0];
        discriminatorClauses.push({
          required: [tag],
          properties: {
            [tag]: {type: 'string', const: val},
          },
        });
      }
    }
    
    // For each non-discriminator property, attach a dependency (if we have any discriminator clauses)
    if (discriminatorClauses.length) {
      for (const key of Object.keys(propsCloned)) {
        if (DISCRIMINATORS.has(key)) continue; // don't create self-dependency
        // Initialize bucket
        if (!deps[key]) deps[key] = [];
        // Push this item's condition set
        deps[key].push(discriminatorClauses.map(c => deepClone(c)));
      }
    }
  }
  
  // Build "dependencies" object:
  // If a property has multiple contexts, use anyOf over those context-sets.
  const dependencies = {};
  for (const [prop, contexts] of Object.entries(deps)) {
    if (!contexts.length) continue;
    if (contexts.length === 1) {
      dependencies[prop] = {allOf: contexts[0]};
    } else {
      dependencies[prop] = {
        anyOf: contexts.map(ctx => ({allOf: ctx})),
      };
    }
  }
  
  return {properties, dependencies};
}


const writeSchemaFile = (filename, schema) => {
  fs.writeFileSync(filename, JSON.stringify(schema, null, 2), 'utf8');
  console.log(`Wrote ${filename}`);
}


const buildSchemas = (inputFile) => {
  const data = readJson(inputFile);
  if (!Array.isArray(data)) {
    console.error('Input must be an array of field objects.');
    process.exit(1);
  }
  
  const groups = {
    LineString: [],
    Point: [],
    PolygonLike: [], // Polygon and/or MultiPolygon
  };
  
  for (const entry of data) {
    const gset = parseGeometrySet(entry.geometryType);
    if (gset.has('LineString')) groups.LineString.push(entry);
    if (gset.has('Point')) groups.Point.push(entry);
    if (gset.has('Polygon') || gset.has('MultiPolygon')) groups.PolygonLike.push(entry);
  }
  
  // Build & write LineString schema (if any)
  if (groups.LineString.length) {
    const {properties, dependencies} = aggregateForGroup(groups.LineString);
    const schema = featureCollectionTemplate(['LineString'], properties, dependencies);
    writeSchemaFile(path.join(outputDir, 'lineSchema.json'), schema);
  }
  
  // Build & write Point schema (if any)
  if (groups.Point.length) {
    const {properties, dependencies} = aggregateForGroup(groups.Point);
    const schema = featureCollectionTemplate(['Point'], properties, dependencies);
    writeSchemaFile(path.join(outputDir, 'pointsSchema.json'), schema);
  }
  
  // Build & write Polygon/MultiPolygon schema (if any)
  if (groups.PolygonLike.length) {
    // Determine which polygon kinds exist to set enum correctly
    const polyKinds = new Set();
    for (const e of groups.PolygonLike) {
      for (const k of parseGeometrySet(e.geometryType)) {
        if (k === 'Polygon' || k === 'MultiPolygon') polyKinds.add(k);
      }
    }
    const geomEnum = Array.from(polyKinds.size ? polyKinds : ['Polygon']);
    const {properties, dependencies} = aggregateForGroup(groups.PolygonLike);
    const schema = featureCollectionTemplate(geomEnum, properties, dependencies);
    writeSchemaFile(path.join(outputDir, 'PolygonSchema.json'), schema);
  }
}

module.exports = {
  buildSchemas
};