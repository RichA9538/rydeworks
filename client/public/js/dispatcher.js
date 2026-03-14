// ============================================================
// ZAK TRANSPORT — Dispatcher Dashboard JS
// ============================================================

// Auth guard
ZakAuth.requireAuth();
if (!ZakAuth.hasRole('dispatcher') && !ZakAuth.hasRole('admin') && !ZakAuth.hasRole('super_admin')) {
  window.location.href = '/driver.html';
}

const API = '';
let dispatchMap = null;
let driverMarkers = {};
let stopMarkers = [];
let routeLines = [];
const geocodeCache = {};
let appData = { drivers: [], vehicles: [], grants: [], partners: [], org: null };
let riderCount = 0;

// ── INIT ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  updateDateDisplay();
  setupNavigation();
  setupMobileMenu();
  hideAdminOnlyIfNeeded();
  await loadAppData();
  loadDashboard();
  setInterval(refreshActiveTrips, 30000); // refresh every 30s
});

function updateDateDisplay() {
  const el = document.getElementById('dateDisplay');
  if (el) {
    el.textContent = new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
  }
  // Set today as default date for trip scheduling
  const tripDateEl = document.getElementById('tripDate');
  if (tripDateEl) tripDateEl.value = new Date().toISOString().split('T')[0];
}

function hideAdminOnlyIfNeeded() {
  if (!ZakAuth.hasRole('admin') && !ZakAuth.hasRole('super_admin')) {
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
  }
  // Show Super Admin link only for super_admin role
  if (ZakAuth.hasRole('super_admin')) {
    const nav  = document.getElementById('superAdminNav');
    const link = document.getElementById('superAdminLink');
    if (nav)  nav.style.display  = '';
    if (link) link.style.display = '';
  }
}

// ── NAVIGATION ────────────────────────────────────────────
function setupNavigation() {
  document.querySelectorAll('.nav-link[data-view]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      showView(link.dataset.view);
    });
  });
}

function showView(viewName) {
  // Update nav
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  const activeLink = document.querySelector(`.nav-link[data-view="${viewName}"]`);
  if (activeLink) activeLink.classList.add('active');

  // Update views
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const view = document.getElementById(`view-${viewName}`);
  if (view) view.classList.add('active');

  // Update page title
  const titles = {
    dashboard: 'Dashboard', schedule: 'Schedule Trip', recurring: 'Recurring Trips', trips: 'All Trips',
    map: 'Live Map', riders: 'Riders', team: 'Team', payments: 'Payments',
    reports: 'Reports', codes: 'Free Ride Codes', canceled: 'Canceled Trips', admin: 'Admin Settings'
  };
  const titleEl = document.getElementById('pageTitle');
  if (titleEl) titleEl.textContent = titles[viewName] || viewName;

  // Load view-specific data
  if (viewName === 'dashboard') loadDashboard();
  if (viewName === 'trips')     loadTrips();
  if (viewName === 'map')       initMap();
  if (viewName === 'riders')    loadRiders();
  if (viewName === 'team')      loadTeam();
  if (viewName === 'payments')  loadPayments();
  if (viewName === 'codes')     loadCodes();
  if (viewName === 'canceled')  loadCanceledTrips();
  if (viewName === 'admin')     loadAdminSettings();
  if (viewName === 'recurring') initRecurringView();

  // Close mobile menu
  document.getElementById('sidebar')?.classList.remove('open');
}

function setupMobileMenu() {
  const btn = document.getElementById('mobileMenuBtn');
  const sidebar = document.getElementById('sidebar');
  const toggle = document.getElementById('sidebarToggle');
  if (btn) btn.addEventListener('click', () => sidebar?.classList.toggle('open'));
  if (toggle) toggle.addEventListener('click', () => sidebar?.classList.remove('open'));
}

// ── LOAD APP DATA ─────────────────────────────────────────
async function loadAppData() {
  try {
    const [driversRes, vehiclesRes, grantsRes, partnersRes, orgRes] = await Promise.all([
      ZakAuth.apiFetch('/api/admin/users'),
      ZakAuth.apiFetch('/api/admin/vehicles'),
      ZakAuth.apiFetch('/api/admin/grants'),
      ZakAuth.apiFetch('/api/admin/partners'),
      ZakAuth.apiFetch('/api/admin/org')
    ]);

    if (driversRes?.success) {
      appData.drivers = driversRes.users.filter(u => u.roles?.includes('driver'));
    }
    if (vehiclesRes?.success) appData.vehicles = vehiclesRes.vehicles;
    if (grantsRes?.success)   appData.grants   = grantsRes.grants;
    if (partnersRes?.success) appData.partners  = partnersRes.partners;
    if (orgRes?.success)      appData.org       = orgRes.org;

    populateFormDropdowns();
  } catch (err) {
    console.error('Failed to load app data:', err);
  }
}

function populateFormDropdowns() {
  // Drivers dropdown
  const driverSel = document.getElementById('tripDriver');
  if (driverSel) {
    driverSel.innerHTML = '<option value="">Select driver...</option>';
    appData.drivers.forEach(d => {
      driverSel.innerHTML += `<option value="${d._id}">${d.firstName} ${d.lastName}</option>`;
    });
  }

  // Vehicles dropdown
  const vehicleSel = document.getElementById('tripVehicle');
  if (vehicleSel) {
    vehicleSel.innerHTML = '<option value="">Select vehicle...</option>';
    appData.vehicles.forEach(v => {
      vehicleSel.innerHTML += `<option value="${v._id}">${v.name} (${v.make || ''} ${v.model || ''})</option>`;
    });
  }

  // Home bases dropdown
  const baseSel = document.getElementById('tripHomeBase');
  if (baseSel && appData.org?.homeBases) {
    baseSel.innerHTML = '<option value="">Select base...</option>';
    appData.org.homeBases.forEach(b => {
      baseSel.innerHTML += `<option value="${b.name}" ${b.isDefault ? 'selected' : ''}>${b.name}</option>`;
    });
  }

  // Grants dropdown
  const grantSel = document.getElementById('grantSelect');
  if (grantSel) {
    grantSel.innerHTML = '<option value="">Select grant...</option>';
    appData.grants.forEach(g => {
      grantSel.innerHTML += `<option value="${g._id}">${g.name}</option>`;
    });
  }

  // Partners dropdown
  const partnerSel = document.getElementById('partnerSelect');
  if (partnerSel) {
    partnerSel.innerHTML = '<option value="">Select partner...</option>';
    appData.partners.forEach(p => {
      partnerSel.innerHTML += `<option value="${p._id}">${p.name}</option>`;
    });
  }

  // User vehicle dropdown
  const userVehSel = document.getElementById('userVehicle');
  if (userVehSel) {
    userVehSel.innerHTML = '<option value="">No vehicle assigned</option>';
    appData.vehicles.forEach(v => {
      userVehSel.innerHTML += `<option value="${v._id}">${v.name}</option>`;
    });
  }
}

// ── DASHBOARD ─────────────────────────────────────────────
async function loadDashboard() {
  const today = new Date().toISOString().split('T')[0];
  const res = await ZakAuth.apiFetch(`/api/trips?date=${today}`);
  if (!res?.success) return;

  const trips = res.trips || [];
  const active = trips.filter(t => t.status === 'in_progress');
  const completed = trips.filter(t => t.status === 'completed');
  const totalFare = trips.reduce((sum, t) => sum + (t.payment?.totalFare || 0), 0);
  const riderCount = trips.reduce((sum, t) => sum + (t.stops?.length || 0), 0);

  document.getElementById('stat-today').textContent = trips.length;
  document.getElementById('stat-active').textContent = active.length;
  document.getElementById('stat-riders').textContent = riderCount;
  document.getElementById('stat-revenue').textContent = `$${totalFare.toFixed(0)}`;

  // Today's trips list
  const listEl = document.getElementById('todayTripsList');
  if (trips.length === 0) {
    listEl.innerHTML = '<div class="empty-state"><i class="fas fa-calendar-times"></i><p>No trips scheduled for today</p></div>';
  } else {
    listEl.innerHTML = trips.map(t => {
      const firstPickup = t.stops?.find(s => s.type === 'pickup');
      const timeStr = firstPickup?.scheduledTime ? formatTime(firstPickup.scheduledTime) : '';
      return `
      <div class="trip-row" onclick="viewTrip('${t._id}')">
        <div class="trip-row-info">
          <span class="trip-driver"><i class="fas fa-user"></i> ${t.driver?.firstName || 'Unassigned'} ${t.driver?.lastName || ''}</span>
          <span class="trip-vehicle"><i class="fas fa-shuttle-van"></i> ${t.vehicle?.name || 'No vehicle'}</span>
          <span class="trip-stops"><i class="fas fa-map-pin"></i> ${t.stops?.length || 0} stop(s)</span>
          ${timeStr ? `<span style="color:var(--green);font-size:13px;"><i class="fas fa-clock"></i> ${timeStr}</span>` : ''}
        </div>
        <div>${statusBadge(t.status)}</div>
      </div>
    `;
    }).join('');
  }

  // Driver status
  const driverEl = document.getElementById('driverStatusList');
  if (appData.drivers.length === 0) {
    driverEl.innerHTML = '<div class="empty-state"><i class="fas fa-id-badge"></i><p>No drivers configured</p></div>';
  } else {
    driverEl.innerHTML = appData.drivers.map(d => {
      const activeTrip = trips.find(t => t.driver?._id === d._id && t.status === 'in_progress');
      const todayTrips = trips.filter(t => t.driver?._id === d._id);
      return `
        <div class="driver-status-row">
          <div class="user-avatar" style="width:36px;height:36px;font-size:13px;background:var(--green);color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            ${d.firstName[0]}${d.lastName[0]}
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;font-size:14px;">${d.firstName} ${d.lastName}</div>
            <div style="font-size:12px;color:var(--gray-500);">${d.driverInfo?.vehicleAssigned?.name || 'No vehicle assigned'}</div>
          </div>
          <div>
            ${activeTrip
              ? '<span class="badge badge-in_progress"><span class="stop-light yellow"></span> On Route</span>'
              : todayTrips.length > 0
                ? '<span class="badge badge-completed"><span class="stop-light green"></span> Available</span>'
                : '<span class="badge badge-pending"><span class="stop-light gray"></span> No Trips</span>'
            }
          </div>
        </div>
      `;
    }).join('');
  }
}

async function refreshActiveTrips() {
  const activeView = document.querySelector('.view.active');
  if (activeView?.id === 'view-dashboard') loadDashboard();
}

// ── HELPERS ──────────────────────────────────────────────
function tabToNext(event, nextId) {
  if (event.key === 'Tab' || event.key === 'Enter') {
    const next = document.getElementById(nextId);
    if (next) {
      event.preventDefault();
      next.focus();
    }
  }
}

// ── SCHEDULE TRIP ─────────────────────────────────────────
let riderRows = [];

document.getElementById('addRiderBtn')?.addEventListener('click', addRiderRow);

function addRiderRow() {
  riderCount++;
  const idx = riderCount;
  const row = document.createElement('div');
  row.className = 'rider-row';
  row.id = `riderRow-${idx}`;
  row.innerHTML = `
    <div class="rider-row-header">
      <span class="rider-row-title"><i class="fas fa-user"></i> Rider ${idx}</span>
      <button type="button" class="rider-row-remove" onclick="removeRiderRow(${idx})"><i class="fas fa-times"></i></button>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Rider</label>
        <select class="form-input rider-select" id="riderSelect-${idx}" onchange="onRiderSelect(${idx})">
          <option value="">Select existing rider...</option>
          <option value="new">+ Add New Rider</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Pickup Address *</label>
        <input type="text" class="form-input" id="riderPickup-${idx}" placeholder="123 Main St, St. Pete, FL">
      </div>
      <div class="form-group">
        <label class="form-label">Destination *</label>
        <input type="text" class="form-input" id="riderDest-${idx}" placeholder="456 Work Ave, Clearwater, FL"
          onblur="onDestinationBlur(${idx})">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Pickup Time</label>
        <input type="time" class="form-input" id="riderPickupTime-${idx}"
          onkeydown="tabToNext(event,'riderApptTime-${idx}')">
      </div>
      <div class="form-group">
        <label class="form-label">Appt/Work Time</label>
        <input type="time" class="form-input" id="riderApptTime-${idx}"
          onkeydown="tabToNext(event,'riderReturnTime-${idx}')">
      </div>
      <div class="form-group">
        <label class="form-label">Trip Type</label>
        <select class="form-input" id="riderTripType-${idx}" onchange="onTripTypeChange(${idx})">
          <option value="round_trip">Round Trip</option>
          <option value="one_way">One Way</option>
        </select>
      </div>
      <div class="form-group" id="returnTimeGroup-${idx}">
        <label class="form-label">Return Pickup Time</label>
        <input type="time" class="form-input" id="riderReturnTime-${idx}" placeholder="Return pickup time">
        <small style="color:var(--gray-500);font-size:11px;margin-top:2px;display:block">Time driver picks up for return trip</small>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Rider Notes</label>
      <input type="text" class="form-input" id="riderNoteInline-${idx}" placeholder="Accessibility needs, special instructions...">
    </div>
  `;
  document.getElementById('ridersList').appendChild(row);

  // Populate rider dropdown
  loadRidersIntoSelect(`riderSelect-${idx}`);
}

async function loadRidersIntoSelect(selectId) {
  // Always fetch fresh from server so edits are reflected immediately
  const res = await ZakAuth.apiFetch('/api/trips/riders');
  const sel = document.getElementById(selectId);
  if (!sel || !res?.success) return;
  // Keep the first two static options, then append riders
  sel.innerHTML = '<option value="">Select existing rider...</option><option value="new">+ Add New Rider</option>';
  res.riders.forEach(r => {
    const opt = document.createElement('option');
    opt.value = r._id;
    opt.textContent = `${r.firstName} ${r.lastName} — ${r.phone || 'no phone'}`;
    // Store home address as a data attribute so we can auto-fill without a second fetch
    opt.dataset.homeAddress = r.homeAddress || '';
    opt.dataset.notes = r.notes || '';
    sel.appendChild(opt);
  });
}

