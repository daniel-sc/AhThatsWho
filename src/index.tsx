import { render } from 'solid-js/web';
import { ErrorBoundary } from 'solid-js';
import App from './app/App';
import { Router } from '@solidjs/router';
import { routes } from './app/routes';
import './style.css';
render(
  () => (
    <ErrorBoundary
      fallback={
        <main>
          <h1>AhThatsWho could not open this screen.</h1>
          <p>Your stored notebook has not been cleared. Reload to try again.</p>
          <button onClick={() => location.reload()}>Reload</button>
        </main>
      }
    >
      <Router root={App} scrollRestoration>
        {routes}
      </Router>
    </ErrorBoundary>
  ),
  document.getElementById('root')!,
);
