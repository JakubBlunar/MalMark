// Only store builds bundle a public application ID. Never bundle a client secret.
export const MAL_CLIENT_ID = import.meta.env.VITE_MAL_CLIENT_ID?.trim() || '';
export const OAUTH_SETUP_REQUIRED = import.meta.env.VITE_DISTRIBUTION !== 'store';
