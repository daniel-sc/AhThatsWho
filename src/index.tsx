import { render } from 'solid-js/web';
import { ErrorBoundary } from 'solid-js';
import App from './app/App';
import './style.css';
render(
  () => (
    <ErrorBoundary
      fallback={
        <main>
          <h1>NameCue could not open this screen.</h1>
          <p>Your stored notebook has not been cleared. Reload to try again.</p>
          <button onClick={() => location.reload()}>Reload</button>
        </main>
      }
    >
      <App />
    </ErrorBoundary>
  ),
  document.getElementById('root')!,
);
