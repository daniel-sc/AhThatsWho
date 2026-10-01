import type { RouteDefinition } from '@solidjs/router';
import { clientOnly } from '@solidjs/start';
const LaunchPage = clientOnly(() => import('./pages').then((m) => ({ default: m.LaunchPage })), {
  lazy: true,
});
const NotFoundPage = clientOnly(
  () => import('./pages').then((m) => ({ default: m.NotFoundPage })),
  { lazy: true },
);
const HomePage = clientOnly(() => import('./pages').then((m) => ({ default: m.HomePage })), {
  lazy: true,
});
const HouseholdPage = clientOnly(
  () => import('./pages').then((m) => ({ default: m.HouseholdPage })),
  { lazy: true },
);
const EditorPage = clientOnly(() => import('./pages').then((m) => ({ default: m.EditorPage })), {
  lazy: true,
});
const HistoryPage = clientOnly(() => import('./pages').then((m) => ({ default: m.HistoryPage })), {
  lazy: true,
});
const TrashPage = clientOnly(() => import('./pages').then((m) => ({ default: m.TrashPage })), {
  lazy: true,
});
const CapturePage = clientOnly(() => import('./pages').then((m) => ({ default: m.CapturePage })), {
  lazy: true,
});
const InboxPage = clientOnly(() => import('./pages').then((m) => ({ default: m.InboxPage })), {
  lazy: true,
});
const ReviewPage = clientOnly(() => import('./pages').then((m) => ({ default: m.ReviewPage })), {
  lazy: true,
});
const SettingsPage = clientOnly(
  () => import('./pages').then((m) => ({ default: m.SettingsPage })),
  { lazy: true },
);
export const routes: RouteDefinition[] = [
  { path: '/', component: LaunchPage },
  { path: '/home', component: HomePage, info: { screen: 'home' } },
  { path: '/settings', component: SettingsPage, info: { screen: 'settings' } },
  { path: '/capture', component: CapturePage, info: { screen: 'capture' } },
  { path: '/inbox', component: InboxPage, info: { screen: 'inbox' } },
  { path: '/trash', component: TrashPage, info: { screen: 'trash' } },
  { path: '/households/new', component: EditorPage, info: { screen: 'editor' } },
  { path: '/households/:target', component: HouseholdPage, info: { screen: 'household' } },
  { path: '/households/:target/edit', component: EditorPage, info: { screen: 'editor' } },
  { path: '/households/:target/history', component: HistoryPage, info: { screen: 'history' } },
  { path: '/inbox/:capture', component: ReviewPage, info: { screen: 'review' } },
  { path: '*missing', component: NotFoundPage },
];
