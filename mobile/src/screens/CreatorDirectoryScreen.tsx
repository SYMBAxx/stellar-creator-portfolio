import React from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useGeofencing } from '../hooks/useGeofencing';
import type { NearbyCreator, NearbyBounty } from '../services/GeofencingService';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

function NearbyCreatorCard({ creator }: { creator: NearbyCreator }) {
  return (
    <TouchableOpacity style={styles.card}>
      <Text style={styles.cardName}>{creator.name}</Text>
      <Text style={styles.cardDiscipline}>{creator.discipline}</Text>
      <Text style={styles.cardDistance}>{creator.distanceKm.toFixed(1)} km away</Text>
    </TouchableOpacity>
  );
}

function NearbyBountyCard({ bounty }: { bounty: NearbyBounty }) {
  return (
    <TouchableOpacity style={styles.card}>
      <Text style={styles.cardName}>{bounty.title}</Text>
      <Text style={styles.cardDiscipline}>${bounty.budget.toLocaleString()}</Text>
      <Text style={styles.cardDistance}>{bounty.distanceKm.toFixed(1)} km away</Text>
    </TouchableOpacity>
  );
}

export default function CreatorDirectoryScreen() {
  const {
    nearbyCreators,
    nearbyBounties,
    loading,
    error,
    hasPermission,
    refresh,
  } = useGeofencing({ apiBaseUrl: API_BASE_URL });

  if (!hasPermission) {
    return (
      <View style={styles.center}>
        <Text style={styles.permissionTitle}>Location Access</Text>
        <Text style={styles.permissionText}>
          We use your location to find creators and bounties near you. Your
          location is never stored on our servers without your explicit consent.
        </Text>
        <TouchableOpacity style={styles.button} onPress={refresh}>
          <Text style={styles.buttonText}>Enable Location</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
      ListHeaderComponent={
        <>
          {error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {loading && nearbyCreators.length === 0 && (
            <ActivityIndicator size="large" style={styles.loader} />
          )}

          {nearbyCreators.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Near You</Text>
              <FlatList
                horizontal
                data={nearbyCreators}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => <NearbyCreatorCard creator={item} />}
                showsHorizontalScrollIndicator={false}
              />
            </View>
          )}

          {nearbyBounties.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Open Bounties Nearby</Text>
              {nearbyBounties.map((bounty) => (
                <NearbyBountyCard key={bounty.id} bounty={bounty} />
              ))}
            </View>
          )}
        </>
      }
      data={[]}
      renderItem={null}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  permissionTitle: { fontSize: 20, fontWeight: '700', marginBottom: 12 },
  permissionText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  button: {
    backgroundColor: '#6366f1',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  loader: { marginVertical: 32 },
  errorBanner: {
    backgroundColor: '#fef2f2',
    padding: 12,
    margin: 16,
    borderRadius: 8,
  },
  errorText: { color: '#dc2626', fontSize: 14 },
  section: { paddingHorizontal: 16, paddingVertical: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  card: {
    backgroundColor: '#f8fafc',
    padding: 16,
    borderRadius: 12,
    marginRight: 12,
    marginBottom: 8,
    minWidth: 180,
  },
  cardName: { fontSize: 16, fontWeight: '600' },
  cardDiscipline: { fontSize: 13, color: '#6366f1', marginTop: 4 },
  cardDistance: { fontSize: 12, color: '#94a3b8', marginTop: 4 },
});
