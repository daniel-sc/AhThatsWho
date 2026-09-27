import type { CloudConfig } from '../providers/cloudkit';

// Public website configuration, not a user authentication token.
export const DEFAULT_CLOUD_CONFIG: CloudConfig = {
  container: 'iCloud.me.cbfp.namecue',
  apiToken: import.meta.env.VITE_CLOUDKIT_API_TOKEN || '',
  environment: 'production',
};
