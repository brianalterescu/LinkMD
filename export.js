// Grab the queue from local storage
chrome.storage.local.get(['updoxQueue'], (result) => {
  const queue = result.updoxQueue || [];
  
  // FIX: Target the ID actually in your HTML (#reportTableBody)
  const tbody = document.getElementById('reportTableBody');

  if (queue.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">No data found. Please run the Updox scraper first.</td></tr>';
    return;
  }

  // Clear existing content just in case
  tbody.innerHTML = '';

  queue.forEach(patient => {
    let displayStatus = patient.confirmationCode;
    if (displayStatus === "0X") {
      displayStatus = '<span style="color: red; font-weight: bold;">Not Confirmed</span>';
    }

    // FIX: Match the element variable names
    const tr = document.createElement('tr'); 
    tr.innerHTML = `
      <td><strong>${patient.patientName}</strong></td>
      <td>${patient.appointmentTime}</td>
      <td class="code-cell">${displayStatus}</td>
    `;
    tbody.appendChild(tr); // Now appending the correct 'tr' variable
  });

  // Automatically trigger the Print dialog after a brief delay
  setTimeout(() => {
    // window.print();
  }, 800);
});

// Set the date
const now = new Date();
const dateElement = document.getElementById("reportDate");
if (dateElement) {
    dateElement.textContent = now.toLocaleDateString() + " " + now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
}

// Print button listener
const printBtn = document.getElementById('printTriggerBtn');
if (printBtn) {
    printBtn.addEventListener('click', () => {
        window.print();
    });
}


// Listen for changes in storage to update the table in real-time
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.updoxQueue) {
        const newQueue = changes.updoxQueue.newValue;
        if (!newQueue || newQueue.length === 0) {
            // If storage is cleared, wipe the table and icon
            document.body.innerHTML = "<h1 style='text-align:center; margin-top:100px;'>Data Purged for Compliance. Please close this window.</h1>";
        }
    }
});