async function onRiderSelect(idx) {
  const sel = document.getElementById(`riderSelect-${idx}`);
  const val = sel?.value;

  if (val === 'new') {
    openAddRiderModal();
    return;
  }

  if (!val) return;

  // Fetch the latest rider record directly so we always have current data
  const res = await ZakAuth.apiFetch(`/api/trips/riders/${val}`);
  if (!res?.success) return;
  const r = res.rider;

  // Auto-fill pickup address with rider's home address
  const pickupEl = document.getElementById(`riderPickup-${idx}`);
  if (pickupEl && r.homeAddress) {
    pickupEl.value = r.homeAddress;
    saveAddressToMemory(r.homeAddress);
  }

  // Auto-fill rider notes if the notes field is empty
  const notesEl = document.getElementById(`riderNoteInline-${idx}`);
  if (notesEl && !notesEl.value && r.notes) {
    notesEl.value = r.notes;
  }
}

function removeRiderRow(idx) {
  document.getElementById(`riderRow-${idx}`)?.remove();
}
function onTripTypeChange(idx) {
  const type = document.getElementById(`riderTripType-${idx}`)?.value;
  const returnGroup = document.getElementById(`returnTimeGroup-${idx}`);
  if (returnGroup) {
    returnGroup.style.display = type === 'one_way' ? 'none' : 'block';
  }
  // Recalculate fare when trip type changes
  const destEl = document.getElementById(`riderDest-${idx}`);
  if (destEl?.value?.trim().length >= 5) onDestinationBlur(idx);
}

// Payment type toggle
function onPaymentTypeChange() {
  const type = document.getElementById('paymentType').value;
  document.getElementById('grantSelectGroup').style.display  = type === 'grant'     ? 'block' : 'none';
  document.getElementById('partnerSelectGroup').style.display= type === 'partner'   ? 'block' : 'none';
  document.getElementById('freeRideGroup').style.display     = type === 'free_ride' ? 'block' : 'none';
  // When free ride code is selected, always force fare to $0.00
  if (type === 'free_ride') {
    document.getElementById('fareAmount').textContent = '$0.00';
    document.getElementById('fareZone').textContent   = 'Free Ride';
    document.getElementById('fareDisplay').style.borderColor = '#28a745';
    document.getElementById('fareDisplay').style.color       = '#155724';
  } else {
    // Reset fare display styling for non-free-ride payment types
    document.getElementById('fareDisplay').style.borderColor = '';
    document.getElementById('fareDisplay').style.color       = '';
    document.getElementById('fareAmount').textContent = '$0.00';
    document.getElementById('fareZone').textContent   = '';
  }
}

