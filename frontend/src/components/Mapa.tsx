import { useEffect, useRef } from 'react';
import L from 'leaflet';

export interface Marcador { lat: number; lng: number; etiqueta?: string; clase?: string; titulo?: string }
interface Props {
  marcadores?: Marcador[]; linea?: Array<[number, number]>; centro?: [number, number];
  poligono?: Array<[number, number]>; onPoligono?: (p: Array<[number, number]>) => void; // dibujo de zona (RF-15)
  punto?: { lat: number; lng: number } | null; onPunto?: (p: { lat: number; lng: number }) => void; // elegir ubicación del ejemplar
  alto?: number; etiquetaAria?: string;
}

const pin = (m: Marcador) => L.divIcon({ className: '', html: `<div class="pin ${m.clase ?? ''}" title="${(m.titulo ?? '').replace(/"/g, '')}">${m.etiqueta ?? ''}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] });

export function Mapa({ marcadores = [], linea, centro, poligono, onPoligono, punto, onPunto, alto = 320, etiquetaAria = 'Mapa' }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const capa = useRef<L.LayerGroup | null>(null);
  const cb = useRef({ onPoligono, onPunto, poligono });
  cb.current = { onPoligono, onPunto, poligono };

  useEffect(() => {
    if (!el.current || mapa.current) return;
    const m = L.map(el.current, { zoomControl: true }).setView(centro ?? [-32.9468, -60.6393], 13);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' }).addTo(m);
    capa.current = L.layerGroup().addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => {
      if (cb.current.onPoligono) cb.current.onPoligono([...(cb.current.poligono ?? []), [e.latlng.lat, e.latlng.lng]]);
      else if (cb.current.onPunto) cb.current.onPunto({ lat: e.latlng.lat, lng: e.latlng.lng });
    });
    mapa.current = m;
    const t = setTimeout(() => { if (mapa.current === m) m.invalidateSize(); }, 100);
    return () => { clearTimeout(t); m.stop(); m.remove(); mapa.current = null; capa.current = null; };
  }, []); // eslint-disable-line

  useEffect(() => {
    const g = capa.current, m = mapa.current;
    if (!g || !m) return;
    g.clearLayers();
    const puntos: L.LatLngExpression[] = [];
    for (const k of marcadores) { L.marker([k.lat, k.lng], { icon: pin(k), keyboard: false }).addTo(g); puntos.push([k.lat, k.lng]); }
    if (linea && linea.length > 1) L.polyline(linea, { color: '#1b5e9e', weight: 4, opacity: 0.8 }).addTo(g);
    if (poligono && poligono.length) {
      (poligono.length > 2 ? L.polygon(poligono, { color: '#c62828', fillOpacity: 0.12 }) : L.polyline(poligono, { color: '#c62828' })).addTo(g);
      poligono.forEach((p) => L.circleMarker(p, { radius: 4, color: '#c62828' }).addTo(g));
    }
    if (punto) { L.marker([punto.lat, punto.lng], { icon: pin({ lat: punto.lat, lng: punto.lng, clase: 'punto', etiqueta: '●' }) }).addTo(g); puntos.push([punto.lat, punto.lng]); }
    if (puntos.length && !poligono?.length) m.fitBounds(L.latLngBounds(puntos), { padding: [30, 30], maxZoom: 17, animate: false });
  }, [marcadores, linea, poligono, punto]);

  return <div ref={el} className="mapa" style={{ height: alto }} role="application" aria-label={etiquetaAria} />;
}
