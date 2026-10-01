import { Show } from 'solid-js';
import { usePage, MissingRecord } from '../page';
import { db } from '../../data/db';
import { Review } from '../../ui/Review';

export default function ReviewPage() {
  const { rows, setRows, contexts, setReviewEditing, report, activeCapture, navigate, act } =
    usePage();
  return (
    <Show
      when={activeCapture()}
      fallback={
        <MissingRecord href="/inbox" message="This capture is not available on this device." />
      }
    >
      <Show when={activeCapture()?.id} keyed>
        {(_id) => (
          <Review
            capture={activeCapture()!}
            rows={rows()}
            contexts={contexts()}
            back={() => navigate('inbox')}
            applied={(id) =>
              void act(async () => {
                setRows(await db.households.toArray());
                navigate('household', { target: id });
              })
            }
            error={report}
            editing={setReviewEditing}
          />
        )}
      </Show>
    </Show>
  );
}
