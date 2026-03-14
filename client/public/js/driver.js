// ============================================================
// ZAK TRANSPORT — Driver App JS
// ============================================================

ZakAuth.requireAuth();

const API = '';
let currentTrip = null;
let currentStopIndex = 0;
let shiftStarted = false;

// ── INIT ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  loadProfile();
  await loadTodayTrip();
  startLocationTracking();

  // Show "Switch to Dispatch" button for multi-role users
  const user = ZakAuth.getUser();
  const canDispatch = (user?.roles || []).some(r => ['super_admin','admin','dispatcher'].includes(r));
  if (canDispatch) {
    const btn = document.getElementById('switchToDispatchBtn');
    if (btn) btn.style.display = '';
  }
});

// ── SCREEN NAVIGATION ─────────────────────────────────────
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById(`screen-${name}`)?.classList.add('active');
  document.getElementById(`tab-${name}`)?.classList.add('active');
}

// ── PROFILE ───────────────────────────────────────────────
function loadProfile() {
  const user = ZakAuth.getUser();
  if (!user) return;

  const initials = `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase();
  document.getElementById('profileAvatar').textContent = initials;
  document.getElementById('profileName').textContent = `${user.firstName} ${user.lastName}`;
  document.getElementById('profileEmail').textContent = user.email || '—';
  document.getElementById('profilePhone').textContent = user.phone || '—';
  document.getElementById('profileVehicle').textContent = user.driverInfo?.vehicleAssigned?.name || 'Not assigned';

  // Update header subtitle
  document.getElementById('headerSubtitle').textContent = `${user.firstName} ${user.lastName}`;
}

// ── LOAD TODAY'S TRIP ─────────────────────────────────────
async function loadTodayTrip() {
  const today = new Date().toISOString().split('T')[0];
  const res = await ZakAuth.apiFetch(`/api/trips/driver/my-trips?date=${today}`);

  if (!res?.success || res.trips.length === 0) {
    renderNoTrips();
    return;
  }

  // Use the first active or scheduled trip
  const trip = res.trips.find(t => t.status === 'in_progress') ||
               res.trips.find(t => t.status === 'scheduled') ||
               res.trips[0];

  window.appTrips = res.trips;
  currentTrip = trip;
  shiftStarted = trip.status === 'in_progress';

  // Update profile stats
  document.getElementById('profileTripsToday').textContent = res.trips.length;
  const totalRiders = res.trips.reduce((sum, t) => sum + (t.stops?.length || 0), 0);
  document.getElementById('profileRidersToday').textContent = totalRiders;

  renderRoute(trip);
}

async function refreshTrips() {
  const btn = document.getElementById('refreshBtn');
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
  await loadTodayTrip();
  btn.innerHTML = '<i class="fas fa-sync-alt"></i>';
  showToast('Route refreshed', 'success');
}

// ── RENDER ROUTE ──────────────────────────────────────────
function renderRoute(trip) {
  const container = document.getElementById('routeContent');
  if (!trip) { renderNoTrips(); return; }

  const stops = trip.stops || [];
  const completedCount = stops.filter(s => ['completed','no_show','canceled'].includes(s.status)).length;
  const totalCount = stops.length;

  // Find current active stop
  currentStopIndex = stops.findIndex(s => !['completed','no_show','canceled'].includes(s.status));

  let html = `
    <div class="route-header">
      <h3><i class="fas fa-route"></i> Today's Route</h3>
      <div class="route-meta">
        <span><i class="fas fa-shuttle-van"></i> ${trip.vehicle?.name || 'No vehicle'}</span>
        <span><i class="fas fa-map-pin"></i> ${totalCount} stop${totalCount !== 1 ? 's' : ''}</span>
        <span><i class="fas fa-check-circle"></i> ${completedCount}/${totalCount} done</span>
      </div>
      ${trip.status === 'scheduled' ? `
        <div style="margin-top:12px;">
          <button onclick="showScreen('start')" style="background:var(--gold);color:var(--gray-900);border:none;border-radius:10px;padding:10px 18px;font-size:14px;font-weight:700;cursor:pointer;width:100%;">
            <i class="fas fa-play"></i> Start Shift First
          </button>
        </div>
      ` : ''}
      ${!['canceled','completed'].includes(trip.status) ? `
        <div style="margin-top:8px;">
          <button onclick="driverCancelTrip('${trip._id}')" style="background:transparent;color:#e53e3e;border:1px solid #e53e3e;border-radius:10px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;width:100%;">
            <i class="fas fa-ban"></i> Cancel Trip (Passenger Request)
          </button>
        </div>
      ` : ''}
    </div>
  `;

  if (stops.length === 0) {
    html += `<div class="no-trips"><i class="fas fa-map-signs"></i><h3>No Stops</h3><p>This trip has no stops assigned yet.</p></div>`;
  } else {
    stops.forEach((stop, i) => {
      const isCurrent = i === currentStopIndex && trip.status === 'in_progress';
      const isDone = ['completed','no_show','canceled'].includes(stop.status);

      html += `
        <div class="stop-card ${isCurrent ? 'current' : ''} ${stop.status === 'completed' ? 'completed' : ''} ${stop.status === 'no_show' ? 'no_show' : ''}" id="stop-${stop._id}">
          <div class="stop-number">${i + 1}</div>
          <div class="stop-rider">
            ${stop.riderId?.firstName || 'Rider'} ${stop.riderId?.lastName || ''}
            ${isCurrent ? '<span style="font-size:12px;background:var(--gold);color:var(--gray-900);padding:2px 8px;border-radius:12px;margin-left:8px;">CURRENT</span>' : ''}
          </div>
          ${stop.riderId?.phone ? `
            <div class="stop-phone">
              <a href="tel:${stop.riderId.phone}"><i class="fas fa-phone"></i> ${stop.riderId.phone}</a>
            </div>
          ` : ''}
          <div class="stop-address">
            <i class="fas fa-map-pin"></i>
            <div>
              <div style="font-size:11px;color:var(--gray-500);font-weight:600;text-transform:uppercase;margin-bottom:2px;">Pickup</div>
              <div>${stop.pickupAddress || 'No address'}</div>
            </div>
          </div>
          <div class="stop-address" style="background:var(--danger-light);">
            <i class="fas fa-flag" style="color:var(--danger);"></i>
            <div>
              <div style="font-size:11px;color:var(--danger);font-weight:600;text-transform:uppercase;margin-bottom:2px;">Drop-off</div>
              <div>${stop.dropoffAddress || 'No address'}</div>
            </div>
          </div>
          ${stop.scheduledPickupTime ? `
            <div class="stop-time"><i class="fas fa-clock"></i> Pickup: ${formatTime(stop.scheduledPickupTime)}${stop.appointmentTime ? ` → Appt: ${formatTime(stop.appointmentTime)}` : ''}</div>
          ` : ''}
          ${stop.notes ? `<div class="stop-notes"><i class="fas fa-sticky-note"></i> ${stop.notes}</div>` : ''}
          ${stop.riderId?.notes ? `<div class="stop-notes"><i class="fas fa-info-circle"></i> ${stop.riderId.notes}</div>` : ''}

          ${isDone ? `
            <div class="stop-status-label ${stop.status}">
              ${stop.status === 'completed' ? '✅ Completed' : stop.status === 'no_show' ? '⚠️ No Show' : '❌ Canceled'}
            </div>
          ` : `
            <div class="stop-actions">
              ${stop.status === 'aboard' ? `
                <button class="stop-btn stop-btn-nav" onclick="navigateTo('${stop.dropoffAddress}','')">
                  <i class="fas fa-directions"></i> Navigate to Drop-off
                </button>
              ` : `
                <button class="stop-btn stop-btn-nav" onclick="navigateTo('${stop.pickupAddress}','')">
                  <i class="fas fa-directions"></i> Navigate to Pickup
                </button>
              `}
              ${stop.status === 'pending' ? `
                <button class="stop-btn" style="background:var(--gold);color:var(--gray-900);" onclick="updateStopStatus('${trip._id}','${stop._id}','en_route')">
                  <i class="fas fa-car"></i> En Route
                </button>
              ` : ''}
              ${stop.riderId?.phone ? `
                <button class="stop-btn stop-btn-call" onclick="callRider('${stop.riderId.phone}')">
                  <i class="fas fa-phone"></i> Call
                </button>
              ` : ''}
              ${stop.status !== 'aboard' ? `
                <button class="stop-btn stop-btn-aboard" onclick="updateStopStatus('${trip._id}','${stop._id}','aboard')">
                  <i class="fas fa-user-check"></i> Rider Aboard
                </button>
              ` : `
                <button class="stop-btn stop-btn-done" onclick="updateStopStatus('${trip._id}','${stop._id}','completed')">
                  <i class="fas fa-flag-checkered"></i> Dropped Off
                </button>
              `}
              <button class="stop-btn stop-btn-noshow" onclick="confirmNoShow('${trip._id}','${stop._id}')">
                <i class="fas fa-user-times"></i> No Show
              </button>
              <button class="stop-btn" style="background:transparent;color:#e53e3e;border:1px solid #e53e3e;" onclick="confirmCancelLeg('${trip._id}','${stop._id}','${stop.riderName || (stop.riderId?.firstName || 'Rider')}')">
                <i class="fas fa-times-circle"></i> Cancel Leg
              </button>
            </div>
          `}
        </div>
      `;
    });
  }

  // If all stops done, show end shift prompt
  const allDone = stops.length > 0 && stops.every(s => ['completed','no_show','canceled'].includes(s.status));
  if (allDone && trip.status !== 'completed') {
    html += `
      <div style="background:var(--green-pale);border:2px solid var(--green-light);border-radius:var(--radius);padding:20px;text-align:center;margin-top:8px;">
        <i class="fas fa-trophy" style="font-size:36px;color:var(--gold);margin-bottom:12px;display:block;"></i>
        <h3 style="color:var(--green);margin-bottom:8px;">Route Complete!</h3>
        <p style="font-size:14px;color:var(--gray-600);margin-bottom:16px;">All stops have been completed. Log your ending mileage to finish your shift.</p>
        <button class="btn-big btn-green" onclick="showScreen('end')" style="margin:0;">
          <i class="fas fa-flag-checkered"></i> End Shift
        </button>
      </div>
    `;
  }

  container.innerHTML = html;
}

function renderNoTrips() {
  document.getElementById('routeContent').innerHTML = `
    <div class="no-trips">
      <i class="fas fa-calendar-times"></i>
      <h3>No Trips Today</h3>
      <p>You have no trips scheduled for today.<br>Contact your dispatcher if you believe this is an error.</p>
    </div>
  `;
}

// ── STOP STATUS UPDATES ───────────────────────────────────
async function updateStopStatus(tripId, stopId, status) {
  const res = await ZakAuth.apiFetch(`/api/trips/${tripId}/stops/${stopId}/status`, {
    method: 'POST',
    body: JSON.stringify({ status })
  });

  if (res?.success) {
    currentTrip = res.trip;
    renderRoute(res.trip);

    const messages = {
      aboard:    '✅ Rider is aboard!',
      completed: '🏁 Rider dropped off!',
      no_show:   '⚠️ No show recorded',
      canceled:  'Stop canceled'
    };
    showToast(messages[status] || 'Status updated', status === 'no_show' ? 'error' : 'success');

    // Auto-navigate to next stop
    if (status === 'completed' || status === 'no_show') {
      const stops = res.trip.stops || [];
      const nextStop = stops.find(s => !['completed','no_show','canceled'].includes(s.status));
      if (nextStop) {
        setTimeout(() => {
          showToast(`Next: ${nextStop.riderId?.firstName || 'Rider'} — ${nextStop.pickupAddress}`, '');
        }, 1500);
      }
    }
  } else {
    showToast(res?.error || 'Failed to update status', 'error');
  }
}

function confirmNoShow(tripId, stopId) {
  if (confirm('Mark this rider as a no-show?')) {
    updateStopStatus(tripId, stopId, 'no_show');
  }
}

function confirmCancelLeg(tripId, stopId, riderName) {
  if (confirm(`Cancel this leg for ${riderName}? (The rider found another ride or no longer needs this stop.)\n\nThis only cancels this stop — the rest of the trip continues.`)) {
    updateStopStatus(tripId, stopId, 'canceled');
  }
}

async function driverCancelTrip(tripId) {
  const reason = prompt('Reason for cancellation (optional):');
  if (reason === null) return; // user pressed Cancel on prompt
  const res = await ZakAuth.apiFetch(`/api/trips/${tripId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason: reason || 'Canceled by driver' })
  });
  if (res?.success) {
    showToast('Trip canceled.', 'success');
    setTimeout(() => loadTodayTrip(), 1000);
  } else {
    showToast(res?.error || 'Failed to cancel trip.', 'error');
  }
}

