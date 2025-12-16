const rulesTextarea = document.getElementById('rulesTextarea');
const applyBtn = document.getElementById('applyBtn');
const revertBtn = document.getElementById('revertBtn');

let originalRules = '';

// Load rules from storage
function loadRules() {
  chrome.storage.sync.get(['rules'], (result) => {
    if (result.rules) {
      rulesTextarea.value = result.rules;
      originalRules = result.rules;
    } else {
      // Storage is empty - background.js will set defaults on first install
      // For now, show empty and let background.js populate it
      rulesTextarea.value = '';
      originalRules = '';
    }
  });
}

// Save rules to storage
function saveRules(rules) {
  chrome.storage.sync.set({ rules: rules }, () => {
    if (chrome.runtime.lastError) {
      console.error('Error saving rules:', chrome.runtime.lastError);
    } else {
      originalRules = rules;
    }
  });
}

// Apply changes
applyBtn.addEventListener('click', () => {
  const rules = rulesTextarea.value;
  saveRules(rules);
  // Show feedback (could be enhanced later)
  applyBtn.textContent = 'Applied!';
  setTimeout(() => {
    applyBtn.textContent = 'Apply changes';
  }, 1000);
});

// Reset to default - get defaults from background script
revertBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'getDefaultParams' }, (response) => {
    if (response && response.defaultParams) {
      const defaultRules = response.defaultParams.join('\n');
      rulesTextarea.value = defaultRules;
    }
  });
});

// Load rules on page load
loadRules();

