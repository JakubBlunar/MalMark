import { version } from '../../package.json';

export { version };

export function compareVersions(a: string, b: string): number {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const difference = left[i] - right[i];
    if (difference) return difference;
  }
  return 0;
}
