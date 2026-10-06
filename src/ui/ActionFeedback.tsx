import { Show, type JSX } from 'solid-js';

// Place this beside the action it describes. Keep recovery controls with its error.
export function ActionFeedback(props: {
  pending?: string;
  error?: string;
  message?: string;
  children?: JSX.Element;
}) {
  return (
    <>
      <Show when={props.pending}>
        <div class="capture-progress" role="status" aria-live="polite" aria-atomic="true">
          <span class="capture-spinner" aria-hidden="true" />
          <p class="capture-progress-title">{props.pending}</p>
        </div>
      </Show>
      <Show when={!props.pending && props.error}>
        <div class="capture-failure">
          <p role="alert">{props.error}</p>
          {props.children}
        </div>
      </Show>
      <Show when={!props.pending && !props.error && props.message}>
        <p class="notice" role="status" aria-live="polite">
          {props.message}
        </p>
      </Show>
    </>
  );
}
