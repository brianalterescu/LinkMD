console.log("[Updox Content Script] Loaded and waiting for commands...");

// 1. The Iframe Piercer
function getTargetDocument() {
  if (document.querySelector('.report-summary')) return document;
  const iframes = document.querySelectorAll('iframe');
  for (let iframe of iframes) {
    try {
      if (iframe.contentDocument && iframe.contentDocument.querySelector('.report-summary')) {
        return iframe.contentDocument;
      }
    } catch (e) {}
  }
  return document;
}

// 2. The Data Scraper
function scrapeUpdoxData() {
  console.log("[Updox Content Script] Scrape function triggered.");
  const patients = [];
  const targetDoc = getTargetDocument();
  
  const patientRows = targetDoc.querySelectorAll('tr.appointment-content'); 
  console.log(`[Updox Content Script] Scraping ${patientRows.length} total patient rows...`);

  patientRows.forEach((row, index) => {
    const name = row.querySelector('.reminder-address-book')?.innerText.trim() || 'Unknown';
    const time = row.cells.length > 1 ? row.cells[1].innerText.trim() : 'Unknown';
    
    let validCount = 0;
    const successfulStatuses = ['sent', 'answered', 'left msg', 'left message'];
    let siblingRow = row.nextElementSibling;

    while (siblingRow && !siblingRow.classList.contains('appointment-content')) {
      if (siblingRow.classList.contains('reminder-content')) {
        const rowTextElements = siblingRow.querySelectorAll('span, div, td');
        let statusFoundInThisRow = false;

        rowTextElements.forEach(el => {
          const text = el.innerText.trim().toLowerCase();
          if (successfulStatuses.includes(text) && !statusFoundInThisRow) {
            validCount++;
            statusFoundInThisRow = true; 
          }
        });
      }
      siblingRow = siblingRow.nextElementSibling;
    }

    patients.push({ 
        patientName: name, 
        appointmentTime: time, 
        confirmationCode: `${validCount}X` 
    });
  });

  chrome.storage.local.set({ updoxQueue: patients }, () => {
    console.log(`[Updox Content Script] Queued ${patients.length} total patients to Chrome Storage.`);
  });
  
  
  return patients.length; 
}

// 3. The Auto-Expander (With Ghost Scroll)
async function runAutoScrape() {
  const targetDoc = getTargetDocument();
  console.log("[Updox Content Script] Loading all patients (CSP-Safe Scroll)...");
  
  let lastCount = 0;
  for (let i = 0; i < 30; i++) { 
    const currentRows = targetDoc.querySelectorAll('tr.appointment-content');
    const currentCount = currentRows.length;
    
    if (currentCount === lastCount && i > 0) break; 

    // Pushing scroll via property instead of Event Dispatcher to avoid CSP blocks
    const scrollers = [
        targetDoc.documentElement, 
        targetDoc.body, 
        targetDoc.querySelector('.report-summary'),
        targetDoc.querySelector('#appointment-reminders')?.parentElement
    ];

    scrollers.forEach(s => {
        if (s) {
            s.scrollTop = s.scrollHeight;
            // Native property scroll is usually not blocked by script-src CSP
            s.scrollTo({ top: s.scrollHeight, behavior: 'auto' });
        }
    });

    lastCount = currentCount;
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  const expandTh = targetDoc.querySelector('#appointment-reminders th[ng-click*="expandCollapseAllAppointments"]');
  if (expandTh) {
    const currentState = expandTh.getAttribute('data-content');
    if (currentState === 'Expand all') {
      const innerIcon = expandTh.querySelector('.material-symbols-outlined');
      if (innerIcon) innerIcon.click(); // Standard .click() is safest for CSP
      else expandTh.click();
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  return scrapeUpdoxData();
}

// Function for V2 (No scrolling, just expand what's there and scrape)
async function runManualScrape() {
  const targetDoc = getTargetDocument();
  const expandTh = targetDoc.querySelector('#appointment-reminders th[ng-click*="expandCollapseAllAppointments"]');
  
  if (expandTh && expandTh.getAttribute('data-content') === 'Expand all') {
    const innerIcon = expandTh.querySelector('.material-symbols-outlined');
    if (innerIcon) innerIcon.click(); else expandTh.click();
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  return scrapeUpdoxData();
}

// Unified Message Listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("[Updox Content Script] Command received:", request.action);

  if (request.action === "SCRAPE_UPDOX") {
    // V1: Run the full auto-scroller
    runAutoScrape().then(count => sendResponse({ status: "success", count: count }));
  } 
  else if (request.action === "SCRAPE_UPDOX_V2") {
    // V2: Scrape currently loaded data only
    runManualScrape().then(count => sendResponse({ status: "success", count: count }));
  }
  
  return true; 
});

// 4. The Message Listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "SCRAPE_UPDOX") {
    runAutoScrape().then(scrapedCount => {
      sendResponse({ status: "success", count: scrapedCount });
    });
  }
  return true; 
});