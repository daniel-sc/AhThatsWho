import { it, expect, vi } from 'vitest';

it('rotates the hosted website token while preserving custom containers', async () => {
  vi.stubEnv('VITE_CLOUDKIT_API_TOKEN', 'synthetic-current-token');
  try {
    const { currentCloudConfig, DEFAULT_CLOUD_CONFIG } = await import('../src/app/cloud-config');
    const stale = { ...DEFAULT_CLOUD_CONFIG, apiToken: 'synthetic-old-token' };
    expect(currentCloudConfig(stale).apiToken).toBe('synthetic-current-token');
    const custom = { ...stale, container: 'iCloud.example.custom' };
    expect(currentCloudConfig(custom)).toEqual(custom);
    const development = { ...stale, environment: 'development' as const };
    expect(currentCloudConfig(development)).toEqual(development);
  } finally {
    vi.unstubAllEnvs();
  }
});
