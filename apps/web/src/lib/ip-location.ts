interface LocationInfo {
  country?: string;
  city?: string;
  region?: string;
}

export async function getIpLocation(_ip: string): Promise<LocationInfo> {
  // For now, return empty location info
  // TODO: Implement actual IP geolocation service
  return {
    country: undefined,
    city: undefined,
    region: undefined,
  };
}
