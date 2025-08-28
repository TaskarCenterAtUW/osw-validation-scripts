const fs = require('fs');
const {generateGeojsonSamples} = require('./scripts/makeSampleGeojson');
const path = require("path");

const schemaDir = path.join(process.cwd(), 'schema');

const Line = [
  'Alley',
  'Crossing',
  'Driveway',
  'Fence',
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
  'UnclassifiedRoad'
];
const Point = [
  'BareNode',
  'Bench',
  'Bollard',
  'CurbRamp',
  'FireHydrant',
  'FlushCurb',
  'GenericCurb',
  'Manhole',
  'PowerPole',
  'RaisedCurb',
  'RolledCurb',
  'StreetLamp',
  'WasteBasket'
];
const Polygon = ['Building', 'PedestrianZone'];


(async () => {
  await generateGeojsonSamples(
    Line,
    {
      schemaPath: path.join(schemaDir, 'opensidewalks.schema.json'),
      validOut: 'my_valid.geojson',
      invalidOut: 'my_invalid.geojson',
      seed: 42,
      numFeatures: 2,
    }
  );
})();