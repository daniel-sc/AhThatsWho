import { onMount } from 'solid-js';
import { Navigate } from '@solidjs/router';
import { useNotebook } from './notebook';

// Only an actual destination page restores the initial document snapshot.
// Launch/fallback redirects leave it for the page that finally renders.
export function usePage() {
  const notebook = useNotebook();
  onMount(notebook.restoreDocumentScroll);
  return notebook;
}
export function MissingRecord(props: { href: string; message: string }) {
  const { setNotice } = useNotebook();
  onMount(() => setNotice(props.message));
  return <Navigate href={props.href} />;
}
