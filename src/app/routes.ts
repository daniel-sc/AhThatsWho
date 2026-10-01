import type { RouteDefinition } from '@solidjs/router';
import { lazy } from 'solid-js';

// The notebook layout supplies the client-only boundary. Route loading uses
// Suspense so the router waits for the view before restoring scroll.
const LaunchPage = lazy(() => import('./pages/LaunchPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
const HomePage = lazy(() => import('./pages/HomePage'));
const HouseholdPage = lazy(() => import('./pages/HouseholdPage'));
const EditorPage = lazy(() => import('./pages/EditorPage'));
const HistoryPage = lazy(() => import('./pages/HistoryPage'));
const TrashPage = lazy(() => import('./pages/TrashPage'));
const CapturePage = lazy(() => import('./pages/CapturePage'));
const InboxPage = lazy(() => import('./pages/InboxPage'));
const ReviewPage = lazy(() => import('./pages/ReviewPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

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
