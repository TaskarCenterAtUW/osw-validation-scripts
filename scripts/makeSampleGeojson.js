// generateSamples.js
// Node.js generator for VALID and INVALID GeoJSON FeatureCollections, driven by the attached schema.

const fs = require('fs');

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

const loadSchema = (schemaPathOrObj) => {
  if (typeof schemaPathOrObj === 'string') return readJson(schemaPathOrObj);
  if (schemaPathOrObj && typeof schemaPathOrObj === 'object') return schemaPathOrObj;
  throw new Error('schemaPath must be a file path or a parsed schema object');
};

// --- JSON Pointer helpers ----------------------------------------------------
const getByPointer = (doc, ref) => {
  if (!ref) throw new Error('Empty $ref');
  const hashIdx = ref.indexOf('#');
  let fragment = hashIdx >= 0 ? ref.slice(hashIdx + 1) : ref;
  fragment = fragment.replace(/^\/+/, '');
  if (!fragment) return doc;
  let cur = doc;
  const parts = fragment.split('/').filter(Boolean);
  for (const partRaw of parts) {
    const key = partRaw.replace(/~1/g, '/').replace(/~0/g, '~');
    if (!cur || typeof cur !== 'object' || !(key in cur)) {
      throw new Error(`JSON pointer failed at "${ref}" (missing "${key}")`);
    }
    cur = cur[key];
  }
  return cur;
};

const deref = (schema, node) => {
  if (node && typeof node === 'object' && node.$ref) {
    return getByPointer(schema, node.$ref);
  }
  return node;
};

// --- Schema-driven helpers ---------------------------------------------------
const inferGeometryType = (tagDef, schema) => {
  const geomNode = (((tagDef || {}).properties || {}).geometry || {});
  if (geomNode.$ref) {
    try {
      const geomSchema = deref(schema, geomNode);
      const enumTypes = ((((geomSchema || {}).properties || {}).type) || {}).enum || [];
      if (enumTypes.length) return enumTypes[0];
    } catch (e) {
      const m = String(geomNode.$ref).match(/GeoJSON\.(Point|LineString|Polygon|MultiPolygon)/);
      if (m) return m[1];
    }
  }
  const enumTypes = ((((geomNode || {}).properties || {}).type) || {}).enum || [];
  if (enumTypes.length) return enumTypes[0];
  return 'Point';
};

const fieldsSchemaForTag = (tagDef, schema) => {
  const propsNode = (((tagDef || {}).properties || {}).properties || {});
  return deref(schema, propsNode);
};

