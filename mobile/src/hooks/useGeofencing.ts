import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type GeofenceRegion,
  type NearbyCreator,
  type NearbyBounty,
  requestLocationPermission,
  getCurrentPosition,
  startGeofencing,
  stopGeofencing,
  createRegionAroundUser,
  fetchNearbyCreators,
  fetchNearbyBounties,
} from '../services/GeofencingService';

interface UseGeofencingOptions {
  apiBaseUrl: string;
  radiusKm?: number;
  enabled?: boolean;
}

interface UseGeofencingResult {
  nearbyCreators: NearbyCreator[];
  nearbyBounties: NearbyBounty[];
  loading: boolean;
  error: string | null;
  hasPermission: boolean;
  userLocation: { latitude: number; longitude: number } | null;
  refresh: () => Promise<void>;
}

export function useGeofencing({
  apiBaseUrl,
  radiusKm = 10,
  enabled = true,
}: UseGeofencingOptions): UseGeofencingResult {
  const [nearbyCreators, setNearbyCreators] = useState<NearbyCreator[]>([]);
  const [nearbyBounties, setNearbyBounties] = useState<NearbyBounty[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState(false);
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const activeRegion = useRef<GeofenceRegion | null>(null);

  const loadNearby = useCallback(
    async (latitude: number, longitude: number) => {
      setLoading(true);
      setError(null);

      try {
        const [creators, bounties] = await Promise.all([
          fetchNearbyCreators(latitude, longitude, radiusKm, apiBaseUrl),
          fetchNearbyBounties(latitude, longitude, radiusKm, apiBaseUrl),
        ]);

        setNearbyCreators(creators);
        setNearbyBounties(bounties);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load nearby data');
      } finally {
        setLoading(false);
      }
    },
    [apiBaseUrl, radiusKm]
  );

  const refresh = useCallback(async () => {
    try {
      const position = await getCurrentPosition();
      const { latitude, longitude } = position.coords;
      setUserLocation({ latitude, longitude });
      await loadNearby(latitude, longitude);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get location');
    }
  }, [loadNearby]);

  useEffect(() => {
    if (!enabled) return;

    let mounted = true;

    (async () => {
      const granted = await requestLocationPermission();
      if (!mounted) return;
      setHasPermission(granted);

      if (!granted) {
        setError('Location permission is required to discover nearby creators');
        return;
      }

      try {
        const position = await getCurrentPosition();
        if (!mounted) return;

        const { latitude, longitude } = position.coords;
        setUserLocation({ latitude, longitude });

        const region = createRegionAroundUser(latitude, longitude);
        activeRegion.current = region;
        await startGeofencing([region]);

        await loadNearby(latitude, longitude);
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Geofencing setup failed');
        }
      }
    })();

    return () => {
      mounted = false;
      stopGeofencing().catch(() => {});
    };
  }, [enabled, loadNearby]);

  return {
    nearbyCreators,
    nearbyBounties,
    loading,
    error,
    hasPermission,
    userLocation,
    refresh,
  };
}
