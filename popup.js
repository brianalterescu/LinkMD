// Created by Brian Alterescu

// popup.js - Handles UI interactions and communicates with content scripts


// HIPAA-Compliant Stop Button: Immediately halts all automation.
stopBtn.addEventListener('click', () => {
    // Force autoRunning to false
    console.log("Stop button clicked. Sending stop command to storage...");
    chrome.storage.local.set({
        autoRunning: false
    }, () => {
        statusElement.innerText = "Status: Automation Stopped.";
        console.log("Stop command sent to storage.");
    });
});

// HIPAA-Compliant Clear Data Button: Wipes all local PHI and resets state.
document.addEventListener('DOMContentLoaded', () => {
    const clearBtn = document.getElementById('clearDataBtn');

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            console.log("Clear Data button clicked!"); // Check this in the console

            const confirmWipe = confirm("Are you sure you want to wipe all local PHI?");
            if (!confirmWipe) return;

            chrome.storage.local.clear(() => {
                // Re-initialize state to clean defaults
                chrome.storage.local.set({
                    updoxQueue: [],
                    autoRunning: false,
                    totalQueueSize: 0
                }, () => {
                    // Force UI Refresh
                    window.location.reload();
                    alert("Data Purged.");
                });
            });
        });
    } else {
        console.error("Critical Error: clearDataBtn not found in DOM.");
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const scrapeBtnV1 = document.getElementById('scrapeUpdoxBtn');
    const scrapeBtnV2 = document.getElementById('scrapeUpdoxV2Btn');
    const exportBtn = document.getElementById('exportPdfBtn');
    const statusElement = document.getElementById('statusText');

    statusElement.innerText = "Status: Clearing old data...";


    // V1 - Automatic Scroller
    scrapeBtnV1.addEventListener('click', async () => {
        // 1. UI Feedback: Let the user know the reset is happening
        statusElement.innerText = "Status: Initializing clean session...";

        // 2. Clear all previous session data to prevent "-10/0" math errors
        chrome.storage.local.set({
            updoxQueue: [],
            totalQueueSize: 0,
            processedCount: 0,
            progressPercent: 0,
            autoRunning: false,
            lastProcessedPatient: ""
        }, async () => {
            console.log("[LinkMD] Session reset. Starting scrape...");

            // 3. Find the active tab
            const [tab] = await chrome.tabs.query({
                active: true,
                currentWindow: true
            });

            if (!tab) {
                statusElement.innerText = "Error: No active tab found.";
                return;
            }

            // 4. Send the scrape command
            statusElement.innerText = "Status: Scraping Updox data...";

            chrome.tabs.sendMessage(tab.id, {
                action: "SCRAPE_UPDOX"
            }, (response) => {
                if (response && response.data) {
                    const totalCount = response.data.length;

                    // 5. Establish the Baseline: This fixes the math for the Progress Bar
                    chrome.storage.local.set({
                        updoxQueue: response.data,
                        totalQueueSize: totalCount,
                        processedCount: 0, // Ensure we start at zero
                        progressPercent: 0
                    }, () => {
                        statusElement.innerText = `Captured ${totalCount} patients.`;

                        // Force the UI to refresh immediately
                        if (typeof updateProgressUI === "function") {
                            updateProgressUI();
                        }
                        console.log(`[LinkMD] Baseline established: ${totalCount} patients.`);
                    });
                } else {
                    statusElement.innerText = "Error: Scrape failed. Is Updox open?";
                    console.error("[LinkMD] Scrape response invalid:", response);
                }
            });
        });
    });

    // AUTO-LOADER: Check if we have data the moment the popup opens
    chrome.storage.local.get(['updoxQueue'], (result) => {
        if (result.updoxQueue && result.updoxQueue.length > 0) {
            statusElement.innerText = `Status: ${result.updoxQueue.length} patients loaded from memory.`;
            statusElement.style.color = "#2e7d32"; // Professional green
        } else {
            statusElement.innerText = "Status: No data found. Scrape Updox first.";
        }
    });

    // V2 - Manual/Loaded Scrape
    //   scrapeBtnV2.addEventListener('click', async () => {
    //     statusElement.innerText = "Status: Scraping loaded patients (V2)...";
    //     const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    //     chrome.tabs.sendMessage(tab.id, { action: "SCRAPE_UPDOX_V2" }, (response) => {
    //       statusElement.innerText = response ? `Status: Captured ${response.count} patients.` : "Error: Check Console.";
    //     });
    //   });

    // Inside the DOMContentLoaded block in popup.js
    const pfBtn = document.getElementById('runPfBtn');

    if (pfBtn) {
        pfBtn.addEventListener('click', async () => {
            console.log("Button 2 clicked!"); // Check this in Popup Inspect -> Console
            statusElement.innerText = "Status: Communicating with PracticeFusion...";

            try {
                const [tab] = await chrome.tabs.query({
                    active: true,
                    currentWindow: true
                });

                // Ensure we are sending to the right place
                if (tab && tab.url.includes("practicefusion.com")) {
                    chrome.tabs.sendMessage(tab.id, {
                        action: "RUN_PF_UPDATE"
                    }, (response) => {
                        if (chrome.runtime.lastError) {
                            statusElement.innerText = "Error: Refresh PF tab and try again.";
                            console.error(chrome.runtime.lastError.message);
                        } else {
                            statusElement.innerText = "Status: Update started on PF page.";
                        }
                    });
                } else {
                    statusElement.innerText = "Error: You must be on the PF tab.";
                }
            } catch (err) {
                console.error("Popup PF Error:", err);
            }
        });
    }

    exportBtn.addEventListener('click', () => {
        chrome.tabs.create({
            url: chrome.runtime.getURL("export.html")
        });
    });
});

