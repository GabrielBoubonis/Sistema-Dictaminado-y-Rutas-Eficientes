export function puntoEnPoligono(p: { lat: number; lng: number }, poly: Array<[number, number]>): boolean {
  let dentro = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i], [yj, xj] = poly[j];
    if (yi > p.lat !== yj > p.lat && p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

/**
 * RF-48: ubicación actual del captor para partir de ahí. Si el ingeniero no da permiso, no hay GPS o tarda
 * demasiado, devuelve undefined y el servidor parte de la sede de Parques y Paseos.
 */
export function ubicacionActual(esperaMs = 8000): Promise<{ lat: number; lng: number } | undefined> {
  if (!('geolocation' in navigator)) return Promise.resolve(undefined);
  return new Promise((resolve) => navigator.geolocation.getCurrentPosition(
    (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
    () => resolve(undefined),
    { enableHighAccuracy: true, timeout: esperaMs, maximumAge: 60_000 },
  ));
}
