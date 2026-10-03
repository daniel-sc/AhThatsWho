import {
  createSignal,
  createMemo,
  createEffect,
  on,
  createContext,
  useContext,
  onMount,
  onCleanup,
} from 'solid-js';
import { useBeforeLeave, useCurrentMatches, useLocation, useNavigate } from '@solidjs/router';
import { liveQuery } from 'dexie';
import { useRegisterSW } from 'virtual:pwa-register/solid';
import { db, getMeta, setMeta, recoverInterrupted } from '../data/db';
import {
  captureCompleted,
  type HouseholdRecord,
  type Context,
  type Capture,
} from '../domain/types';
import { createSearchIndex, searchIndex } from '../domain/search';
import { startBackup } from './backup';
import { createInstallation } from '../ui/InstallHelp';
import { isFreshNotebook } from '../data/onboarding';
import { initial, routePath, decodeId, screens, type Screen, type UI } from './view-state';
export const NotebookContext = createContext<ReturnType<typeof createNotebook>>();
export function useNotebook() {
  const notebook = useContext(NotebookContext);
  if (!notebook) throw new Error('Notebook provider is missing.');
  return notebook;
}
export function createNotebook() {
  const location = useLocation<{ ui: UI }>();
  const go = useNavigate();
  const matches = useCurrentMatches();
  const [rows, setRows] = createSignal<HouseholdRecord[]>([]);
  const [contexts, setContexts] = createSignal<Context[]>([]);
  const [inbox, setInbox] = createSignal<Capture[]>([]);
  let documentResume: UI | undefined;
  const [startupState, setStartupState] = createSignal<UI>();
  const [launchState, setLaunchState] = createSignal<UI>(initial);
  // The router's location state is the only owner of per-entry UI state.
  const ui = createMemo<UI>(() => {
    const match = matches().at(-1);
    const screen = (match?.route.info?.screen || 'home') as Screen;
    const state = location.state?.ui || startupState() || initial;
    return {
      ...initial,
      ...state,
      context: contexts().some((c) => c.id === state.context) ? state.context : '',
      homeAnchor:
        !state.context || contexts().some((c) => c.id === state.context)
          ? state.homeAnchor
          : undefined,
      screen,
      ...(['household', 'editor', 'history'].includes(screen)
        ? { target: decodeId(match?.params.target) }
        : {}),
      ...(screen === 'review' ? { capture: decodeId(match?.params.capture) } : {}),
    };
  });
  function setUI(state: UI) {
    go(location.pathname, { replace: true, scroll: false, state: { ui: state } });
  }
  const [fresh, setFresh] = createSignal(false);
  const [returnToCapture, setReturnToCapture] = createSignal(false);
  const welcome = () =>
    ready() && fresh() && ui().screen === 'home' && !ui().query && !ui().context;
  const [ready, setReady] = createSignal(false);
  const [error, setError] = createSignal('');
  const [notice, setNotice] = createSignal('');
  const [recording, setRecording] = createSignal(false);
  const [reviewEditing, setReviewEditing] = createSignal(false);
  const [importing, setImporting] = createSignal(false);
  const [online, setOnline] = createSignal(navigator.onLine);
  let disposed = false;
  let persistWrites = Promise.resolve();
  const sw = useRegisterSW();
  const blocked = () =>
    recording() ||
    ui().screen === 'editor' ||
    reviewEditing() ||
    importing() ||
    ui().screen === 'capture';
  const report = (e: unknown) => {
    setError(
      e instanceof Error ? e.message : 'Something went wrong. Your saved data has been kept.',
    );
    requestAnimationFrame(() => document.getElementById('app-error')?.focus());
  };
  const installation = createInstallation(report);
  const current = createMemo(() =>
    rows().find((r) => r.household.id === ui().target && !r.deletedAt),
  );
  const activeCapture = createMemo(() => inbox().find((c) => c.id === ui().capture));
  const index = createMemo(() => createSearchIndex(rows(), contexts()));
  const results = createMemo(() => searchIndex(index(), ui().query, ui().context || undefined));
  const unresolved = createMemo(() => inbox().filter((c) => !captureCompleted(c)));
  function anchor() {
    const row = [...document.querySelectorAll<HTMLElement>('[data-household]')].find(
      (e) => e.getBoundingClientRect().bottom > 0,
    );
    return row ? { id: row.dataset.household!, top: row.getBoundingClientRect().top } : undefined;
  }
  function persist() {
    if (!ready()) return;
    const state = {
      ...ui(),
      scroll: window.scrollY,
      ...(ui().screen === 'home' ? { homeAnchor: anchor() } : {}),
    };
    persistWrites = persistWrites
      .then(() => setMeta('ui', state))
      .then(() => {})
      .catch(report);
  }
  // Persist accepted locations as they change, not just when the old view is left.
  createEffect(
    on(
      () => [ready(), ui()] as const,
      ([loaded]) => {
        if (loaded) persist();
      },
    ),
  );
  function canLeave() {
    if (!ready()) return false;
    if (!recording() && !importing()) return true;
    setNotice(
      recording()
        ? 'Stop the recording before navigating.'
        : 'Finish or cancel the import before navigating.',
    );
    return false;
  }
  useBeforeLeave((event) => {
    if (!canLeave()) event.preventDefault();
    else {
      if (event.to !== location.pathname) {
        persist();
        setStartupState(undefined);
      }
    }
  });
  function navigate(screen: Screen, patch: Partial<UI> = {}) {
    if (!canLeave()) return;
    setNotice('');
    const next = {
      ...ui(),
      screen,
      ...(ui().screen === 'home' ? { homeAnchor: anchor() } : {}),
      ...patch,
    };
    go(routePath(next), { replace: routePath(next) === location.pathname, state: { ui: next } });
  }
  const home = () =>
    navigate('home', {
      ...initial,
      target: undefined,
      capture: undefined,
      previous: undefined,
      homeAnchor: undefined,
    });
  function openHousehold(r: HouseholdRecord) {
    navigate('household', { target: r.household.id });
    void db.households
      .update(r.household.id, { lastViewedAt: new Date().toISOString() })
      .catch(report);
  }
  const newHousehold = () => navigate('editor', { target: undefined });
  const beginEdit = () => navigate('editor');
  function capture() {
    navigate('capture', { previous: ui().screen === 'capture' ? 'home' : ui().screen });
  }
  const history = () => navigate('history');
  async function act(fn: () => Promise<unknown>) {
    try {
      await fn();
    } catch (e) {
      report(e);
    }
  }
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (recording() || importing()) {
      event.preventDefault();
      event.returnValue = '';
    }
  };
  window.addEventListener('beforeunload', beforeUnload);
  onCleanup(() => window.removeEventListener('beforeunload', beforeUnload));
  onMount(async () => {
    try {
      await db.open();
      const [households, ctx, items, preferences, saved, newNotebook] = await Promise.all([
        db.households.toArray(),
        db.contexts.toArray(),
        db.inbox.toArray(),
        getMeta('preferences', { resume: true }),
        getMeta<UI>('ui', initial),
        isFreshNotebook(),
      ]);
      if (disposed) return;
      setFresh(newNotebook);
      setRows(households);
      setContexts(ctx);
      setInbox(items);
      let resumed = preferences.resume && screens.includes(saved.screen) ? saved : initial;
      const returningFromGoogle =
        new URLSearchParams(location.search).has('backup') ||
        !!(await getMeta('driveFlow', undefined));
      if (returningFromGoogle) resumed = { ...initial, screen: 'settings' };
      setLaunchState(resumed);
      if (location.pathname === '/' || routePath(resumed) === location.pathname)
        documentResume = resumed;
      if (routePath(resumed) === location.pathname) setStartupState(resumed);
      if (returningFromGoogle && location.pathname !== '/')
        go('/settings', { replace: true, state: { ui: resumed } });
      setReady(true);
      const subscriptions = [
        liveQuery(() => isFreshNotebook()).subscribe({ next: setFresh, error: report }),
        liveQuery(() => db.households.toArray()).subscribe(setRows),
        liveQuery(() => db.contexts.toArray()).subscribe(setContexts),
        liveQuery(() => db.inbox.toArray()).subscribe(setInbox),
      ];
      const stopBackup = startBackup();
      cleanup = () => {
        subscriptions.forEach((s) => s.unsubscribe());
        stopBackup();
      };
      void recoverInterrupted().catch(report);
    } catch (e) {
      report(e);
    }
  });
  let cleanup = () => {};
  let scrollTimer: ReturnType<typeof setTimeout> | undefined;
  const scroll = () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(persist, 100);
  };
  const lifecycle = () => {
    clearTimeout(scrollTimer);
    persist();
  };
  const network = () => setOnline(navigator.onLine);
  window.addEventListener('scroll', scroll, { passive: true });
  window.addEventListener('pagehide', lifecycle);
  window.addEventListener('online', network);
  window.addEventListener('offline', network);
  onCleanup(() => {
    disposed = true;
    clearTimeout(scrollTimer);
    cleanup();
    window.removeEventListener('scroll', scroll);
    window.removeEventListener('pagehide', lifecycle);
    window.removeEventListener('online', network);
    window.removeEventListener('offline', network);
  });
  function restoreDocumentScroll() {
    const saved = documentResume;
    documentResume = undefined;
    // The virtual list restores by row because its measured heights change on reload.
    if (saved && !(saved.screen === 'home' && saved.homeAnchor)) {
      const frame = requestAnimationFrame(() => window.scrollTo(0, saved.scroll));
      onCleanup(() => cancelAnimationFrame(frame));
    }
  }
  function homeRestoreAnchor() {
    const state = documentResume?.screen === 'home' ? documentResume : ui();
    return !state.context || contexts().some((c) => c.id === state.context)
      ? state.homeAnchor
      : undefined;
  }
  return {
    location,
    go,
    ui,
    setUI,
    rows,
    setRows,
    contexts,
    inbox,
    ready,
    welcome,
    returnToCapture,
    setReturnToCapture,
    recording,
    setRecording,
    reviewEditing,
    setReviewEditing,
    importing,
    setImporting,
    online,
    sw,
    blocked,
    report,
    installation,
    current,
    activeCapture,
    results,
    unresolved,
    persist,
    canLeave,
    navigate,
    home,
    openHousehold,
    newHousehold,
    beginEdit,
    capture,
    history,
    act,
    notice,
    setNotice,
    error,
    setError,
    launchState,
    startupState,
    restoreDocumentScroll,
    homeRestoreAnchor,
  };
}
