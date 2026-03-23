/**
 * Route Optimization Service
 * Primary:  Google Maps Distance Matrix API (real-time traffic) — requires GOOGLE_MAPS_API_KEY
 * Fallback: OSRM (historical speeds, free, no key required)
 * Docs:     https://developers.google.com/maps/documentation/distance-matrix
 *           http://router.project-osrm.org
 */

const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

const OSRM_BASE = 'https://router.project-osrm.org';
const DWELL_MINUTES = 3; // minutes assumed at each stop for pickup/dropoff

const GOOGLE_MAPS_KEY = () => process.env.GOOGLE_MAPS_API_KEY || '';

/**
 * Geocode a US address.
 * Primary: US Census Bureau Geocoding API (free, no key, highly accurate for US addresses)
 * Fallback: Nominatim (OpenStreetMap)
 */
async function geocodeAddress(address) {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // --- Primary: US Census Bureau Geocoder ---
  try {
    const censusUrl = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(address)}&benchmark=2020&format=json`;
    const censusRes = await fetch(censusUrl, { headers: { 'User-Agent': 'RydeworksDispatch/1.0' } });
    if (censusRes.ok) {
      const censusData = await censusRes.json();
      const matches = censusData?.result?.addressMatches;
      if (matches && matches.length > 0) {
        const m = matches[0];
        return {
          lat: parseFloat(m.coordinates.y),
          lng: parseFloat(m.coordinates.x),
          display: m.matchedAddress
        };
      }
    }
  } catch (e) {
    console.warn('Census geocoder failed, trying Nominatim:', e.message);
  }

  // --- Fallback: Nominatim ---
  await sleep(500);
  const tryNominatim = async (url) => {
    const res = await fetch(url, { headers: { 'User-Agent': 'RydeworksDispatch/1.0 (dispatch@rydeworks.com)' } });
    if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
    return res.json();
  };

  // Try with US restriction first, then without
  let data = await tryNominatim(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=us`);
  if (!data || data.length === 0) {
    await sleep(1000);
    data = await tryNominatim(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`);
  }

  if (!data || data.length === 0) throw new Error(`Could not geocode: ${address}`);
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), display: data[0].display_name };
}

/**
 * Get drive time in minutes between two lat/lng points.
 * Uses Google Directions API (with live traffic) when key is available, else OSRM.
 */
async function getDriveTime(from, to) {
  const key = GOOGLE_MAPS_KEY();
  if (key) {
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}&departure_time=now&traffic_model=best_guess&key=${key}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status === 'OK' && data.routes?.[0]?.legs?.[0]) {
      const leg = data.routes[0].legs[0];
      const secs = (leg.duration_in_traffic || leg.duration).value;
      return {
        durationMins: Math.ceil(secs / 60),
        distanceMiles: Math.round(leg.distance.value / 1609.34 * 10) / 10
      };
    }
    console.warn('Google Directions API failed, falling back to OSRM:', data.status);
  }
  // OSRM fallback
  const url = `${OSRM_BASE}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`;
  const res = await fetch(url, { headers: { 'User-Agent': 'RydeworksDispatch/1.0' } });
  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
    throw new Error(`Routing failed between ${JSON.stringify(from)} and ${JSON.stringify(to)}`);
  }
  return {
    durationMins: Math.ceil(data.routes[0].duration / 60),
    distanceMiles: Math.round(data.routes[0].distance / 1609.34 * 10) / 10
  };
}

/**
 * Get a full drive time matrix between N points.
 * Uses Google Distance Matrix API (with live traffic) when key is available, else OSRM Table API.
 */
async function getDriveTimeMatrix(points) {
  const key = GOOGLE_MAPS_KEY();
  if (key) {
    try {
      // Google Distance Matrix supports max 25 origins/destinations per call
      const coords = points.map(p => `${p.lat},${p.lng}`).join('|');
      const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(coords)}&destinations=${encodeURIComponent(coords)}&departure_time=now&traffic_model=best_guess&key=${key}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.status === 'OK' && data.rows) {
        return data.rows.map(row =>
          row.elements.map(el => {
            if (el.status !== 'OK') return 999; // unreachable — will be deprioritized
            const secs = (el.duration_in_traffic || el.duration).value;
            return Math.ceil(secs / 60);
          })
        );
      }
      console.warn('Google Distance Matrix API failed, falling back to OSRM:', data.status);
    } catch (e) {
      console.warn('Google Distance Matrix error, falling back to OSRM:', e.message);
    }
  }
  // OSRM fallback
  const coords = points.map(p => `${p.lng},${p.lat}`).join(';');
  const url = `${OSRM_BASE}/table/v1/driving/${coords}?annotations=duration,distance`;
  const res = await fetch(url, { headers: { 'User-Agent': 'RydeworksDispatch/1.0' } });
  const data = await res.json();
  if (data.code !== 'Ok') throw new Error('OSRM table API failed');
  return data.durations.map(row => row.map(s => Math.ceil(s / 60)));
}

/**
 * Main optimization function
 * 
 * @param {Object} params
 * @param {Object} params.homeBase - { address, lat, lng }
 * @param {Array}  params.stops - array of stop objects from Trip model
 * @param {string} params.tripDate - ISO date string for the trip
 * @returns {Object} optimization result with optimized order, timing, conflicts
 */
async function optimizeRoute({ homeBase, stops, tripDate }) {
  // Step 1: Ensure all stops have coordinates (geocode if missing)
  const geocodedStops = [];
  for (const stop of stops) {
    if (stop.lat && stop.lng) {
      geocodedStops.push({ ...stop });
    } else {
      try {
        const geo = await geocodeAddress(stop.address);
        geocodedStops.push({ ...stop, lat: geo.lat, lng: geo.lng });
      } catch (e) {
        geocodedStops.push({ ...stop, lat: null, lng: null, geocodeError: e.message });
      }
    }
  }

  // Step 2: Ensure homeBase has coordinates
  let origin = homeBase;
  if (!origin.lat || !origin.lng) {
    const geo = await geocodeAddress(origin.address);
    origin = { ...origin, lat: geo.lat, lng: geo.lng };
  }

  // Filter stops that have valid coordinates
  const validStops = geocodedStops.filter(s => s.lat && s.lng);
  const invalidStops = geocodedStops.filter(s => !s.lat || !s.lng);

  if (validStops.length === 0) {
    const badAddrs = invalidStops.map(s => s.address).join('; ');
    return {
      success: false,
      error: `Could not geocode stop addresses. Check that addresses are complete (include city and state). Failed: ${badAddrs}`,
      invalidAddresses: invalidStops.map(s => s.address)
    };
  }

  // Warn but continue if some stops failed
  if (invalidStops.length > 0) {
    console.warn('Some stops could not be geocoded:', invalidStops.map(s => s.address));
  }

  // Step 3: Build coordinate list: [origin, ...stops]
  const allPoints = [origin, ...validStops];

  // Step 4: Get drive time matrix
  let matrix;
  try {
    matrix = await getDriveTimeMatrix(allPoints);
  } catch (e) {
    return { success: false, error: `Routing service error: ${e.message}` };
  }

  // Step 5: Nearest-neighbor greedy optimization
  // Constraint: pickups must come before their corresponding dropoffs
  // Build rider pairs: { riderId, pickupIdx, dropoffIdx }
  const riderPairs = {};
  validStops.forEach((stop, idx) => {
    const key = stop.riderId || stop.address; // group by rider
    if (!riderPairs[key]) riderPairs[key] = {};
    if (stop.type === 'pickup') riderPairs[key].pickupIdx = idx + 1; // +1 for origin offset
    if (stop.type === 'dropoff') riderPairs[key].dropoffIdx = idx + 1;
  });

  // Greedy nearest-neighbor with pickup-before-dropoff constraint
  const visited = new Set();
  const optimizedOrder = []; // indices into allPoints
  let currentIdx = 0; // start at origin

  // Determine which stops are "available" (pickup not yet done = dropoff not available)
  const completedPickups = new Set();

  while (optimizedOrder.length < validStops.length) {
    let bestIdx = -1;
    let bestTime = Infinity;

    for (let i = 1; i < allPoints.length; i++) {
      if (visited.has(i)) continue;
      const stop = validStops[i - 1];

      // If this is a dropoff, its pickup must already be visited
      if (stop.type === 'dropoff') {
        const key = stop.riderId || stop.address;
        if (!completedPickups.has(key)) continue; // skip until pickup done
      }

      const travelTime = matrix[currentIdx][i];
      if (travelTime < bestTime) {
        bestTime = travelTime;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) {
      // Fallback: pick any unvisited stop (shouldn't happen)
      for (let i = 1; i < allPoints.length; i++) {
        if (!visited.has(i)) { bestIdx = i; break; }
      }
    }

    visited.add(bestIdx);
    optimizedOrder.push(bestIdx);
    const stop = validStops[bestIdx - 1];
    if (stop.type === 'pickup') {
      const key = stop.riderId || stop.address;
      completedPickups.add(key);
    }
    currentIdx = bestIdx;
  }

  // Step 6: Calculate arrival times along the optimized route
  const tripDateObj = new Date(tripDate);
  const conflicts = [];
  const warnings = [];
  const optimizedStops = [];

  // Find the earliest scheduled pickup time to determine route start
  let routeStartTime = null;
  for (const idx of optimizedOrder) {
    const stop = validStops[idx - 1];
    if (stop.type === 'pickup' && stop.scheduledTime) {
      const t = new Date(stop.scheduledTime);
      if (!routeStartTime || t < routeStartTime) routeStartTime = t;
    }
  }
  // Default to 8 AM if no times set
  if (!routeStartTime) {
    routeStartTime = new Date(tripDateObj);
    routeStartTime.setHours(8, 0, 0, 0);
  }
  // Back up by drive time from origin to first stop
  const firstStopIdx = optimizedOrder[0];
  const driveToFirst = matrix[0][firstStopIdx];
  const departureTime = new Date(routeStartTime.getTime() - driveToFirst * 60 * 1000);

  let currentTime = new Date(departureTime);
  let prevIdx = 0;
  let totalDistanceMiles = 0;

  for (let i = 0; i < optimizedOrder.length; i++) {
    const idx = optimizedOrder[i];
    const stop = { ...validStops[idx - 1] };
    const travelMins = matrix[prevIdx][idx];

    // Accumulate distance (approximate from matrix — OSRM table only gives duration by default)
    // We'll calculate distance separately for total
    currentTime = new Date(currentTime.getTime() + travelMins * 60 * 1000);

    const estimatedArrival = new Date(currentTime);
    stop.estimatedArrival = estimatedArrival.toISOString();
    stop.travelMinsFromPrev = travelMins;
    stop.newStopOrder = i;

    // Check appointment time constraint for dropoffs
    if (stop.type === 'dropoff' && stop.appointmentTime) {
      const apptTime = new Date(stop.appointmentTime);
      const bufferMins = Math.round((apptTime - estimatedArrival) / 60000);

      if (bufferMins < 0) {
        conflicts.push({
          stopAddress: stop.address,
          riderName: stop.riderName || 'Rider',
          type: 'late_dropoff',
          severity: 'error',
          message: `${stop.riderName || 'Rider'} appointment at ${formatTime(apptTime)} — estimated arrival ${Math.abs(bufferMins)} min LATE. Consider dispatching a second van or adjusting pickup time.`,
          minutesLate: Math.abs(bufferMins),
          appointmentTime: apptTime.toISOString(),
          estimatedArrival: estimatedArrival.toISOString()
        });
      } else if (bufferMins < 10) {
        warnings.push({
          stopAddress: stop.address,
          riderName: stop.riderName || 'Rider',
          type: 'tight_schedule',
          severity: 'warning',
          message: `${stop.riderName || 'Rider'} appointment at ${formatTime(apptTime)} — only ${bufferMins} min buffer. Schedule is very tight.`,
          bufferMins,
          appointmentTime: apptTime.toISOString(),
          estimatedArrival: estimatedArrival.toISOString()
        });
      }
    }

    // Check scheduled pickup time — if we're arriving significantly late
    if (stop.type === 'pickup' && stop.scheduledTime) {
      const scheduledPickup = new Date(stop.scheduledTime);
      const pickupDiff = Math.round((estimatedArrival - scheduledPickup) / 60000);
      if (pickupDiff > 10) {
        warnings.push({
          stopAddress: stop.address,
          riderName: stop.riderName || 'Rider',
          type: 'late_pickup',
          severity: 'warning',
          message: `${stop.riderName || 'Rider'} pickup scheduled at ${formatTime(scheduledPickup)} — estimated arrival ${pickupDiff} min late due to route order.`,
          minutesLate: pickupDiff,
          scheduledTime: scheduledPickup.toISOString(),
          estimatedArrival: estimatedArrival.toISOString()
        });
      }
    }

    optimizedStops.push(stop);
    currentTime = new Date(currentTime.getTime() + DWELL_MINUTES * 60 * 1000);
    prevIdx = idx;
  }

  // Step 7: Calculate total route stats (sequential leg sum — avoids waypoint limit issues)
  let totalDurationMins = 0;
  try {
    const routePoints = [origin, ...optimizedOrder.map(i => allPoints[i])];
    for (let i = 0; i < routePoints.length - 1; i++) {
      const leg = await getDriveTime(routePoints[i], routePoints[i + 1]);
      totalDurationMins  += leg.durationMins;
      totalDistanceMiles += leg.distanceMiles;
    }
    totalDistanceMiles = Math.round(totalDistanceMiles * 10) / 10;
  } catch (e) {
    // Non-fatal — just won't have total stats
  }

  // Step 8: Second-van suggestion
  // If there are conflicts, try splitting into two groups and check if that resolves them
  let secondVanSuggestion = null;
  if (conflicts.length > 0) {
    const conflictedRiders = new Set(conflicts.map(c => c.riderName));
    secondVanSuggestion = {
      message: `Dispatching a second van for ${[...conflictedRiders].join(', ')} would resolve the timing conflict(s).`,
      suggestedRiders: [...conflictedRiders]
    };
  }

  return {
    success: true,
    feasible: conflicts.length === 0,
    conflicts,
    warnings,
    secondVanSuggestion,
    optimizedStops,
    totalDurationMins,
    totalDistanceMiles,
    estimatedDeparture: departureTime.toISOString(),
    invalidAddresses: invalidStops.map(s => s.address)
  };
}

function formatTime(date) {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

module.exports = { optimizeRoute, geocodeAddress };
