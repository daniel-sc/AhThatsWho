import type { CloudConfig } from '../providers/cloudkit';

// Public website configuration, not a user authentication token.
export const DEFAULT_CLOUD_CONFIG: CloudConfig = {
  container: 'iCloud.me.cbfp.namecue',
  apiToken: import.meta.env.VITE_CLOUDKIT_API_TOKEN || '',
  environment: 'production',
};

// For the hosted AhThatsWho container, token rotation follows the deployed build.
// Explicit alternative containers/environments retain their device configuration.
export function currentCloudConfig(saved?: CloudConfig): CloudConfig {
  if (
    !saved ||
    (DEFAULT_CLOUD_CONFIG.apiToken &&
      saved.container === DEFAULT_CLOUD_CONFIG.container &&
      saved.environment === DEFAULT_CLOUD_CONFIG.environment)
  ) {
    return { ...DEFAULT_CLOUD_CONFIG };
  }
  return saved;
}
