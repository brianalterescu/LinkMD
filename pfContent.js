let isSearching = false; // Add this at the very top of the file
async function runPracticeFusionUpdate() {
    // Check if the user manually stopped the process
    const status = await new Promise(resolve => chrome.storage.local.get(['autoRunning'], resolve));
    if (status.autoRunning === false) {
        console.log("[PF] Automation stopped by user.");
        isSearching = false;
        return;
    }

    if (isSearching) {
        console.log("[PF] Search already in progress, skipping duplicate call.");
        // return; 
    }
    isSearching = true; // Lock the function

    try {
        console.log("[PF] Update process initiated...");

        const result = await new Promise(resolve => chrome.storage.local.get(['updoxQueue'], resolve));
        let queue = result.updoxQueue || [];

        if (queue.length === 0) {
            console.log("[PF] Queue is empty. Workflow complete.");
            chrome.storage.local.set({
                autoRunning: false
            });
            isSearching = false; // Unlock
            return;
        }

        const patient = queue[0];
        const matchingRows = await findAllPatientRows(patient.patientName);

        if (matchingRows.length > 0) {
            // Process ALL appointments found for this name
            await handleBatchUpdate(matchingRows, patient.confirmationCode);

            // Once the entire batch is done, proceed to the recursive loop logic
            // (Shift queue, save to storage, and call next patient)
        } else {
            console.warn(`[PF] ${patient.patientName} not found.`);
            // ... skip logic ...
        }
        // --- SKIP LOGIC (0X) ---
        if (patient.confirmationCode === "0X" || patient.confirmationCode.includes("Not Confirmed")) {
            console.log(`[PF] Skipping ${patient.patientName} (0X). Updating queue...`);
            queue.shift();
            await new Promise(resolve => chrome.storage.local.set({
                updoxQueue: queue
            }, resolve));

            isSearching = false; // Unlock before recursion
            // Short delay then call self for next patient
            setTimeout(() => runPracticeFusionUpdate(), 1000);
            return;
        }

        // --- FIND PATIENT ---
        const patientRow = await scrollAndFindPatient(patient.patientName);

        if (patientRow) {
            // handlePatientUpdate will handle the "Next Step" after the Save click
            await handlePatientUpdate(patientRow, patient.confirmationCode);
        } else {
            // --- NOT FOUND LOGIC ---
            console.warn(`[PF] ${patient.patientName} not found. Moving to next.`);
            queue.shift();
            await new Promise(resolve => chrome.storage.local.set({
                updoxQueue: queue
            }, resolve));

            isSearching = false; // Unlock before recursion
            setTimeout(() => runPracticeFusionUpdate(), 1000);
        }
    } catch (error) {
        console.error("[PF] Error:", error);
        isSearching = false; // Unlock so we don't get stuck on failure
    }
    // Note: Removed 'finally' to prevent accidental premature unlocking 
    // during handlePatientUpdate's async process.
}

/**
 * 2. THE MODAL INTERACTION LOGIC
 */
async function handlePatientUpdate(row, code) {
    const editBtn = Array.from(row.querySelectorAll('button, a, span'))
        .find(el => el.innerText.includes('Edit confirmation') || el.innerText.includes('Confirm'));

    if (!editBtn) return;
    editBtn.click();

    await new Promise(resolve => setTimeout(resolve, 1500));

    // CONFIRM RADIO
    const confirmedInput = document.querySelector('input[name="confirmationStatus"][value="true"]');
    const confirmedLabel = document.querySelector('label[for="' + (confirmedInput ? confirmedInput.id : '') + '"]');
    if (confirmedLabel) confirmedLabel.click();
    else if (confirmedInput) confirmedInput.click();

    // CUSTOM DROPDOWN
    const dropdownBtn = document.querySelector('[data-element="select-confirmation-method-dropdown"]');
    if (dropdownBtn) {
        dropdownBtn.click();
        await new Promise(resolve => setTimeout(resolve, 600));
        const customOption = Array.from(document.querySelectorAll('.composable-select__option, li, button, span'))
            .find(el => el.innerText.includes("Custom confirmation method"));
        if (customOption) customOption.click();
    }

    // NOTES FIELD
    const notesField = document.querySelector('textarea.input--textarea');
    if (notesField) {
        notesField.value = code;
        notesField.dispatchEvent(new Event('input', {
            bubbles: true
        }));
        notesField.dispatchEvent(new Event('change', {
            bubbles: true
        }));
    }

    // --- FINAL SAVE BLOCK ---
    const saveBtn = document.querySelector('[data-element="btn-save-confirmation"]');
    if (saveBtn) {
        // 1. Prepare the queue for the next patient
        const res = await new Promise(r => chrome.storage.local.get(['updoxQueue'], r));
        let q = res.updoxQueue || [];
        q.shift(); // Remove the current patient

        // 2. Save the updated queue
        await new Promise(r => chrome.storage.local.set({
            updoxQueue: q,
            autoRunning: true
        }, r));

        console.log("[PF] Save clicked. Initiating recursive loop for next patient...");
        saveBtn.click();
        

        // 3. THE RECURSIVE TRIGGER: 
        // Wait for the modal to disappear and the "Agenda" to be interactive again
        // Recursive Call
        setTimeout(() => {
            console.log("[PF] UI stabilized. Calling next patient...");
            runPracticeFusionUpdate();
        }, 500); // 0.5 seconds allows for the "Save" animation and data refresh
    }



}