// --- Sampling helpers (diversity + IDs) -------------------------------------
const mulberry32 = (seed) => {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

const coordsForType = (geomType, rnd) => {
  // Small bbox near Seattle; deterministic but varied
  const lon0 = -122.35 + rnd() * 0.05;
  const lat0 = 47.60 + rnd() * 0.02;
  if (geomType === 'Point') return [lon0, lat0];
  if (geomType === 'LineString') return [[lon0, lat0], [lon0 + 0.001 + rnd()*0.001, lat0 + 0.001 + rnd()*0.001]];
  if (geomType === 'Polygon') {
    const dx = 0.0008 + rnd()*0.0006;
    const dy = 0.0008 + rnd()*0.0006;
    return [[[lon0, lat0],
      [lon0 + dx, lat0],
      [lon0 + dx, lat0 + dy],
      [lon0,     lat0 + dy],
      [lon0,     lat0]]];
  }
  if (geomType === 'MultiPolygon') {
    const dx = 0.0008 + rnd()*0.0006;
    const dy = 0.0008 + rnd()*0.0006;
    return [[[[lon0, lat0],
      [lon0 + dx, lat0],
      [lon0 + dx, lat0 + dy],
      [lon0,      lat0 + dy],
      [lon0,      lat0]]]];
  }
  return [lon0, lat0];
};

const uniqueId = (prefix, tag, i, j) => `${prefix}-${tag.toLowerCase()}-${i}-${j}`;

// Choose a value from enum cycling through options, else fall back to sampleByType
const enumOrTypeSample = (propName, propSchema, j, rnd) => {
  const s = propSchema || {};
  if (Array.isArray(s.enum) && s.enum.length > 0) {
    const idx = j % s.enum.length;
    return s.enum[idx];
  }
  return sampleByType(propName, s, j, rnd);
};

const sampleByType = (propName, propSchema, j, rnd) => {
  let t = propSchema?.type ?? 'string';
  if (Array.isArray(t)) {
    const cand = t.find(x => x !== 'null');
    t = cand || t[0];
  }
  switch (t) {
    case 'string': {
      if (propName === '_id') return `id-${j.toString().padStart(4,'0')}`;
      if (propName === '_u_id') return `node-u-${j.toString().padStart(4,'0')}`;
      if (propName === '_v_id') return `node-v-${j.toString().padStart(4,'0')}`;
      if (propName === 'name') return `Example Name ${j+1}`;
      return `example-${j}`;
    }
    case 'number': {
      const mn = typeof propSchema.minimum === 'number' ? propSchema.minimum : 0;
      const mx = typeof propSchema.maximum === 'number' ? propSchema.maximum : mn + 10;
      const v = mn + (mx - mn) * rnd();
      return Number(v.toFixed(3));
    }
    case 'integer': {
      const mn = typeof propSchema.minimum === 'number' ? propSchema.minimum : 0;
      const mx = typeof propSchema.maximum === 'number' ? propSchema.maximum : mn + 10;
      return Math.floor(mn + (mx - mn) * rnd());
    }
    case 'boolean':
      return rnd() > 0.5;
    case 'array': {
      const items = propSchema.items || {};
      const n = 1 + Math.floor(rnd()*2); // 1–2 items
      if (Array.isArray(items)) return [];
      if (items.type === 'string') return Array.from({length:n}, (_,k)=>`ex-${j}-${k}`);
      if (items.type === 'number') return Array.from({length:n}, ()=> Number((rnd()*10).toFixed(2)));
      return [];
    }
    case 'object':
      return {};
    default:
      return `example-${j}`;
  }
};

// --- Core generator ----------------------------------------------------------
/**
 * Generate FeatureCollections:
 *  - validOut: each feature satisfies its <Tag>Fields constraints, with diversity
 *  - invalidOut: same count, but each violates a *different* constraint when possible
 *
 * @param {string[]} tags
 * @param {object} options
 * @param {string} [options.schemaPath='/mnt/data/opensidewalks.schema.json']
 * @param {string} [options.validOut='valid_sample.geojson']
 * @param {string} [options.invalidOut='invalid_sample.geojson']
 * @param {number} [options.seed=0]
 * @param {number} [options.numFeatures=1]  Number of features per tag
 */
async function generateGeojsonSamples(tags, {
  schemaPath = '/mnt/data/opensidewalks.schema.json',
  validOut = 'valid_sample.geojson',
  invalidOut = 'invalid_sample.geojson',
  seed = 0,
  numFeatures = 1,
} = {}) {
  if (!Array.isArray(tags) || tags.length === 0) {
    throw new Error('tags must be a non-empty string array, e.g. ["Alley","Bench"]');
  }
  
  const schema = loadSchema(schemaPath);
  const defs = schema.definitions || {};
  const rnd = mulberry32(seed);
  
  const valid = { type: 'FeatureCollection', features: [] };
  const invalid = { type: 'FeatureCollection', features: [] };
  
  const getTagDef = (tagName) => {
    const def = defs[tagName];
    if (!def) throw new Error(`Tag "${tagName}" not found in schema definitions`);
    return def;
  };
  
  for (let i = 0; i < tags.length; i++) {
    const tag = tags[i];
    const tagDef = getTagDef(tag);
    const geomType = inferGeometryType(tagDef, schema);
    const tagFields = fieldsSchemaForTag(tagDef, schema);
    const requiredList = Array.isArray(tagFields.required) ? tagFields.required.slice() : [];
    const propSchemas = (tagFields.properties || {});
    
    // Identify which required props are enums to target for invalidation variety
    const enumRequired = requiredList.filter((req) => {
      const s = deref(schema, propSchemas[req] || {});
      return Array.isArray(s?.enum) && s.enum.length > 0;
    });
    
    for (let j = 0; j < numFeatures; j++) {
      // VALID props (diverse)
      const props = {};
      for (const reqName of requiredList) {
        const rawProp = propSchemas[reqName] || {};
        const propSchema = deref(schema, rawProp);
        
        // Use cycling enums when present, else type-based varied sampling
        let val = enumOrTypeSample(reqName, propSchema, j, rnd);
        
        props[reqName] = val;
      }
      
      // Ensure unique IDs regardless of schema specifics
      // If these aren't required in a given tag schema, we won't add them.
      if (requiredList.includes('_id'))   props['_id']   = uniqueId('id', tag, i, j);
      if (requiredList.includes('_u_id')) props['_u_id'] = uniqueId('node-u', tag, i, j);
      if (requiredList.includes('_v_id')) props['_v_id'] = uniqueId('node-v', tag, i, j);
      
      const feature = {
        type: 'Feature',
        geometry: { type: geomType, coordinates: coordsForType(geomType, rnd) },
        properties: props,
      };
      valid.features.push(feature);
      
      // INVALID variant — rotate failure mode
      const bad = JSON.parse(JSON.stringify(feature));
      
      if (enumRequired.length > 0) {
        // Break a different enum each time (round-robin)
        const which = enumRequired[j % enumRequired.length];
        bad.properties[which] = `__INVALID_ENUM__${j}`; // guaranteed not in enum
      } else if (requiredList.length > 0) {
        // Drop a different required field each time
        const dropIdx = j % requiredList.length;
        const toDrop = requiredList[dropIdx];
        delete bad.properties[toDrop];
      } else {
        // Fallback: flip geometry type on alternating features
        bad.geometry.type = geomType === 'Point' ? 'LineString'
          : geomType === 'LineString' ? 'Point'
            : 'Point';
        bad.geometry.coordinates = coordsForType(bad.geometry.type, rnd);
      }
      
      // Also ensure invalid IDs look different if still present
      if (bad.properties['_id'])   bad.properties['_id']   += '-bad';
      if (bad.properties['_u_id']) bad.properties['_u_id'] += '-bad';
      if (bad.properties['_v_id']) bad.properties['_v_id'] += '-bad';
      
      invalid.features.push(bad);
    }
  }
  
  fs.writeFileSync(validOut, JSON.stringify(valid, null, 2), 'utf8');
  fs.writeFileSync(invalidOut, JSON.stringify(invalid, null, 2), 'utf8');
  
  return { valid, invalid };
}

module.exports = { generateGeojsonSamples };