// ── FARE AUTO-CALCULATION ─────────────────────────────────
// Called when dispatcher leaves the Destination field.
// Geocodes via Nominatim (free, no API key) then calls /api/trips/calculate-fare.
async function onDestinationBlur(idx) {
  // If payment type is free ride, always show $0.00 — skip fare calculation entirely
  const payType = document.getElementById('paymentType')?.value;
  if (payType === 'free_ride') {
    document.getElementById('fareAmount').textContent = '$0.00';
    document.getElementById('fareZone').textContent   = 'Free Ride';
    return;
  }
  const destEl = document.getElementById(`riderDest-${idx}`);
  const dest   = destEl?.value?.trim();
  if (!dest || dest.length < 5) return;
  // Use selected home base or fall back to the default one
  let homeBaseName = document.getElementById('tripHomeBase')?.value;
  if (!homeBaseName) {
    const defaultBase = appData.org?.homeBases?.find(b => b.isDefault) || appData.org?.homeBases?.[0];
    homeBaseName = defaultBase?.name || '';
    // Auto-select it in the dropdown
    const baseSel = document.getElementById('tripHomeBase');
    if (baseSel && homeBaseName) baseSel.value = homeBaseName;
  }
  if (!homeBaseName) {
    document.getElementById('fareAmount').textContent = 'Set home base first';
    return;
  }
  const tripType = document.getElementById(`riderTripType-${idx}`)?.value || 'round_trip';
  document.getElementById('fareAmount').textContent = 'Calculating...';
  document.getElementById('fareZone').textContent   = '';
  // Helper: geocode via US Census Bureau API (primary), fall back to Nominatim
  async function geocodeAddress(address) {
    try {
      const censusUrl = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(address)}&benchmark=2020&format=json`;
      const r = await fetch(censusUrl);
      const d = await r.json();
      const match = d?.result?.addressMatches?.[0];
      if (match) return { lat: parseFloat(match.coordinates.y), lng: parseFloat(match.coordinates.x) };
    } catch(e) {}
    // Fallback: Nominatim
    try {
      const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
      const r = await fetch(nomUrl, { headers: { 'Accept-Language': 'en' } });
      const d = await r.json();
      if (d?.[0]) return { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) };
    } catch(e) {}
    return null;
  }

  try {
    // Geocode destination
    const destCoords = await geocodeAddress(dest);
    if (!destCoords) {
      document.getElementById('fareAmount').textContent = 'Address not found';
      return;
    }
    const destLat = destCoords.lat;
    const destLng = destCoords.lng;
    // Also geocode pickup address for accurate pickup-to-dropoff fare calculation
    let pickupLat = null, pickupLng = null;
    const pickupEl = document.getElementById(`riderPickup-${idx}`);
    const pickupAddr = pickupEl?.value?.trim();
    if (pickupAddr && pickupAddr.length >= 5) {
      try {
        const pc = await geocodeAddress(pickupAddr);
        if (pc) { pickupLat = pc.lat; pickupLng = pc.lng; }
      } catch(e) {}
    }
    // Call server fare calculation
    const fareRes = await ZakAuth.apiFetch('/api/trips/calculate-fare', {
      method: 'POST',
      body: JSON.stringify({ destLat, destLng, homeBaseName, pickupLat, pickupLng })
    });
    if (!fareRes?.success) {
      document.getElementById('fareAmount').textContent = fareRes?.error || 'Unable to calculate';
      return;
    }
    const fare = tripType === 'one_way' ? fareRes.oneWayFare : fareRes.fare;
    document.getElementById('fareAmount').textContent = fare ? `$${fare.toFixed(2)}` : '$0.00';
    document.getElementById('fareZone').textContent   = fareRes.zone
      ? `${fareRes.zone.name} • ${fareRes.distanceMiles} mi`
      : '';

    // Travel time warning: estimate drive time at 20 mph average (urban + stops)
    const distMiles = fareRes.distanceMiles || 0;
    if (distMiles > 0) {
      const pickupTimeEl = document.getElementById(`riderPickupTime-${idx}`);
      const tripDateEl   = document.getElementById('tripDate');
      if (pickupTimeEl?.value && tripDateEl?.value) {
        const pickupDt = new Date(`${tripDateEl.value}T${pickupTimeEl.value}`);
        const estimatedMinutes = Math.ceil((distMiles / 20) * 60); // 20 mph avg
        const nowMs = Date.now();
        const minutesUntilPickup = (pickupDt - nowMs) / 60000;
        let warningEl = document.getElementById(`travelWarning-${idx}`);
        if (!warningEl) {
          warningEl = document.createElement('div');
          warningEl.id = `travelWarning-${idx}`;
          warningEl.style.cssText = 'margin-top:6px;padding:8px 12px;border-radius:8px;font-size:13px;font-weight:600;';
          document.getElementById(`riderDest-${idx}`)?.parentElement?.appendChild(warningEl);
        }
        if (minutesUntilPickup < estimatedMinutes + 15) {
          warningEl.style.background = '#fff3cd';
          warningEl.style.color = '#856404';
          warningEl.style.border = '1px solid #ffc107';
          warningEl.innerHTML = `⚠️ Tight schedule: ~${estimatedMinutes} min drive time but only ${Math.round(minutesUntilPickup)} min until pickup. Consider adjusting.`;
        } else {
          warningEl.style.background = '#d1e7dd';
          warningEl.style.color = '#0a3622';
          warningEl.style.border = '1px solid #a3cfbb';
          warningEl.innerHTML = `✅ ~${estimatedMinutes} min estimated drive time — schedule looks good.`;
        }
      }
    }
  } catch (err) {
    document.getElementById('fareAmount').textContent = '$0.00';
  }
}

// ── FREE RIDE CODE AUTO-GET ───────────────────────────────
/// When payment type is free_ride, auto-fetch or generate the rider's code.
async function getFreeRideCode() {
  // Find the first rider select that has a valid rider selected
  // Check both class-based and id-based selects (dynamically added rider rows)
  const allSelects = document.querySelectorAll('select[id^="riderSelect-"], select.rider-select');
  let riderId = null;
  for (const sel of allSelects) {
    if (sel.value && sel.value !== 'new' && sel.value !== '') { riderId = sel.value; break; }
  }
  if (!riderId) {
    showToast('Please add a rider and select them from the dropdown first.', 'error');
    return;
  }
  const btn = document.getElementById('getFreeRideCodeBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Getting...'; }
  const res = await ZakAuth.apiFetch(`/api/trips/riders/${riderId}/free-ride-code`);
  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-magic"></i> Get/Generate Code'; }
  if (res?.success) {
    document.getElementById('freeRideCode').value = res.code;
    const exp = new Date(res.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    // Show expiry inline below the code field
    const expiryEl = document.getElementById('freeRideExpiry');
    if (expiryEl) {
      expiryEl.style.display = 'block';
      expiryEl.style.color = res.isNew ? '#0a6640' : '#856404';
      expiryEl.textContent = res.isNew
        ? `✅ New code generated — valid until ${exp}`
        : `♻️ Existing code reused — valid until ${exp}`;
    }
    showToast(`Code: ${res.code} • Expires ${exp}`, 'success');
  } else {
    showToast(res?.error || 'Could not get free ride code.', 'error');
  }
}

// Schedule form submit
document.getElementById('scheduleForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('scheduleSubmitBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Scheduling...';

  try {
    const tripDate = document.getElementById('tripDate').value;
    const driver   = document.getElementById('tripDriver').value;
    const vehicle  = document.getElementById('tripVehicle').value;
    const homeBaseName = document.getElementById('tripHomeBase').value;
    // Helper: build a timezone-aware ISO string for Eastern Time (UTC-5 EST / UTC-4 EDT)
    // This ensures times entered by the dispatcher are stored correctly in UTC on the server.
    const toEasternISO = (dateStr, timeStr) => {
      if (!dateStr || !timeStr) return null;
      // Detect if EDT (daylight saving) or EST
      const testDate = new Date(`${dateStr}T12:00:00`);
      const offset = testDate.toLocaleString('en-US', { timeZone: 'America/New_York', timeZoneName: 'short' }).includes('EDT') ? '-04:00' : '-05:00';
      return `${dateStr}T${timeStr}:00${offset}`;
    };
    const homeBase = appData.org?.homeBases?.find(b => b.name === homeBaseName) || { name: homeBaseName };
    const notes    = document.getElementById('tripNotes').value;
    const paymentType = document.getElementById('paymentType').value;

    if (!tripDate || !driver || !vehicle) {
      showToast('Please fill in date, driver, and vehicle.', 'error');
      return;
    }

    // Build stops from rider rows — each rider becomes a pickup + dropoff stop pair
    const stops = [];
    let stopOrder = 0;
    const riderRowEls = document.querySelectorAll('.rider-row');
    for (const row of riderRowEls) {
      const id = row.id.replace('riderRow-', '');
      const riderId   = document.getElementById(`riderSelect-${id}`)?.value;
      const pickup    = document.getElementById(`riderPickup-${id}`)?.value;
      const dest      = document.getElementById(`riderDest-${id}`)?.value;
      const pickupTime= document.getElementById(`riderPickupTime-${id}`)?.value;
      const apptTime  = document.getElementById(`riderApptTime-${id}`)?.value;
      const riderNote = document.getElementById(`riderNoteInline-${id}`)?.value;

      if (!pickup || !dest) continue;

      const rId = riderId && riderId !== 'new' ? riderId : null;
      // Pickup stop
      stops.push({
        stopOrder: stopOrder++,
        type: 'pickup',
        riderId: rId,
        address: pickup,
        scheduledTime: toEasternISO(tripDate, pickupTime),
        notes: riderNote,
        status: 'pending'
      });
      // Dropoff stop
      stops.push({
        stopOrder: stopOrder++,
        type: 'dropoff',
        riderId: rId,
        address: dest,
        appointmentTime: toEasternISO(tripDate, apptTime),
        status: 'pending'
      });
    }

    if (stops.length === 0) {
      showToast('Please add at least one rider.', 'error');
      return;
    }

    // Payment
    const payment = { type: paymentType };
    if (paymentType === 'grant')     payment.grantId   = document.getElementById('grantSelect')?.value;
    if (paymentType === 'partner')   payment.partnerId = document.getElementById('partnerSelect')?.value;
    if (paymentType === 'free_ride') payment.freeRideCode = document.getElementById('freeRideCode')?.value;

    const body = {
      tripDate: new Date(tripDate).toISOString(),
      driver, vehicle, homeBase, notes,
      stops, payment
    };

    const res = await ZakAuth.apiFetch('/api/trips', {
      method: 'POST',
      body: JSON.stringify(body)
    });
    if (res?.success) {
      // Auto-create return trips for any round-trip riders
      const riderRowEls2 = document.querySelectorAll('.rider-row');
      const returnTripStops = [];
      let returnStopOrder = 0;
      let hasReturnTrip = false;
      for (const row of riderRowEls2) {
        const id = row.id.replace('riderRow-', '');
        const tripType   = document.getElementById(`riderTripType-${id}`)?.value;
        const returnTime = document.getElementById(`riderReturnTime-${id}`)?.value;
        const pickup     = document.getElementById(`riderPickup-${id}`)?.value;
        const dest       = document.getElementById(`riderDest-${id}`)?.value;
        const riderId    = document.getElementById(`riderSelect-${id}`)?.value;
        const riderNote  = document.getElementById(`riderNoteInline-${id}`)?.value;
        if (tripType !== 'round_trip' || !returnTime || !pickup || !dest) continue;
        hasReturnTrip = true;
        const rId = riderId && riderId !== 'new' ? riderId : null;
        // Return trip: destination becomes pickup, pickup becomes destination
        returnTripStops.push({
          stopOrder: returnStopOrder++,
          type: 'pickup',
          riderId: rId,
          address: dest,  // reversed: original destination is now pickup
          scheduledTime: toEasternISO(tripDate, returnTime),
          notes: riderNote ? `[RETURN] ${riderNote}` : '[RETURN TRIP]',
          status: 'pending'
        });
        returnTripStops.push({
          stopOrder: returnStopOrder++,
          type: 'dropoff',
          riderId: rId,
          address: pickup,  // reversed: original pickup is now destination
          status: 'pending'
        });
      }
      if (hasReturnTrip && returnTripStops.length > 0) {
        const returnBody = {
          tripDate: new Date(tripDate).toISOString(),
          driver, vehicle, homeBase,
          notes: `[RETURN TRIP] ${notes || ''}`.trim(),
          stops: returnTripStops,
          payment
        };
        const returnRes = await ZakAuth.apiFetch('/api/trips', {
          method: 'POST',
          body: JSON.stringify(returnBody)
        });
        if (returnRes?.success) {
          showToast('Trip + return trip scheduled successfully!', 'success');
        } else {
          showToast('Outbound trip saved, but return trip failed: ' + (returnRes?.error || 'unknown error'), 'error');
        }
      } else {
        showToast('Trip scheduled successfully!', 'success');
      }
      document.getElementById('scheduleForm').reset();
      document.getElementById('ridersList').innerHTML = '';
      riderCount = 0;
      showView('dashboard');
    } else {
      showToast(res?.error || 'Failed to schedule trip.', 'error');
    }
  } catch (err) {
    showToast('Error scheduling trip.', 'error');
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-calendar-check"></i> Schedule Trip';
  }
});

//// ── ROUTE OPTIMIZATION ───────────────────────────────
async function optimizeAndValidate() {
  const resultEl = document.getElementById('optimizeResult');
  const btn = document.getElementById('optimizeBtn');
  resultEl.style.display = 'none';

  // Collect stops from the form (same logic as submit)
  const tripDate = document.getElementById('tripDate').value;
  const homeBaseName = document.getElementById('tripHomeBase').value;
  const homeBase = appData.org?.homeBases?.find(b => b.name === homeBaseName) || null;

  const stops = [];
  let stopOrder = 0;
  const riderRowEls = document.querySelectorAll('.rider-row');
  for (const row of riderRowEls) {
    const id = row.id.replace('riderRow-', '');
    const pickup   = document.getElementById(`riderPickup-${id}`)?.value;
    const dest     = document.getElementById(`riderDest-${id}`)?.value;
    const pickupTime = document.getElementById(`riderPickupTime-${id}`)?.value;
    const apptTime   = document.getElementById(`riderApptTime-${id}`)?.value;
    const riderName  = document.getElementById(`riderSelect-${id}`)?.selectedOptions[0]?.text || `Rider ${id}`;
    if (!pickup || !dest) continue;
    stops.push({ stopOrder: stopOrder++, type: 'pickup', address: pickup, scheduledTime: pickupTime ? `${tripDate}T${pickupTime}` : null, riderName });
    stops.push({ stopOrder: stopOrder++, type: 'dropoff', address: dest, appointmentTime: apptTime ? `${tripDate}T${apptTime}` : null, riderName });
  }

  if (stops.length === 0) {
    showToast('Add at least one rider before optimizing.', 'error');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Optimizing...';

  try {
    const res = await ZakAuth.apiFetch('/api/trips/optimize-preview', {
      method: 'POST',
      body: JSON.stringify({ stops, homeBase, tripDate })
    });

    if (!res?.success) {
      resultEl.style.display = 'block';
      resultEl.style.background = '#fff3cd';
      resultEl.style.border = '1px solid #ffc107';
      resultEl.innerHTML = `<i class="fas fa-exclamation-triangle" style="color:#856404;"></i> <strong>Could not optimize:</strong> ${res?.error || 'Unknown error. Check addresses and try again.'}`;
      return;
    }

    const r = res.result;
    const hasConflicts = r.conflicts && r.conflicts.length > 0;
    const bgColor = hasConflicts ? '#fff3cd' : '#d4edda';
    const borderColor = hasConflicts ? '#ffc107' : '#28a745';
    const icon = hasConflicts ? '⚠️' : '✅';

    let html = `<div style="display:flex;align-items:flex-start;gap:12px;">`;
    html += `<div style="font-size:22px;">${icon}</div>`;
    html += `<div style="flex:1;">`;
    if (!hasConflicts) {
      html += `<strong style="color:#155724;">Route is feasible!</strong><br>`;
    } else {
      html += `<strong style="color:#856404;">Schedule conflicts detected</strong><br>`;
      r.conflicts.forEach(c => {
        html += `<div style="margin-top:6px;padding:6px 10px;background:rgba(0,0,0,0.05);border-radius:6px;">`;
        html += `⚠️ <strong>${c.riderName || 'Rider'}</strong>: ${c.message}`;
        if (c.suggestion) html += `<br><em style="font-size:12px;color:#6c757d;">${c.suggestion}</em>`;
        html += `</div>`;
      });
    }
    html += `<div style="margin-top:8px;font-size:13px;color:#555;">`;
    html += `<i class="fas fa-road"></i> Total distance: <strong>${r.totalDistanceMiles?.toFixed(1) || '?'} miles</strong> &nbsp;`;
    html += `<i class="fas fa-clock"></i> Est. drive time: <strong>${r.totalDurationMins ? Math.round(r.totalDurationMins) + ' min' : '?'}</strong>`;
    html += `</div>`;
    if (r.optimizedStops && r.optimizedStops.length > 0) {
      html += `<div style="margin-top:8px;font-size:12px;color:#555;"><strong>Optimized stop order:</strong> `;
      html += r.optimizedStops.map((s, i) => `${i+1}. ${s.type === 'pickup' ? '⬆' : '⬇'} ${s.address?.split(',')[0]}`).join(' → ');
      html += `</div>`;
    }
    html += `</div></div>`;

    resultEl.style.display = 'block';
    resultEl.style.background = bgColor;
    resultEl.style.border = `1px solid ${borderColor}`;
    resultEl.innerHTML = html;
  } catch (err) {
    resultEl.style.display = 'block';
    resultEl.style.background = '#f8d7da';
    resultEl.style.border = '1px solid #f5c6cb';
    resultEl.innerHTML = `<i class="fas fa-times-circle" style="color:#721c24;"></i> <strong>Optimization failed:</strong> ${err.message}`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-magic"></i> Optimize &amp; Validate Route';
  }
}

// ── TRIPS LIST ─────────────────────────────────────────
async function loadTrips() {
  const date   = document.getElementById('filterDate')?.value;
  const status = document.getElementById('filterStatus')?.value;
  let url = '/api/trips?';
  if (date)   url += `date=${date}&`;
  if (status) url += `status=${status}&`;
  // By default, exclude canceled trips from the active list.
  // Only include them when the user explicitly selects "Canceled" from the filter.
  if (!status) url += `excludeStatus=canceled&`;

  const res = await ZakAuth.apiFetch(url);
  const tbody = document.getElementById('tripsTableBody');
  if (!res?.success) { tbody.innerHTML = '<tr><td colspan="9" class="empty-row">Failed to load trips.</td></tr>'; return; }

  const trips = res.trips || [];
  if (trips.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-row">No trips found.</td></tr>';
    return;
  }

  tbody.innerHTML = trips.map(t => {
    const firstPickup = t.stops?.find(s => s.type === 'pickup');
    const timeStr = firstPickup?.scheduledTime ? formatTime(firstPickup.scheduledTime) : '—';
    // Count unique riders = number of pickup stops (each rider has 1 pickup + 1 dropoff)
    const riderCount = t.stops?.filter(s => s.type === 'pickup').length || 0;
    const isReturn = t.notes?.includes('[RETURN TRIP]');
    return `
    <tr>
      <td><code style="font-size:11px;color:var(--gray-500);">${t._id.slice(-6).toUpperCase()}</code></td>
      <td>${formatDate(t.tripDate)}</td>
      <td style="color:var(--green);font-weight:600;">${timeStr}</td>
      <td>${t.driver?.firstName || '—'} ${t.driver?.lastName || ''}</td>
      <td>${t.vehicle?.name || '—'}</td>
      <td>${riderCount} rider${riderCount !== 1 ? 's' : ''}${isReturn ? ' <span style="font-size:10px;background:#e3f2fd;color:#1565c0;padding:1px 5px;border-radius:4px;font-weight:600;">RETURN</span>' : ''}</td>
      <td>${statusBadge(t.status)}</td>
      <td>${t.payment?.estimatedFare ? '$' + t.payment.estimatedFare.toFixed(2) : '—'}</td>
      <td>
        <button class="btn btn-sm btn-secondary" onclick="viewTrip('${t._id}')"><i class="fas fa-eye"></i></button>
      </td>
    </tr>
  `;
  }).join('');
}

async function viewTrip(tripId) {
  const res = await ZakAuth.apiFetch(`/api/trips/${tripId}`);
  if (!res?.success) return;
  const t = res.trip;

  const body = document.getElementById('tripDetailBody');
  body.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
      <div><strong>Date:</strong> ${formatDate(t.tripDate)}</div>
      <div><strong>Status:</strong> ${statusBadge(t.status)}</div>
      <div><strong>Driver:</strong> ${t.driver?.firstName || '—'} ${t.driver?.lastName || ''}</div>
      <div><strong>Vehicle:</strong> ${t.vehicle?.name || '—'}</div>
      <div><strong>Home Base:</strong> ${t.homeBase || '—'}</div>
      <div><strong>Payment:</strong> ${t.payment?.type || '—'}</div>
    </div>
    <h4 style="margin-bottom:12px;color:var(--green);">Stops</h4>
    ${(t.stops || []).map((s, i) => `
      <div style="background:var(--gray-50);border:1px solid var(--gray-200);border-radius:8px;padding:14px;margin-bottom:10px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <strong>Stop ${i+1}: ${s.riderId?.firstName || 'Unknown'} ${s.riderId?.lastName || ''}</strong>
          ${statusBadge(s.status)}
        </div>
        <div style="font-size:13px;color:var(--gray-600);">
          <div><i class="fas fa-map-pin" style="color:var(--green);width:16px;"></i> ${s.type === 'pickup' ? 'Pickup' : 'Drop-off'}: ${s.address || '—'}</div>
          ${s.scheduledTime ? `<div><i class="fas fa-clock" style="width:16px;"></i> Scheduled: ${formatTime(s.scheduledTime)}</div>` : ''}
          ${s.appointmentTime ? `<div><i class="fas fa-calendar-check" style="width:16px;"></i> Appointment: ${formatTime(s.appointmentTime)}</div>` : ''}
          ${s.notes ? `<div><i class="fas fa-sticky-note" style="width:16px;"></i> ${s.notes}</div>` : ''}
        </div>
      </div>
    `).join('')}
    ${t.notes ? `<div style="margin-top:12px;padding:12px;background:var(--gold-pale);border-radius:8px;font-size:13px;"><strong>Notes:</strong> ${t.notes}</div>` : ''}
  `;

  // Store trip reference for edit modal
  window._currentViewTrip = t;

  // Cancel trip button (only for scheduled/in_progress)
  const footer = document.getElementById('tripDetailFooter');
  if (footer) {
    footer.innerHTML = '';
    if (!['canceled','completed'].includes(t.status)) {
      footer.innerHTML += `
        <button class="btn btn-primary" onclick="openEditTrip()" style="margin-right:8px;">
          <i class="fas fa-edit"></i> Edit Trip
        </button>
        <button class="btn btn-danger" onclick="cancelTrip('${t._id}')" style="margin-right:8px;">
          <i class="fas fa-ban"></i> Cancel Trip
        </button>
        <button class="btn btn-secondary" onclick="openReassignDriver('${t._id}', '${t.driver?._id || ''}')">
          <i class="fas fa-user-edit"></i> Reassign Driver
        </button>
      `;
    }
  }

  openModal('tripDetailModal');
}

function openEditTrip() {
  const t = window._currentViewTrip;
  if (!t) return;

  // Build Eastern time string from a UTC date for <input type="time">
  const toEasternTime = (isoStr) => {
    if (!isoStr) return '';
    return new Date(isoStr).toLocaleTimeString('en-US', {
      timeZone: 'America/New_York',
      hour: '2-digit', minute: '2-digit', hour12: false
    });
  };
  const toEasternDate = (isoStr) => {
    if (!isoStr) return '';
    return new Date(isoStr).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // YYYY-MM-DD
  };

  // Build stop rows
  const stopRows = (t.stops || []).map((s, i) => {
    const isPickup = s.type === 'pickup';
    const timeVal  = isPickup ? toEasternTime(s.scheduledTime) : '';
    const apptVal  = !isPickup ? toEasternTime(s.appointmentTime) : '';
    return `
      <div style="background:var(--gray-50);border:1px solid var(--gray-200);border-radius:8px;padding:12px;margin-bottom:10px;">
        <div style="font-weight:600;margin-bottom:8px;font-size:13px;">
          Stop ${i+1} — ${isPickup ? '🟢 Pickup' : '🔴 Drop-off'}:
          ${s.riderId?.firstName || 'Unknown'} ${s.riderId?.lastName || ''}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div>
            <label style="font-size:12px;color:var(--gray-500);">Address</label>
            <input type="text" class="form-input" id="editStop_addr_${i}" value="${(s.address||'').replace(/"/g,'&quot;')}" style="font-size:13px;">
          </div>
          ${isPickup ? `
          <div>
            <label style="font-size:12px;color:var(--gray-500);">Pickup Time (EST)</label>
            <input type="time" class="form-input" id="editStop_time_${i}" value="${timeVal}">
          </div>` : `
          <div>
            <label style="font-size:12px;color:var(--gray-500);">Appt/Work Time (EST)</label>
            <input type="time" class="form-input" id="editStop_appt_${i}" value="${apptVal}">
          </div>`}
        </div>
        <div style="margin-top:8px;">
          <label style="font-size:12px;color:var(--gray-500);">Notes</label>
          <input type="text" class="form-input" id="editStop_notes_${i}" value="${(s.notes||'').replace(/"/g,'&quot;')}" placeholder="Optional notes" style="font-size:13px;">
        </div>
        <input type="hidden" id="editStop_id_${i}" value="${s._id}">
      </div>
    `;
  }).join('');

  const tripDate = toEasternDate(t.tripDate);

  document.getElementById('editTripBody').innerHTML = `
    <div style="margin-bottom:16px;">
      <label style="font-size:12px;color:var(--gray-500);">Dispatcher Notes</label>
      <textarea class="form-input" id="editTripNotes" rows="2" style="font-size:13px;">${t.notes || ''}</textarea>
    </div>
    <h4 style="margin-bottom:10px;color:var(--green);">Stops <span style="font-size:12px;color:var(--gray-400);font-weight:400;">(times in Eastern)</span></h4>
    ${stopRows}
    <input type="hidden" id="editTripId" value="${t._id}">
    <input type="hidden" id="editTripDate" value="${tripDate}">
    <input type="hidden" id="editStopCount" value="${(t.stops||[]).length}">
  `;

  closeModal('tripDetailModal');
  openModal('editTripModal');
}

async function saveEditTrip() {
  const tripId    = document.getElementById('editTripId').value;
  const tripDate  = document.getElementById('editTripDate').value;
  const notes     = document.getElementById('editTripNotes').value;
  const stopCount = parseInt(document.getElementById('editStopCount').value, 10);
  const t         = window._currentViewTrip;

  const toEasternISO = (dateStr, timeStr) => {
    if (!dateStr || !timeStr) return null;
    const testDate = new Date(`${dateStr}T12:00:00`);
    const offset = testDate.toLocaleString('en-US', { timeZone: 'America/New_York', timeZoneName: 'short' }).includes('EDT') ? '-04:00' : '-05:00';
    return `${dateStr}T${timeStr}:00${offset}`;
  };

  const stopUpdates = [];
  for (let i = 0; i < stopCount; i++) {
    const stopId  = document.getElementById(`editStop_id_${i}`)?.value;
    const address = document.getElementById(`editStop_addr_${i}`)?.value;
    const notes_s = document.getElementById(`editStop_notes_${i}`)?.value;
    const timeEl  = document.getElementById(`editStop_time_${i}`);
    const apptEl  = document.getElementById(`editStop_appt_${i}`);
    const upd = { stopId, address, notes: notes_s };
    if (timeEl) upd.scheduledTime   = toEasternISO(tripDate, timeEl.value);
    if (apptEl) upd.appointmentTime = toEasternISO(tripDate, apptEl.value);
    stopUpdates.push(upd);
  }

  const btn = document.getElementById('saveEditTripBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

  const res = await ZakAuth.apiFetch(`/api/trips/${tripId}`, {
    method: 'PUT',
    body: JSON.stringify({ notes, stopUpdates })
  });

  btn.disabled = false;
  btn.innerHTML = '<i class="fas fa-save"></i> Save Changes';

  if (res?.success) {
    showToast('Trip updated successfully!', 'success');
    closeModal('editTripModal');
    loadTrips();
  } else {
    showToast(res?.error || 'Failed to save trip.', 'error');
  }
}

async function cancelTrip(tripId) {
  if (!confirm('Cancel this trip? This cannot be undone.')) return;
  const res = await ZakAuth.apiFetch(`/api/trips/${tripId}`, {
    method: 'PUT',
    body: JSON.stringify({ status: 'canceled' })
  });
  if (res?.success) {
    showToast('Trip canceled.', 'success');
    closeModal('tripDetailModal');
    loadTrips();
  } else {
    showToast(res?.error || 'Failed to cancel trip.', 'error');
  }
}

async function openReassignDriver(tripId, currentDriverId) {
  const modal = document.getElementById('reassignDriverModal');
  if (!modal) return;
  document.getElementById('reassignTripId').value = tripId;
  const sel = document.getElementById('reassignDriverSel');
  sel.innerHTML = '<option value="">Select driver...</option>';
  const drivers = (appData.users || []).filter(u => u.roles?.includes('driver') && u.isActive);
  drivers.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d._id;
    opt.textContent = `${d.firstName} ${d.lastName}`;
    if (String(d._id) === String(currentDriverId)) opt.selected = true;
    sel.appendChild(opt);
  });
  closeModal('tripDetailModal');
  openModal('reassignDriverModal');
}

