import { createSignal, onCleanup, onMount, Show } from 'solid-js';
import type Cropper from 'cropperjs';
import { encodePortrait, ensureImageAsset } from '../data/person-images';
import { ImageDialog } from './ImageDialog';
import { MAX_PORTRAIT_SIZE } from '../domain/person-images';

const template = `<cropper-canvas background>
  <cropper-image alt="Selected source photo"></cropper-image>
  <cropper-shade hidden></cropper-shade>
  <cropper-selection aspect-ratio="1" movable resizable zoomable outlined precise>
    <cropper-grid covered></cropper-grid>
    <cropper-crosshair centered></cropper-crosshair>
    <cropper-handle action="move" theme-color="rgba(255,255,255,0.12)"></cropper-handle>
    <cropper-handle action="ne-resize"></cropper-handle>
    <cropper-handle action="nw-resize"></cropper-handle>
    <cropper-handle action="se-resize"></cropper-handle>
    <cropper-handle action="sw-resize"></cropper-handle>
  </cropper-selection>
</cropper-canvas>`;

export function ImageCropper(props: {
  file: File;
  name: string;
  accept: (assetId: string) => void;
  cancel: () => void;
  standalone?: boolean;
}) {
  let container!: HTMLDivElement;
  let cropper: Cropper | undefined;
  let source: HTMLImageElement | undefined;
  let disposed = false;
  let resizeObserver: ResizeObserver | undefined;
  const [ready, setReady] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [issue, setIssue] = createSignal('');
  const bounds = () => {
    const image = cropper?.getCropperImage()?.getBoundingClientRect();
    const canvas = cropper?.getCropperCanvas()?.getBoundingClientRect();
    if (!image || !canvas) return;
    return {
      x: image.left - canvas.left,
      y: image.top - canvas.top,
      width: image.width,
      height: image.height,
    };
  };
  function frame(size?: number, x?: number, y?: number) {
    const selection = cropper?.getCropperSelection();
    const image = bounds();
    if (!selection || !image) return;
    const side = Math.max(8, Math.min(size ?? selection.width, image.width, image.height));
    const left = x ?? selection.x + (selection.width - side) / 2;
    const top = y ?? selection.y + (selection.height - side) / 2;
    selection.$change(
      Math.max(image.x, Math.min(left, image.x + image.width - side)),
      Math.max(image.y, Math.min(top, image.y + image.height - side)),
      side,
      side,
      1,
    );
  }
  function zoom(factor: number) {
    const selection = cropper?.getCropperSelection();
    if (selection) frame(selection.width * factor);
  }
  function center() {
    const image = bounds();
    if (!image) return;
    const side = Math.min(image.width, image.height) * 0.7;
    frame(side, image.x + (image.width - side) / 2, image.y + (image.height - side) / 2);
  }
  onMount(async () => {
    const sourceUrl = URL.createObjectURL(props.file);
    onCleanup(() => {
      disposed = true;
      resizeObserver?.disconnect();
      cropper?.destroy();
      URL.revokeObjectURL(sourceUrl);
      container.replaceChildren();
    });
    try {
      const { default: Cropper } = await import('cropperjs');
      if (disposed) return;
      source = new Image();
      source.alt = `Source photo for ${props.name}`;
      source.src = sourceUrl;
      await source.decode();
      if (disposed) return;
      cropper = new Cropper(source, { container, template });
      const image = cropper.getCropperImage();
      const selection = cropper.getCropperSelection();
      if (!image || !selection)
        throw new Error('The image editor could not open. Please try again.');
      await image.$ready();
      if (disposed) return;
      image.$center('contain');
      // Cropper's cancellable change event enforces the source bounds for touch and pointer gestures.
      selection.addEventListener('change', (event) => {
        const detail = (
          event as CustomEvent<{ x: number; y: number; width: number; height: number }>
        ).detail;
        const area = bounds();
        if (
          !area ||
          detail.width < 8 ||
          detail.height < 8 ||
          detail.x < area.x - 0.1 ||
          detail.y < area.y - 0.1 ||
          detail.x + detail.width > area.x + area.width + 0.1 ||
          detail.y + detail.height > area.y + area.height + 0.1
        )
          event.preventDefault();
      });
      center();
      setReady(true);
      let lastWidth = container.clientWidth;
      let lastHeight = container.clientHeight;
      resizeObserver = new ResizeObserver(() => {
        if (container.clientWidth === lastWidth && container.clientHeight === lastHeight) return;
        lastWidth = container.clientWidth;
        lastHeight = container.clientHeight;
        image.translatable = true;
        image.scalable = true;
        image.$center('contain');
        image.translatable = false;
        image.scalable = false;
        center();
      });
      resizeObserver.observe(container);
    } catch {
      if (!disposed)
        setIssue(
          'This image could not be opened. Choose a JPEG, PNG or another image your browser supports. Convert HEIC photos if needed.',
        );
    }
  });
  async function accept() {
    if (!ready() || busy()) return;
    setBusy(true);
    cropper!.getCropperCanvas()!.disabled = true;
    setIssue('');
    try {
      const selection = cropper!.getCropperSelection()!;
      const image = bounds()!;
      // Selection pixels are display pixels; convert back to source pixels before capping output.
      const side = Math.max(
        1,
        Math.min(
          MAX_PORTRAIT_SIZE,
          Math.floor((selection.width * source!.naturalWidth) / image.width),
        ),
      );
      const canvas = await selection.$toCanvas({ width: side, height: side });
      const asset = await encodePortrait(canvas);
      await ensureImageAsset(asset.id, asset.blob);
      if (!disposed) props.accept(asset.id);
    } catch (error) {
      if (!disposed)
        setIssue(
          error instanceof Error
            ? error.message
            : 'The image could not be saved. Your previous image is still kept.',
        );
    } finally {
      if (!disposed) {
        setBusy(false);
        cropper!.getCropperCanvas()!.disabled = false;
      }
    }
  }
  return (
    <ImageDialog
      title={`Frame ${props.name}`}
      close={props.cancel}
      busy={busy()}
      dismissOnBackdrop={!props.standalone}
    >
      <p class="muted crop-help">
        Drag the square to the person. Resize its corners or zoom for a closer crop.
      </p>
      <div
        ref={container}
        class="crop-stage"
        tabindex="0"
        role="group"
        aria-label="Image crop. Arrow keys move the square. Plus and minus zoom."
        aria-busy={!ready() || busy()}
        onKeyDown={(event) => {
          if (!ready() || busy()) return;
          const selection = cropper?.getCropperSelection();
          if (!selection) return;
          const delta = event.shiftKey ? 20 : 4;
          const directions: Record<string, [number, number]> = {
            ArrowLeft: [-delta, 0],
            ArrowRight: [delta, 0],
            ArrowUp: [0, -delta],
            ArrowDown: [0, delta],
          };
          if (directions[event.key]) {
            event.preventDefault();
            const [x, y] = directions[event.key];
            frame(undefined, selection.x + x, selection.y + y);
          } else if (['+', '=', '-'].includes(event.key)) {
            event.preventDefault();
            zoom(event.key === '-' ? 1.2 : 1 / 1.2);
          }
        }}
      />
      <Show when={!ready() && !issue()}>
        <p role="status" class="fine muted">
          Opening image…
        </p>
      </Show>
      <div class="crop-controls" role="group" aria-label="Crop controls">
        <button type="button" disabled={!ready() || busy()} onClick={() => zoom(1.2)}>
          − Zoom out
        </button>
        <button type="button" disabled={!ready() || busy()} onClick={() => zoom(1 / 1.2)}>
          + Zoom in
        </button>
        <button type="button" disabled={!ready() || busy()} class="quiet" onClick={center}>
          Reset
        </button>
      </div>
      <Show when={issue()}>
        <p role="alert" class="notice error">
          {issue()}
        </p>
      </Show>
      <p class="fine muted">
        Only the square crop is kept.{' '}
        {props.standalone
          ? 'Choose “Use this image”, then Save to apply it.'
          : 'It applies when you save the household.'}
      </p>
      <div class="actions crop-actions">
        <button
          type="button"
          class="primary"
          disabled={!ready() || busy()}
          onClick={() => void accept()}
        >
          {busy() ? 'Saving image…' : 'Use this image'}
        </button>
        <button type="button" disabled={busy()} onClick={props.cancel}>
          Cancel
        </button>
      </div>
    </ImageDialog>
  );
}
