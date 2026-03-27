// ============================================================
// RYDEWORKS — Driver App JS
// ============================================================

ZakAuth.requireAuth();

const API = '';
let currentTrip = null;
let currentStopIndex = 0;
let shiftStarted = false;
let screenHistory = ['route'];
let selectedMapTarget = null;
let MAPBOX_TOKEN = '';

// Fetch Mapbox token from server config
(async () => {
  try {
    const cfg = await fetch('/api/config').then(r => r.json());
    MAPBOX_TOKEN = cfg.mapboxToken || '';
  } catch (e) {}
})();

const KNOWN_LOCATION_ALIASES = {
  'perc st pete': '1523 16th St S, St. Petersburg, FL 33705',
  'perc st. pete': '1523 16th St S, St. Petersburg, FL 33705',
  'perc st petersburg': '1523 16th St S, St. Petersburg, FL 33705',
  'perc clearwater': '12810 US Hwy 19 N, Clearwater, FL 33764'
};

function normalizeAddress(address) {
  if (!address) return '';
  const trimmed = String(address).trim();
  const key = trimmed.toLowerCase();
  if (KNOWN_LOCATION_ALIASES[key]) return KNOWN_LOCATION_ALIASES[key];
  if (/\bperc st\.? pete\b/i.test(trimmed)) return '1523 16th St S, St. Petersburg, FL 33705';
  if (/\bperc clearwater\b/i.test(trimmed)) return '12810 US Hwy 19 N, Clearwater, FL 33764';
  return trimmed;
}

function sortStopsByOrder(stops = []) {
  return [...stops].sort((a, b) => (a.stopOrder ?? 0) - (b.stopOrder ?? 0));
}

function isStopDone(stop) {
  if (stop?.type === 'pickup' && stop?.status === 'aboard') return true;
  return ['completed', 'no_show', 'canceled'].includes(stop?.status);
}

function getRemainingStops(trip) {
  return sortStopsByOrder(trip?.stops || []).filter(stop => !isStopDone(stop));
}

function getNextStopTimeValue(stop) {
  if (!stop) return Number.MAX_SAFE_INTEGER;
  const ts = stop.scheduledTime || stop.appointmentTime || stop.scheduledPickupTime || null;
  const t = ts ? new Date(ts).getTime() : NaN;
  return Number.isFinite(t) ? t : Number.MAX_SAFE_INTEGER;
}

function getTripPriority(trip) {
  const remaining = getRemainingStops(trip);
  const nextStop = remaining[0] || null;
  const nextTime = getNextStopTimeValue(nextStop);
  const isReturnTrip = /\[RETURN TRIP\]/i.test(String(trip?.notes || ''));
  return {
    inProgress: trip?.status === 'in_progress' ? 0 : 1,
    nextTime,
    isReturnTrip: isReturnTrip ? 1 : 0,
    createdAt: trip?.createdAt ? new Date(trip.createdAt).getTime() : Number.MAX_SAFE_INTEGER
  };
}

function compareTripsForDriver(a, b) {
  const pa = getTripPriority(a);
  const pb = getTripPriority(b);
  return (pa.inProgress - pb.inProgress) || (pa.nextTime - pb.nextTime) || (pa.isReturnTrip - pb.isReturnTrip) || (pa.createdAt - pb.createdAt);
}

function getActiveStop(trip) {
  return getRemainingStops(trip)[0] || null;
}

function getStopTypeLabel(stop) {
  return stop?.type === 'dropoff' ? 'Drop-off' : 'Pickup';
}

function getStopAddress(stop) {
  return normalizeAddress(stop?.address || (stop?.type === 'dropoff' ? stop?.dropoffAddress : stop?.pickupAddress) || '');
}


function getStopActionConfig(stop) {
  const status = stop?.status || 'pending';
  const isPickup = stop?.type !== 'dropoff';
  if (isStopDone(stop)) return [];

  if (isPickup) {
    if (status === 'pending') {
      return [{ status: 'en_route', label: 'En Route', icon: 'fas fa-car', style: 'background:var(--gold);color:var(--gray-900);' }];
    }
    if (status === 'en_route') {
      return [{ status: 'arrived', label: 'Arrived at Pickup', icon: 'fas fa-map-marker-alt', style: 'background:#3b82f6;color:#fff;' }];
    }
    // arrived: next action is Rider On Board (SMS already sent to rider on arrival)
    return [{ status: 'aboard', label: 'Rider On Board', icon: 'fas fa-user-check', style: 'background:#f59e0b;color:#fff;' }];
  }

  // Dropoff: rider is already on board, just need Dropped Off
  return [{ status: 'completed', label: 'Dropped Off', icon: 'fas fa-flag-checkered', style: '' }];
}

function getRiderDisplayName(stop) {
  return `${stop?.riderId?.firstName || 'Rider'} ${stop?.riderId?.lastName || ''}`.trim();
}

function findSelectedTargetIndex(stops = []) {
  if (!selectedMapTarget?.address) return 0;
  const normalizedTarget = normalizeAddress(selectedMapTarget.address);
  const idx = stops.findIndex(stop => getStopAddress(stop) === normalizedTarget && (!selectedMapTarget.legType || stop.type === selectedMapTarget.legType));
  return idx >= 0 ? idx : 0;
}


function getEasternDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const map = Object.fromEntries(parts.filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}


function getShiftStorageKey() {
  const user = ZakAuth.getUser() || {};
  return `rydeworks_shift_started_${user._id || 'driver'}_${getEasternDateString()}`;
}

function persistShiftStarted(value) {
  try {
    if (value) {
      localStorage.setItem(getShiftStorageKey(), '1');
      localStorage.setItem('zak_shift_active', 'true');
    } else {
      localStorage.removeItem(getShiftStorageKey());
      localStorage.removeItem('zak_shift_active');
    }
  } catch (e) {}
}

function hasPersistedShiftStarted() {
  try {
    return localStorage.getItem(getShiftStorageKey()) === '1' ||
           localStorage.getItem('zak_shift_active') === 'true';
  } catch (e) {
    return false;
  }
}

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
function showScreen(name, remember = true) {
  if (!shiftStarted && name === 'end') {
    showToast('Complete your pre-trip checklist to start your shift first.', 'error');
    name = 'start';
  }

  const active = document.querySelector('.screen.active')?.id?.replace('screen-','');
  if (remember && active && active !== name) screenHistory.push(name);
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById(`screen-${name}`)?.classList.add('active');
  document.getElementById(`tab-${name}`)?.classList.add('active');
  const backBtn = document.getElementById('backBtn');
  if (backBtn) backBtn.style.display = ['route','start'].includes(name) ? 'none' : '';

  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) refreshBtn.style.display = name === 'map' ? 'none' : '';
}

function goBack() {
  if (screenHistory.length > 1) screenHistory.pop();
  const prev = screenHistory[screenHistory.length - 1] || 'route';
  showScreen(prev, false);
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
  const today = getEasternDateString();
  const res = await ZakAuth.apiFetch('/api/trips/driver/my-trips');

  if (!res?.success || res.trips.length === 0) {
    currentTrip = null;
    shiftStarted = hasPersistedShiftStarted() || ZakAuth.getUser()?.driverInfo?.isAvailable === true;
    renderNoTrips();
    return;
  }

  const actionableTrips = (res.trips || []).filter(t => !['canceled','completed'].includes(t.status));
  if (actionableTrips.length === 0) {
    currentTrip = null;
    shiftStarted = hasPersistedShiftStarted() || ZakAuth.getUser()?.driverInfo?.isAvailable === true;
    window.appTrips = [];
    renderNoTrips();
    return;
  }

  const orderedTrips = [...actionableTrips].sort(compareTripsForDriver);
  const trip = orderedTrips[0] || null;

  window.appTrips = orderedTrips;
  currentTrip = trip;
  shiftStarted = orderedTrips.some(t => t.status === 'in_progress') || hasPersistedShiftStarted() || ZakAuth.getUser()?.driverInfo?.isAvailable === true;

  document.getElementById('profileTripsToday').textContent = orderedTrips.length;
  const totalRiders = orderedTrips.reduce((sum, t) => sum + (t.stops?.length || 0), 0);
  document.getElementById('profileRidersToday').textContent = totalRiders;

  if (shiftStarted) {
    renderRoute(trip);
  } else {
    renderPreShiftGate(trip, res.trips);
  }
}

async function refreshTrips() {
  const btn = document.getElementById('refreshBtn');
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
  await loadTodayTrip();
  btn.innerHTML = '<i class="fas fa-sync-alt"></i>';
  showToast('Route refreshed', 'success');
}

