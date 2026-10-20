// Handle the toolbar action explicitly so Chrome records the click as an
// extension invocation and grants activeTab for the page being captured.
chrome.action.onClicked.addListener((tab) => {
  if (tab.windowId !== undefined) {
    chrome.sidePanel.open({ windowId: tab.windowId });
  }
});
