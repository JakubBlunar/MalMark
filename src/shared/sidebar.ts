interface SidePanel {
  open(options: { tabId: number }): Promise<void>;
}

// The polyfill's API metadata predates Chromium's Side Panel API.
export function chromiumSidePanel(): SidePanel | undefined {
  return (globalThis as { chrome?: { sidePanel?: SidePanel } }).chrome?.sidePanel;
}
