// demo.js — Atlas.js usage example

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
  // Create a map centered on London with zoom level 12
  const map = Atlas.map('map', {
    center: [51.505, -0.09],
    zoom: 12,
    layers: [
      Atlas.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      })
    ]
  });

  // Add a marker with popup and tooltip
  const marker = Atlas.marker([51.5, -0.09])
    .bindPopup('Hello from <b>Atlas.js</b>!')
    .bindTooltip('Click me!')
    .addTo(map);

  // Add a GeoJSON point
  const geojsonFeature = {
    type: 'Feature',
    properties: {
      name: 'GeoJSON Point'
    },
    geometry: {
      type: 'Point',
      coordinates: [-0.1, 51.51] // [lng, lat]
    }
  };

  Atlas.geoJSON(geojsonFeature, {
    onEachFeature: (feature, layer) => {
      layer.bindPopup(`<b>${feature.properties.name}</b>`);
    }
  }).addTo(map);

  // Optional: Add a circle marker
  Atlas.circleMarker([51.51, -0.12], {
    radius: 10,
    fillColor: '#ff7800',
    color: '#000',
    weight: 1,
    opacity: 1,
    fillOpacity: 0.8
  }).addTo(map).bindPopup('A circle marker!');

  console.log('Atlas.js demo loaded!');
});