// ── NAVIGATION ────────────────────────────────────────────
function navigateTo(pickupAddress, dropoffAddress) {
  // Build a route: current location -> pickup -> dropoff (if dropoff provided)
  const pickup = pickupAddress || '';
  const dropoff = dropoffAddress || '';
  if (!pickup && !dropoff) { showToast('No address available', 'error'); return; }

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  if (isIOS) {
    // iOS: build Google Maps URL with waypoint (pickup) and destination (dropoff)
    let googleMapsUrl, appleMapsUrl;
    if (pickup && dropoff && pickup !== dropoff) {
      // Route: current -> pickup -> dropoff
      googleMapsUrl = `comgooglemaps://?waypoints=${encodeURIComponent(pickup)}&daddr=${encodeURIComponent(dropoff)}&directionsmode=driving`;
      appleMapsUrl = `maps://?addr=${encodeURIComponent(pickup)}&daddr=${encodeURIComponent(dropoff)}&dirflg=d`;
    } else {
      const dest = pickup || dropoff;
      googleMapsUrl = `comgooglemaps://?daddr=${encodeURIComponent(dest)}&directionsmode=driving`;
      appleMapsUrl = `maps://?daddr=${encodeURIComponent(dest)}&dirflg=d`;
    }
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = googleMapsUrl;
    document.body.appendChild(iframe);
    setTimeout(() => document.body.removeChild(iframe), 500);
    setTimeout(() => { window.location.href = appleMapsUrl; }, 25);
  } else {
    // Android: Google Maps web URL supports waypoints
    let webUrl;
    if (pickup && dropoff && pickup !== dropoff) {
      webUrl = `https://www.google.com/maps/dir/?api=1&waypoints=${encodeURIComponent(pickup)}&destination=${encodeURIComponent(dropoff)}&travelmode=driving`;
    } else {
      const dest = pickup || dropoff;
      webUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&travelmode=driving`;
    }
    const intentUrl = webUrl.replace('https://', 'intent://').replace('www.google.com', 'maps.google.com') + '#Intent;scheme=https;package=com.google.android.apps.maps;end';
    try {
      window.location.href = intentUrl;
    } catch (e) {
      window.open(webUrl, '_blank');
    }
    setTimeout(() => {
      if (!document.hidden) window.open(webUrl, '_blank');
    }, 1500);
  }
}

function callRider(phone) {
  window.location.href = `tel:${phone}`;
}

// ── START SHIFT ───────────────────────────────────────────
function toggleCheck(el) {
  el.classList.toggle('checked');
}

function toggleDamageField() {
  const checked = document.getElementById('hasDamage').checked;
  document.getElementById('damageField').style.display = checked ? 'block' : 'none';
}

async function startShift() {
  if (!currentTrip) { showToast('No trip found for today', 'error'); return; }

  const startMileage = document.getElementById('startMileage').value;
  if (!startMileage) { showToast('Please enter your starting mileage', 'error'); return; }

  const checkedItems = document.querySelectorAll('.checklist-item.checked');
  if (checkedItems.length < 5) {
    if (!confirm('You have not completed all inspection items. Start anyway?')) return;
  }

  const inspectionDone = checkedItems.length >= 7;
  const hasDamage = document.getElementById('hasDamage').checked;
  const inspectionNotes = hasDamage ? document.getElementById('damageNotes').value : '';

  const res = await ZakAuth.apiFetch(`/api/trips/${currentTrip._id}/start`, {
    method: 'POST',
    body: JSON.stringify({
      startMileage: parseInt(startMileage),
      inspectionDone,
      inspectionNotes
    })
  });

  if (res?.success) {
    currentTrip = res.trip;
    shiftStarted = true;
    showToast('Shift started! Have a safe trip. 🚐', 'success');
    showScreen('route');
    renderRoute(res.trip);
  } else {
    showToast(res?.error || 'Failed to start shift', 'error');
  }
}

// ── END SHIFT ─────────────────────────────────────────────
async function endShift() {
  if (!currentTrip) { showToast('No active trip found', 'error'); return; }

  const endMileage = document.getElementById('endMileage').value;
  if (!endMileage) { showToast('Please enter your ending mileage', 'error'); return; }

  const res = await ZakAuth.apiFetch(`/api/trips/${currentTrip._id}/complete`, {
    method: 'POST',
    body: JSON.stringify({ endMileage: parseInt(endMileage) })
  });

  if (res?.success) {
    currentTrip = null;
    shiftStarted = false;
    showToast('Shift complete! Great work today. 🎉', 'success');
    showScreen('route');
    renderNoTrips();
  } else {
    showToast(res?.error || 'Failed to end shift', 'error');
  }
}

// ── GPS LOCATION TRACKING ─────────────────────────────────
function startLocationTracking() {
  if (!navigator.geolocation) return;

  navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      // Send location to server every 30 seconds if shift is active
      if (shiftStarted && currentTrip) {
        sendLocationUpdate(latitude, longitude);
      }
    },
    (err) => console.warn('GPS error:', err),
    { enableHighAccuracy: true, maximumAge: 15000, timeout: 10000 }
  );
}

let lastLocationSent = 0;
async function sendLocationUpdate(lat, lng) {
  const now = Date.now();
  if (now - lastLocationSent < 30000) return; // throttle to 30s
  lastLocationSent = now;

  // Update driver location via API (best effort, no error shown to driver)
  try {
    await ZakAuth.apiFetch('/api/trips/driver/location', {
      method: 'POST',
      body: JSON.stringify({ lat, lng })
    });
  } catch (e) { /* silent */ }
}

// ── HELPERS ───────────────────────────────────────────────
function formatTime(d) {
  if (!d) return '';
  return new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function showToast(msg, type = '') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast show ${type}`;
  setTimeout(() => toast.classList.remove('show'), 3500);
}

// ── EMBEDDED DRIVER MAP ───────────────────────────────────
let driverMapInstance = null;
let driverMapMarkers = [];
let driverMapRouteLayer = null;
let driverLocationMarker = null;

function initDriverMap() {
  // Only init once
  if (driverMapInstance) {
    driverMapInstance.invalidateSize();
    refreshDriverMap();
    return;
  }
  driverMapInstance = L.map('driverMap', { zoomControl: true }).setView([27.9944, -81.7603], 10);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 18
  }).addTo(driverMapInstance);

  // Watch driver location and update marker
  if (navigator.geolocation) {
    navigator.geolocation.watchPosition(pos => {
      const { latitude: lat, longitude: lng } = pos.coords;
      if (!driverLocationMarker) {
        const vanIcon = L.divIcon({
          html: '<div style="background:#1B5E20;color:#FFC107;border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:18px;border:3px solid #FFC107;box-shadow:0 2px 8px rgba(0,0,0,0.4);">🚐</div>',
          iconSize: [36, 36], iconAnchor: [18, 18], className: ''
        });
        driverLocationMarker = L.marker([lat, lng], { icon: vanIcon, zIndexOffset: 1000 }).addTo(driverMapInstance);
        driverLocationMarker.bindPopup('Your Location');
      } else {
        driverLocationMarker.setLatLng([lat, lng]);
      }
      sendLocationUpdate(lat, lng);
    }, null, { enableHighAccuracy: true, maximumAge: 10000 });
  }

  refreshDriverMap();
}

