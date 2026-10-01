import { Navigate } from '@solidjs/router';
import { useNotebook } from '../notebook';
import { routePath } from '../view-state';

export default function LaunchPage() {
  const { launchState } = useNotebook();
  return <Navigate href={routePath(launchState())} state={{ ui: launchState() }} />;
}
