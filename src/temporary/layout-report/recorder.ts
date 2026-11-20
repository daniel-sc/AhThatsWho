import { screens, type Screen } from '../../app/view-state';

// Temporary, local-only iPhone Home Screen diagnostics. See README.md for removal.
const key = 'ahthatswho:layout-report:v1';
const week = 7 * 24 * 60 * 60 * 1000;
const events = ['open', 'resume', 'hide', 'focus', 'blur', 'settled', 'resize', 'scroll'] as const;
type Reason = (typeof events)[number];
type Sample = [
  time: number,
  build: string,
  reason: Reason,
  screen: Screen,
  width: number,
  height: number,
  visualHeight: number,
  visualTop: number,
  scale: number,
  scrollY: number,
  navBottom: number,
  actionsBottom: number,
  editable: number,
];
type Recordings = { healthy: Sample[]; recent: Sample[]; episode: Sample[] };
let records: Recordings = { healthy: [], recent: [], episode: [] };

export function isReportDevice() {
  return (
    typeof navigator !== 'undefined' &&
    /iPhone/.test(navigator.userAgent) &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true)
  );
}

// Only these fixed labels and numbers can reach storage or a shared report, including on reload.
function readRows(value: unknown, limit: number): Sample[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(-limit)
    .filter(
      (r): r is Sample =>
        Array.isArray(r) &&
        r.length === 13 &&
        Number.isSafeInteger(r[0]) &&
        r[0] >= Date.now() - week &&
        r[0] <= Date.now() &&
        typeof r[1] === 'string' &&
        /^(?:[0-9a-f]{7,40}|local)$/.test(r[1]) &&
        events.includes(r[2]) &&
        screens.includes(r[3]) &&
        r.slice(4).every(Number.isFinite),
    );
}
function bounded(data: Partial<Recordings>): Recordings {
  return {
    healthy: readRows(data.healthy, 1),
    recent: readRows(data.recent, 16),
    episode: readRows(data.episode, 12),
  };
}

export function startLayoutReport(screen: () => Screen) {
  if (!isReportDevice()) return () => {};
  try {
    records = bounded(JSON.parse(localStorage.getItem(key) || '{}'));
  } catch {
    /* Storage can be unavailable; continue in memory. */
  }
  const build = /^[0-9a-f]{7,40}$/.test(__BUILD__.sha) ? __BUILD__.sha.slice(0, 12) : 'local';
  const vv = window.visualViewport;
  const listeners = new AbortController();
  const opts = { passive: true, signal: listeners.signal };
  let write: ReturnType<typeof setTimeout> | undefined;
  let motion: ReturnType<typeof setTimeout> | undefined;
  let settle: ReturnType<typeof setTimeout> | undefined;
  let lastBlur = 0,
    inEpisode = false,
    worstGap = 0;
  const flush = () => {
    clearTimeout(write);
    write = undefined;
    try {
      localStorage.setItem(key, JSON.stringify(records));
    } catch {
      /* Memory still works. */
    }
  };
  function sample(reason: Reason) {
    // Preserve the lead-up while the user navigates the (long) Settings page to share.
    if (screen() === 'settings' || !vv || (document.hidden && reason !== 'hide')) return;
    const nav = document.querySelector('.bottom-nav');
    if (!nav) return;
    const round = Math.round;
    const w = innerWidth,
      h = innerHeight,
      vh = round(vv.height),
      top = round(vv.offsetTop);
    const scale = round(vv.scale * 100) / 100;
    const editable = !!document.activeElement?.matches(
      'input:not([type=checkbox]):not([type=radio]),textarea,select,[contenteditable=true]',
    );
    const floor = round(nav.getBoundingClientRect().bottom);
    const actions = document.querySelector('.sticky-actions');
    const now = Date.now();
    const row: Sample = [
      now,
      build,
      reason,
      screen(),
      w,
      h,
      vh,
      top,
      scale,
      round(scrollY),
      floor,
      actions ? round(actions.getBoundingClientRect().bottom) : -1,
      Number(editable),
    ];
    const before = records.recent;
    // Keep one sample per uninterrupted scroll burst instead of evicting lifecycle/focus events.
    const replace =
      reason === 'scroll' &&
      before.at(-1)?.[2] === reason &&
      before.at(-1)?.[3] === screen() &&
      now - before.at(-1)![0] < 1000;
    records.recent = [...(replace ? before.slice(0, -1) : before), row].slice(-16);
    const healthy = records.healthy[0];
    const base = healthy && healthy[0] >= now - week && healthy[4] === w ? healthy[5] : h;
    const gap = Math.max(h - vh, h - floor, base - h, Math.abs(top));
    const comparable = scale === 1 && !editable && now - lastBlur > 600 && reason !== 'hide';
    if (comparable && gap >= 48) {
      if (!inEpisode) {
        records.episode = [...records.healthy, ...before.slice(-9), row];
        inEpisode = true;
        worstGap = gap;
        flush(); // The user may have to force-quit immediately.
      } else if (
        gap > worstGap ||
        (screen() === 'editor' && records.episode.at(-1)?.[3] !== 'editor')
      ) {
        records.episode = [...records.episode.slice(0, 11), row];
        worstGap = Math.max(worstGap, gap);
        if (write === undefined) write = setTimeout(flush, 1000);
      }
    } else if (comparable && gap < 20) {
      inEpisode = false;
      if (h > w) records.healthy = [row];
    }
    if (write === undefined) write = setTimeout(flush, 3000);
  }
  function delayed(reason: Reason) {
    if (motion !== undefined) return;
    motion = setTimeout(() => {
      motion = undefined;
      sample(reason);
    }, 180);
  }
  function afterTransition() {
    clearTimeout(settle);
    settle = setTimeout(() => sample('settled'), 900);
  }
  window.addEventListener('scroll', () => delayed('scroll'), opts);
  vv?.addEventListener('scroll', () => delayed('scroll'), opts);
  vv?.addEventListener(
    'resize',
    () => {
      delayed('resize');
      afterTransition();
    },
    opts,
  );
  document.addEventListener('focusin', () => sample('focus'), opts);
  document.addEventListener(
    'focusout',
    () => {
      lastBlur = Date.now();
      sample('blur');
      afterTransition();
    },
    opts,
  );
  const hide = () => {
    sample('hide');
    flush();
  };
  const resume = () => {
    sample('resume');
    afterTransition();
  };
  document.addEventListener('visibilitychange', () => (document.hidden ? hide() : resume()), opts);
  window.addEventListener('pagehide', hide, opts);
  window.addEventListener('pageshow', resume, opts);
  sample('open');
  return () => {
    listeners.abort();
    clearTimeout(settle);
    clearTimeout(motion);
    flush();
  };
}

export function layoutReportText() {
  const data = bounded(records);
  function section(title: string, rows: Sample[]) {
    return [
      title,
      ...rows.map(([t, ...fields]) => `${new Date(t).toISOString()} ${fields.join(' ')}`),
      ...(rows.length ? [] : ['None recorded.']),
    ].join('\n');
  }
  return [
    'AhThatsWho · iPhone Home Screen layout report v1',
    'UTC | build | event | screen | width | windowH | visualH | visualTop | zoom | scrollY | navBottom | actionsBottom (-1=absent) | editable (0/1)',
    section('Latest suspected episode (including lead-up)', data.episode),
    section('Last healthy portrait measurement', data.healthy),
    section('Recent activity before Settings', data.recent),
  ].join('\n\n');
}