document.addEventListener('DOMContentLoaded', () => {
    // Initial draw
    updateProgressUI();

    // Constant refresh while popup is open
    setInterval(updateProgressUI, 1000);
});

function updateProgressUI() {
    chrome.storage.local.get(['updoxQueue', 'totalQueueSize', 'processedCount'], (data) => {
        // Source of Truth: If totalQueueSize is missing, use the queue length as a backup
        const remaining = data.updoxQueue ? data.updoxQueue.length : 0;

        // If totalQueueSize is 0 but we have data, we fix it on the fly
        let total = data.totalQueueSize || 0;
        if (total === 0 && remaining > 0) {
            total = remaining;
            chrome.storage.local.set({
                totalQueueSize: total
            });
        }

        const processed = data.processedCount || 0;

        // Calculate percentage safely
        const percent = total > 0 ? Math.round((processed / total) * 100) : 0;

        // UI Elements
        const barFill = document.getElementById('progressBarFill');
        const percentText = document.getElementById('progressPercent');
        const statusText = document.getElementById('statusText');

        if (barFill) barFill.style.width = percent + '%';
        if (percentText) percentText.innerText = percent + '%';

        // This ensures you never see "-10 / 0" again
        if (statusText) {
            statusText.innerText = total > 0 ? `${total} Scraped` : "Waiting for Scrape...";
        }
        document.getElementById('progressBarFill').style.width = data.progressPercent + "%";
    });
}

document.getElementById('clearDataBtn').addEventListener('click', async () => {
    // 1. Immediate UI Feedback
    const statusText = document.getElementById('statusText');
    const patientStatus = document.getElementById('patientStatus');
    const progressBar = document.getElementById('progressBarFill');

    // 2. Clear Storage
    // Using .clear() is more effective than setting keys to empty arrays
    chrome.storage.local.clear(() => {

        // 3. Re-initialize only the bare essentials
        chrome.storage.local.set({
            updoxQueue: [],
            autoRunning: false,
            totalQueueSize: 0,
            lastProcessedPatient: "Storage Wiped"
        }, () => {

            // 4. Update UI Elements
            if (progressBar) progressBar.style.width = '0%';
            if (statusText) statusText.innerText = "Status: Purged";
            if (patientStatus) patientStatus.innerText = "All local PHI deleted.";

            // 5. Hard-Kill the Content Script
            // We tell the tab to stop whatever it is doing immediately
            chrome.tabs.query({
                active: true,
                currentWindow: true
            }, (tabs) => {
                if (tabs[0]) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        action: "STOP_AUTOMATION"
                    });
                }
            });

            console.log("HIPAA-Compliant Wipe Complete.");
            alert("Local data successfully destroyed.");
        });
    });
});