/**
 * 3. THE SCROLL LOGIC
 */
async function scrollAndFindPatient(name) {
    const maxScrollAttempts = 20;
    const scheduleContainer = document.querySelector('.appointment-schedule-container') || window;
    for (let i = 0; i < maxScrollAttempts; i++) {
        const foundRow = Array.from(document.querySelectorAll('tr, div.appointment-row'))
            .find(el => el.innerText.toLowerCase().includes(name.toLowerCase()));
        if (foundRow) {
            foundRow.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });
            return foundRow;
        }
        if (scheduleContainer === window) window.scrollBy(0, 1000);
        else scheduleContainer.scrollTop += 1000;
        await new Promise(resolve => setTimeout(resolve, 1500));
    }
    return null;
}

/**
 * 4. THE AUTO-RECOVERY HEARTBEAT
 */
console.log("[PF] Heartbeat Monitor Active.");

// This interval checks every 3 seconds if the tool should "Wake Up"
setInterval(async () => {
    const result = await new Promise(resolve => chrome.storage.local.get(['autoRunning', 'updoxQueue'], resolve));

    if (result.autoRunning && result.updoxQueue && result.updoxQueue.length > 0) {

        // Check if a modal is currently open (we don't want to interrupt an active save)
        const modalOpen = document.querySelector('.modal-container') || document.querySelector('[data-element="btn-save-confirmation"]');

        // Check if the Agenda/Schedule is visible
        const scheduleVisible = document.querySelector('.appointment-schedule-container') || document.querySelector('#scheduler-agenda');

        if (!modalOpen && scheduleVisible && !isSearching) {
            console.log("[PF] Detects idle state with active queue. Auto-triggering next patient...");
            runPracticeFusionUpdate();
        }
    }
}, 3000); // 3-second check is the "sweet spot" for PF reloads


/**
 * Modified Find Logic: Captures all matching rows for a patient
 */
async function findAllPatientRows(targetName) {
    // Re-use your existing scroll logic, but instead of returning the first match,
    // push every matching row into an array.
    const allRows = Array.from(document.querySelectorAll('.appointment-row')); // Adjust selector to your PF row class

    return allRows.filter(row => {
        const nameElement = row.querySelector('.patient-name-cell'); // Adjust selector
        return nameElement && nameElement.innerText.trim().toLowerCase() === targetName.toLowerCase();
    });
}

/**
 * The Batch Update Loop
 */
async function handleBatchUpdate(patientRows, confirmationCode) {
    console.log(`[PF] Found ${patientRows.length} appointments for this patient. Processing batch...`);

    for (let i = 0; i < patientRows.length; i++) {
        console.log(`[PF] Updating appointment ${i + 1} of ${patientRows.length}`);

        // Call your existing update logic for this specific row
        await handlePatientUpdate(patientRows[i], confirmationCode);

        // Crucial: Wait for PF's UI to settle between each appointment update
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
}



/**
 * 5. THE START LISTENER
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "RUN_PF_UPDATE") {
        chrome.storage.local.set({
            autoRunning: true
        }, () => {
            runPracticeFusionUpdate();
        });
        sendResponse({
            status: "started"
        });
    }
    return true;
});