import type { RouteDefinition } from '@solidjs/router';
import {
  LaunchPage,
  NotFoundPage,
  HomePage,
  HouseholdPage,
  EditorPage,
  HistoryPage,
  TrashPage,
  CapturePage,
  InboxPage,
  ReviewPage,
  SettingsPage,
} from './pages';
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
