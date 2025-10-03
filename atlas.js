// atlas.js — A minimal mapping library inspired by Leaflet

// ---------- UTILITIES ----------
const Util = {
  extend(dest, ...sources) {
    for (const src of sources) {
      for (const i in src) dest[i] = src[i];
    }
    return dest;
  },
  stamp(obj) {
    if (!('_id' in obj)) obj._id = ++Util.lastId;
    return obj._id;
  },
  lastId: 0,
  formatNum(num, digits = 6) {
    const pow = Math.pow(10, digits);
    return Math.round(num * pow) / pow;
  },
  requestAnimFrame(fn) {
    return requestAnimationFrame ? requestAnimationFrame(fn) : setTimeout(fn, 16);
  },
  cancelAnimFrame(id) {
    if (requestAnimationFrame) cancelAnimationFrame(id);
    else clearTimeout(id);
  }
};

// ---------- EVENT SYSTEM ----------
class Evented {
  on(types, fn, ctx) {
    this._events = this._events || {};
    for (const type of types.split(' ')) {
      (this._events[type] = this._events[type] || []).push({ fn, ctx });
    }
    return this;
  }
  off(types, fn) {
    if (!this._events) return this;
    for (const type of (types || Object.keys(this._events)).flat()) {
      if (fn) {
        this._events[type] = this._events[type]?.filter(l => l.fn !== fn) || [];
      } else {
        delete this._events[type];
      }
    }
    return this;
  }
  fire(type, data = {}) {
    const listeners = this._events?.[type];
    if (!listeners) return this;
    data.type = type;
    data.target = this;
    for (const { fn, ctx } of listeners) fn.call(ctx || this, data);
    return this;
  }
}

// ---------- CORE TYPES ----------
class Point {
  constructor(x, y) { this.x = x; this.y = y; }
  add(p) { return new Point(this.x + p.x, this.y + p.y); }
  subtract(p) { return new Point(this.x - p.x, this.y - p.y); }
  multiplyBy(k) { return new Point(this.x * k, this.y * k); }
  divideBy(k) { return new Point(this.x / k, this.y / k); }
  distanceTo(p) { const dx = p.x - this.x, dy = p.y - this.y; return Math.sqrt(dx * dx + dy * dy); }
  clone() { return new Point(this.x, this.y); }
  equals(p) { return this.x === p.x && this.y === p.y; }
  round() { return new Point(Math.round(this.x), Math.round(this.y)); }
}

class LatLng {
  constructor(lat, lng) {
    if (isNaN(lat) || isNaN(lng)) throw new Error('Invalid LatLng');
    this.lat = +lat; this.lng = +lng;
  }
  clone() { return new LatLng(this.lat, this.lng); }
  equals(other) {
    return Math.abs(this.lat - other.lat) < 1e-9 && Math.abs(this.lng - other.lng) < 1e-9;
  }
}

class Bounds {
  constructor(a, b) {
    if (a) this.extend(a);
    if (b) this.extend(b);
  }
  extend(obj) {
    const p = obj instanceof Point ? obj : new Point(obj.x, obj.y);
    if (!this.min) {
      this.min = p.clone(); this.max = p.clone();
    } else {
      this.min.x = Math.min(this.min.x, p.x);
      this.min.y = Math.min(this.min.y, p.y);
      this.max.x = Math.max(this.max.x, p.x);
      this.max.y = Math.max(this.max.y, p.y);
    }
    return this;
  }
  contains(p) {
    return p.x >= this.min.x && p.x <= this.max.x &&
           p.y >= this.min.y && p.y <= this.max.y;
  }
  getSize() { return this.max.subtract(this.min); }
  isValid() { return !!this.min && !!this.max; }
}

// ---------- PROJECTION (Web Mercator) ----------
const earthRadius = 6378137;
const MAX_LATITUDE = 85.0511287798;

function project(latlng) {
  const d = Math.PI / 180;
  const lat = Math.max(Math.min(MAX_LATITUDE, latlng.lat), -MAX_LATITUDE);
  const sin = Math.sin(lat * d);
  return new Point(
    earthRadius * latlng.lng * d,
    earthRadius * Math.log((1 + sin) / (1 - sin)) / 2
  );
}