async function saveReassignDriver() {
  const tripId   = document.getElementById('reassignTripId').value;
  const driverId = document.getElementById('reassignDriverSel').value;
  if (!driverId) { showToast('Please select a driver.', 'error'); return; }
  const res = await ZakAuth.apiFetch(`/api/trips/${tripId}`, {
    method: 'PUT',
    body: JSON.stringify({ driver: driverId })
  });
  if (res?.success) {
    showToast('Driver reassigned!', 'success');
    closeModal('reassignDriverModal');
    loadTrips();
  } else {
    showToast(res?.error || 'Failed to reassign driver.', 'error');
  }
}

// ── LIVE MAP ──────────────────────────────────────────────
function initMap() {
  if (dispatchMap) return; // already initialized

  dispatchMap = L.map('dispatchMap').setView([27.7731, -82.6398], 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  }).addTo(dispatchMap);

  // Add PERC home bases
  if (appData.org?.homeBases) {
    appData.org.homeBases.forEach(base => {
      if (base.lat && base.lng) {
        L.marker([base.lat, base.lng], {
          icon: L.divIcon({
            className: '',
            html: `<div style="background:var(--green);color:white;padding:6px 10px;border-radius:8px;font-size:12px;font-weight:700;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.3);">🏠 ${base.name}</div>`,
            iconAnchor: [0, 0]
          })
        }).addTo(dispatchMap).bindPopup(`<strong>${base.name}</strong><br>${base.address || ''}`);
      }
    });
  }

  // Load active trips and show driver locations
  loadMapTrips();
  setInterval(loadMapTrips, 15000);
}

async function geocodeForMap(address) {
  if (geocodeCache[address]) return geocodeCache[address];
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=us`;
    const r = await fetch(url);
    const d = await r.json();
    if (d && d.length > 0) {
      const coords = { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) };
      geocodeCache[address] = coords;
      return coords;
    }
  } catch(e) {}
  return null;
}

async function loadMapTrips() {
  if (!dispatchMap) return;
  const today = new Date().toISOString().split('T')[0];
  const res = await ZakAuth.apiFetch(`/api/trips?date=${today}`);
  if (!res?.success) return;

  // Clear old markers and route lines
  Object.values(driverMarkers).forEach(m => dispatchMap.removeLayer(m));
  driverMarkers = {};
  stopMarkers.forEach(m => dispatchMap.removeLayer(m));
  stopMarkers = [];
  routeLines.forEach(l => dispatchMap.removeLayer(l));
  routeLines = [];

  for (const trip of res.trips) {
    if (!trip.driver) continue;

    // Driver van marker (live GPS location)
    const loc = trip.driver.driverInfo?.currentLocation;
    if (loc?.lat && loc?.lng) {
      const vanIcon = trip.status === 'in_progress' ? '🚐' : '🚌';
      const marker = L.marker([loc.lat, loc.lng], {
        icon: L.divIcon({
          className: '',
          html: `<div style="background:var(--gold);color:var(--gray-900);padding:6px 10px;border-radius:8px;font-size:12px;font-weight:700;box-shadow:0 2px 8px rgba(0,0,0,0.3);">${vanIcon} ${trip.driver.firstName}</div>`,
          iconAnchor: [0, 0]
        })
      }).addTo(dispatchMap);
      const nextStop = (trip.stops || []).find(s => s.status === 'pending' || s.status === 'en_route');
      marker.bindPopup(`<strong>${trip.driver.firstName} ${trip.driver.lastName}</strong><br>Vehicle: ${trip.vehicle?.name || '—'}<br>Status: ${trip.status}${nextStop ? '<br>Next stop: ' + nextStop.address : ''}`);
      driverMarkers[trip._id] = marker;
    }

    // Geocode stops and show markers + route line
    const stopCoords = [];
    for (const stop of (trip.stops || [])) {
      let coords = (stop.lat && stop.lng) ? { lat: stop.lat, lng: stop.lng } : await geocodeForMap(stop.address);
      if (!coords) continue;
      stopCoords.push(coords);
      const isPickup = stop.type === 'pickup';
      const isDone = ['completed', 'no_show', 'canceled'].includes(stop.status);
      const bgColor = isDone ? '#aaa' : isPickup ? '#27ae60' : '#e74c3c';
      const icon = isPickup ? '⬆' : '⬇';
      const sm = L.marker([coords.lat, coords.lng], {
        icon: L.divIcon({
          className: '',
          html: `<div style="background:${bgColor};color:white;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,0.3);border:2px solid white;">${icon}</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        })
      }).addTo(dispatchMap);
      const riderName = stop.riderName || (stop.riderId ? (stop.riderId.firstName + ' ' + stop.riderId.lastName) : 'Rider');
      sm.bindPopup(`<strong>${isPickup ? 'Pickup' : 'Drop-off'}</strong><br>${riderName}<br>${stop.address}<br>Status: ${stop.status}`);
      stopMarkers.push(sm);
    }

    // Draw dashed route line connecting stops in order
    if (stopCoords.length >= 2) {
      const latlngs = stopCoords.map(c => [c.lat, c.lng]);
      const line = L.polyline(latlngs, { color: '#3498db', weight: 3, opacity: 0.7, dashArray: '8,6' }).addTo(dispatchMap);
      routeLines.push(line);
    }
  }
}

// ── RIDERS ────────────────────────────────────────────────
async function loadRiders(query = '') {
  const url = query ? `/api/trips/riders?q=${encodeURIComponent(query)}` : '/api/trips/riders';
  const res = await ZakAuth.apiFetch(url);
  const tbody = document.getElementById('ridersTableBody');
  if (!res?.success) { tbody.innerHTML = '<tr><td colspan="6" class="empty-row">Failed to load riders.</td></tr>'; return; }

  const riders = res.riders || [];
  if (riders.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-row">No riders found. Add your first rider!</td></tr>';
    return;
  }

  tbody.innerHTML = riders.map(r => `
    <tr>
      <td><strong>${r.firstName} ${r.lastName}</strong></td>
      <td><code style="font-size:12px;background:var(--gray-100);padding:2px 6px;border-radius:4px;">${r.riderId || r.anonymousId || '—'}</code></td>
      <td>${r.phone || '—'}</td>
      <td>${r.homeAddress || '—'}</td>
      <td>${r.totalTrips || 0}</td>
      <td style="white-space:nowrap;">
        <button class="btn btn-sm btn-secondary" onclick="editRider('${r._id}')" title="Edit rider"><i class="fas fa-edit"></i></button>
        <button class="btn btn-sm" style="background:#28a745;color:#fff;margin-left:4px;" onclick="openEnrollModal('${r._id}','${r.firstName}','${r.lastName}','${r.phone || ''}','${r.email || ''}','${(r.homeAddress || '').replace(/'/g, '&apos;')}')" title="Charge &amp; Enroll ($100)"><i class="fas fa-credit-card"></i> Enroll</button>
        <button class="btn btn-sm" style="background:var(--red,#e53e3e);color:#fff;margin-left:4px;" onclick="deleteRider('${r._id}','${r.firstName} ${r.lastName}')" title="Delete rider"><i class="fas fa-trash"></i></button>
      </td>
    </tr>
  `).join('');
}

function searchRiders(q) {
  clearTimeout(window._riderSearchTimer);
  window._riderSearchTimer = setTimeout(() => loadRiders(q), 300);
}

// ── CHARGE & ENROLL ──────────────────────────────────────
let _enrollStripe = null;
let _enrollCardElement = null;
let _enrollRiderData = {};

async function openEnrollModal(riderId, firstName, lastName, phone, email, homeAddress) {
  _enrollRiderData = { riderId, firstName, lastName, phone, email, homeAddress };

  // Reset modal state
  document.getElementById('enrollCardError').style.display = 'none';
  document.getElementById('enrollSuccessBox').style.display = 'none';
  document.getElementById('enrollModalFooter').style.display = 'flex';
  const submitBtn = document.getElementById('enrollSubmitBtn');
  submitBtn.disabled = false;
  submitBtn.innerHTML = '<i class="fas fa-lock"></i> Charge $100 &amp; Enroll';

  // Show rider info
  document.getElementById('enrollRiderInfo').innerHTML =
    `<strong>${firstName} ${lastName}</strong>${phone ? ` &nbsp;·&nbsp; ${phone}` : ''}${email ? ` &nbsp;·&nbsp; ${email}` : ''}`;

  openModal('enrollModal');

  // Load Stripe key and mount card element
  try {
    const keyRes = await ZakAuth.apiFetch('/api/book/stripe-key');
    const pubKey = keyRes?.publishableKey;
    if (!pubKey) {
      document.getElementById('enrollStripeElement').innerHTML =
        '<p style="color:#e53e3e;font-size:13px;">Stripe is not configured. Please add your Stripe keys in Admin Settings.</p>';
      submitBtn.disabled = true;
      return;
    }
    _enrollStripe = Stripe(pubKey);
    const elements = _enrollStripe.elements();
    _enrollCardElement = elements.create('card', {
      style: { base: { fontSize: '15px', fontFamily: 'Inter, sans-serif', color: '#1a202c' } }
    });
    document.getElementById('enrollStripeElement').innerHTML = '';
    _enrollCardElement.mount('#enrollStripeElement');
    _enrollCardElement.on('change', e => {
      const errEl = document.getElementById('enrollCardError');
      if (e.error) { errEl.textContent = e.error.message; errEl.style.display = 'block'; }
      else { errEl.style.display = 'none'; }
    });
  } catch(e) {
    document.getElementById('enrollStripeElement').innerHTML =
      '<p style="color:#e53e3e;font-size:13px;">Failed to load payment form. Please refresh and try again.</p>';
  }
}

