import GeoJSON from 'ol/format/GeoJSON.js';
import VectorTileLayer from 'ol/layer/VectorTile.js';
import VectorTileSource from 'ol/source/VectorTile.js';
import {
  WebGLVectorTileLayer,
  createMap,
  getGuiParameterValue,
  getRandomColor,
  initializeGui,
  registerGuiParameter,
} from '../common.js';
import {transformExtent} from 'ol/proj.js';

const source = new VectorTileSource({
  url: '{z}/{x}/{y}',
  // @ts-ignore
  tileLoadFunction: (tile) => tileLoadFunction(tile),
  maxZoom: 15,
});

const format = new GeoJSON({featureProjection: 'EPSG:3857'});

/**
 * @type {import('ol/style/flat.js').FlatStyle & import('ol/style/webgl.js').WebGLStyle}
 */
const style = {
  'fill-color': ['get', 'color'],
  'stroke-color': ['get', 'color'],
  'stroke-width': 2,
  'circle-radius': 7,
  'circle-fill-color': ['get', 'color'],
  'circle-stroke-color': 'gray',
  'circle-stroke-width': 0.5,
};

/**
 * @param {number} countPoints Points count
 * @param {number} countPolygons Polygons count
 * @param {number} countLines Lines count
 * @param {number} numVertices Amount of vertices in polygons
 * @param {Array<number>} bbox Bounding box
 * @return {import('geojson').FeatureCollection} Feature collection
 */
function makeData(countPoints, countPolygons, countLines, numVertices, bbox) {
  /**
   * @type {Array<import('geojson').Feature>}
   */
  const features = [];
  const width = bbox[2] - bbox[0];
  const height = bbox[3] - bbox[1];
  const centerLon = bbox[0] + width / 2;
  const centerLat = bbox[1] + height / 2;

  // Calculate the size based on the count and the bounding box area
  const gridSpacing =
    (width + height) / 4 / (Math.ceil(Math.sqrt(countPoints)) + 1);

  // Generate polygons on the left bottom corner
  for (let lon = bbox[0] + gridSpacing; lon < centerLon; lon += gridSpacing) {
    for (let lat = bbox[1] + gridSpacing; lat < centerLat; lat += gridSpacing) {
      const buffer = (0.3 + Math.random() * 0.2) * gridSpacing;

      const angleStep = (2 * Math.PI) / numVertices;

      const polygonCoordinates = [];
      for (let i = 0; i < numVertices; i++) {
        const angle = i * angleStep;
        const x = lon + buffer * Math.cos(angle);
        const y = lat + buffer * Math.sin(angle);
        polygonCoordinates.push([x, y]);
      }
      polygonCoordinates.push(polygonCoordinates[0]);

      features.push({
        type: 'Feature',
        properties: {
          color: getRandomColor(),
        },
        geometry: {
          type: 'Polygon',
          coordinates: [polygonCoordinates],
        },
      });
    }
  }

  // outer boundary
  features.push({
    type: 'Feature',
    properties: {
      color: getRandomColor(),
    },
    geometry: {
      type: 'LineString',
      coordinates: [
        [bbox[0], bbox[1]],
        [bbox[2], bbox[1]],
        [bbox[2], bbox[3]],
        [bbox[0], bbox[3]],
        [bbox[0], bbox[1]],
      ],
    },
  });

  // Generate points on the right top corner
  for (let lon = centerLon + gridSpacing; lon < bbox[2]; lon += gridSpacing) {
    for (let lat = bbox[1] + gridSpacing; lat < centerLat; lat += gridSpacing) {
      const point = [lon, lat];

      features.push({
        type: 'Feature',
        properties: {
          color: getRandomColor(),
        },
        geometry: {
          type: 'Point',
          coordinates: point,
        },
      });
    }
  }

  const curveComplexity = 2;
  const periodCount = 6;
  const periodWidth = (width - gridSpacing * 2) / periodCount;
  const periodHeight = height / 20;
  const latitudeSpacing = (height / 2 - periodHeight * 2) / countLines;

  /**
   * @type {Array<any>}
   */
  let singleCurve = []; // Create a singleCurve array outside the loop

  for (let j = 0; j < countLines; j++) {
    const coordinates = [];
    for (let i = 0; i < periodCount; i++) {
      const startLon = bbox[0] + i * periodWidth + gridSpacing;
      const startLat = centerLat + periodHeight + j * latitudeSpacing; // Change the starting latitude to be above the center

      singleCurve = []; // Clear the array

      for (let i = 0; i < curveComplexity; i++) {
        const ratio = i / curveComplexity;
        const longitude = startLon + ratio * periodWidth;
        const latitude =
          startLat + Math.cos(ratio * Math.PI * 2) * periodHeight * 0.5;
        singleCurve = singleCurve.concat([[longitude, latitude]]);
      }
      coordinates.push(...singleCurve);
    }
    features.push({
      type: 'Feature',
      properties: {
        color: getRandomColor(),
      },
      geometry: {
        type: 'LineString',
        coordinates,
      },
    });
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}

/**
 * @param {import("ol/VectorTile.js").default} tile Vector tile
 */
function tileLoadFunction(tile) {
  const totalFeatureCount = /** @type {number} */ (
    getGuiParameterValue('count')
  );
  const countPoints = Math.floor(totalFeatureCount / 3);
  const countPolygons = Math.floor(totalFeatureCount / 3);
  const countLines = totalFeatureCount - countPoints - countPolygons;
  const tileGrid = source.getTileGrid();
  let extent = tileGrid
    ? tileGrid.getTileCoordExtent(tile.tileCoord)
    : [0, 0, 0, 0];
  extent = transformExtent(extent, 'EPSG:3857', 'EPSG:4326');
  const numVertices = 5;
  const data = makeData(
    countPoints,
    countPolygons,
    countLines,
    numVertices,
    extent
  );
  const features = format.readFeatures(data);
  tile.setFeatures(features);
}

function main() {
  createMap(
    (map) => {
      map.addLayer(new WebGLVectorTileLayer({source, properties: {style}}));
    },
    (map) => {
      map.addLayer(
        new VectorTileLayer({
          source,
          // @ts-ignore
          style: style,
        })
      );
    }
  );
  initializeGui();
  registerGuiParameter(
    'count',
    'Feature count',
    [500, 10000, 500],
    500,
    (value, initial) => {
      if (initial) {
        return;
      }
      source.refresh();
      // workaround required for webgl renderer; see https://github.com/openlayers/openlayers/issues/15213
      // @ts-ignore
      source.setKey(Date.now().toString());
    }
  );
}

main();
