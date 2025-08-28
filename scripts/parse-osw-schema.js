const fs = require('fs');
const path = require('path');
const {buildSchemas} = require('./build-schemas')

const outputDir = path.join(process.cwd(), 'output');
const outputFile = path.join(outputDir, 'results.json');

// take this path from schema

const filePath = path.join(process.cwd(), 'schema', 'opensidewalks.schema.json');
const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
const root = schema;


const jsonPointerGet = (obj, pointer) => {
  // pointer like "/definitions/GeoJSON.LineString"
  const parts = pointer.split('/').filter(Boolean).map(p => p.replace(/~1/g, '/').replace(/~0/g, '~'));
  return parts.reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}

const resolveRef = (ref) => {
  // Handles same-document refs like "https://...#/definitions/Thing"
  if (typeof ref !== 'string') return undefined;
  const hashIndex = ref.indexOf('#');
  if (hashIndex === -1) throw new Error(`Only internal $ref supported: ${ref}`);
  const pointer = ref.slice(hashIndex + 1) || '';
  return jsonPointerGet(root, pointer);
}

const lastPointerSegment = (ref) => {
  const afterHash = ref.split('#').pop();
  const parts = afterHash.split('/').filter(Boolean);
  return parts[parts.length - 1];
}

const deepClone = (obj) => {
  return obj == null ? obj : JSON.parse(JSON.stringify(obj));
}

/**
 * Recursively inline $ref anywhere in an object/array.
 * Sibling keys (besides $ref) are merged over the referenced target (spec-like).
 */
const inlineRefs = (node)=> {
  if (Array.isArray(node)) {
    return node.map(inlineRefs);
  }
  if (node && typeof node === 'object') {
    if (node.$ref && typeof node.$ref === 'string') {
      const target = resolveRef(node.$ref);
      if (!target) throw new Error(`Unresolvable $ref: ${node.$ref}`);
      const { $ref, ...siblings } = node;
      // Merge siblings over target, then recurse
      return inlineRefs({ ...deepClone(target), ...siblings });
    }
    const out = {};
    for (const [k, v] of Object.entries(node)) out[k] = inlineRefs(v);
    return out;
  }
  return node;
}

// --- main extraction ---
const main = () => {
  const defs = root.definitions || root.$defs || {};
  const results = [];
  
  for (const [defName, defVal] of Object.entries(defs)) {
    // Identify "Feature" definitions that point to a geometry and a *Fields object via $ref
    const geomRef = defVal?.properties?.geometry?.$ref;
    const propsRef = defVal?.properties?.properties?.$ref;
    
    if (geomRef && propsRef) {
      const fieldsDef = resolveRef(propsRef);
      if (!fieldsDef) continue; // skip if weird/missing
      
      // Fully inline nested $ref inside the *Fields definition (e.g., Building → BuildingFields → BuildingField)
      const fieldsResolved = inlineRefs(deepClone(fieldsDef));
      
      // Attach the geometry type (as a string like "GeoJSON.LineString") and the item name ("AlleyFields")
      results.push({
        ...fieldsResolved,
        geometryType: lastPointerSegment(geomRef),
        itemName: lastPointerSegment(propsRef),
      });
    }
  }
  
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2), 'utf8');
  console.log(`Results written to ${outputFile}`);
  buildSchemas(outputFile)
  
};

main()