async function submitEnrollment() {
  const btn = document.getElementById('enrollSubmitBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
  const errEl = document.getElementById('enrollCardError');
  errEl.style.display = 'none';

  try {
    // Create payment method from card element
    const { paymentMethod, error } = await _enrollStripe.createPaymentMethod({
      type: 'card',
      card: _enrollCardElement,
      billing_details: {
        name: `${_enrollRiderData.firstName} ${_enrollRiderData.lastName}`,
        phone: _enrollRiderData.phone || undefined,
        email: _enrollRiderData.email || undefined
      }
    });

    if (error) {
      errEl.textContent = error.message;
      errEl.style.display = 'block';
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-lock"></i> Charge $100 &amp; Enroll';
      return;
    }

    // Call the existing enroll endpoint
    const res = await ZakAuth.apiFetch('/api/book/enroll', {
      method: 'POST',
      body: JSON.stringify({
        firstName: _enrollRiderData.firstName,
        lastName:  _enrollRiderData.lastName,
        phone:     _enrollRiderData.phone,
        email:     _enrollRiderData.email || '',
        homeAddress: _enrollRiderData.homeAddress || '',
        paymentMethodId: paymentMethod.id
      })
    });

    if (!res?.success) {
      errEl.textContent = res?.error || 'Enrollment failed. Please try again.';
      errEl.style.display = 'block';
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-lock"></i> Charge $100 &amp; Enroll';
      return;
    }

    // Handle 3D Secure if required
    if (res.requiresAction && res.clientSecret) {
      const { error: actionError } = await _enrollStripe.handleCardAction(res.clientSecret);
      if (actionError) {
        errEl.textContent = actionError.message;
        errEl.style.display = 'block';
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-lock"></i> Charge $100 &amp; Enroll';
        return;
      }
      // Confirm via server
      const confirmRes = await ZakAuth.apiFetch('/api/book/confirm-payment', {
        method: 'POST',
        body: JSON.stringify({ enrollmentId: res.enrollmentId })
      });
      if (!confirmRes?.success) {
        errEl.textContent = confirmRes?.error || 'Payment confirmation failed.';
        errEl.style.display = 'block';
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-lock"></i> Charge $100 &amp; Enroll';
        return;
      }
      document.getElementById('enrollGeneratedCode').textContent = confirmRes.freeRideCode || '—';
    } else {
      document.getElementById('enrollGeneratedCode').textContent = res.freeRideCode || '—';
    }

    // Show success
    document.getElementById('enrollSuccessBox').style.display = 'block';
    document.getElementById('enrollModalFooter').innerHTML =
      '<button class="btn btn-primary" onclick="closeModal(\'enrollModal\'); loadRiders();"><i class="fas fa-check"></i> Done</button>';

  } catch(e) {
    errEl.textContent = 'An unexpected error occurred. Please try again.';
    errEl.style.display = 'block';
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-lock"></i> Charge $100 &amp; Enroll';
  }
}

// ── TEAM ──────────────────────────────────────────────────
async function loadTeam() {
  const res = await ZakAuth.apiFetch('/api/admin/users?all=true');
  const tbody = document.getElementById('teamTableBody');
  if (!res?.success) return;

  tbody.innerHTML = res.users.map(u => `
    <tr>
      <td><strong>${u.firstName} ${u.lastName}</strong></td>
      <td>${u.email}</td>
      <td>${u.phone || '—'}</td>
      <td>${(u.roles || []).map(r => `<span class="badge badge-${r === 'driver' ? 'pending' : r === 'admin' ? 'completed' : 'scheduled'}">${r}</span>`).join(' ')}</td>
      <td>${u.driverInfo?.vehicleAssigned?.name || '—'}</td>
      <td>${u.isActive ? '<span class="badge badge-completed">Active</span>' : '<span class="badge badge-canceled">Inactive</span>'}</td>
      <td style="display:flex;gap:6px;">
        <button class="btn btn-sm btn-secondary" onclick="editUser('${u._id}')"><i class="fas fa-edit"></i></button>
        ${u.isActive ? `<button class="btn btn-sm btn-danger" onclick="deactivateUser('${u._id}', '${u.firstName} ${u.lastName}')" title="Deactivate user"><i class="fas fa-trash"></i></button>` : `<button class="btn btn-sm btn-secondary" onclick="reactivateUser('${u._id}', '${u.firstName} ${u.lastName}')" title="Reactivate user"><i class="fas fa-undo"></i></button>`}
      </td>
    </tr>
  `).join('');
}

// ── PAYMENTS ──────────────────────────────────────────────
async function loadPayments() {
  const res = await ZakAuth.apiFetch('/api/trips');
  const body = document.getElementById('paymentsBody');
  if (!res?.success) return;

  const trips = res.trips || [];
  const byType = {};
  trips.forEach(t => {
    const type = t.payment?.type || 'unknown';
    if (!byType[type]) byType[type] = { count: 0, total: 0 };
    byType[type].count++;
    byType[type].total += t.payment?.totalFare || 0;
  });

  const typeLabels = {
    self_pay: 'Self Pay', grant: 'Grant Funded',
    partner: 'Partner Agency', free_ride: 'Free Ride', none: 'Not Set', unknown: 'Unknown'
  };

  body.innerHTML = `
    <div class="stats-grid" style="margin-bottom:20px;">
      ${Object.entries(byType).map(([type, data]) => `
        <div class="stat-card">
          <div class="stat-icon green"><i class="fas fa-dollar-sign"></i></div>
          <div class="stat-info">
            <div class="stat-value">$${data.total.toFixed(0)}</div>
            <div class="stat-label">${typeLabels[type] || type} (${data.count} trips)</div>
          </div>
        </div>
      `).join('')}
    </div>
    <div class="table-wrapper">
      <table class="data-table">
        <thead><tr><th>Date</th><th>Driver</th><th>Riders</th><th>Payment Type</th><th>Fare</th><th>Status</th></tr></thead>
        <tbody>
          ${trips.slice(0, 50).map(t => `
            <tr>
              <td>${formatDate(t.tripDate)}</td>
              <td>${t.driver?.firstName || '—'} ${t.driver?.lastName || ''}</td>
              <td>${t.stops?.length || 0}</td>
              <td>${typeLabels[t.payment?.type] || '—'}</td>
              <td>${t.payment?.totalFare ? '$' + t.payment.totalFare.toFixed(2) : '—'}</td>
              <td>${statusBadge(t.status)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ── FREE RIDE CODES ───────────────────────────────────────
async function loadCodes() {
  const res = await ZakAuth.apiFetch('/api/admin/access-codes');
  const tbody = document.getElementById('codesTableBody');
  if (!res?.success) return;

  const codes = res.codes || [];
  if (codes.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-row">No codes generated yet.</td></tr>';
    return;
  }

  tbody.innerHTML = codes.map(c => `
    <tr>
      <td><code style="font-weight:700;letter-spacing:1px;">${c.code}</code></td>
      <td>${c.type === 'free_ride' ? 'Free Ride' : 'Registration'}</td>
      <td>${statusBadge(c.status)}</td>
      <td>${c.freeRide?.assignedTo ? `${c.freeRide.assignedTo.firstName} ${c.freeRide.assignedTo.lastName}` : '—'}</td>
      <td>${c.freeRide?.expiresAt ? formatDate(c.freeRide.expiresAt) : '—'}</td>
      <td>${c.freeRide?.tripsUsed || 0}</td>
    </tr>
  `).join('');
}

async function generateCodes() {
  // Populate rider dropdown in modal
  const riderSel = document.getElementById('codeRider');
  if (riderSel) {
    riderSel.innerHTML = '<option value="">— Unassigned —</option>';
    const ridersRes = await ZakAuth.apiFetch('/api/riders');
    if (ridersRes?.success) {
      ridersRes.riders.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r._id;
        opt.textContent = `${r.firstName} ${r.lastName}`;
        riderSel.appendChild(opt);
      });
    }
  }
  // Reset result area
  const result = document.getElementById('generatedCodesResult');
  if (result) result.style.display = 'none';
  const btn = document.getElementById('genCodeBtn');
  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-magic"></i> Generate'; }
  openModal('generateCodeModal');
}

async function doGenerateCodes() {
  const qty    = parseInt(document.getElementById('codeQty').value) || 1;
  const trips  = parseInt(document.getElementById('codeTrips').value) || 1;
  const rider  = document.getElementById('codeRider').value || null;
  const notes  = document.getElementById('codeNotes').value.trim();

  const btn = document.getElementById('genCodeBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';

  const res = await ZakAuth.apiFetch('/api/admin/access-codes/generate', {
    method: 'POST',
    body: JSON.stringify({ type: 'free_ride', quantity: qty, expiresInDays: 30, tripsAllowed: trips, assignedTo: rider, notes })
  });

  btn.disabled = false;
  btn.innerHTML = '<i class="fas fa-magic"></i> Generate';

  if (res?.success) {
    const codes = res.codes || [];
    const listEl = document.getElementById('generatedCodesList');
    const expDate = new Date(Date.now() + 30*24*60*60*1000).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
    listEl.innerHTML = codes.map(c =>
      `<span style="color:#7DF9AA;">${c.code}</span> &nbsp;<span style="color:#888;font-size:12px;">expires ${expDate} · ${trips} trip${trips>1?'s':''}</span>`
    ).join('<br>');
    document.getElementById('generatedCodesResult').style.display = 'block';
    showToast(`${codes.length} code${codes.length>1?'s':''} generated!`, 'success');
    loadCodes();
  } else {
    showToast(res?.error || 'Failed to generate codes.', 'error');
  }
}
// ── CANCELED TRIPS ──────────────────────────────────────
async function loadCanceledTrips() {
  const start = document.getElementById('canceledFilterStart')?.value;
  const end   = document.getElementById('canceledFilterEnd')?.value;
  let url = '/api/trips?status=canceled';
  if (start) url += `&dateFrom=${start}`;
  if (end)   url += `&dateTo=${end}`;

  const tbody = document.getElementById('canceledTripsBody');
  tbody.innerHTML = '<tr><td colspan="9" class="empty-row">Loading...</td></tr>';

  const res = await ZakAuth.apiFetch(url);
  if (!res?.success) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-row">Failed to load canceled trips.</td></tr>';
    return;
  }

  const trips = res.trips || [];
  if (trips.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-row">No canceled trips found.</td></tr>';
    document.getElementById('canceledTripsSummary').style.display = 'none';
    return;
  }

  tbody.innerHTML = trips.map(t => {
    const firstPickup  = t.stops?.find(s => s.type === 'pickup');
    const firstDropoff = t.stops?.find(s => s.type === 'dropoff');
    const timeStr  = firstPickup?.scheduledTime ? formatTime(firstPickup.scheduledTime) : '—';
    const dateStr  = t.tripDate ? formatDate(t.tripDate) : '—';
    const riders   = [...new Set(t.stops?.filter(s => s.type === 'pickup').map(s =>
      s.riderId ? `${s.riderId.firstName} ${s.riderId.lastName}` : s.riderName || '—'
    ))].join(', ') || '—';
    const driver   = t.driver ? `${t.driver.firstName} ${t.driver.lastName}` : '—';
    const route    = firstPickup && firstDropoff
      ? `<span style="font-size:12px;">${firstPickup.address || '—'} → ${firstDropoff.address || '—'}</span>`
      : '—';
    const payment  = t.paymentType ? t.paymentType.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase()) : '—';
    const fare     = t.fareAmount != null ? `$${Number(t.fareAmount).toFixed(2)}` : '—';
    const canceledOn = t.updatedAt ? formatDate(t.updatedAt) : '—';
    return `
    <tr style="opacity:0.8;">
      <td><code style="font-size:12px;background:var(--gray-100);padding:2px 6px;border-radius:4px;">${t.tripNumber || '—'}</code></td>
      <td>${dateStr}</td>
      <td>${timeStr}</td>
      <td>${riders}</td>
      <td>${driver}</td>
      <td>${route}</td>
      <td>${payment}</td>
      <td>${fare}</td>
      <td>${canceledOn}</td>
    </tr>`;
  }).join('');

  // Summary bar
  const totalFare = trips.reduce((sum, t) => sum + (Number(t.fareAmount) || 0), 0);
  const summary = document.getElementById('canceledTripsSummary');
  summary.style.display = 'block';
  summary.innerHTML = `<strong>${trips.length}</strong> canceled trip${trips.length !== 1 ? 's' : ''} &nbsp;&bull;&nbsp; Estimated lost fare: <strong>$${totalFare.toFixed(2)}</strong>`;
}