function unproject(point) {
  const d = 180 / Math.PI;
  return new LatLng(
    (2 * Math.atan(Math.exp(point.y / earthRadius)) - (Math.PI / 2)) * d,
    point.x * d / earthRadius
  );
}

const CRS = {
  project,
  unproject,
  scale(zoom) { return 256 * Math.pow(2, zoom); },
  zoom(scale) { return Math.log(scale / 256) / Math.LN2; }
};

// ---------- DOM UTILS ----------
const DomUtil = {
  get(id) { return typeof id === 'string' ? document.getElementById(id) : id; },
  create(tag, className, parent) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (parent) parent.appendChild(el);
    return el;
  },
  setPosition(el, point) {
    el.style.left = point.x + 'px';
    el.style.top = point.y + 'px';
    el._pos = point;
  },
  getPosition(el) { return el._pos || new Point(0, 0); },
  setTransform(el, offset, scale) {
    const pos = offset || new Point(0, 0);
    el.style.transform = `translate3d(${pos.x}px,${pos.y}px,0)` + (scale ? ` scale(${scale})` : '');
  }
};

// ---------- ANIMATION ----------
class PosAnimation extends Evented {
  run(el, newPos, duration = 0.25) {
    this.stop();
    this._el = el;
    this._startPos = DomUtil.getPosition(el);
    this._offset = newPos.subtract(this._startPos);
    this._startTime = Date.now();
    this._duration = duration * 1000;
    this._animate();
  }
  stop() {
    if (this._animId) {
      Util.cancelAnimFrame(this._animId);
      delete this._animId;
    }
  }
  _animate() {
    const elapsed = Date.now() - this._startTime;
    if (elapsed < this._duration) {
      const t = elapsed / this._duration;
      const ease = 1 - Math.pow(1 - t, 2); // easeOutQuad
      const pos = this._startPos.add(this._offset.multiplyBy(ease));
      DomUtil.setPosition(this._el, pos);
      this._animId = Util.requestAnimFrame(() => this._animate());
    } else {
      DomUtil.setPosition(this._el, this._startPos.add(this._offset));
      this.fire('end');
    }
  }
}

// ---------- LAYER BASE ----------
class Layer extends Evented {
  addTo(map) {
    map.addLayer(this);
    return this;
  }
  remove() {
    if (this._map) this._map.removeLayer(this);
    return this;
  }
}

// ---------- MARKER ----------
class Marker extends Layer {
  constructor(latlng, options = {}) {
    super();
    this._latlng = latlng instanceof LatLng ? latlng : new LatLng(latlng[0], latlng[1]);
    this._options = options;
  }
  onAdd(map) {
    this._map = map;
    this._el = DomUtil.create('div', 'atlas-marker', map._container);
    this._el.textContent = '📍';
    this._el.style.cursor = 'pointer';
    this.update();
    this._el.addEventListener('click', (e) => {
      if (this._popup) this._popup.setLatLng(this._latlng).openOn(map);
    });
  }
  onRemove() {
    this._el.remove();
    delete this._el;
    delete this._map;
  }
  update() {
    if (!this._map || !this._el) return;
    const point = this._map.latLngToContainerPoint(this._latlng);
    DomUtil.setPosition(this._el, point);
  }
  setLatLng(latlng) {
    this._latlng = latlng instanceof LatLng ? latlng : new LatLng(latlng[0], latlng[1]);
    this.update();
    return this;
  }
  getLatLng() { return this._latlng.clone(); }
  bindPopup(content) {
    this._popup = new Popup(content);
    return this;
  }
  bindTooltip(content) {
    this._tooltip = new Tooltip(content);
    return this;
  }
}

