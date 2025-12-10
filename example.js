const fs = require('fs');
const {generateGeojsonSamples} = require('./scripts/makeSampleGeojson');
const path = require("path");

const schemaDir = path.join(process.cwd(), 'schema');

// Default tag lists from OSW 0.3 definitions
const NODE_TAGS = [
  'BareNode',
  'CurbRamp',
  'FlushCurb',
  'GenericCurb',
  'RaisedCurb',
  'RolledCurb',
];

const EDGE_TAGS = [
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
];

const ZONE_TAGS = [
  'PedestrianZone',
];

const POINT_TAGS = [
  'Bench',
  'Bollard',
  'FireHydrant',
  'Manhole',
  'PowerPole',
  'StreetLamp',
  'Tree',
  'WasteBasket',
  'CustomPoint',
];

const LINE_TAGS = [
  'Fence',
  'TreeRow',
  'CustomLine',
];

const POLYGON_TAGS = [
  'Building',
  'Wood',
  'CustomPolygon',
];

(async () => {
  // Generate one valid/invalid per tag type for a small smoke set
  await generateGeojsonSamples(NODE_TAGS, {
    schemaPath: path.join(schemaDir, 'opensidewalks.schema-0.3.json'),
    validOut: 'samples_nodes_valid.geojson',
    invalidOut: 'samples_nodes_invalid.geojson',
    seed: 11,
    numFeatures: 1,
  });

  await generateGeojsonSamples(EDGE_TAGS, {
    schemaPath: path.join(schemaDir, 'opensidewalks.schema-0.3.json'),
    validOut: 'samples_edges_valid.geojson',
    invalidOut: 'samples_edges_invalid.geojson',
    seed: 22,
    numFeatures: 1,
  });

  await generateGeojsonSamples(ZONE_TAGS, {
    schemaPath: path.join(schemaDir, 'opensidewalks.schema-0.3.json'),
    validOut: 'samples_zones_valid.geojson',
    invalidOut: 'samples_zones_invalid.geojson',
    seed: 33,
    numFeatures: 1,
  });

  await generateGeojsonSamples(POINT_TAGS, {
    schemaPath: path.join(schemaDir, 'opensidewalks.schema-0.3.json'),
    validOut: 'samples_points_valid.geojson',
    invalidOut: 'samples_points_invalid.geojson',
    seed: 44,
    numFeatures: 1,
  });

  await generateGeojsonSamples(LINE_TAGS, {
    schemaPath: path.join(schemaDir, 'opensidewalks.schema-0.3.json'),
    validOut: 'samples_lines_valid.geojson',
    invalidOut: 'samples_lines_invalid.geojson',
    seed: 55,
    numFeatures: 1,
  });

  await generateGeojsonSamples(POLYGON_TAGS, {
    schemaPath: path.join(schemaDir, 'opensidewalks.schema-0.3.json'),
    validOut: 'samples_polygons_valid.geojson',
    invalidOut: 'samples_polygons_invalid.geojson',
    seed: 66,
    numFeatures: 1,
  });
})();