// NPI Lookup Logic
document.addEventListener('DOMContentLoaded', () => {
    const npiLookupBtn = document.getElementById('npiLookupBtn');
    const npiInput = document.getElementById('npiInput');
    const npiStatus = document.getElementById('npiStatus');

    if (npiLookupBtn) {
        npiLookupBtn.addEventListener('click', async () => {
            const npiNumber = npiInput.value.trim();

            // Basic validation for exactly 10 digits
            if (!/^\d{10}$/.test(npiNumber)) {
                npiStatus.style.color = "red";
                npiStatus.innerText = "Please enter a valid 10-digit NPI.";
                return;
            }

            npiStatus.style.color = "#0094FF";
            npiStatus.innerText = "Fetching data...";

            try {
                const response = await fetch(`https://npiregistry.cms.hhs.gov/api/?number=${npiNumber}&version=2.1`);
                const data = await response.json();

                if (data.result_count === 0 || !data.results || data.results.length === 0) {
                    npiStatus.style.color = "red";
                    npiStatus.innerText = "No provider found for this NPI.";
                    return;
                }

                const provider = data.results[0];

                // 1. Extract Name
                const firstName = provider.basic.first_name || "";
                const lastName = provider.basic.last_name || "";

                // 2. Extract Specialization (Find the primary one)
                let specialty = "General Practice"; // Fallback
                if (provider.taxonomies && provider.taxonomies.length > 0) {
                    const primaryTaxonomy = provider.taxonomies.find(t => t.primary === true) || provider.taxonomies[0];
                    specialty = primaryTaxonomy.desc;
                }

                // 3. Extract Location Address (Not mailing address)
                let location = provider.addresses.find(a => a.address_purpose === "LOCATION") || provider.addresses[0];

                const street1 = location.address_1 || "";
                const street2 = location.address_2 ? `, ${location.address_2}` : "";
                const city = location.city || "";
                const state = location.state || "";
                // Grab just the 5-digit zip if it returns the 9-digit format
                const zip = location.postal_code ? location.postal_code.substring(0, 5) : "";

                // 4. Format Phones & Fax
                const formatPhone = (phoneStr) => {
                    if (!phoneStr) return "N/A";
                    const cleaned = ('' + phoneStr).replace(/\D/g, ''); // Strip hyphens/parentheses
                    const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/);
                    if (match) {
                        return `(${match[1]}) ${match[2]} - ${match[3]}`;
                    }
                    return phoneStr;
                };

                const phone = formatPhone(location.telephone_number);
                const fax = formatPhone(location.fax_number);

                // 5. Construct the final string
                // 1. Add this helper function to convert ALL CAPS to Title Case
                const toTitleCase = (str) => {
                    if (!str) return "";
                    return str.toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase());
                };

                // 2. Format the specific variables before using them
                const cleanFirstName = toTitleCase(firstName);
                const cleanLastName = toTitleCase(lastName);
                const cleanStreet1 = toTitleCase(street1);
                const cleanStreet2 = toTitleCase(street2); // This will handle things like ", Ste 11"
                const cleanCity = toTitleCase(city);
                // Note: We leave 'state' alone because we want "NY", not "Ny"

                // 3. Construct the final string with the new formatting, NPI, and period
                const clipboardText = `Patient needs a referral for Dr. ${cleanFirstName} ${cleanLastName} who specializes in ${specialty}.\n\nNPI #: ${npiNumber}\nAddress: ${cleanStreet1}${cleanStreet2}, ${cleanCity}, ${state} ${zip}\nPhone: ${phone} | Fax: ${fax}`;
                // const clipboardText = `Patient needs a referral for Dr. ${firstName} ${lastName} who specializes in ${specialty}\n\nAddress: ${street1}${street2}, ${city}, ${state} ${zip}\nPhone: ${phone} | Fax: ${fax}`;

                // 6. Write to Clipboard
                await navigator.clipboard.writeText(clipboardText);

                // 7. UI Feedback
                npiInput.value = ""; // Clear input for next use
                npiStatus.style.color = "#28a745"; // Success green
                npiStatus.innerText = "Referral info copied to clipboard!";

                // Clear success message after 3 seconds
                setTimeout(() => {
                    npiStatus.innerText = "";
                }, 3000);

            } catch (error) {
                console.error("NPI API Error:", error);
                npiStatus.style.color = "red";
                npiStatus.innerText = "Connection error. Try again.";
            }
        });
    }
});

// ==========================================
// USABILITY ENHANCEMENTS (Dates & Navigation)
// ==========================================

// 1. Auto-format MM/DD/YYYY as the user types (Numbers Only)
const autoFormatDate = (e) => {
    let val = e.target.value.replace(/\D/g, '').substring(0, 8);
    if (val.length > 4) {
        e.target.value = `${val.substring(0, 2)}/${val.substring(2, 4)}/${val.substring(4, 8)}`;
    } else if (val.length > 2) {
        e.target.value = `${val.substring(0, 2)}/${val.substring(2, 4)}`;
    } else {
        e.target.value = val;
    }
};

// Safely attach listeners to the date inputs
const noteDOBInput = document.getElementById('noteDOB');
const returnDateInput = document.getElementById('returnDate');
if (noteDOBInput) noteDOBInput.addEventListener('input', autoFormatDate);
if (returnDateInput) returnDateInput.addEventListener('input', autoFormatDate);