// ---------- POPUP & TOOLTIP ----------
class DivOverlay extends Layer {
  constructor(content, options = {}) {
    super();
    this._content = content;
    this._options = options;
  }
  onAdd(map) {
    this._map = map;
    this._container = DomUtil.create('div', this._className, map._container);
    this._updateContent();
    this.update();
  }
  onRemove() {
    this._container.remove();
    delete this._map;
  }
  setLatLng(latlng) {
    this._latlng = latlng instanceof LatLng ? latlng : new LatLng(latlng[0], latlng[1]);
    this.update();
    return this;
  }
  setContent(content) {
    this._content = content;
    this._updateContent();
    return this;
  }
  openOn(map) {
    this.addTo(map);
    return this;
  }
  update() {
    if (!this._map) return;
    const point = this._map.latLngToContainerPoint(this._latlng);
    const offset = this._getOffset();
    DomUtil.setPosition(this._container, point.add(offset));
  }
  _updateContent() {
    if (typeof this._content === 'string') {
      this._container.innerHTML = this._content;
    } else {
      this._container.innerHTML = '';
      this._container.appendChild(this._content);
    }
  }
}

class Popup extends DivOverlay {
  constructor(content) {
    super(content);
    this._className = 'atlas-popup';
    const style = this._container?.style || {};
    style.backgroundColor = 'white';
    style.border = '1px solid #ccc';
    style.padding = '6px';
    style.borderRadius = '4px';
    style.boxShadow = '0 1px 5px rgba(0,0,0,0.4)';
    style.position = 'absolute';
    style.pointerEvents = 'auto';
    style.zIndex = '1000';
  }
  _getOffset() { return new Point(0, -30); }
}

class Tooltip extends DivOverlay {
  constructor(content) {
    super(content);
    this._className = 'atlas-tooltip';
    const style = this._container?.style || {};
    style.backgroundColor = 'black';
    style.color = 'white';
    style.padding = '3px 6px';
    style.borderRadius = '3px';
    style.position = 'absolute';
    style.pointerEvents = 'none';
    style.zIndex = '999';
    style.fontSize = '12px';
    style.whiteSpace = 'nowrap';
  }
  _getOffset() { return new Point(10, 0); }
}

