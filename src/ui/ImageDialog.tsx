import { createUniqueId, onCleanup, onMount, type JSX } from 'solid-js';
import { Portal } from 'solid-js/web';

/** Native modal behavior keeps focus and keyboard dismissal consistent across image flows. */
export function ImageDialog(props: {
  title: string;
  close: () => void;
  busy?: boolean;
  dismissOnBackdrop?: boolean;
  children: JSX.Element;
}) {
  let dialog!: HTMLDialogElement;
  const titleId = createUniqueId();
  onMount(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    onCleanup(() => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    });
  });
  return (
    <Portal>
      <dialog
        ref={dialog}
        class="image-dialog"
        aria-labelledby={titleId}
        onCancel={(event) => {
          event.preventDefault();
          if (!props.busy) props.close();
        }}
        onClick={(event) => {
          if (event.target !== dialog || props.busy || props.dismissOnBackdrop === false) return;
          const rect = dialog.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            props.close();
        }}
      >
        <div class="image-dialog-heading">
          <h2 id={titleId}>{props.title}</h2>
          <button
            type="button"
            class="quiet"
            disabled={props.busy}
            onClick={props.close}
            aria-label="Close image dialog"
          >
            ✕
          </button>
        </div>
        {props.children}
      </dialog>
    </Portal>
  );
}
