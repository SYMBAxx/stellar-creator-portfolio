import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';

const GEOFENCE_TASK_NAME = 'CREATOR_GEOFENCE_TASK';
const DEFAULT_RADIUS_METERS = 10_000; // 10km

export interface GeofenceRegion {
  identifier: string;
  latitude: number;
  longitude: number;
  radius: number;
}

export interface NearbyCreator {
  id: string;
  name: string;
  discipline: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
}

export interface NearbyBounty {
  id: string;
  title: string;
  budget: number;
  latitude: number;
  longitude: number;
  distanceKm: number;
}

interface GeofenceEvent {
  eventType: Location.GeofencingEventType;
  region: GeofenceRegion;
}

TaskManager.defineTask(GEOFENCE_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('[Geofencing] Task error:', error.message);
    return;
  }

  const { eventType, region } = data as GeofenceEvent;

  if (eventType === Location.GeofencingEventType.Enter) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Creators & Bounties Nearby',
        body: `You entered ${region.identifier}. Check out local creators and open bounties!`,
        data: { regionId: region.identifier },
      },
      trigger: null,
    });
  }
});

export async function requestLocationPermission(): Promise<boolean> {
  const { status: foreground } = await Location.requestForegroundPermissionsAsync();
  if (foreground !== 'granted') {
    return false;
  }

  const { status: background } = await Location.requestBackgroundPermissionsAsync();
  return background === 'granted';
}

export async function getCurrentPosition(): Promise<Location.LocationObject> {
  return Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
}

export async function startGeofencing(regions: GeofenceRegion[]): Promise<void> {
  const hasPermission = await requestLocationPermission();
  if (!hasPermission) {
    throw new Error('Background location permission is required for geofencing');
  }

  await Location.startGeofencingAsync(GEOFENCE_TASK_NAME, regions);
}

export async function stopGeofencing(): Promise<void> {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(GEOFENCE_TASK_NAME);
  if (isRegistered) {
    await Location.stopGeofencingAsync(GEOFENCE_TASK_NAME);
  }
}

export function createRegionAroundUser(
  latitude: number,
  longitude: number,
  identifier = 'user-region',
  radius = DEFAULT_RADIUS_METERS
): GeofenceRegion {
  return { identifier, latitude, longitude, radius };
}

export async function fetchNearbyCreators(
  latitude: number,
  longitude: number,
  radiusKm = 10,
  apiBaseUrl: string
): Promise<NearbyCreator[]> {
  const response = await fetch(
    `${apiBaseUrl}/api/creators/nearby?lat=${latitude}&lng=${longitude}&radius=${radiusKm}`
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch nearby creators: ${response.status}`);
  }

  const data = await response.json();
  return data.creators ?? [];
}

export async function fetchNearbyBounties(
  latitude: number,
  longitude: number,
  radiusKm = 10,
  apiBaseUrl: string
): Promise<NearbyBounty[]> {
  const response = await fetch(
    `${apiBaseUrl}/api/bounties/nearby?lat=${latitude}&lng=${longitude}&radius=${radiusKm}`
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch nearby bounties: ${response.status}`);
  }

  const data = await response.json();
  return data.bounties ?? [];
}

export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
