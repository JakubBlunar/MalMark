import type { Message, PublicState } from '../shared/types';
export type View = 'watching' | 'matches' | 'sites' | 'settings' | 'profile';
export type Navigate = (view: View) => void;
export type Act = (
  key: string,
  task: Message | (() => Promise<unknown>),
  success?: string,
) => Promise<boolean>;
export interface ViewProps {
  state: PublicState;
  tabId?: number;
  busy: string;
  act: Act;
}
