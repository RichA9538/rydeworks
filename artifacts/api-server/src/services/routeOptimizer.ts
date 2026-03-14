// Route optimizer using OSRM (free, no API key needed)
// Falls back gracefully if OSRM is unavailable

const OSRM_BASE = 'https://router.project-osrm.org';

interface Stop {
  _id?: any;
  address: string;
  lat?: number | null;
  lng?: number | null;
  type: 'pickup' | 'dropoff';
  riderName?: string;
  scheduledTime?: Date;
  appointmentTime?: Date;
  stopOrder: number;
}

interface HomeBase {
  address: string;
  lat?: number | null;
  lng?: number | null;
}

export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!address) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'RydeworksDispatch/1.0' } });
    const data: any[] = await res.json();
    if (data[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    return null;
  } catch {
    return null;
  }
}

async function getOsrmDuration(fromLat: number, fromLng: number, toLat: number, toLng: number): Promise<number> {
  try {
    const url = `${OSRM_BASE}/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=false`;
    const res = await fetch(url, { headers: { 'User-Agent': 'RydeworksDispatch/1.0' } });
    const data: any = await res.json();
    if (data.code === 'Ok' && data.routes[0]) {
      return Math.ceil(data.routes[0].duration / 60); // minutes
    }
    return 20; // fallback
  } catch {
    return 20; // fallback
  }
}

export async function optimizeRoute(params: {
  homeBase: HomeBase;
  stops: Stop[];
  tripDate: Date;
}): Promise<any> {
  const { homeBase, stops, tripDate } = params;

  if (!stops || stops.length === 0) {
    return { success: false, error: 'No stops provided.' };
  }

  // Geocode any stops missing coordinates
  const geocodedStops = await Promise.all(
    stops.map(async (stop) => {
      if (!stop.lat || !stop.lng) {
        const coords = await geocodeAddress(stop.address);
        return { ...stop, ...(coords || {}) };
      }
      return stop;
    })
  );

  // Geocode home base if needed
  let origin = { lat: homeBase.lat, lng: homeBase.lng };
  if (!origin.lat || !origin.lng) {
    const coords = await geocodeAddress(homeBase.address);
    if (coords) origin = coords;
  }

  const invalidStops = geocodedStops.filter(s => !s.lat || !s.lng);

  // Separate pickup and dropoff stops
  const pickups  = geocodedStops.filter(s => s.type === 'pickup');
  const dropoffs = geocodedStops.filter(s => s.type === 'dropoff');

  // Simple optimization: pickups first (ordered by appointment time), then dropoffs
  const sortedPickups  = pickups.sort((a, b) => {
    const ta = a.appointmentTime || a.scheduledTime;
    const tb = b.appointmentTime || b.scheduledTime;
    if (!ta && !tb) return 0;
    if (!ta) return 1;
    if (!tb) return -1;
    return new Date(ta).getTime() - new Date(tb).getTime();
  });

  const sortedDropoffs = dropoffs.sort((a, b) => {
    const ta = a.appointmentTime || a.scheduledTime;
    const tb = b.appointmentTime || b.scheduledTime;
    if (!ta && !tb) return 0;
    if (!ta) return 1;
    if (!tb) return -1;
    return new Date(ta).getTime() - new Date(tb).getTime();
  });

  const optimizedStops = [...sortedPickups, ...sortedDropoffs].map((s, i) => ({
    ...s,
    stopOrder: i
  }));

  // Check for appointment conflicts
  const conflicts: any[] = [];
  const warnings: any[] = [];
  let currentTime = new Date(tripDate);
  currentTime.setHours(7, 0, 0, 0); // Start at 7 AM by default

  let totalDistanceMiles = 0;
  let totalDurationMins = 0;
  let prevLat = origin.lat || 0;
  let prevLng = origin.lng || 0;

  for (const stop of optimizedStops) {
    if (!stop.lat || !stop.lng) continue;

    const drivingMins = await getOsrmDuration(prevLat, prevLng, stop.lat, stop.lng);
    const estimatedArrival = new Date(currentTime.getTime() + drivingMins * 60000);
    (stop as any).estimatedArrival = estimatedArrival.toISOString();

    totalDurationMins += drivingMins;

    if (stop.appointmentTime) {
      const appt = new Date(stop.appointmentTime);
      const diffMins = (appt.getTime() - estimatedArrival.getTime()) / 60000;
      if (diffMins < -10) {
        conflicts.push({
          stopAddress: stop.address,
          riderName: stop.riderName,
          estimatedArrival: estimatedArrival.toISOString(),
          appointmentTime: appt.toISOString(),
          lateByMins: Math.abs(Math.round(diffMins))
        });
      } else if (diffMins < 5) {
        warnings.push({
          stopAddress: stop.address,
          riderName: stop.riderName,
          message: `Tight connection — only ${Math.round(diffMins)} minutes buffer`
        });
      }
    }

    currentTime = new Date(estimatedArrival.getTime() + 5 * 60000); // 5 min at each stop
    prevLat = stop.lat;
    prevLng = stop.lng;
  }

  return {
    success: true,
    feasible: conflicts.length === 0,
    conflicts,
    warnings,
    optimizedStops,
    totalDurationMins,
    totalDistanceMiles: Math.round(totalDistanceMiles * 10) / 10,
    invalidAddresses: invalidStops.map(s => s.address)
  };
}
