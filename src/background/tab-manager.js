/**
 * KIRO Recorder - Tab Manager
 * Tracks browser tabs and their states during recording.
 */

export class TabManager {
  constructor() {
    this.tabs = new Map();
    this.activeTabId = null;
  }

  setActiveTab(tabId) {
    this.activeTabId = tabId;
  }

  getActiveTab() {
    return this.activeTabId;
  }

  addTab(tab) {
    this.tabs.set(tab.id, {
      id: tab.id,
      url: tab.url || tab.pendingUrl,
      title: tab.title,
      createdAt: Date.now(),
    });
  }

  removeTab(tabId) {
    this.tabs.delete(tabId);
    if (this.activeTabId === tabId) {
      this.activeTabId = null;
    }
  }

  updateTab(tabId, changes) {
    const tab = this.tabs.get(tabId);
    if (tab) {
      Object.assign(tab, changes);
    }
  }

  getTab(tabId) {
    return this.tabs.get(tabId);
  }

  getAllTabs() {
    return Array.from(this.tabs.values());
  }

  clear() {
    this.tabs.clear();
    this.activeTabId = null;
  }
}
