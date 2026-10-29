export const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export const siteName = (site?: string) =>
  site === 'crunchyroll' ? 'Crunchyroll' : 'Custom website';
