"use client";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css";

interface Props {
  lat: number;
  lng: number;
  name: string;
  congestion: boolean;
}

export default function TrafficMap({ lat, lng, name, congestion }: Props) {
  const fill = congestion ? "#ef4444" : "#22c55e";
  const stroke = congestion ? "#b91c1c" : "#15803d";
  return (
    <MapContainer center={[lat, lng]} zoom={15} scrollWheelZoom className="h-80 w-full rounded-lg shadow">
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                 attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a> contributors' />
      <CircleMarker center={[lat, lng]} radius={12} pathOptions={{ color: stroke, fillColor: fill, fillOpacity: 0.9 }}>
        <Popup>
          <div className="font-medium">{name}</div>
          <div>Status: <span style={{ color: fill }}>{congestion ? "Congested" : "Clear"}</span></div>
        </Popup>
      </CircleMarker>
    </MapContainer>
  );
}
