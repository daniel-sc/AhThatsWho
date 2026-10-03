import { usePage } from '../page';
import { initial } from '../view-state';
import { Settings } from '../../ui/Settings';

export default function SettingsPage() {
  const {
    setUI,
    contexts,
    returnToCapture,
    setReturnToCapture,
    setImporting,
    report,
    installation,
    navigate,
    setNotice,
    inlinePersonImages,
  } = usePage();
  return (
    <Settings
      inlinePersonImages={inlinePersonImages()}
      installation={installation}
      returnToCapture={
        returnToCapture()
          ? () => {
              setReturnToCapture(false);
              navigate('capture');
            }
          : undefined
      }
      contexts={contexts()}
      error={report}
      importing={setImporting}
      trash={() => navigate('trash')}
      replaced={() => {
        setUI({ ...initial, screen: 'settings' });
        setNotice('Data restored. Local audio is not included in backups.');
      }}
    />
  );
}