async function refreshDriverMap() {
  if (!driverMapInstance || !window.appTrips || window.appTrips.length === 0) {
    document.getElementById('mapInfoBar').textContent = '📍 No trips to show';
    return;
  }

  // Clear old markers and route
  driverMapMarkers.forEach(m => driverMapInstance.removeLayer(m));
  driverMapMarkers = [];
  if (driverMapRouteLayer) { driverMapInstance.removeLayer(driverMapRouteLayer); driverMapRouteLayer = null; }

  const trip = window.appTrips[0]; // Show first active trip
  const stops = (trip.stops || []).filter(s => !['completed','no_show','canceled'].includes(s.status));
  if (stops.length === 0) {
    document.getElementById('mapInfoBar').textContent = '✅ All stops completed';
    return;
  }

  // Geocode all stop addresses and place markers
  const bounds = [];
  const geocodeCache = {};

  async function geocode(address) {
    if (!address) return null;
    if (geocodeCache[address]) return geocodeCache[address];
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`, { headers: { 'Accept-Language': 'en' } });
      const d = await r.json();
      if (d && d[0]) { geocodeCache[address] = [parseFloat(d[0].lat), parseFloat(d[0].lon)]; return geocodeCache[address]; }
    } catch(e) {}
    return null;
  }

  const waypoints = [];
  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i];
    const pickupCoords = await geocode(stop.pickupAddress);
    const dropoffCoords = await geocode(stop.dropoffAddress);

    if (pickupCoords) {
      const pickupIcon = L.divIcon({
        html: `<div style="background:#2E7D32;color:white;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);">${i+1}</div>`,
        iconSize: [28, 28], iconAnchor: [14, 14], className: ''
      });
      const m = L.marker(pickupCoords, { icon: pickupIcon }).addTo(driverMapInstance);
      m.bindPopup(`<b>Stop ${i+1} Pickup</b><br>${stop.riderId?.firstName || 'Rider'} ${stop.riderId?.lastName || ''}<br>${stop.pickupAddress}`);
      driverMapMarkers.push(m);
      bounds.push(pickupCoords);
      waypoints.push(pickupCoords);
    }
    if (dropoffCoords) {
      const dropoffIcon = L.divIcon({
        html: `<div style="background:#EF4444;color:white;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);">D</div>`,
        iconSize: [28, 28], iconAnchor: [14, 14], className: ''
      });
      const m = L.marker(dropoffCoords, { icon: dropoffIcon }).addTo(driverMapInstance);
      m.bindPopup(`<b>Stop ${i+1} Drop-off</b><br>${stop.riderId?.firstName || 'Rider'} ${stop.riderId?.lastName || ''}<br>${stop.dropoffAddress}`);
      driverMapMarkers.push(m);
      bounds.push(dropoffCoords);
      waypoints.push(dropoffCoords);
    }
  }

  // Draw route line via OSRM
  if (waypoints.length >= 2) {
    try {
      const coordStr = waypoints.map(([lat, lng]) => `${lng},${lat}`).join(';');
      const osrmRes = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`);
      const osrmData = await osrmRes.json();
      if (osrmData.routes && osrmData.routes[0]) {
        driverMapRouteLayer = L.geoJSON(osrmData.routes[0].geometry, {
          style: { color: '#2E7D32', weight: 4, opacity: 0.8, dashArray: '8,4' }
        }).addTo(driverMapInstance);
        const dist = (osrmData.routes[0].distance / 1609.34).toFixed(1);
        const mins = Math.round(osrmData.routes[0].duration / 60);
        document.getElementById('mapInfoBar').textContent = `🗺 ${stops.length} stop${stops.length > 1 ? 's' : ''} · ${dist} mi · ~${mins} min`;
      }
    } catch(e) {
      document.getElementById('mapInfoBar').textContent = `📍 ${stops.length} stop${stops.length > 1 ? 's' : ''} remaining`;
    }
  }

  // Add driver location to bounds if available
  if (driverLocationMarker) bounds.push(driverLocationMarker.getLatLng());

  if (bounds.length > 0) {
    driverMapInstance.fitBounds(bounds, { padding: [30, 30] });
  }
}
