/**
 * Geocoding via Nominatim (free, no API key required).
 * Falls back gracefully if the request fails.
 */

interface GeoResult {
  lat: number;
  lng: number;
}

export async function geocodeAddress(address: string): Promise<GeoResult | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=us`;
    const res = await fetch(url, {
      headers: { "User-Agent": "RydeWorks/1.0 (dispatch@rydeworks.com)" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data: any[] = await res.json();
    if (!data.length) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {
    return null;
  }
}

export async function geocodeStops(stops: any[]): Promise<any[]> {
  return Promise.all(
    stops.map(async (stop) => {
      if (stop.lat && stop.lng) return stop;
      if (!stop.address) return stop;
      const geo = await geocodeAddress(stop.address);
      if (geo) return { ...stop, lat: geo.lat, lng: geo.lng };
      return stop;
    })
  );
}
