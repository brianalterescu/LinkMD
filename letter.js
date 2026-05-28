document.addEventListener('DOMContentLoaded', () => {
    
    // Wire up the print button safely
    const printBtn = document.getElementById('printBtn');
    if (printBtn) {
        printBtn.addEventListener('click', () => {
            window.print();
        });
    }

    // Fetch the stored letter data and populate the DOM
    chrome.storage.local.get(['currentLetter'], (result) => {
        if (result.currentLetter) {
            document.getElementById('docDate').innerText = result.currentLetter.date;
            document.getElementById('docName').innerText = result.currentLetter.name.toUpperCase();
            document.getElementById('docDOB').innerText = result.currentLetter.dob;
            document.getElementById('docReason').innerText = result.currentLetter.bodyText;
        } else {
            document.body.innerHTML = "<h2 style='text-align:center; margin-top:50px; font-family:sans-serif;'>Error: No letter data found. Please generate from the extension.</h2>";
        }
    });
});