function exportCanceledTrips() {
  const rows = document.querySelectorAll('#canceledTripsBody tr');
  if (!rows.length || rows[0].querySelector('.empty-row')) {
    showToast('No canceled trips to export.', 'error');
    return;
  }
  const headers = ['Trip #','Date','Time','Rider(s)','Driver','Pickup','Dropoff','Payment','Fare','Canceled On'];
  const lines = [headers.join(',')];
  rows.forEach(row => {
    const cells = row.querySelectorAll('td');
    if (!cells.length) return;
    const vals = Array.from(cells).map((td, i) => {
      let v = td.innerText.trim().replace(/\n/g,' ');
      return `"${v.replace(/"/g,'""')}"`;
    });
    lines.push(vals.join(','));
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `canceled-trips-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}

// ── ADMIN SETTINGS ─────────────────────────────────────────
async function loadAdminSettings() {
  const org = appData.org;
  if (!org) return;

  // Fare zones
  const fareBody = document.getElementById('fareZonesBody');
  if (fareBody) {
    fareBody.innerHTML = (org.fareZones || []).map((z, i) => `
      <div style="display:flex;align-items:center;gap:10px;padding:10px;border:1px solid var(--gray-200);border-radius:8px;margin-bottom:8px;">
        <div style="flex:1;">
          <div style="font-weight:700;font-size:14px;">${z.name}</div>
          <div style="font-size:12px;color:var(--gray-500);">${z.description || ''}</div>
          <div style="font-size:12px;color:var(--gray-600);">${z.minMiles}–${z.maxMiles || '∞'} miles</div>
        </div>
        <div style="text-align:right;">
          <div style="font-weight:700;color:var(--green);">$${z.roundTripFare} RT</div>
          <div style="font-size:12px;color:var(--gray-500);">$${z.oneWayFare} one-way</div>
        </div>
        <button class="btn btn-sm btn-secondary" onclick="editFareZone(${i})"><i class="fas fa-edit"></i></button>
      </div>
    `).join('') || '<div class="empty-state"><p>No fare zones configured</p></div>';
  }

  // Home bases
  const baseBody = document.getElementById('homeBasesBody');
  if (baseBody) {
    baseBody.innerHTML = (org.homeBases || []).map((b, i) => `
      <div style="display:flex;align-items:center;gap:10px;padding:10px;border:1px solid var(--gray-200);border-radius:8px;margin-bottom:8px;">
        <div style="flex:1;">
          <div style="font-weight:700;font-size:14px;">${b.name} ${b.isDefault ? '<span class="badge badge-completed" style="font-size:11px;">Default</span>' : ''}</div>
          <div style="font-size:12px;color:var(--gray-500);">${b.address || 'No address set'}</div>
        </div>
        <button class="btn btn-sm btn-secondary" onclick="editHomeBase(${i})"><i class="fas fa-edit"></i></button>
      </div>
    `).join('') || '<div class="empty-state"><p>No home bases configured</p></div>';
  }

  // Grants
  const grantsBody = document.getElementById('grantsBody');
  if (grantsBody) {
    grantsBody.innerHTML = (appData.grants || []).map(g => `
      <div style="display:flex;align-items:center;gap:10px;padding:10px;border:1px solid var(--gray-200);border-radius:8px;margin-bottom:8px;">
        <div style="flex:1;">
          <div style="font-weight:700;font-size:14px;">${g.name}</div>
          <div style="font-size:12px;color:var(--gray-500);">${g.grantor || ''}</div>
        </div>
        <div style="text-align:right;font-size:13px;">
          ${g.totalAmount ? `$${g.totalAmount.toLocaleString()} total` : ''}
        </div>
        <button class="btn btn-sm btn-secondary" onclick="editGrant('${g._id}')"><i class="fas fa-edit"></i></button>
      </div>
    `).join('') || '<div class="empty-state"><p>No grants added yet</p></div>';
  }

  // Partners
  const partnersBody = document.getElementById('partnersBody');
  if (partnersBody) {
    partnersBody.innerHTML = (appData.partners || []).map(p => `
      <div style="display:flex;align-items:center;gap:10px;padding:10px;border:1px solid var(--gray-200);border-radius:8px;margin-bottom:8px;">
        <div style="flex:1;">
          <div style="font-weight:700;font-size:14px;">${p.name}</div>
          <div style="font-size:12px;color:var(--gray-500);">${p.contactName || ''} ${p.contactPhone || ''}</div>
        </div>
      </div>
    `).join('') || '<div class="empty-state"><p>No partner agencies added yet</p></div>';
  }

  // Vehicles
  const vehiclesBody = document.getElementById('vehiclesBody');
  if (vehiclesBody) {
    vehiclesBody.innerHTML = (appData.vehicles || []).map(v => `
      <div style="display:flex;align-items:center;gap:10px;padding:10px;border:1px solid var(--gray-200);border-radius:8px;margin-bottom:8px;">
        <div style="flex:1;">
          <div style="font-weight:700;font-size:14px;">${v.name}</div>
          <div style="font-size:12px;color:var(--gray-500);">${v.make || ''} ${v.model || ''} ${v.year || ''} — ${v.licensePlate || 'No plate'}</div>
        </div>
        <span class="badge badge-${v.status === 'available' ? 'completed' : v.status === 'in_use' ? 'in_progress' : 'pending'}">${v.status}</span>
        <button class="btn btn-sm btn-secondary" onclick="editVehicle('${v._id}')"><i class="fas fa-edit"></i></button>
      </div>
    `).join('') || '<div class="empty-state"><p>No vehicles configured</p></div>';
  }

  // Self-pay / payment config
  if (org.selfPayConfig) {
    const cfg = org.selfPayConfig;
    if (cfg.paymentLink) document.getElementById('paymentLink').value = cfg.paymentLink;
    if (cfg.venmoHandle) document.getElementById('venmoHandle').value = cfg.venmoHandle;
    if (cfg.cashAppHandle) document.getElementById('cashAppHandle').value = cfg.cashAppHandle;
  }
  if (org.paymentProvider) document.getElementById('paymentProvider').value = org.paymentProvider;
  if (org.weeklyBillingDay) document.getElementById('weeklyBillingDay').value = org.weeklyBillingDay;
}

async function savePaymentConfig() {
  const paymentLink     = document.getElementById('paymentLink').value;
  const venmoHandle     = document.getElementById('venmoHandle').value;
  const cashAppHandle   = document.getElementById('cashAppHandle').value;
  const paymentProvider = document.getElementById('paymentProvider').value;
  const weeklyBillingDay = document.getElementById('weeklyBillingDay').value;

  const res = await ZakAuth.apiFetch('/api/admin/org', {
    method: 'PUT',
    body: JSON.stringify({
      selfPayConfig: { paymentLink, venmoHandle, cashAppHandle },
      paymentProvider,
      weeklyBillingDay
    })
  });
  if (res?.success) {
    appData.org = res.org;
    showToast('Payment config saved!', 'success');
  }
}

// ── MODALS ────────────────────────────────────────────────
function openModal(id) {
  document.getElementById(id)?.classList.add('active');
  document.getElementById('modalOverlay')?.classList.add('active');
}
function closeModal(id) {
  document.getElementById(id)?.classList.remove('active');
  document.getElementById('modalOverlay')?.classList.remove('active');
}
document.getElementById('modalOverlay')?.addEventListener('click', () => {
  document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active'));
  document.getElementById('modalOverlay')?.classList.remove('active');
});

function openAddRiderModal() { openModal('addRiderModal'); }
function openAddUserModal()  { openModal('addUserModal'); }
function openAddGrantModal() { openModal('addGrantModal'); }
function openAddPartnerModal(){ openModal('addPartnerModal'); }
function openAddVehicleModal(){ openModal('addVehicleModal'); }

async function saveNewRider() {
  const firstName = document.getElementById('riderFirstName').value.trim();
  const lastName  = document.getElementById('riderLastName').value.trim();
  const phone     = document.getElementById('riderPhone').value.trim();
  const email     = document.getElementById('riderEmail').value.trim();
  const notes     = document.getElementById('riderNotes').value.trim();

  // Assemble address from split fields
  const street = document.getElementById('riderStreet').value.trim();
  const city   = document.getElementById('riderCity').value.trim();
  const state  = document.getElementById('riderState').value.trim().toUpperCase();
  const zip    = document.getElementById('riderZip').value.trim();
  const parts  = [street, city && state ? `${city}, ${state}` : city || state, zip].filter(Boolean);
  const homeAddress = parts.join(' ');

  if (!firstName || !lastName || !phone) {
    showToast('First name, last name, and phone are required.', 'error');
    return;
  }

  const res = await ZakAuth.apiFetch('/api/trips/riders', {
    method: 'POST',
    body: JSON.stringify({ firstName, lastName, phone, email, homeAddress, notes })
  });

  if (res?.success) {
    showToast(`Rider ${firstName} ${lastName} added!`, 'success');
    closeModal('addRiderModal');
    ['riderFirstName','riderLastName','riderPhone','riderEmail',
     'riderStreet','riderCity','riderState','riderZip','riderNotes']
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    loadRiders();
  } else {
    showToast(res?.error || 'Failed to add rider.', 'error');
  }
}

async function saveNewUser() {
  const firstName = document.getElementById('userFirstName').value.trim();
  const lastName  = document.getElementById('userLastName').value.trim();
  const email     = document.getElementById('userEmail').value.trim();
  const phone     = document.getElementById('userPhone').value.trim();
  const password  = document.getElementById('userPassword').value;
  const vehicleId = document.getElementById('userVehicle').value;

  const roles = [];
  document.querySelectorAll('#addUserModal .checkbox-group input:checked').forEach(cb => roles.push(cb.value));

  if (!firstName || !lastName || !email || !password) {
    showToast('All required fields must be filled.', 'error');
    return;
  }

  const res = await ZakAuth.apiFetch('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify({ firstName, lastName, email, phone, password, roles, vehicleId: vehicleId || null })
  });

  if (res?.success) {
    showToast(`${firstName} ${lastName} added to team!`, 'success');
    closeModal('addUserModal');
    loadTeam();
    await loadAppData();
  } else {
    showToast(res?.error || 'Failed to add team member.', 'error');
  }
}

async function saveGrant() {
  const name    = document.getElementById('grantName').value.trim();
  const grantor = document.getElementById('grantGrantor').value.trim();
  const amount  = parseFloat(document.getElementById('grantAmount').value) || 0;
  const endDate = document.getElementById('grantEndDate').value;
  const notes   = document.getElementById('grantNotes').value.trim();

  if (!name) { showToast('Grant name is required.', 'error'); return; }

  const res = await ZakAuth.apiFetch('/api/admin/grants', {
    method: 'POST',
    body: JSON.stringify({ name, grantor, totalAmount: amount, endDate: endDate || null, reportingNotes: notes })
  });

  if (res?.success) {
    showToast('Grant added!', 'success');
    closeModal('addGrantModal');
    appData.grants.push(res.grant);
    populateFormDropdowns();
    loadAdminSettings();
  }
}

async function savePartner() {
  const name    = document.getElementById('partnerName').value.trim();
  const contact = document.getElementById('partnerContact').value.trim();
  const phone   = document.getElementById('partnerPhone').value.trim();
  const email   = document.getElementById('partnerEmail').value.trim();
  const notes   = document.getElementById('partnerBillingNotes').value.trim();

  if (!name) { showToast('Agency name is required.', 'error'); return; }

  const res = await ZakAuth.apiFetch('/api/admin/partners', {
    method: 'POST',
    body: JSON.stringify({ name, contactName: contact, contactPhone: phone, contactEmail: email, billingNotes: notes })
  });

  if (res?.success) {
    showToast('Partner added!', 'success');
    closeModal('addPartnerModal');
    appData.partners.push(res.partner);
    populateFormDropdowns();
    loadAdminSettings();
  }
}

async function saveVehicle() {
  const name     = document.getElementById('vehName').value.trim();
  const plate    = document.getElementById('vehPlate').value.trim();
  const make     = document.getElementById('vehMake').value.trim();
  const model    = document.getElementById('vehModel').value.trim();
  const year     = parseInt(document.getElementById('vehYear').value) || null;
  const capacity = parseInt(document.getElementById('vehCapacity').value) || 7;

  if (!name) { showToast('Vehicle name is required.', 'error'); return; }

  const res = await ZakAuth.apiFetch('/api/admin/vehicles', {
    method: 'POST',
    body: JSON.stringify({ name, licensePlate: plate, make, model, year, capacity })
  });

  if (res?.success) {
    showToast('Vehicle added!', 'success');
    closeModal('addVehicleModal');
    appData.vehicles.push(res.vehicle);
    populateFormDropdowns();
    loadAdminSettings();
  }
}

// ── REPORTS ───────────────────────────────────────────────
function generateReport(type) {
  showToast(`Generating ${type} report... (coming soon)`, 'success');
}

// ── HELPERS ───────────────────────────────────────────────
function statusBadge(status) {
  const labels = {
    scheduled: 'Scheduled', in_progress: 'In Progress', completed: 'Completed',
    canceled: 'Canceled', pending: 'Pending', en_route: 'En Route',
    aboard: 'Aboard', no_show: 'No Show', available: 'Available',
    used: 'Used', expired: 'Expired', revoked: 'Revoked'
  };
  return `<span class="badge badge-${status}">${labels[status] || status}</span>`;
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function showToast(msg, type = '') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast show ${type}`;
  setTimeout(() => toast.classList.remove('show'), 3500);
}

// Placeholder functions for edit actions
async function editRider(riderId) {
  const res = await ZakAuth.apiFetch(`/api/trips/riders/${riderId}`);
  if (!res?.success) { showToast('Could not load rider data.', 'error'); return; }
  const r = res.rider;

  // Parse stored address back into parts (best-effort)
  // Stored format: "123 Main St St. Petersburg, FL 33701"
  let street = '', city = '', state = '', zip = '';
  if (r.homeAddress) {
    // Try to extract ZIP (last 5 digits)
    const zipMatch = r.homeAddress.match(/(\d{5})\s*$/);
    if (zipMatch) {
      zip = zipMatch[1];
      const withoutZip = r.homeAddress.slice(0, r.homeAddress.lastIndexOf(zip)).trim().replace(/,?\s*$/, '');
      // Try to split on ", STATE" pattern
      const stateMatch = withoutZip.match(/^(.+),\s*([A-Z]{2})$/);
      if (stateMatch) {
        state = stateMatch[2];
        // Split city from street on last comma before state
        const beforeState = stateMatch[1];
        const lastComma = beforeState.lastIndexOf(',');
        if (lastComma > 0) {
          street = beforeState.slice(0, lastComma).trim();
          city   = beforeState.slice(lastComma + 1).trim();
        } else {
          street = beforeState.trim();
        }
      } else {
        street = withoutZip;
      }
    } else {
      street = r.homeAddress;
    }
  }

  document.getElementById('editRiderId').value        = r._id;
  document.getElementById('editRiderFirstName').value = r.firstName;
  document.getElementById('editRiderLastName').value  = r.lastName;
  document.getElementById('editRiderPhone').value     = r.phone || '';
  document.getElementById('editRiderEmail').value     = r.email || '';
  document.getElementById('editRiderStreet').value    = street;
  document.getElementById('editRiderCity').value      = city;
  document.getElementById('editRiderState').value     = state;
  document.getElementById('editRiderZip').value       = zip;
  document.getElementById('editRiderNotes').value     = r.notes || '';

  openModal('editRiderModal');
}

async function saveEditRider() {
  const riderId    = document.getElementById('editRiderId').value;
  const firstName  = document.getElementById('editRiderFirstName').value.trim();
  const lastName   = document.getElementById('editRiderLastName').value.trim();
  const phone      = document.getElementById('editRiderPhone').value.trim();
  const email      = document.getElementById('editRiderEmail').value.trim();
  const notes      = document.getElementById('editRiderNotes').value.trim();

  const street = document.getElementById('editRiderStreet').value.trim();
  const city   = document.getElementById('editRiderCity').value.trim();
  const state  = document.getElementById('editRiderState').value.trim().toUpperCase();
  const zip    = document.getElementById('editRiderZip').value.trim();
  const parts  = [street, city && state ? `${city}, ${state}` : city || state, zip].filter(Boolean);
  const homeAddress = parts.join(' ');

  if (!firstName || !lastName || !phone) {
    showToast('First name, last name, and phone are required.', 'error');
    return;
  }

  const res = await ZakAuth.apiFetch(`/api/trips/riders/${riderId}`, {
    method: 'PUT',
    body: JSON.stringify({ firstName, lastName, phone, email, homeAddress, notes })
  });

  if (res?.success) {
    showToast(`${firstName} ${lastName} updated!`, 'success');
    closeModal('editRiderModal');
    loadRiders();
  } else {
    showToast(res?.error || 'Failed to update rider.', 'error');
  }
}

async function deleteRider(riderId, riderName) {
  if (!confirm(`Delete rider "${riderName}"?\n\nThis will permanently remove them from the system. Their trip history will be preserved for reporting.`)) return;

  const res = await ZakAuth.apiFetch(`/api/trips/riders/${riderId}`, { method: 'DELETE' });

  if (res?.success) {
    showToast(`${riderName} has been removed.`, 'success');
    loadRiders();
  } else {
    showToast(res?.error || 'Failed to delete rider.', 'error');
  }
}
// ── FARE ZONE EDIT / ADD ─────────────────────────────────
function addFareZone() { openModal('addFareZoneModal'); }

function editFareZone(i) {
  const z = (appData.org?.fareZones || [])[i];
  if (!z) return;
  document.getElementById('editFzIndex').value = i;
  document.getElementById('editFzName').value  = z.name || '';
  document.getElementById('editFzDesc').value  = z.description || '';
  document.getElementById('editFzMin').value   = z.minMiles ?? 0;
  document.getElementById('editFzMax').value   = z.maxMiles ?? '';
  document.getElementById('editFzRT').value    = z.roundTripFare ?? '';
  document.getElementById('editFzOW').value    = z.oneWayFare ?? '';
  document.getElementById('editFzNotes').value = z.notes || '';
  openModal('editFareZoneModal');
}

async function saveEditFareZone() {
  const i    = parseInt(document.getElementById('editFzIndex').value);
  const zones = [...(appData.org?.fareZones || [])];
  zones[i] = {
    ...zones[i],
    name:          document.getElementById('editFzName').value.trim(),
    description:   document.getElementById('editFzDesc').value.trim(),
    minMiles:      parseFloat(document.getElementById('editFzMin').value) || 0,
    maxMiles:      document.getElementById('editFzMax').value ? parseFloat(document.getElementById('editFzMax').value) : null,
    roundTripFare: parseFloat(document.getElementById('editFzRT').value) || 0,
    oneWayFare:    parseFloat(document.getElementById('editFzOW').value) || 0,
    notes:         document.getElementById('editFzNotes').value.trim()
  };
  if (!zones[i].name) { showToast('Zone name is required.', 'error'); return; }
  const res = await ZakAuth.apiFetch('/api/admin/org', { method: 'PUT', body: JSON.stringify({ fareZones: zones }) });
  if (res?.success) {
    showToast('Fare zone updated!', 'success');
    appData.org = res.org;
    closeModal('editFareZoneModal');
    loadAdminSettings();
  } else {
    showToast(res?.error || 'Failed to update fare zone.', 'error');
  }
}

async function deleteFareZone() {
  const i = parseInt(document.getElementById('editFzIndex').value);
  if (!confirm('Delete this fare zone?')) return;
  const zones = (appData.org?.fareZones || []).filter((_, idx) => idx !== i);
  const res = await ZakAuth.apiFetch('/api/admin/org', { method: 'PUT', body: JSON.stringify({ fareZones: zones }) });
  if (res?.success) {
    showToast('Fare zone deleted.', 'success');
    appData.org = res.org;
    closeModal('editFareZoneModal');
    loadAdminSettings();
  } else {
    showToast(res?.error || 'Failed to delete fare zone.', 'error');
  }
}

async function saveNewFareZone() {
  const name = document.getElementById('newFzName').value.trim();
  if (!name) { showToast('Zone name is required.', 'error'); return; }
  const newZone = {
    name,
    description:   document.getElementById('newFzDesc').value.trim(),
    minMiles:      parseFloat(document.getElementById('newFzMin').value) || 0,
    maxMiles:      document.getElementById('newFzMax').value ? parseFloat(document.getElementById('newFzMax').value) : null,
    roundTripFare: parseFloat(document.getElementById('newFzRT').value) || 0,
    oneWayFare:    parseFloat(document.getElementById('newFzOW').value) || 0,
    notes:         document.getElementById('newFzNotes').value.trim()
  };
  const zones = [...(appData.org?.fareZones || []), newZone];
  const res = await ZakAuth.apiFetch('/api/admin/org', { method: 'PUT', body: JSON.stringify({ fareZones: zones }) });
  if (res?.success) {
    showToast(`Fare zone "${name}" added!`, 'success');
    appData.org = res.org;
    closeModal('addFareZoneModal');
    ['newFzName','newFzDesc','newFzMin','newFzMax','newFzRT','newFzOW','newFzNotes'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    loadAdminSettings();
  } else {
    showToast(res?.error || 'Failed to add fare zone.', 'error');
  }
}

// ── HOME BASE EDIT ────────────────────────────────────────
function addHomeBase() { openModal('addHomeBaseModal'); }

function editHomeBase(i) {
  const b = (appData.org?.homeBases || [])[i];
  if (!b) return;
  document.getElementById('editHbIndex').value   = i;
  document.getElementById('editHbName').value    = b.name || '';
  document.getElementById('editHbAddress').value = b.address || '';
  document.getElementById('editHbDefault').checked = !!b.isDefault;
  openModal('editHomeBaseModal');
}

async function saveEditHomeBase() {
  const i       = parseInt(document.getElementById('editHbIndex').value);
  const name    = document.getElementById('editHbName').value.trim();
  const address = document.getElementById('editHbAddress').value.trim();
  const isDef   = document.getElementById('editHbDefault').checked;
  if (!name || !address) { showToast('Name and address are required.', 'error'); return; }
  const bases = [...(appData.org?.homeBases || [])];
  if (isDef) bases.forEach(b => b.isDefault = false);
  bases[i] = { ...bases[i], name, address, isDefault: isDef };
  const res = await ZakAuth.apiFetch('/api/admin/org', { method: 'PUT', body: JSON.stringify({ homeBases: bases }) });
  if (res?.success) {
    showToast('Home base updated!', 'success');
    appData.org = res.org;
    closeModal('editHomeBaseModal');
    loadAdminSettings();
    populateFormDropdowns();
  } else {
    showToast(res?.error || 'Failed to update home base.', 'error');
  }
}

async function deleteHomeBase() {
  const i = parseInt(document.getElementById('editHbIndex').value);
  if (!confirm('Delete this home base?')) return;
  const bases = (appData.org?.homeBases || []).filter((_, idx) => idx !== i);
  const res = await ZakAuth.apiFetch('/api/admin/org', { method: 'PUT', body: JSON.stringify({ homeBases: bases }) });
  if (res?.success) {
    showToast('Home base deleted.', 'success');
    appData.org = res.org;
    closeModal('editHomeBaseModal');
    loadAdminSettings();
    populateFormDropdowns();
  } else {
    showToast(res?.error || 'Failed to delete home base.', 'error');
  }
}

// ── VEHICLE EDIT ──────────────────────────────────────────
function editVehicle(vehicleId) {
  const v = appData.vehicles.find(v => String(v._id) === String(vehicleId));
  if (!v) return;
  document.getElementById('editVehId').value       = v._id;
  document.getElementById('editVehName').value     = v.name || '';
  document.getElementById('editVehPlate').value    = v.licensePlate || '';
  document.getElementById('editVehMake').value     = v.make || '';
  document.getElementById('editVehModel').value    = v.model || '';
  document.getElementById('editVehYear').value     = v.year || '';
  document.getElementById('editVehCapacity').value = v.capacity || 7;
  document.getElementById('editVehStatus').value   = v.status || 'available';
  openModal('editVehicleModal');
}

async function saveEditVehicle() {
  const id       = document.getElementById('editVehId').value;
  const name     = document.getElementById('editVehName').value.trim();
  const plate    = document.getElementById('editVehPlate').value.trim();
  const make     = document.getElementById('editVehMake').value.trim();
  const model    = document.getElementById('editVehModel').value.trim();
  const year     = parseInt(document.getElementById('editVehYear').value) || null;
  const capacity = parseInt(document.getElementById('editVehCapacity').value) || 7;
  const status   = document.getElementById('editVehStatus').value;
  if (!name) { showToast('Vehicle name is required.', 'error'); return; }
  const res = await ZakAuth.apiFetch(`/api/admin/vehicles/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name, licensePlate: plate, make, model, year, capacity, status })
  });
  if (res?.success) {
    showToast('Vehicle updated!', 'success');
    const idx = appData.vehicles.findIndex(v => v._id === id);
    if (idx !== -1) appData.vehicles[idx] = res.vehicle;
    closeModal('editVehicleModal');
    loadAdminSettings();
    populateFormDropdowns();
  } else {
    showToast(res?.error || 'Failed to update vehicle.', 'error');
  }
}

// ── GRANT EDIT ────────────────────────────────────────────
function editGrant(grantId) {
  const g = appData.grants.find(g => String(g._id) === String(grantId));
  if (!g) return;
  document.getElementById('editGrantId').value      = g._id;
  document.getElementById('editGrantName').value    = g.name || '';
  document.getElementById('editGrantGrantor').value = g.grantor || '';
  document.getElementById('editGrantAmount').value  = g.totalAmount || '';
  document.getElementById('editGrantEndDate').value = g.endDate ? g.endDate.split('T')[0] : '';
  document.getElementById('editGrantNotes').value   = g.reportingNotes || '';
  openModal('editGrantModal');
}

async function saveEditGrant() {
  const id      = document.getElementById('editGrantId').value;
  const name    = document.getElementById('editGrantName').value.trim();
  const grantor = document.getElementById('editGrantGrantor').value.trim();
  const amount  = parseFloat(document.getElementById('editGrantAmount').value) || 0;
  const endDate = document.getElementById('editGrantEndDate').value;
  const notes   = document.getElementById('editGrantNotes').value.trim();
  if (!name) { showToast('Grant name is required.', 'error'); return; }
  const res = await ZakAuth.apiFetch(`/api/admin/grants/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name, grantor, totalAmount: amount, endDate: endDate || null, reportingNotes: notes })
  });
  if (res?.success) {
    showToast('Grant updated!', 'success');
    const idx = appData.grants.findIndex(g => g._id === id);
    if (idx !== -1) appData.grants[idx] = res.grant;
    closeModal('editGrantModal');
    loadAdminSettings();
    populateFormDropdowns();
  } else {
    showToast(res?.error || 'Failed to update grant.', 'error');
  }
}

