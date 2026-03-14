import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

interface Stop {
  type: string;
  address: string;
  riderName?: string;
  lat?: number;
  lng?: number;
  status?: string;
}

interface TripMapProps {
  stops: Stop[];
  routeGeometry?: GeoJSON.LineString | null;
  className?: string;
}

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

function getStopColor(type: string, status?: string) {
  if (status === "completed" || status === "dropped_off" || status === "aboard") return "#10b981";
  if (status === "en_route" || status === "arrived") return "#f59e0b";
  if (type === "pickup") return "#00D4C8";
  if (type === "dropoff") return "#6366f1";
  return "#94a3b8";
}

export function TripMap({ stops, routeGeometry, className = "" }: TripMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);

  useEffect(() => {
    if (!mapContainer.current || !TOKEN) return;

    mapboxgl.accessToken = TOKEN;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [-82.7, 27.9],
      zoom: 10,
      attributionControl: false,
    });

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");

    mapRef.current = map;

    map.on("load", () => {
      const stopsWithCoords = stops.filter(s => s.lat && s.lng);

      if (stopsWithCoords.length === 0) return;

      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];

      stopsWithCoords.forEach((stop, i) => {
        const el = document.createElement("div");
        el.style.cssText = `
          width: 32px; height: 32px;
          background: ${getStopColor(stop.type, stop.status)};
          border: 2.5px solid white;
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          color: white; font-size: 11px; font-weight: 700;
          box-shadow: 0 2px 8px rgba(0,0,0,0.4);
          cursor: default;
        `;
        el.textContent = stop.type === "pickup" ? "P" : "D";

        const popup = new mapboxgl.Popup({ offset: 20, closeButton: false, className: "trip-popup" }).setHTML(`
          <div style="background:#1e293b;color:#f1f5f9;padding:8px 12px;border-radius:8px;font-family:sans-serif;min-width:180px;">
            <div style="font-size:10px;font-weight:600;color:#00D4C8;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:4px;">${stop.type}</div>
            <div style="font-size:13px;font-weight:600;margin-bottom:2px;">${stop.riderName || "Stop " + (i + 1)}</div>
            <div style="font-size:11px;color:#94a3b8;">${stop.address}</div>
          </div>
        `);

        const marker = new mapboxgl.Marker(el)
          .setLngLat([stop.lng!, stop.lat!])
          .setPopup(popup)
          .addTo(map);

        markersRef.current.push(marker);
      });

      if (routeGeometry) {
        if (map.getSource("route")) {
          (map.getSource("route") as mapboxgl.GeoJSONSource).setData({
            type: "Feature",
            properties: {},
            geometry: routeGeometry,
          });
        } else {
          map.addSource("route", {
            type: "geojson",
            data: { type: "Feature", properties: {}, geometry: routeGeometry },
          });
          map.addLayer({
            id: "route",
            type: "line",
            source: "route",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": "#00D4C8", "line-width": 3, "line-opacity": 0.8 },
          });
        }
      }

      const bounds = new mapboxgl.LngLatBounds();
      stopsWithCoords.forEach(s => bounds.extend([s.lng!, s.lat!]));
      map.fitBounds(bounds, { padding: 60, maxZoom: 14 });
    });

    return () => {
      markersRef.current.forEach(m => m.remove());
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    const stopsWithCoords = stops.filter(s => s.lat && s.lng);
    stopsWithCoords.forEach((stop, i) => {
      const el = document.createElement("div");
      el.style.cssText = `
        width: 32px; height: 32px;
        background: ${getStopColor(stop.type, stop.status)};
        border: 2.5px solid white; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        color: white; font-size: 11px; font-weight: 700;
        box-shadow: 0 2px 8px rgba(0,0,0,0.4);
      `;
      el.textContent = stop.type === "pickup" ? "P" : "D";

      const popup = new mapboxgl.Popup({ offset: 20, closeButton: false }).setHTML(`
        <div style="background:#1e293b;color:#f1f5f9;padding:8px 12px;border-radius:8px;font-family:sans-serif;min-width:180px;">
          <div style="font-size:10px;font-weight:600;color:#00D4C8;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:4px;">${stop.type}</div>
          <div style="font-size:13px;font-weight:600;margin-bottom:2px;">${stop.riderName || "Stop " + (i + 1)}</div>
          <div style="font-size:11px;color:#94a3b8;">${stop.address}</div>
        </div>
      `);

      const marker = new mapboxgl.Marker(el)
        .setLngLat([stop.lng!, stop.lat!])
        .setPopup(popup)
        .addTo(map);

      markersRef.current.push(marker);
    });

    if (stopsWithCoords.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      stopsWithCoords.forEach(s => bounds.extend([s.lng!, s.lat!]));
      map.fitBounds(bounds, { padding: 60, maxZoom: 14 });
    }
  }, [stops]);

  if (!TOKEN) {
    return (
      <div className={`flex items-center justify-center bg-black/40 text-muted-foreground text-sm ${className}`}>
        Mapbox token not configured
      </div>
    );
  }

  return <div ref={mapContainer} className={className} />;
}
