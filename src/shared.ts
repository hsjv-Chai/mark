export type Action = 'new' | 'open' | 'save' | 'saveAs' | 'close';
export type Result = ({ status: 'ok'; text?: string; path: string | null; saved?: boolean } | { status: 'cancel' } | { status: 'error'; message: string }) & { checkpoint?: {text: string; path: string | null} };
export interface DesktopAPI {
  action(action: Action, text: string): Promise<Result>;
  changed(dirty: boolean): void;
  onCommand(handler: (action: Action | 'source') => void): () => void;
  openLink(url: string): Promise<void>;
}
declare global { interface Window { desktop?: DesktopAPI } }
