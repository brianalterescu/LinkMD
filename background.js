// This script stays alive even when tabs refresh
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Check if the page has finished loading
  if (changeInfo.status === 'complete' && tab.url.includes("practicefusion.com")) {
    
    // Ask storage if we are supposed to be auto-running
    chrome.storage.local.get(['autoRunning', 'updoxQueue'], (result) => {
      if (result.autoRunning && result.updoxQueue && result.updoxQueue.length > 0) {
        console.log("[Background] Auto-resume triggered for tab:", tabId);
        
        // Tell the content script to start
        chrome.tabs.sendMessage(tabId, { action: "RUN_PF_UPDATE" });
      }
    });
  }
});