// ---------- TILE LAYER ----------
class TileLayer extends Layer {
  constructor(urlTemplate, options = {}) {
    super();
    this._url = urlTemplate;
    this._options = { tileSize: 256, ...options };
  }
  onAdd(map) {
    this._map = map;
    this._container = DomUtil.create('div', 'atlas-tile-container', map._container);
    this._container.style.zIndex = '1';
    this._tiles = {};
    this._update();
    map.on('moveend', this._update, this);
  }
  onRemove() {
    this._map.off('moveend', this._update, this);
    this._container.remove();
    this._clearTiles();
    delete this._map;
  }
  _clearTiles() {
    for (const key in this._tiles) {
      this._container.removeChild(this._tiles[key]);
      delete this._tiles[key];
    }
  }
  _getTileUrl(coords) {
    return this._url
      .replace('{x}', coords.x)
      .replace('{y}', coords.y)
      .replace('{z}', coords.z);
  }
  _wrapX(x, zoom) {
    const worldWidth = Math.pow(2, zoom);
    return ((x % worldWidth) + worldWidth) % worldWidth;
  }
  _update() {
    if (!this._map) return;
    const zoom = Math.round(this._map.getZoom());
    const bounds = this._map.getPixelBounds();
    const tileSize = this._options.tileSize;
    const nwTile = bounds.min.divideBy(tileSize).floor();
    const seTile = bounds.max.divideBy(tileSize).ceil();
    const tilesToLoad = {};

    for (let x = nwTile.x; x <= seTile.x; x++) {
      for (let y = nwTile.y; y <= seTile.y; y++) {
        const wx = this._wrapX(x, zoom);
        const key = `${wx}:${y}:${zoom}`;
        tilesToLoad[key] = { x: wx, y, z: zoom };
      }
    }

    // Remove old tiles
    for (const key in this._tiles) {
      if (!(key in tilesToLoad)) {
        this._container.removeChild(this._tiles[key]);
        delete this._tiles[key];
      }
    }

    // Add new tiles
    for (const key in tilesToLoad) {
      if (!(key in this._tiles)) {
        const coords = tilesToLoad[key];
        const tile = DomUtil.create('img', 'atlas-tile');
        tile.style.position = 'absolute';
        tile.style.width = tileSize + 'px';
        tile.style.height = tileSize + 'px';
        tile.style.left = (coords.x * tileSize) + 'px';
        tile.style.top = (coords.y * tileSize) + 'px';
        tile.src = this._getTileUrl(coords);
        tile.loading = true;
        tile.onload = () => { tile.loading = false; };
        tile.onerror = () => { tile.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='; };
        this._container.appendChild(tile);
        this._tiles[key] = tile;
      }
    }

    // Update container transform
    const center = this._map.getCenter();
    const pixelOrigin = this._map._getNewPixelOrigin(center, zoom);
    const offset = pixelOrigin.multiplyBy(-1);
    const scale = this._map.getZoomScale(zoom, this._map._zoom);
    DomUtil.setTransform(this._container, offset, scale);
  }
}

// ---------- GEOJSON SUPPORT ----------
function geoJSON(data, options = {}) {
  const layers = [];
  function process(feature) {
    if (feature.type === 'FeatureCollection') {
      feature.features.forEach(process);
    } else if (feature.type === 'Feature') {
      const geom = feature.geometry;
      if (geom.type === 'Point') {
        const ll = new LatLng(geom.coordinates[1], geom.coordinates[0]);
        const marker = new Marker(ll, options);
        if (options.onEachFeature) options.onEachFeature(feature, marker);
        layers.push(marker);
      }
    }
  }
  if (data.type === 'Feature') {
    process(data);
  } else {
    process({ type: 'FeatureCollection', features: [data] });
  }
  return new LayerGroup(layers);
}

class LayerGroup extends Layer {
  constructor(layers = []) {
    super();
    this._layers = layers;
  }
  onAdd(map) {
    this._map = map;
    this._layers.forEach(layer => layer.addTo(map));
  }
  onRemove() {
    this._layers.forEach(layer => layer.remove());
    delete this._map;
  }
}

// ---------- CONTROLS ----------
class Control {
  constructor(options = {}) {
    this._options = options;
  }
  getPosition() { return this._options.position || 'topright'; }
  addTo(map) {
    this._map = map;
    this._container = this.onAdd(map);
    const pos = this.getPosition();
    const corner = map._controlCorners[pos];
    corner.appendChild(this._container);
    return this;
  }
}

class ZoomControl extends Control {
  onAdd(map) {
    const container = DomUtil.create('div', 'atlas-zoom-control');
    const zoomIn = DomUtil.create('button', '', container);
    const zoomOut = DomUtil.create('button', '', container);
    zoomIn.innerHTML = '+';
    zoomOut.innerHTML = '–';
    zoomIn.onclick = () => map.zoomIn();
    zoomOut.onclick = () => map.zoomOut();
    container.style.position = 'absolute';
    container.style.zIndex = '1000';
    Object.assign(container.style, {
      top: '10px', right: '10px', display: 'flex', flexDirection: 'column'
    });
    Object.assign(zoomIn.style, zoomOut.style, {
      width: '30px', height: '30px', cursor: 'pointer'
    });
    return container;
  }
}

class AttributionControl extends Control {
  onAdd(map) {
    const container = DomUtil.create('div', 'atlas-attribution');
    container.innerHTML = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | <a href="https://atlas.js.org">Atlas</a>';
    container.style.cssText = `
      position: absolute; bottom: 0; right: 0; background: rgba(255,255,255,0.7);
      padding: 2px 5px; font-size: 11px; z-index: 1000;
    `;
    return container;
  }
}

// ---------- MAP ----------
class Map extends Evented {
  constructor(container, options = {}) {
    super();
    this._container = DomUtil.get(container);
    this._container.style.position = 'relative';
    this._initLayout();
    this._initControls();
    this.setView(options.center || [0, 0], options.zoom !== undefined ? options.zoom : 1);
    if (options.layers) options.layers.forEach(layer => layer.addTo(this));
  }

  _initLayout() {
    this._mapPane = DomUtil.create('div', 'atlas-map-pane', this._container);
    this._mapPane.style.cssText = 'position:absolute;top:0;left:0;overflow:hidden;';
  }

  _initControls() {
    this._controlContainer = DomUtil.create('div', '', this._container);
    const positions = ['topleft', 'topright', 'bottomleft', 'bottomright'];
    this._controlCorners = {};
    for (const pos of positions) {
      this._controlCorners[pos] = DomUtil.create('div', '', this._controlContainer);
      const style = this._controlCorners[pos].style;
      style.position = 'absolute';
      if (pos.includes('top')) style.top = '10px'; else style.bottom = '10px';
      if (pos.includes('left')) style.left = '10px'; else style.right = '10px';
    }
    new ZoomControl().addTo(this);
    new AttributionControl().addTo(this);
  }

