// Intercept clipboard write operations to clean URLs
// This script runs in an isolated world, so we need to inject into the page context

// Set up message channel for communication between page context and content script
window.addEventListener('message', async (event) => {
  // Only accept messages from the page itself
  if (event.source !== window) return;
  
  if (event.data.type === 'URL_CLEANER_CLEAN') {
    const cleaned = await cleanText(event.data.text);
    window.postMessage({ type: 'URL_CLEANER_CLEANED', id: event.data.id, cleaned: cleaned }, '*');
  }
}, false);

// Inject script file into page context to override clipboard methods
// Using a separate file to avoid CSP violations with inline scripts
const script = document.createElement('script');
script.src = chrome.runtime.getURL('inject.js');
script.onload = function() {
  this.remove();
};
(document.head || document.documentElement).appendChild(script);

// Helper function to clean text (extract and clean URLs)
async function cleanText(text) {
  if (!text || typeof text !== 'string') {
    return text;
  }

  // Check if the entire text is a URL
  try {
    new URL(text);
    // It's a valid URL, clean it
    const cleaned = await sendCleanRequest(text);
    return cleaned || text;
  } catch (e) {
    // Not a valid URL, check if it contains URLs
    const urlRegex = /https?:\/\/[^\s]+/g;
    const urls = text.match(urlRegex);
    
    if (urls && urls.length > 0) {
      let cleanedText = text;
      for (const url of urls) {
        const cleaned = await sendCleanRequest(url);
        if (cleaned && cleaned !== url) {
          cleanedText = cleanedText.replace(url, cleaned);
        }
      }
      return cleanedText;
    }
  }

  return text;
}

// Send URL to background script for cleaning
function sendCleanRequest(url) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { action: 'cleanURL', url: url },
      (response) => {
        if (chrome.runtime.lastError) {
          resolve(url); // Return original if error
        } else {
          resolve(response?.cleanedURL || url);
        }
      }
    );
  });
}

