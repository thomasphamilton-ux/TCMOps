import { useEffect, useRef } from "react";
import { Box, Typography } from "@mui/material";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface GeofencePickerProps {
  lat: number | null;
  lng: number | null;
  radiusM: number | null;
  onPick: (lat: number, lng: number) => void;
  height?: number;
}

const DEFAULT_CENTER: L.LatLngExpression = [39.8283, -98.5795]; // center of the continental US
const DEFAULT_ZOOM = 4;
const PICKED_ZOOM = 16;
const GEOFENCE_COLOR = "#1976d2";

/** Click-to-place map for choosing a project's geofence center, with a live radius preview. */
export default function GeofencePicker({ lat, lng, radiusM, onPick, height = 260 }: GeofencePickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current).setView(
      lat != null && lng != null ? [lat, lng] : DEFAULT_CENTER,
      lat != null && lng != null ? PICKED_ZOOM : DEFAULT_ZOOM
    );
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    map.on("click", (e: L.LeafletMouseEvent) => onPickRef.current(e.latlng.lat, e.latlng.lng));

    mapRef.current = map;

    // Leaflet caches container size at construction time. Inside a MUI Dialog
    // the container can still be mid-transition (or 0-sized) at that instant,
    // which leaves clicks mapping to the wrong lat/lng forever after. Recompute
    // once layout settles, and keep recomputing if the dialog/container resizes.
    const resizeObserver = new ResizeObserver(() => map.invalidateSize());
    resizeObserver.observe(containerRef.current);
    const raf = requestAnimationFrame(() => map.invalidateSize());

    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(raf);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (lat == null || lng == null) {
      if (markerRef.current) map.removeLayer(markerRef.current);
      if (circleRef.current) map.removeLayer(circleRef.current);
      markerRef.current = null;
      circleRef.current = null;
      return;
    }

    const center: L.LatLngExpression = [lat, lng];
    if (!markerRef.current) {
      markerRef.current = L.marker(center).addTo(map);
    } else {
      markerRef.current.setLatLng(center);
    }

    const radius = radiusM ?? 100;
    if (!circleRef.current) {
      circleRef.current = L.circle(center, {
        radius,
        color: GEOFENCE_COLOR,
        fillColor: GEOFENCE_COLOR,
        fillOpacity: 0.1,
        weight: 2,
      }).addTo(map);
    } else {
      circleRef.current.setLatLng(center);
      circleRef.current.setRadius(radius);
    }
  }, [lat, lng, radiusM]);

  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
        Click the map to set the geofence center.
      </Typography>
      <Box
        ref={containerRef}
        sx={{ width: "100%", height, borderRadius: 1, overflow: "hidden", border: "1px solid", borderColor: "divider" }}
      />
    </Box>
  );
}