// 2. Arrow Key Navigation for visible fields
const inputSequence = ['noteName', 'noteDOB', 'noteReason', 'returnDate'];
inputSequence.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;

    el.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault(); // Prevent cursor jumping inside text inputs
            
            // Only gather inputs that are currently visible on the screen
            const visibleInputs = inputSequence
                .map(inputId => document.getElementById(inputId))
                .filter(node => node && window.getComputedStyle(node).display !== 'none');
            
            const currentIndex = visibleInputs.indexOf(e.target);
            let nextIndex = e.key === 'ArrowDown' ? currentIndex + 1 : currentIndex - 1;
            
            if (nextIndex >= 0 && nextIndex < visibleInputs.length) {
                visibleInputs[nextIndex].focus();
            }
        }
    });
});

// 3. Convert MM/DD/YYYY to "Month Day, Year" Helper
const formatLongDate = (dateStr) => {
    const [month, day, year] = dateStr.split('/');
    if (!month || !day || !year) return dateStr; 
    
    const d = new Date(year, parseInt(month) - 1, day);
    const monthName = d.toLocaleString('default', { month: 'long' });
    return `${monthName} ${parseInt(day)}, ${year}`; 
};


// ==========================================
// EXISTING LETTER LOGIC (Updated)
// ==========================================

// Dropdown Logic: Show/Hide inputs based on letter type
const letterType = document.getElementById('letterType');
const noteReason = document.getElementById('noteReason');
const returnDate = document.getElementById('returnDate');

if (letterType) {
    letterType.addEventListener('change', (e) => {
        const type = e.target.value;
        if (type === 'custom') {
            if(noteReason) noteReason.style.display = 'block';
            if(returnDate) returnDate.style.display = 'none';
        } else if (type === 'return') {
            if(noteReason) noteReason.style.display = 'none';
            if(returnDate) returnDate.style.display = 'block';
        } else if (type === 'general') {
            if(noteReason) noteReason.style.display = 'none';
            if(returnDate) returnDate.style.display = 'none';
        }
    });
}
function toTitleCase(str) {
  return str.toLowerCase().replace(/\b\w/g, s => s.toUpperCase());
}

// Generate Button Logic
const generateNoteBtn = document.getElementById('generateNoteBtn');
if (generateNoteBtn) {
    generateNoteBtn.addEventListener('click', () => {
        const type = document.getElementById('letterType').value;
        const name = document.getElementById('noteName').value.trim();
        const dob = document.getElementById('noteDOB').value.trim();
        const status = document.getElementById('noteStatus');

        if (!name || !dob) {
            status.style.color = "red";
            status.innerText = "Name and DOB are required.";
            return;
        }

        // Formulate the Body Text based on the template
        let bodyText = "";
        if (type === 'custom') {
            const reason = document.getElementById('noteReason').value.trim();
            if (!reason) return status.innerText = "Reason required.";
            bodyText = `${toTitleCase(name)} was seen today in my office for ${reason}. If you have any additional questions, please do not hesitate to contact my office at (631) 543 - 8844. Thank you.`;
        
        } else if (type === 'general') {
            bodyText = `${toTitleCase(name)} was seen in my office today.`;
        
        } else if (type === 'return') {
            const rDateRaw = document.getElementById('returnDate').value.trim();
            if (!rDateRaw) return status.innerText = "Return date required.";
            
            // --- NEW LONG DATE FORMATTING APPLIED HERE ---
            const longReturnDate = formatLongDate(rDateRaw); 

            bodyText = `${toTitleCase(name)} was seen in my office today for a sick visit. Please excuse the patient from missing work and they may return on ${longReturnDate}. If you have any additional questions, please do not hesitate to contact my office at (631) 543 - 8844. Thank you.`;
        }

        // Helper to format date for the top of the letter
        const getFormattedDate = () => {
            const d = new Date();
            const month = d.toLocaleString('default', { month: 'long' });
            const day = d.getDate();
            const nth = (day) => {
                if (day > 3 && day < 21) return 'th';
                switch (day % 10) {
                    case 1: return "st";
                    case 2: return "nd";
                    case 3: return "rd";
                    default: return "th";
                }
            };
            return `${month} ${day}${nth(day)}, ${d.getFullYear()}`;
        };

        const letterData = {
            date: getFormattedDate(),
            name: name,
            dob: dob,
            bodyText: bodyText
        };

        chrome.storage.local.set({
            currentLetter: letterData
        }, () => {
            status.style.color = "#0094FF";
            status.innerText = "Generating...";
            chrome.tabs.create({ url: 'letter.html' });
            setTimeout(() => { status.innerText = ""; }, 2000);
        });
    });
}