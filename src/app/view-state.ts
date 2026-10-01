export type Screen =
  | 'home'
  | 'household'
  | 'editor'
  | 'history'
  | 'trash'
  | 'capture'
  | 'inbox'
  | 'review'
  | 'settings';
export type Route = { screen: Screen; target?: string; capture?: string };
export type UI = Route & {
  query: string;
  context: string;
  scroll: number;
  homeScroll: number;
  homeAnchor?: { id: string; top: number };
  previous?: Screen;
};
export const initial: UI = { screen: 'home', query: '', context: '', scroll: 0, homeScroll: 0 };

export function routePath(route: Route): string {
  switch (route.screen) {
    case 'household':
      return `/households/${encodeURIComponent(route.target!)}`;
    case 'editor':
      return route.target
        ? `/households/${encodeURIComponent(route.target)}/edit`
        : '/households/new';
    case 'history':
      return `/households/${encodeURIComponent(route.target!)}/history`;
    case 'review':
      return `/inbox/${encodeURIComponent(route.capture!)}`;
    default:
      return `/${route.screen}`;
  }
}

export function decodeId(value: string | undefined) {
  try {
    return value === undefined ? undefined : decodeURIComponent(value);
  } catch {
    return value; // A malformed or unavailable ID follows the missing-record fallback.
  }
}

export const screens: Screen[] = [
  'home',
  'household',
  'editor',
  'history',
  'trash',
  'capture',
  'inbox',
  'review',
  'settings',
];
