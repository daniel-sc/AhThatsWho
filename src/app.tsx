import { Router, useCurrentMatches, useLocation } from '@solidjs/router';
import { init, track } from '@plausible-analytics/tracker';
import { clientOnly } from '@solidjs/start';
import { MetaProvider, Title } from '@solidjs/meta';
import { createEffect, ErrorBoundary, on, onMount, Suspense, type ParentProps } from 'solid-js';
import { routes } from './app/routes';
import { PrivacyPage } from './ui/PrivacyPage';
import './style.css';
const Notebook = clientOnly(() => import('./app/App'), { lazy: true });
function NotebookLayout(props: ParentProps) {
  return (
    <Notebook
      {...props}
      fallback={
        <main class="privacy-page">
          <h1>AhThatsWho</h1>
          <p>A private, offline notebook for the names you want to remember.</p>
          <p>Opening your notebook…</p>
          <noscript>Enable JavaScript to use the notebook.</noscript>
          <a href="/privacy">Privacy policy</a>
        </main>
      }
    />
  );
}
function RouterLayout(props: ParentProps) {
  const location = useLocation();
  const matches = useCurrentMatches();
  onMount(() => {
    init({
      domain: 'ahthatswho.com',
      autoCapturePageviews: false,
      transformRequest(event) {
        const pattern = matches().at(-1)?.route.pattern;
        if (!pattern || pattern === '/' || pattern.includes('*')) return null;
        return { ...event, u: new URL(event.u).origin + pattern.replace(/:\w+/g, 'ID'), r: null };
      },
    });
    // The launch redirect uses replaceState, which Plausible's automatic tracker misses.
    createEffect(
      on(
        () => location.pathname,
        () => track('pageview', {}),
      ),
    );
  });
  return <>{props.children}</>;
}
export default function App() {
  return (
    <MetaProvider>
      <Title>AhThatsWho</Title>
      <ErrorBoundary
        fallback={
          <main>
            <h1>AhThatsWho could not open this screen.</h1>
            <p>Your stored notebook has not been cleared. Reload to try again.</p>
            <button onClick={() => location.reload()}>Reload</button>
          </main>
        }
      >
        <Suspense>
          <Router root={RouterLayout} scrollRestoration>
            {[
              { path: '/privacy', component: PrivacyPage },
              { path: '', component: NotebookLayout, children: routes },
            ]}
          </Router>
        </Suspense>
      </ErrorBoundary>
    </MetaProvider>
  );
}