// ── EDIT USER ─────────────────────────────────────────────
async function editUser(userId) {
  if (!ZakAuth.hasRole('admin') && !ZakAuth.hasRole('super_admin')) {
    showToast('Admin access required to edit users.', 'error');
    return;
  }

  // Find user from already-loaded team data, or fetch fresh (include inactive for edit)
  const res = await ZakAuth.apiFetch('/api/admin/users?all=true');
  if (!res?.success) { showToast('Could not load user data.', 'error'); return; }
  const user = res.users.find(u => u._id === userId);
  if (!user) { showToast('User not found.', 'error'); return; }

  // Populate edit modal fields
  document.getElementById('editUserId').value        = user._id;
  document.getElementById('editUserFirstName').value = user.firstName;
  document.getElementById('editUserLastName').value  = user.lastName;
  document.getElementById('editUserEmail').value     = user.email;
  document.getElementById('editUserPhone').value     = user.phone || '';
  document.getElementById('editUserPassword').value  = '';

  // Set role checkboxes
  ['super_admin','admin','dispatcher','driver'].forEach(role => {
    const cb = document.getElementById(`editRole_${role}`);
    if (cb) cb.checked = (user.roles || []).includes(role);
  });

  // Hide super_admin checkbox for non-super-admins
  const saRow = document.getElementById('editRole_super_admin_row');
  if (saRow) saRow.style.display = ZakAuth.hasRole('super_admin') ? 'flex' : 'none';

  // Set vehicle dropdown
  const vehSel = document.getElementById('editUserVehicle');
  if (vehSel) {
    vehSel.innerHTML = '<option value="">No vehicle assigned</option>';
    appData.vehicles.forEach(v => {
      const sel = user.driverInfo?.vehicleAssigned?._id === v._id ||
                  user.driverInfo?.vehicleAssigned === v._id ? 'selected' : '';
      vehSel.innerHTML += `<option value="${v._id}" ${sel}>${v.name}</option>`;
    });
  }

  // Set active toggle
  const activeToggle = document.getElementById('editUserActive');
  if (activeToggle) activeToggle.checked = user.isActive !== false;

  openModal('editUserModal');
}

async function saveEditUser() {
  const userId    = document.getElementById('editUserId').value;
  const firstName = document.getElementById('editUserFirstName').value.trim();
  const lastName  = document.getElementById('editUserLastName').value.trim();
  const email     = document.getElementById('editUserEmail').value.trim();
  const phone     = document.getElementById('editUserPhone').value.trim();
  const password  = document.getElementById('editUserPassword').value;
  const vehicleId = document.getElementById('editUserVehicle').value;
  const isActive  = document.getElementById('editUserActive').checked;

  const roles = [];
  ['super_admin','admin','dispatcher','driver'].forEach(role => {
    const cb = document.getElementById(`editRole_${role}`);
    if (cb?.checked) roles.push(role);
  });

  if (!firstName || !lastName || !email) {
    showToast('First name, last name, and email are required.', 'error');
    return;
  }
  if (roles.length === 0) {
    showToast('Please assign at least one role.', 'error');
    return;
  }

  const body = { firstName, lastName, email, phone, roles, isActive, vehicleId: vehicleId || null };
  if (password) body.password = password;

  const res = await ZakAuth.apiFetch(`/api/admin/users/${userId}`, {
    method: 'PUT',
    body: JSON.stringify(body)
  });

  if (res?.success) {
    showToast(`${firstName} ${lastName} updated!`, 'success');
    closeModal('editUserModal');
    loadTeam();
    await loadAppData(); // refresh dropdowns
  } else {
    showToast(res?.error || 'Failed to update user.', 'error');
  }
}

async function deactivateUser(userId, name) {
  if (!confirm(`Deactivate ${name || 'this user'}? They will no longer be able to log in.`)) return;
  const res = await ZakAuth.apiFetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
  if (res?.success) {
    showToast(`${name || 'User'} deactivated.`, 'success');
    closeModal('editUserModal');
    loadTeam();
  } else {
    showToast(res?.error || 'Failed to deactivate user.', 'error');
  }
}

async function reactivateUser(userId, name) {
  if (!confirm(`Reactivate ${name || 'this user'}? They will be able to log in again.`)) return;
  const res = await ZakAuth.apiFetch(`/api/admin/users/${userId}`, {
    method: 'PUT',
    body: JSON.stringify({ isActive: true })
  });
  if (res?.success) {
    showToast(`${name || 'User'} reactivated.`, 'success');
    loadTeam();
  } else {
    showToast(res?.error || 'Failed to reactivate user.', 'error');
  }
}

