// Shared user-location store backed by sessionStorage + localStorage so a manually
// chosen city/pincode persists across pages and survives reloads. Components subscribe
// via useUserLocation() and react to changes immediately when setUserLocation() fires.

import { useEffect, useState, useCallback } from 'react';

export interface UserLocation {
  city: string;
  state: string;
  pincode: string;
  label: string;     // human-readable display (e.g. "Indirapuram, Ghaziabad")
  lat?: string;
  lng?: string;
  source: 'manual' | 'gps' | 'address' | '';
}

const STORAGE_KEY = 'user_location_v1';
const EVENT = 'user-location-changed';

const empty: UserLocation = { city: '', state: '', pincode: '', label: '', lat: '', lng: '', source: '' };

function read(): UserLocation {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw);
    return { ...empty, ...parsed };
  } catch { return empty; }
}

export function setUserLocation(loc: Partial<UserLocation>) {
  const merged = { ...read(), ...loc };
  const json = JSON.stringify(merged);
  // Session-scoped + persisted across reloads in the same browser
  try { sessionStorage.setItem(STORAGE_KEY, json); } catch { /* ignore quota */ }
  try { localStorage.setItem(STORAGE_KEY, json); } catch { /* ignore quota */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: merged }));
}

export function clearUserLocation() {
  try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: empty }));
}

export function useUserLocation(): [UserLocation, (loc: Partial<UserLocation>) => void] {
  const [loc, setLoc] = useState<UserLocation>(() => read());

  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<UserLocation>).detail;
      setLoc(detail || read());
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setLoc(read());
    };
    window.addEventListener(EVENT, onChange as EventListener);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(EVENT, onChange as EventListener);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const update = useCallback((partial: Partial<UserLocation>) => {
    setUserLocation(partial);
  }, []);

  return [loc, update];
}
