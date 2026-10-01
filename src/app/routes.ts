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

// The bare root is the PWA launch/resume URL. Named paths always take precedence.
export function parseRoute(pathname: string): Route | undefined {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/') return undefined;
  if (/^\/(home|settings|capture|inbox|trash)$/.test(path))
    return { screen: path.slice(1) as Screen };
  if (path === '/households/new') return { screen: 'editor' };
  try {
    const household = /^\/households\/([^/]+)(?:\/(edit|history))?$/.exec(path);
    if (household)
      return {
        screen:
          household[2] === 'edit' ? 'editor' : household[2] === 'history' ? 'history' : 'household',
        target: decodeURIComponent(household[1]),
      };
    const review = /^\/inbox\/([^/]+)$/.exec(path);
    if (review) return { screen: 'review', capture: decodeURIComponent(review[1]) };
  } catch {
    // Malformed URL encoding is handled like an unknown path.
  }
  return undefined;
}