// ── HOME BASE ─────────────────────────────────────────────
async function saveHomeBase() {
  const name      = document.getElementById('hbName').value.trim();
  const address   = document.getElementById('hbAddress').value.trim();
  const isDefault = document.getElementById('hbDefault').checked;

  if (!name || !address) {
    showToast('Name and address are required.', 'error');
    return;
  }

  // Fetch current org, add new base, save
  const orgRes = await ZakAuth.apiFetch('/api/admin/org');
  if (!orgRes?.success) { showToast('Could not load org data.', 'error'); return; }

  const homeBases = orgRes.org.homeBases || [];
  if (isDefault) homeBases.forEach(b => b.isDefault = false);
  homeBases.push({ name, address, isDefault });

  const res = await ZakAuth.apiFetch('/api/admin/org', {
    method: 'PUT',
    body: JSON.stringify({ homeBases })
  });

  if (res?.success) {
    showToast(`Home base "${name}" added!`, 'success');
    closeModal('addHomeBaseModal');
    appData.org = res.org;
    document.getElementById('hbName').value = '';
    document.getElementById('hbAddress').value = '';
    document.getElementById('hbDefault').checked = false;
    loadAdminSettings();
    populateFormDropdowns();
  } else {
    showToast(res?.error || 'Failed to save home base.', 'error');
  }
}

// ── ADDRESS AUTOCOMPLETE ──────────────────────────────────
// Simple saved-address suggestion using previously entered addresses
const _savedAddresses = JSON.parse(localStorage.getItem('zakSavedAddresses') || '[]');

function saveAddressToMemory(addr) {
  if (!addr || addr.length < 5) return;
  if (!_savedAddresses.includes(addr)) {
    _savedAddresses.unshift(addr);
    if (_savedAddresses.length > 50) _savedAddresses.pop();
    localStorage.setItem('zakSavedAddresses', JSON.stringify(_savedAddresses));
  }
}

function attachAddressAutocomplete(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;

  // Create datalist
  const listId = inputId + '_suggestions';
  let dl = document.getElementById(listId);
  if (!dl) {
    dl = document.createElement('datalist');
    dl.id = listId;
    document.body.appendChild(dl);
    input.setAttribute('list', listId);
  }

  input.addEventListener('input', () => {
    const val = input.value.toLowerCase();
    dl.innerHTML = _savedAddresses
      .filter(a => a.toLowerCase().includes(val))
      .slice(0, 8)
      .map(a => `<option value="${a}">`)
      .join('');
  });

  input.addEventListener('blur', () => {
    saveAddressToMemory(input.value.trim());
  });
}

// Attach autocomplete to trip scheduling address fields once DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  attachAddressAutocomplete('stopPickup');
  attachAddressAutocomplete('stopDest');
  initPhoneFormatting();
  initZipLookup();
  initTimeTabNavigation();
});
// ── TIME FIELD TAB NAVIGATION ─────────────────────────────
// Pressing Tab on a time input immediately jumps to the next focusable element
// instead of cycling through hours/minutes/AM-PM within the same field.
function initTimeTabNavigation() {
  // Use capture phase (true) so we intercept Tab before the browser's native time-picker handler
  document.addEventListener('keydown', e => {
    if (e.key !== 'Tab' || !e.target.matches('input[type="time"]')) return;
    e.preventDefault();
    e.stopPropagation();
    const focusable = Array.from(document.querySelectorAll(
      'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])'
    )).filter(el => el.offsetParent !== null);
    const idx = focusable.indexOf(e.target);
    const next = e.shiftKey ? focusable[idx - 1] : focusable[idx + 1];
    if (next) { next.focus(); next.select && next.select(); }
  }, true); // capture phase
}

// ── PHONE NUMBER AUTO-FORMATTING ─────────────────────────
// Formats any input.phone-format as (XXX) XXX-XXXX while the user types
function formatPhoneNumber(value) {
  // Strip everything except digits
  const digits = value.replace(/\D/g, '').substring(0, 10);
  const len = digits.length;
  if (len === 0) return '';
  if (len < 4)  return `(${digits}`;
  if (len < 7)  return `(${digits.slice(0,3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
}

function initPhoneFormatting() {
  // Apply to all current and future phone-format inputs via event delegation
  document.addEventListener('input', e => {
    if (e.target.classList.contains('phone-format')) {
      const input = e.target;
      const cursor = input.selectionStart;
      const rawBefore = input.value.substring(0, cursor).replace(/\D/g, '').length;
      input.value = formatPhoneNumber(input.value);
      // Restore cursor position after formatting
      let newCursor = 0, digitCount = 0;
      for (let i = 0; i < input.value.length; i++) {
        if (/\d/.test(input.value[i])) digitCount++;
        if (digitCount === rawBefore) { newCursor = i + 1; break; }
      }
      input.setSelectionRange(newCursor, newCursor);
    }
  });
  // Prevent non-numeric key presses (allow backspace, delete, arrows, tab)
  document.addEventListener('keydown', e => {
    if (!e.target.classList.contains('phone-format')) return;
    const allowed = ['Backspace','Delete','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Tab','Enter','Home','End'];
    if (allowed.includes(e.key)) return;
    if (e.ctrlKey || e.metaKey) return; // allow copy/paste shortcuts
    if (!/^\d$/.test(e.key)) e.preventDefault();
  });
}

// ── ZIP CODE → CITY / STATE LOOKUP ───────────────────────
// Uses the free zippopotam.us API — no key required
function initZipLookup() {
  document.addEventListener('input', e => {
    if (!e.target.classList.contains('zip-lookup')) return;
    const zip = e.target.value.replace(/\D/g, '');
    if (zip.length !== 5) return;

    const cityId  = e.target.id.replace('Zip', 'City');
    const stateId = e.target.id.replace('Zip', 'State');
    const cityEl  = document.getElementById(cityId);
    const stateEl = document.getElementById(stateId);
    if (!cityEl || !stateEl) return;

    // Show a subtle loading indicator
    cityEl.placeholder = 'Looking up...';

    fetch(`https://api.zippopotam.us/us/${zip}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && data.places && data.places.length > 0) {
          const place = data.places[0];
          cityEl.value  = place['place name'];
          stateEl.value = place['state abbreviation'];
          cityEl.placeholder = 'City';
          // Move focus to street if it's empty
          const streetId = e.target.id.replace('Zip', 'Street');
          const streetEl = document.getElementById(streetId);
          if (streetEl && !streetEl.value) streetEl.focus();
        } else {
          cityEl.placeholder = 'City';
          showToast('ZIP code not found — please enter city and state manually.', 'error');
        }
      })
      .catch(() => {
        cityEl.placeholder = 'City';
      });
  });
}

// ── RECURRING TRIPS ───────────────────────────────────────
// Populate recurring form dropdowns when view is shown
function initRecurringView() {
  // Riders
  const recRiderSel = document.getElementById('recRider');
  if (recRiderSel && recRiderSel.options.length <= 1) {
    loadRidersIntoSelect('recRider');
  }
  // Drivers
  const recDriverSel = document.getElementById('recDriver');
  if (recDriverSel) {
    recDriverSel.innerHTML = '<option value="">Select driver...</option>';
    (appData.drivers || []).forEach(d => {
      const opt = document.createElement('option');
      opt.value = d._id;
      opt.textContent = `${d.firstName} ${d.lastName}`;
      recDriverSel.appendChild(opt);
    });
  }
  // Vehicles
  const recVehicleSel = document.getElementById('recVehicle');
  if (recVehicleSel) {
    recVehicleSel.innerHTML = '<option value="">Select vehicle...</option>';
    (appData.vehicles || []).forEach(v => {
      const opt = document.createElement('option');
      opt.value = v._id;
      opt.textContent = `${v.name} (${v.licensePlate || 'no plate'})`;
      recVehicleSel.appendChild(opt);
    });
  }
  // Home Bases
  const recBaseSel = document.getElementById('recHomeBase');
  if (recBaseSel && appData.org?.homeBases) {
    recBaseSel.innerHTML = '<option value="">Select home base...</option>';
    appData.org.homeBases.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.name;
      opt.textContent = b.name;
      if (b.isDefault) opt.selected = true;
      recBaseSel.appendChild(opt);
    });
  }
  // Default start date to today
  const recStart = document.getElementById('recStartDate');
  if (recStart && !recStart.value) {
    recStart.value = new Date().toISOString().slice(0, 10);
  }
}

function toggleRecReturnTime() {
  const type = document.getElementById('recTripType')?.value;
  const grp  = document.getElementById('recReturnTimeGroup');
  if (grp) grp.style.display = type === 'round_trip' ? '' : 'none';
}

function selectWeekdays() {
  document.querySelectorAll('#recDaysGroup input[type="checkbox"]').forEach(cb => {
    cb.checked = ['1','2','3','4','5'].includes(cb.value);
  });
}
function selectAllDays() {
  document.querySelectorAll('#recDaysGroup input[type="checkbox"]').forEach(cb => cb.checked = true);
}
function clearDays() {
  document.querySelectorAll('#recDaysGroup input[type="checkbox"]').forEach(cb => cb.checked = false);
}

function getRecurringDates() {
  const startStr = document.getElementById('recStartDate')?.value;
  const endStr   = document.getElementById('recEndDate')?.value;
  if (!startStr || !endStr) return [];
  const selectedDays = Array.from(
    document.querySelectorAll('#recDaysGroup input[type="checkbox"]:checked')
  ).map(cb => parseInt(cb.value));
  if (selectedDays.length === 0) return [];

  const dates = [];
  const cur = new Date(startStr + 'T12:00:00'); // noon to avoid DST issues
  const end = new Date(endStr   + 'T12:00:00');
  while (cur <= end) {
    if (selectedDays.includes(cur.getDay())) {
      dates.push(cur.toISOString().slice(0, 10));
    }
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function previewRecurringTrips() {
  const dates = getRecurringDates();
  const preview = document.getElementById('recPreview');
  const count   = document.getElementById('recPreviewCount');
  if (!preview || !count) return;
  if (dates.length === 0) {
    preview.style.display = 'block';
    count.textContent = 'No dates match — please select days and a valid date range.';
    count.style.color = '#c0392b';
    return;
  }
  const tripType = document.getElementById('recTripType')?.value;
  const totalTrips = tripType === 'round_trip' ? dates.length * 2 : dates.length;
  preview.style.display = 'block';
  count.style.color = '#0a6640';
  count.textContent = `✅ ${dates.length} day(s) selected → ${totalTrips} trip(s) will be created` +
    ` (${dates[0]} to ${dates[dates.length - 1]})`;
}

async function submitRecurringTrips(e) {
  e.preventDefault();
  const dates = getRecurringDates();
  if (dates.length === 0) {
    showToast('Please select at least one day and a valid date range.', 'error');
    return;
  }
  const riderId      = document.getElementById('recRider')?.value;
  const pickup       = document.getElementById('recPickup')?.value;
  const dest         = document.getElementById('recDest')?.value;
  const pickupTime   = document.getElementById('recPickupTime')?.value;
  const apptTime     = document.getElementById('recApptTime')?.value;
  const tripType     = document.getElementById('recTripType')?.value;
  const returnTime   = document.getElementById('recReturnTime')?.value;
  const driver       = document.getElementById('recDriver')?.value;
  const vehicle      = document.getElementById('recVehicle')?.value;
  const homeBaseName = document.getElementById('recHomeBase')?.value;
  const paymentType  = document.getElementById('recPaymentType')?.value;
  const homeBase     = appData.org?.homeBases?.find(b => b.name === homeBaseName) || { name: homeBaseName };
  // Eastern Time ISO helper (same as in scheduleTrip)
  const toEasternISO = (dateStr, timeStr) => {
    if (!dateStr || !timeStr) return null;
    const testDate = new Date(`${dateStr}T12:00:00`);
    const offset = testDate.toLocaleString('en-US', { timeZone: 'America/New_York', timeZoneName: 'short' }).includes('EDT') ? '-04:00' : '-05:00';
    return `${dateStr}T${timeStr}:00${offset}`;
  };

  const btn = document.getElementById('recSubmitBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';

  let created = 0;
  let failed  = 0;

  for (const dateStr of dates) {
    // Build outbound trip
    const stops = [
      {
        stopOrder: 0, type: 'pickup', riderId: riderId || null,
        address: pickup,
        scheduledTime: toEasternISO(dateStr, pickupTime),
        status: 'pending'
      },
      {
        stopOrder: 1, type: 'dropoff', riderId: riderId || null,
        address: dest,
        appointmentTime: toEasternISO(dateStr, apptTime),
        status: 'pending'
      }
    ];
    const body = {
      tripDate: new Date(dateStr).toISOString(),
      driver, vehicle, homeBase,
      stops,
      payment: { type: paymentType }
    };
    const res = await ZakAuth.apiFetch('/api/trips', { method: 'POST', body: JSON.stringify(body) });
    if (res?.success) { created++; } else { failed++; }

    // Build return trip if round trip
    if (tripType === 'round_trip' && returnTime) {
      const returnStops = [
        {
          stopOrder: 0, type: 'pickup', riderId: riderId || null,
          address: dest,
          scheduledTime: toEasternISO(dateStr, returnTime),
          notes: '[RETURN TRIP]',
          status: 'pending'
        },
        {
          stopOrder: 1, type: 'dropoff', riderId: riderId || null,
          address: pickup,
          status: 'pending'
        }
      ];
      const returnBody = {
        tripDate: new Date(dateStr).toISOString(),
        driver, vehicle, homeBase,
        notes: '[RETURN TRIP]',
        stops: returnStops,
        payment: { type: paymentType }
      };
      const retRes = await ZakAuth.apiFetch('/api/trips', { method: 'POST', body: JSON.stringify(returnBody) });
      if (retRes?.success) { created++; } else { failed++; }
    }
  }

  btn.disabled = false;
  btn.innerHTML = '<i class="fas fa-calendar-check"></i> Generate Trips';

  if (failed === 0) {
    showToast(`✅ ${created} trip(s) created successfully!`, 'success');
    document.getElementById('recurringForm').reset();
    document.getElementById('recPreview').style.display = 'none';
  } else {
    showToast(`${created} trips created, ${failed} failed. Check the Trips list.`, 'error');
  }
}
