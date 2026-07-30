import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Real-Time Tracking was rebuilt as five modules under `/tracking` (docs/23).
   * The nine screens it replaced keep working as links — each one lands on the
   * tab that absorbed its job, carrying its record id where it had one.
   * Temporary (307) rather than permanent: the old paths are still referenced
   * by bookmarks and saved reports, and we would rather not bake them into
   * browser caches forever while the IA settles.
   */
  async redirects() {
    return [
      { source: '/geofences', destination: '/tracking/geofences', permanent: false },
      { source: '/geofences/new', destination: '/tracking/geofences', permanent: false },
      { source: '/movement', destination: '/tracking/journey', permanent: false },
      { source: '/movement/:assetId', destination: '/tracking/journey?asset=:assetId', permanent: false },
      { source: '/sensors', destination: '/tracking/infrastructure?tab=tags', permanent: false },
      { source: '/sensors/:id', destination: '/tracking/infrastructure?tab=tags&device=:id', permanent: false },
      { source: '/gateways', destination: '/tracking/infrastructure?tab=gateways', permanent: false },
      { source: '/gateways/:id', destination: '/tracking/infrastructure?tab=gateways&device=:id', permanent: false },
      { source: '/twin', destination: '/tracking', permanent: false },
      { source: '/twin/:facility', destination: '/tracking/twin/:facility', permanent: false },
      // Removed outright: zone heatmaps answered no question that coverage and
      // inventory accuracy do not answer better, and the telemetry explorer was
      // an engineering console with no business question attached to it.
      { source: '/heatmaps', destination: '/tracking/infrastructure?tab=readers', permanent: false },
      { source: '/telemetry', destination: '/tracking/infrastructure?tab=health', permanent: false },
    ];
  },
};

export default nextConfig;
