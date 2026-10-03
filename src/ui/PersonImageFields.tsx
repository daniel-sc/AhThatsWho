import { createSignal, Show } from 'solid-js';
import { PersonImage } from './PersonImage';
import { ImageCropper } from './ImageCropper';

/** Hosts own the draft and decide when its image association is committed. */
export function PersonImageFields(props: {
  name: string;
  assetId?: string;
  change: (assetId: string | undefined) => void;
  standalone?: boolean;
}) {
  const [file, setFile] = createSignal<File>();
  return (
    <>
      <div class="person-image-editor">
        <Show when={props.assetId}>
          {(assetId) => <PersonImage assetId={assetId()} name={props.name} />}
        </Show>
        <div>
          <label class="file-button">
            {props.assetId ? 'Replace image' : '+ Add image'}
            <input
              type="file"
              accept="image/*"
              aria-label={`Choose image for ${props.name}`}
              onChange={(event) => {
                const selected = event.currentTarget.files?.[0];
                event.currentTarget.value = '';
                if (selected) setFile(selected);
              }}
            />
          </label>
          <Show when={props.assetId}>
            <button type="button" class="quiet danger" onClick={() => props.change(undefined)}>
              Remove image
            </button>
          </Show>
          <p class="fine muted">Choose a photo, then crop to this person.</p>
        </div>
      </div>
      <Show when={file()} keyed>
        {(selected) => (
          <ImageCropper
            file={selected}
            name={props.name}
            standalone={props.standalone}
            accept={(assetId) => {
              props.change(assetId);
              setFile(undefined);
            }}
            cancel={() => setFile(undefined)}
          />
        )}
      </Show>
    </>
  );
}