// ── RENDER ROUTE ──────────────────────────────────────────
function renderPreShiftGate(trip, trips = []) {
  const tripCount = trips.length;
  const stops = sortStopsByOrder(trip?.stops || []);
  const stopCount = stops.length;

  let html = `
    <div style="background:#FEF3C7;border:2px solid #F59E0B;border-radius:var(--radius);padding:14px 16px;margin-bottom:16px;">
      <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:10px;">
        <i class="fas fa-clipboard-check" style="color:#D97706;font-size:20px;flex-shrink:0;margin-top:2px;"></i>
        <div>
          <div style="font-weight:700;font-size:14px;color:#78350F;">Checklist required to start your route</div>
          <div style="font-size:12px;color:#92400E;margin-top:2px;">You can preview your stops below. Complete your pre-trip inspection to unlock trip actions.</div>
        </div>
      </div>
      <button onclick="showScreen('start')" style="width:100%;background:#D97706;color:#fff;border:none;border-radius:10px;padding:11px;font-size:14px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;">
        <i class="fas fa-clipboard-check"></i> Go to Pre-Trip Checklist
      </button>
    </div>
    <div class="route-header">
      <h3><i class="fas fa-route"></i> Today's Route Preview</h3>
      <div class="route-meta">
        <span><i class="fas fa-calendar-day"></i> ${tripCount} trip${tripCount !== 1 ? "s" : ""} assigned</span>
        <span><i class="fas fa-map-pin"></i> ${stopCount} stop${stopCount !== 1 ? "s" : ""} queued</span>
      </div>
      <div style="margin-top:8px;">
        <button onclick="showQRCode()" style="background:rgba(255,255,255,0.15);color:#fff;border:1px solid rgba(255,255,255,0.25);border-radius:10px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;width:100%;font-family:'Inter',sans-serif;">
          <i class="fas fa-qrcode"></i> Show Rider Booking QR Code
        </button>
      </div>
    </div>
  `;

  if (stops.length === 0) {
    html += `<div class="no-trips"><i class="fas fa-map-signs"></i><h3>No Stops Yet</h3><p>No stops assigned yet. Check back or contact your dispatcher.</p></div>`;
  } else {
    stops.forEach((stop, i) => {
      const riderName = getRiderDisplayName(stop);
      const currentAddress = getStopAddress(stop);
      const pairedAddress = normalizeAddress(stop.pairedAddress || '');
      const stopLabel = getStopTypeLabel(stop);
      const timeLabel = stop.type === 'pickup' ? 'Target pickup' : 'Target drop-off';
      const timeValue = stop.type === 'pickup' ? stop.scheduledTime : (stop.appointmentTime || stop.scheduledTime);

      html += `
        <div class="stop-card" id="stop-prev-${stop._id}">
          <div class="stop-number">${i + 1}</div>
          <div class="stop-rider">
            ${riderName}
            <span style="font-size:12px;background:${stop.type === 'pickup' ? 'rgba(0,212,200,0.12)' : 'rgba(239,68,68,0.12)'};color:${stop.type === 'pickup' ? 'var(--green)' : 'var(--danger)'};padding:2px 8px;border-radius:12px;margin-left:8px;">${stopLabel}</span>
          </div>
          ${stop.riderId?.phone ? `<div class="stop-phone"><a href="tel:${stop.riderId.phone}"><i class="fas fa-phone"></i> ${stop.riderId.phone}</a></div>` : ''}
          <div class="stop-address">
            <i class="${stop.type === 'pickup' ? 'fas fa-map-pin' : 'fas fa-flag'}"></i>
            <div>
              <div style="font-size:11px;color:${stop.type === 'pickup' ? 'var(--gray-500)' : 'var(--danger)'};font-weight:600;text-transform:uppercase;margin-bottom:2px;">${stopLabel}</div>
              <div>${currentAddress || 'No address'}</div>
            </div>
          </div>
          ${pairedAddress ? `
            <div class="stop-address" style="background:${stop.type === 'pickup' ? 'var(--danger-light)' : 'var(--green-pale)'};">
              <i class="${stop.type === 'pickup' ? 'fas fa-flag' : 'fas fa-map-pin'}" style="color:${stop.type === 'pickup' ? 'var(--danger)' : 'var(--green)'};"></i>
              <div>
                <div style="font-size:11px;color:${stop.type === 'pickup' ? 'var(--danger)' : 'var(--green)'};font-weight:600;text-transform:uppercase;margin-bottom:2px;">${stop.type === 'pickup' ? 'Later drop-off' : 'Original pickup'}</div>
                <div>${pairedAddress}</div>
              </div>
            </div>
          ` : ''}
          ${timeValue ? `<div class="stop-time"><i class="fas fa-clock"></i> ${timeLabel}: ${formatTime(timeValue)}</div>` : ''}
          ${stop.notes ? `<div class="stop-notes"><i class="fas fa-sticky-note"></i> ${stop.notes}</div>` : ''}
          ${stop.riderId?.notes ? `<div class="stop-notes"><i class="fas fa-info-circle"></i> ${stop.riderId.notes}</div>` : ''}
          <div style="background:var(--gray-100);border-radius:8px;padding:10px 12px;text-align:center;font-size:12px;color:var(--gray-500);">
            <i class="fas fa-lock" style="margin-right:4px;"></i> Complete checklist to unlock trip actions
          </div>
        </div>
      `;
    });
  }

  document.getElementById('routeContent').innerHTML = html;
}

