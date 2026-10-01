import { createMemo, Show } from 'solid-js';
import { useParams } from '@solidjs/router';
import { usePage, MissingRecord } from '../page';
import { db, saveHousehold } from '../../data/db';
import { emptyHousehold } from '../../domain/types';
import { Editor } from '../../ui/Editor';

export default function EditorPage() {
  const { setRows, contexts, current, ui, navigate, report } = usePage();
  const params = useParams();
  const edit = createMemo(() =>
    current()
      ? { h: structuredClone(current()!.household), version: current()!.versionId }
      : {
          h: {
            ...emptyHousehold(),
            contextIds: ui().context ? [ui().context] : [],
            people: [{ id: crypto.randomUUID() }],
          },
          version: undefined,
        },
  );
  return (
    <Show
      when={!params.target || current()}
      fallback={
        <MissingRecord href="/home" message="This household is not available on this device." />
      }
    >
      <Show when={params.target || 'new'} keyed>
        {(_id) => (
          <Editor
            initial={edit()!.h}
            baseVersion={edit()!.version}
            contexts={contexts()}
            draftKey={`draft:household:${edit()!.version ? edit()!.h.id : 'new'}`}
            error={report}
            title={edit()?.version ? 'Edit household' : 'Add household'}
            cancel={() => navigate(current() ? 'household' : 'home')}
            save={async (h, baseVersion) => {
              const r = await saveHousehold(h, baseVersion);
              setRows(await db.households.toArray());
              navigate('household', { target: r.household.id });
            }}
          />
        )}
      </Show>
    </Show>
  );
}