  // --- Projection ---
  project(latlng, zoom = this._zoom) {
    const point = CRS.project(latlng);
    return point.multiplyBy(CRS.scale(zoom) / earthRadius);
  }
  unproject(point, zoom = this._zoom) {
    const scaled = point.divideBy(CRS.scale(zoom) / earthRadius);
    return CRS.unproject(scaled);
  }

  // --- Coordinate conversions ---
  latLngToContainerPoint(latlng) {
    const p = this.project(latlng).subtract(this._pixelOrigin);
    return p.round();
  }
  containerPointToLatLng(point) {
    return this.unproject(point.add(this._pixelOrigin));
  }

  // --- View control ---
  getZoom() { return this._zoom; }
  getCenter() { return this._center; }
  getPixelBounds() {
    const size = this.getSize();
    const nw = this._pixelOrigin;
    return new Bounds(nw, nw.add(size));
  }
  getSize() {
    return new Point(this._container.clientWidth, this._container.clientHeight);
  }
  getPixelOrigin() { return this._pixelOrigin; }
  getZoomScale(toZoom, fromZoom = this._zoom) {
    return CRS.scale(toZoom) / CRS.scale(fromZoom);
  }

  setView(latlng, zoom) {
    this._center = latlng instanceof LatLng ? latlng : new LatLng(...latlng);
    this._zoom = zoom;
    this._pixelOrigin = this.project(this._center)
      .subtract(this.getSize().divideBy(2));
    this._resetView();
    return this;
  }

  panBy(offset, options = {}) {
    const newPos = this._getMapPanePos().subtract(new Point(offset[0], offset[1]));
    if (options.animate !== false) {
      if (!this._panAnim) this._panAnim = new PosAnimation();
      this._panAnim.run(this._mapPane, newPos, options.duration);
    } else {
      DomUtil.setPosition(this._mapPane, newPos);
    }
    this.fire('moveend');
    return this;
  }

  panTo(latlng, options = {}) {
    const from = this.latLngToContainerPoint(this._center);
    const to = this.latLngToContainerPoint(latlng);
    const offset = to.subtract(from);
    return this.panBy([offset.x, offset.y], options);
  }

  zoomIn(delta = 1) { return this.setZoom(this._zoom + delta); }
  zoomOut(delta = 1) { return this.setZoom(this._zoom - delta); }
  setZoom(zoom) {
    return this.setView(this._center, zoom);
  }

  _resetView() {
    DomUtil.setPosition(this._mapPane, new Point(0, 0));
    this._updateLayers();
    this.fire('moveend');
  }

  _getMapPanePos() {
    return DomUtil.getPosition(this._mapPane);
  }

  _getNewPixelOrigin(center, zoom) {
    const viewHalf = this.getSize().divideBy(2);
    return this.project(center, zoom).subtract(viewHalf);
  }

  // --- Layer management ---
  addLayer(layer) {
    const id = Util.stamp(layer);
    this._layers = this._layers || {};
    this._layers[id] = layer;
    if (layer.onAdd) layer.onAdd(this);
    return this;
  }
  removeLayer(layer) {
    const id = Util.stamp(layer);
    if (this._layers?.[id]) {
      if (layer.onRemove) layer.onRemove();
      delete this._layers[id];
    }
    return this;
  }
  _updateLayers() {
    for (const id in this._layers) {
      const layer = this._layers[id];
      if (layer.update) layer.update();
    }
  }
}

// ---------- EXPORTS ----------
const Atlas = {
  Map,
  Layer,
  Marker,
  Popup,
  Tooltip,
  TileLayer,
  LayerGroup,
  geoJSON,
  Point,
  LatLng,
  Bounds,
  DomUtil,
  Util,
  map: (id, opts) => new Map(id, opts),
  marker: (latlng, opts) => new Marker(latlng, opts),
  tileLayer: (url, opts) => new TileLayer(url, opts),
  geoJSON
};

if (typeof window !== 'undefined') window.Atlas = Atlas;
export default Atlas;
