import { createSignal, Show } from 'solid-js';
import { savePersonImage } from '../data/db';
import type { Person } from '../domain/types';
import { personName } from '../domain/types';
import { ImageDialog } from './ImageDialog';
import { PersonImageFields } from './PersonImageFields';

export default function PersonImageEditor(props: {
  householdId: string;
  person: Person;
  close: () => void;
}) {
  const [assetId, setAssetId] = createSignal(props.person.imageAssetId);
  const [busy, setBusy] = createSignal(false);
  const [issue, setIssue] = createSignal('');
  async function save() {
    if (busy()) return;
    setBusy(true);
    setIssue('');
    try {
      await savePersonImage(props.householdId, props.person.id, assetId());
      props.close();
    } catch (error) {
      setIssue(error instanceof Error ? error.message : 'The image could not be saved. Try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <ImageDialog
      title={`Image of ${personName(props.person)}`}
      close={props.close}
      busy={busy()}
      dismissOnBackdrop={false}
    >
      <fieldset class="image-editor-fields" disabled={busy()}>
        <PersonImageFields
          name={personName(props.person)}
          assetId={assetId()}
          change={setAssetId}
          standalone
        />
      </fieldset>
      <Show when={issue()}>
        <p class="notice error" role="alert">
          {issue()}
        </p>
      </Show>
      <div class="actions">
        <button type="button" class="primary" disabled={busy()} onClick={() => void save()}>
          {busy() ? 'Saving…' : 'Save'}
        </button>
        <button type="button" disabled={busy()} onClick={props.close}>
          Cancel
        </button>
      </div>
    </ImageDialog>
  );
}
