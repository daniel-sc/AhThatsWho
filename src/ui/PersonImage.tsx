import { createEffect, createSignal, onCleanup, onMount, Show } from 'solid-js';
import { imagePreview, readImageAsset } from '../data/person-images';
import { ImageDialog } from './ImageDialog';

/** URLs belong to this mounted image, including when a revision or draft changes its reference. */
export function PersonImage(props: {
  assetId: string;
  name: string;
  preview?: boolean;
  enlarge?: boolean;
  class?: string;
}) {
  let element!: HTMLElement;
  const [url, setUrl] = createSignal<string>();
  const [failed, setFailed] = createSignal(false);
  const [failureReason, setFailureReason] = createSignal('');
  const [open, setOpen] = createSignal(false);
  const [visible, setVisible] = createSignal(!props.preview);
  onMount(() => {
    if (visible()) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '400px' },
    );
    observer.observe(element);
    onCleanup(() => observer.disconnect());
  });
  createEffect(() => {
    if (!visible()) return;
    const id = props.assetId;
    const preview = props.preview;
    let disposed = false;
    let objectUrl: string | undefined;
    setUrl(undefined);
    setFailed(false);
    setFailureReason('');
    setOpen(false);
    (preview ? imagePreview(id) : readImageAsset(id))
      .then((blob) => {
        if (disposed) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((error) => {
        if (!disposed) {
          setFailed(true);
          setFailureReason(
            error instanceof Error
              ? error.message
              : 'Image unavailable. Restore a backup containing this image.',
          );
        }
      });
    onCleanup(() => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    });
  });
  const content = () => (
    <Show
      when={url()}
      fallback={
        <span
          class="portrait-placeholder"
          role="img"
          aria-label={`${props.name}: ${failed() ? failureReason() : 'image loading'}`}
          title={failureReason() || undefined}
        >
          {failed() ? 'Image unavailable' : '…'}
        </span>
      }
    >
      <img
        src={url()}
        alt={`Portrait of ${props.name}`}
        width="88"
        height="88"
        decoding="async"
        onError={() => {
          setFailed(true);
          setFailureReason(
            'This image could not be opened. Restore a backup containing this image.',
          );
          setUrl(undefined);
        }}
      />
    </Show>
  );
  return (
    <>
      <Show
        when={props.enlarge}
        fallback={
          <span ref={element} class={`person-portrait ${props.class || ''}`}>
            {content()}
          </span>
        }
      >
        <button
          ref={(button) => {
            element = button;
          }}
          type="button"
          class={`person-portrait portrait-button ${props.class || ''}`}
          disabled={!url()}
          aria-label={
            failed() ? `${props.name}: ${failureReason()}` : `Enlarge image of ${props.name}`
          }
          onClick={() => setOpen(true)}
        >
          {content()}
        </button>
      </Show>
      <Show when={open()}>
        <ImageDialog title={props.name} close={() => setOpen(false)}>
          <img class="enlarged-portrait" src={url()} alt={`Portrait of ${props.name}`} />
          <p class="fine muted">Person image</p>
          <button type="button" onClick={() => setOpen(false)}>
            Close
          </button>
        </ImageDialog>
      </Show>
    </>
  );
}