function renderRoute(trip) {
  const container = document.getElementById('routeContent');
  if (!trip) { renderNoTrips(); return; }

  const stops = sortStopsByOrder(trip.stops || []);
  const completedCount = stops.filter(isStopDone).length;
  const totalCount = stops.length;
  const activeStop = getActiveStop(trip);
  currentStopIndex = activeStop ? stops.findIndex(s => s._id === activeStop._id) : -1;

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
      <div style="margin-top:8px;display:grid;gap:8px;">
        <button onclick="setDriverAvailability(${ZakAuth.getUser()?.driverInfo?.isAvailable === false ? 'true':'false'})" style="background:rgba(255,255,255,0.15);color:#fff;border:1px solid rgba(255,255,255,0.25);border-radius:10px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;width:100%;">
          <i class="fas fa-user-clock"></i> ${ZakAuth.getUser()?.driverInfo?.isAvailable === false ? 'Mark Available' : 'Mark Unavailable'}
        </button>
        <button onclick="showScreen('map');initDriverMap()" style="background:rgba(255,255,255,0.15);color:#fff;border:1px solid rgba(255,255,255,0.25);border-radius:10px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;width:100%;">
          <i class="fas fa-map"></i> Trip Overview Map
        </button>
        <button onclick="showQRCode()" style="background:rgba(255,255,255,0.15);color:#fff;border:1px solid rgba(255,255,255,0.25);border-radius:10px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;width:100%;">
          <i class="fas fa-qrcode"></i> Show Rider Booking QR Code
        </button>
      </div>
    </div>
  `;

  if (stops.length === 0) {
    html += `<div class="no-trips"><i class="fas fa-map-signs"></i><h3>No Stops</h3><p>This trip has no stops assigned yet.</p></div>`;
  } else {
    const activeStops = stops.filter(s => !isStopDone(s));
    const doneStops = stops.filter(s => isStopDone(s));

    // Render completed stops as collapsed summary at top
    if (doneStops.length > 0) {
      doneStops.forEach(stop => {
        const label = stop.status === 'aboard' ? 'On Board' : stop.status === 'completed' ? 'Dropped Off' : stop.status === 'no_show' ? 'No Show' : 'Done';
        const icon = stop.status === 'aboard' ? '🧑' : stop.status === 'completed' ? '✅' : '⚠️';
        html += `<div style="padding:8px 14px;margin-bottom:6px;background:rgba(255,255,255,0.05);border-radius:8px;font-size:13px;color:rgba(255,255,255,0.5);display:flex;align-items:center;gap:8px;">
          ${icon} <span>${getRiderDisplayName(stop)} — ${getStopTypeLabel(stop)} <strong style="color:rgba(255,255,255,0.7)">${label}</strong></span>
        </div>`;
      });
    }

    activeStops.forEach((stop, i) => {
      const isCurrent = activeStop && stop._id === activeStop._id && trip.status === 'in_progress';
      const isDone = false;
      const riderName = getRiderDisplayName(stop);
      const currentAddress = getStopAddress(stop);
      const pairedAddress = normalizeAddress(stop.pairedAddress || '');
      const actionAddress = currentAddress.replace(/'/g, '&#39;');
      const riderEscaped = riderName.replace(/'/g, '&#39;');
      const stopLabel = getStopTypeLabel(stop);
      const timeLabel = stop.type === 'pickup' ? 'Target pickup' : 'Target drop-off';
      const timeValue = stop.type === 'pickup' ? stop.scheduledTime : (stop.appointmentTime || stop.scheduledTime);

      html += `
        <div class="stop-card ${isCurrent ? 'current' : ''} ${stop.status === 'completed' ? 'completed' : ''} ${stop.status === 'no_show' ? 'no_show' : ''}" id="stop-${stop._id}">
          <div class="stop-number">${i + 1}</div>
          <div class="stop-rider">
            ${riderName}
            <span style="font-size:12px;background:${stop.type === 'pickup' ? 'rgba(0,212,200,0.12)' : 'rgba(239,68,68,0.12)'};color:${stop.type === 'pickup' ? 'var(--green)' : 'var(--danger)'};padding:2px 8px;border-radius:12px;margin-left:8px;">${stopLabel}</span>
            ${isCurrent ? '<span style="font-size:12px;background:var(--gold);color:var(--gray-900);padding:2px 8px;border-radius:12px;margin-left:8px;">NEXT</span>' : ''}
          </div>
          ${stop.riderId?.phone ? `
            <div class="stop-phone">
              <a href="tel:${stop.riderId.phone}"><i class="fas fa-phone"></i> ${stop.riderId.phone}</a>
            </div>
          ` : ''}
          <div class="stop-address">
            <i class="${stop.type === 'pickup' ? 'fas fa-map-pin' : 'fas fa-flag'}"></i>
            <div>
              <div style="font-size:11px;color:${stop.type === 'pickup' ? 'var(--gray-500)' : 'var(--danger)'};font-weight:600;text-transform:uppercase;margin-bottom:2px;">${stopLabel}</div>
              <div>${currentAddress || 'No address'}</div>
            </div>
          </div>
          ${pairedAddress ? `
            <div class="stop-address" style="background:${stop.type === 'pickup' ? 'var(--danger-light)' : 'var(--green-pale)'};">
              <i class="${stop.type === 'pickup' ? 'fas fa-flag' : 'fas fa-map-pin'}" style="color:${stop.type === 'pickup' ? 'var(--danger)' : 'var(--green)'};"></i>
              <div>
                <div style="font-size:11px;color:${stop.type === 'pickup' ? 'var(--danger)' : 'var(--green)'};font-weight:600;text-transform:uppercase;margin-bottom:2px;">${stop.type === 'pickup' ? 'Later drop-off' : 'Original pickup'}</div>
                <div>${pairedAddress}</div>
              </div>
            </div>
          ` : ''}
          ${timeValue ? `
            <div class="stop-time"><i class="fas fa-clock"></i> ${timeLabel}: ${formatTime(timeValue)}</div>
          ` : ''}
          ${stop.notes ? `<div class="stop-notes"><i class="fas fa-sticky-note"></i> ${stop.notes}</div>` : ''}
          ${stop.riderId?.notes ? `<div class="stop-notes"><i class="fas fa-info-circle"></i> ${stop.riderId.notes}</div>` : ''}

          ${isDone ? `
            <div class="stop-status-label ${stop.status}">
              ${stop.status === 'completed' ? '✅ Completed' : stop.status === 'aboard' ? '🧑 Rider On Board' : stop.status === 'no_show' ? '⚠️ No Show' : '❌ Canceled'}
            </div>
          ` : `
            <div class="stop-actions">
              <button class="stop-btn stop-btn-nav" onclick="navigateTo('${actionAddress}', '${stop.type}', '${riderEscaped}')">
                <i class="fas fa-directions"></i> Navigate to ${stopLabel}
              </button>
              ${getStopActionConfig(stop).map(action => `
                <button class="stop-btn ${action.status === 'completed' ? (stop.type === 'pickup' ? 'stop-btn-aboard' : 'stop-btn-done') : ''}" style="${action.style || ''}" ${stop.status === action.status ? 'disabled' : ''} onclick="${stop.status === action.status ? 'void(0)' : `updateStopStatus('${trip._id}','${stop._id}','${action.status}')`}">
                  <i class="${action.icon}"></i> ${action.label}
                </button>
              `).join('')}
              ${stop.riderId?.phone ? `
                <button class="stop-btn stop-btn-call" onclick="callRider('${stop.riderId.phone}')">
                  <i class="fas fa-phone"></i> Call
                </button>
              ` : ''}
              <button class="stop-btn stop-btn-noshow" onclick="confirmNoShow('${trip._id}','${stop._id}')">
                <i class="fas fa-user-times"></i> No Show
              </button>
            </div>
          `}
        </div>
      `;
    });
  }

  const allDone = stops.length > 0 && stops.every(s => isStopDone(s));

  if (!allDone && !['canceled','completed'].includes(trip.status)) {
    const isRoundTrip = (window.appTrips?.length > 1);
    const cancelLabel = isRoundTrip ? 'Cancel This Leg' : 'Cancel This Trip';
    html += `
      <div style="margin-top:12px;">
        <button onclick="driverCancelTrip('${trip._id}')" style="background:transparent;color:#e53e3e;border:1px solid #e53e3e;border-radius:10px;padding:10px 16px;font-size:13px;font-weight:600;cursor:pointer;width:100%;">
          <i class="fas fa-ban"></i> ${cancelLabel}
        </button>
      </div>
    `;
  }

  if (allDone) {
    html += `
      <div style="background:var(--green-pale);border:2px solid var(--green-light);border-radius:var(--radius);padding:20px;text-align:center;margin-top:8px;">
        <i class="fas fa-check-circle" style="font-size:36px;color:var(--green);margin-bottom:12px;display:block;"></i>
        <h3 style="color:var(--green);margin-bottom:8px;">All Stops Complete</h3>
        <p style="font-size:14px;color:var(--gray-600);">You are available. Waiting for dispatch to assign additional trips.</p>
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
      <div style="margin-top:16px;">
        <button class="btn-big btn-outline" onclick="setDriverAvailability(true)"><i class="fas fa-user-check"></i> Mark Available</button>
      </div>
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
    const messages = {
      en_route:  '🚐 En route to pickup',
      arrived:   '📍 Arrived at stop',
      aboard:    '🧑 Rider on board!',
      completed: '✅ Dropped off!',
      no_show:   '⚠️ No show recorded',
      canceled:  'Stop canceled'
    };
    showToast(messages[status] || 'Status updated', status === 'no_show' ? 'error' : 'success');

    // Hide nav banner when stop is completed or rider is aboard
    if (['completed', 'aboard', 'no_show'].includes(status)) hideNavBanner();

    if (status === 'completed') {
      // Dropoff completed — reload trips to show next trip or no-trips screen
      setTimeout(() => loadTodayTrip(), 800);
    } else {
      currentTrip = res.trip;
      renderRoute(res.trip);
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
let lastGoogleMapsUrl = '';

function navigateTo(address, legType = 'pickup', riderName = 'Rider') {
  const normalized = normalizeAddress(address);
  if (!normalized) { showToast('No address available', 'error'); return; }

  // Open Google Maps for turn-by-turn navigation
  const encoded = encodeURIComponent(normalized);
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encoded}&travelmode=driving`;
  lastGoogleMapsUrl = mapsUrl;
  window.open(mapsUrl, '_blank');

  // Show floating banner so driver can easily return or reopen Maps
  showNavBanner(normalized, riderName);
  showToast(`Opening Google Maps for ${legType === 'dropoff' ? 'drop-off' : 'pickup'}`, 'success');
}

function showNavBanner(address, riderName) {
  const banner = document.getElementById('navBanner');
  const dest   = document.getElementById('navBannerDest');
  if (!banner) return;
  if (dest) dest.textContent = riderName ? `${riderName} — ${address}` : address;
  banner.style.display = 'flex';
  try { localStorage.setItem('rydeworks_nav_active', '1'); } catch(e) {}
}

function hideNavBanner() {
  const banner = document.getElementById('navBanner');
  if (banner) banner.style.display = 'none';
  try { localStorage.removeItem('rydeworks_nav_active'); } catch(e) {}
}

function reopenGoogleMaps() {
  if (lastGoogleMapsUrl) window.open(lastGoogleMapsUrl, '_blank');
}

function clearSelectedMapTarget() {
  selectedMapTarget = null;
  const panel = document.getElementById('mapRoutePanel');
  if (panel) panel.style.display = 'none';
  refreshDriverMap();
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
  const startMileage = document.getElementById('startMileage').value;
  if (!startMileage) { showToast('Please enter your starting mileage', 'error'); return; }

  const checkedItems = document.querySelectorAll('.checklist-item.checked');
  if (checkedItems.length < 5) {
    if (!confirm('You have not completed all inspection items. Start anyway?')) return;
  }

  const inspectionDone = checkedItems.length >= 7;
  const hasDamage = document.getElementById('hasDamage').checked;
  const inspectionNotes = hasDamage ? document.getElementById('damageNotes').value : '';

  // If a trip is assigned, call the trip start API
  if (currentTrip) {
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
      persistShiftStarted(true);
      showToast('Shift started! Have a safe trip. 🚐', 'success');
      renderRoute(res.trip);
      showScreen('route', false);
    } else {
      showToast(res?.error || 'Failed to start shift', 'error');
    }
    return;
  }

  // No trip assigned yet — mark driver available and proceed to standby
  await ZakAuth.apiFetch('/api/trips/driver/availability', {
    method: 'POST',
    body: JSON.stringify({ isAvailable: true })
  });

  shiftStarted = true;
  persistShiftStarted(true);
  showToast('Shift started — you\'re on standby. A route will be assigned soon.', 'success');

  // Show standby state on route screen
  const routeContent = document.getElementById('routeContent');
  if (routeContent) {
    routeContent.innerHTML = `
      <div style="text-align:center;padding:40px 20px;">
        <div style="font-size:48px;margin-bottom:16px;">🚐</div>
        <h3 style="color:#fff;margin-bottom:8px;">On Standby</h3>
        <p style="color:rgba(255,255,255,0.7);font-size:14px;">Your shift is active. Waiting for a route to be assigned by dispatch.</p>
        <p style="color:rgba(255,255,255,0.5);font-size:12px;margin-top:12px;">Start mileage logged: ${parseInt(startMileage).toLocaleString()} mi</p>
      </div>`;
  }
  showScreen('route', false);
}

// ── END SHIFT ─────────────────────────────────────────────
async function endShift() {
  const endMileage = document.getElementById('endMileage').value;
  if (!endMileage) { showToast('Please enter your ending mileage', 'error'); return; }
  if (!document.getElementById('shiftVerifyCheck')?.checked) {
    showToast('Please check the verification box before completing your shift.', 'error');
    return;
  }

  // Standby mode — no active trip, just mark driver offline
  if (!currentTrip) {
    await ZakAuth.apiFetch('/api/trips/driver/availability', {
      method: 'POST',
      body: JSON.stringify({ isAvailable: false })
    });
    const u = ZakAuth.getUser() || {};
    if (u.driverInfo) u.driverInfo.isAvailable = false;
    localStorage.setItem('zak_user', JSON.stringify(u));
    shiftStarted = false;
    persistShiftStarted(false);
    showToast('Shift ended. Have a good rest!', 'success');
    showScreen('start', false);
    return;
  }

  const res = await ZakAuth.apiFetch(`/api/trips/${currentTrip._id}/complete`, {
    method: 'POST',
    body: JSON.stringify({ endMileage: parseInt(endMileage), shiftCertified: true })
  });

  if (res?.success) {
    // Explicitly mark driver offline so dispatch dashboard reflects off status
    await ZakAuth.apiFetch('/api/trips/driver/availability', {
      method: 'POST',
      body: JSON.stringify({ isAvailable: false })
    });
    const u = ZakAuth.getUser() || {};
    if (u.driverInfo) u.driverInfo.isAvailable = false;
    localStorage.setItem('zak_user', JSON.stringify(u));
    currentTrip = null;
    shiftStarted = false;
    persistShiftStarted(false);
    selectedMapTarget = null;
    showToast('Shift complete! Great work today.', 'success');
    renderNoTrips();
    showScreen('start', false);
  } else {
    showToast(res?.error || 'Failed to end shift', 'error');
  }
}

async function setDriverAvailability(isAvailable) {
  const res = await ZakAuth.apiFetch('/api/trips/driver/availability', {
    method: 'POST',
    body: JSON.stringify({ isAvailable })
  });
  if (res?.success) {
    const user = ZakAuth.getUser() || {};
    user.driverInfo = { ...(user.driverInfo || {}), ...(res.user?.driverInfo || {}), isAvailable };
    localStorage.setItem('zak_user', JSON.stringify(user));
    loadProfile();
    renderRoute(currentTrip);
    showToast(isAvailable ? 'You are now marked available.' : 'You are marked unavailable.', 'success');
  } else {
    showToast(res?.error || 'Could not update availability.', 'error');
  }
}

// ── BOOKING QR CODE ───────────────────────────────────────
function showQRCode() {
  document.getElementById('qrOverlay').style.display = 'flex';
}

function hideQRCode() {
  document.getElementById('qrOverlay').style.display = 'none';
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
let lastKnownDriverLocation = null;

function initDriverMap() {
  // Only init once
  if (driverMapInstance) {
    driverMapInstance.invalidateSize();
    refreshDriverMap();
    return;
  }
  driverMapInstance = L.map('driverMap', { zoomControl: true }).setView([27.9944, -81.7603], 10);
  try {
    const cached = JSON.parse(localStorage.getItem('rydeworks_last_driver_loc') || 'null');
    if (Array.isArray(cached) && cached.length === 2) lastKnownDriverLocation = cached;
  } catch (e) {}
  // Use Mapbox Streets tiles when token is available, fall back to OSM
  if (MAPBOX_TOKEN) {
    L.tileLayer(`https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/256/{z}/{x}/{y}?access_token=${MAPBOX_TOKEN}`, {
      attribution: '© <a href="https://www.mapbox.com/">Mapbox</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19, tileSize: 256
    }).addTo(driverMapInstance);
  } else {
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors', maxZoom: 18
    }).addTo(driverMapInstance);
  }

  // Watch driver location and update marker
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(pos => {
      const { latitude: lat, longitude: lng } = pos.coords;
      lastKnownDriverLocation = [lat, lng];
      try { localStorage.setItem('rydeworks_last_driver_loc', JSON.stringify(lastKnownDriverLocation)); } catch (e) {}
      // Center map on driver's actual location on first fix
      driverMapInstance.setView([lat, lng], 14);
      if (!driverLocationMarker) {
        const vanIcon = L.divIcon({
          html: '<div style="background:#0A1628;color:#00D4C8;border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:18px;border:3px solid #00D4C8;box-shadow:0 2px 8px rgba(0,0,0,0.4);">🚐</div>',
          iconSize: [36, 36], iconAnchor: [18, 18], className: ''
        });
        driverLocationMarker = L.marker([lat, lng], { icon: vanIcon, zIndexOffset: 1000 }).addTo(driverMapInstance);
        driverLocationMarker.bindPopup('Your Location');
      } else {
        driverLocationMarker.setLatLng([lat, lng]);
      }
      refreshDriverMap();
    }, () => {}, { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 });

    navigator.geolocation.watchPosition(pos => {
      const { latitude: lat, longitude: lng } = pos.coords;
      lastKnownDriverLocation = [lat, lng];
      try { localStorage.setItem('rydeworks_last_driver_loc', JSON.stringify(lastKnownDriverLocation)); } catch (e) {}
      if (!driverLocationMarker) {
        const vanIcon = L.divIcon({
          html: '<div style="background:#0A1628;color:#00D4C8;border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:18px;border:3px solid #00D4C8;box-shadow:0 2px 8px rgba(0,0,0,0.4);">🚐</div>',
          iconSize: [36, 36], iconAnchor: [18, 18], className: ''
        });
        driverLocationMarker = L.marker([lat, lng], { icon: vanIcon, zIndexOffset: 1000 }).addTo(driverMapInstance);
        driverLocationMarker.bindPopup('Your Location');
      } else {
        driverLocationMarker.setLatLng([lat, lng]);
      }
      sendLocationUpdate(lat, lng);
      if (document.getElementById('screen-map')?.classList.contains('active')) {
        refreshDriverMap();
      }
    }, null, { enableHighAccuracy: true, maximumAge: 10000 });
  }

  refreshDriverMap();
}

async function refreshDriverMap() {
  const panel = document.getElementById('mapRoutePanel');
  const titleEl = document.getElementById('mapRouteTitle');
  const addrEl = document.getElementById('mapRouteAddress');

  if (!driverMapInstance || !window.appTrips || window.appTrips.length === 0) {
    document.getElementById('mapInfoBar').textContent = '📍 No trips to show';
    if (panel) panel.style.display = 'none';
    return;
  }

  driverMapMarkers.forEach(m => driverMapInstance.removeLayer(m));
  driverMapMarkers = [];
  if (driverMapRouteLayer) { driverMapInstance.removeLayer(driverMapRouteLayer); driverMapRouteLayer = null; }

  const trip = currentTrip || window.appTrips[0];
  const remainingStops = getRemainingStops(trip);
  if (remainingStops.length === 0) {
    document.getElementById('mapInfoBar').textContent = '✅ All stops completed';
    if (panel) panel.style.display = 'none';
    return;
  }

  const bounds = [];
  const geocodeCache = {};

  async function geocode(address) {
    const normalized = normalizeAddress(address);
    if (!normalized) return null;
    if (geocodeCache[normalized]) return geocodeCache[normalized];
    const queries = [normalized];
    if (!/,\s*FL/i.test(normalized)) queries.push(`${normalized}, FL`);
    for (const q of queries) {
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`, { headers: { 'Accept-Language': 'en' } });
        const d = await r.json();
        if (d && d[0]) {
          geocodeCache[normalized] = [parseFloat(d[0].lat), parseFloat(d[0].lon)];
          return geocodeCache[normalized];
        }
      } catch (e) {}
    }
    return null;
  }

  const stopPoints = [];
  for (let i = 0; i < remainingStops.length; i++) {
    const stop = remainingStops[i];
    const coords = (Number.isFinite(stop?.lat) && Number.isFinite(stop?.lng)) ? [stop.lat, stop.lng] : await geocode(getStopAddress(stop));
    if (!coords) {
      console.warn('Could not geocode stop address:', getStopAddress(stop));
      continue;
    }
    stopPoints.push({ stop, coords });
    bounds.push(coords);

    const isPickup = stop.type === 'pickup';
    const markerIcon = L.divIcon({
      html: `<div style="background:${isPickup ? '#0A1628' : '#EF4444'};color:white;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);">${i + 1}</div>`,
      iconSize: [30, 30], iconAnchor: [15, 15], className: ''
    });
    const m = L.marker(coords, { icon: markerIcon }).addTo(driverMapInstance);
    m.bindPopup(`<b>${getStopTypeLabel(stop)}</b><br>${getRiderDisplayName(stop)}<br>${getStopAddress(stop)}`);
    driverMapMarkers.push(m);
  }

  if (stopPoints.length === 0) {
    document.getElementById('mapInfoBar').textContent = '📍 Could not locate remaining stops';
    if (panel) panel.style.display = 'none';
    return;
  }

  const activeIndex = findSelectedTargetIndex(remainingStops);
  const activePoint = stopPoints[Math.min(activeIndex, stopPoints.length - 1)] || stopPoints[0];

  if (panel && titleEl && addrEl) {
    panel.style.display = '';
    titleEl.textContent = `${getStopTypeLabel(activePoint.stop)} for ${getRiderDisplayName(activePoint.stop)}`;
    addrEl.textContent = getStopAddress(activePoint.stop);
  }

  const orderedRoutePoints = [];
  if (driverLocationMarker) {
    const ll = driverLocationMarker.getLatLng();
    orderedRoutePoints.push([ll.lat, ll.lng]);
    bounds.push([ll.lat, ll.lng]);
  } else if (lastKnownDriverLocation) {
    orderedRoutePoints.push(lastKnownDriverLocation);
    bounds.push(lastKnownDriverLocation);
    const vanIcon = L.divIcon({
      html: '<div style="background:#0A1628;color:#00D4C8;border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:18px;border:3px solid #00D4C8;box-shadow:0 2px 8px rgba(0,0,0,0.4);">🚐</div>',
      iconSize: [36, 36], iconAnchor: [18, 18], className: ''
    });
    driverLocationMarker = L.marker(lastKnownDriverLocation, { icon: vanIcon, zIndexOffset: 1000 }).addTo(driverMapInstance);
    driverLocationMarker.bindPopup('Your Location');
  }
  const prioritizedStops = [activePoint, ...stopPoints.filter(p => p !== activePoint)];
  prioritizedStops.forEach(p => orderedRoutePoints.push(p.coords));

  try {
    if (orderedRoutePoints.length >= 2) {
      const coordStr = orderedRoutePoints.map(([lat, lng]) => `${lng},${lat}`).join(';');
      let routeGeo = null, dist = null, mins = null, steps = [];

      // Use Mapbox Directions API (traffic-aware) when token is available
      if (MAPBOX_TOKEN) {
        const mbUrl = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coordStr}?steps=true&geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;
        const mbRes = await fetch(mbUrl);
        const mbData = await mbRes.json();
        if (mbData.routes && mbData.routes[0]) {
          const route = mbData.routes[0];
          routeGeo = route.geometry;
          dist = (route.distance / 1609.34).toFixed(1);
          mins = Math.round(route.duration / 60);
          // Collect all step maneuver instructions
          route.legs?.forEach(leg => {
            leg.steps?.forEach(step => {
              if (step.maneuver?.instruction) steps.push(step.maneuver.instruction);
            });
          });
        }
      } else {
        // Fallback to OSRM
        const osrmRes = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`);
        const osrmData = await osrmRes.json();
        if (osrmData.routes && osrmData.routes[0]) {
          routeGeo = osrmData.routes[0].geometry;
          dist = (osrmData.routes[0].distance / 1609.34).toFixed(1);
          mins = Math.round(osrmData.routes[0].duration / 60);
        }
      }

      if (routeGeo) {
        driverMapRouteLayer = L.geoJSON(routeGeo, {
          style: { color: '#00B4AA', weight: 6, opacity: 0.95 }
        }).addTo(driverMapInstance);
        const infoBar = document.getElementById('mapInfoBar');
        infoBar.textContent = `🧭 ${remainingStops.length} stop${remainingStops.length > 1 ? 's' : ''} left · ${dist} mi · ~${mins} min`;

        // Show first turn-by-turn step if available
        const navStepEl = document.getElementById('navStep');
        if (navStepEl && steps.length > 0) {
          navStepEl.style.display = 'block';
          navStepEl.textContent = `▶ ${steps[0]}`;
        } else if (navStepEl) {
          navStepEl.style.display = 'none';
        }
      } else {
        document.getElementById('mapInfoBar').textContent = `📍 ${remainingStops.length} stop${remainingStops.length > 1 ? 's' : ''} remaining`;
      }
    } else {
      document.getElementById('mapInfoBar').textContent = `📍 Next: ${getStopAddress(activePoint.stop)}`;
    }
  } catch (e) {
    if (orderedRoutePoints.length >= 2) {
      driverMapRouteLayer = L.polyline(orderedRoutePoints, { color: '#00B4AA', weight: 4, opacity: 0.8, dashArray: '8,8' }).addTo(driverMapInstance);
    }
    document.getElementById('mapInfoBar').textContent = `📍 ${remainingStops.length} stop${remainingStops.length > 1 ? 's' : ''} remaining`;
  }

  if (bounds.length > 0) {
    driverMapInstance.fitBounds(bounds, { padding: [30, 30] });
  }
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
