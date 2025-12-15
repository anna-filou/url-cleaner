// This script runs in the page context (not isolated world)
// It intercepts clipboard operations and communicates with the content script

(function() {
  // Helper to clean text via message passing
  function cleanTextViaMessage(text) {
    return new Promise((resolve) => {
      const id = Math.random().toString(36);
      const timeout = setTimeout(() => {
        window.removeEventListener('message', handler);
        resolve(text); // Return original on timeout
      }, 5000);
      
      const handler = (event) => {
        if (event.data.type === 'URL_CLEANER_CLEANED' && event.data.id === id) {
          clearTimeout(timeout);
          window.removeEventListener('message', handler);
          resolve(event.data.cleaned);
        }
      };
      window.addEventListener('message', handler);
      window.postMessage({ type: 'URL_CLEANER_CLEAN', id: id, text: text }, '*');
    });
  }

  // Override navigator.clipboard.writeText using Object.defineProperty
  if (navigator.clipboard) {
    const originalWriteText = navigator.clipboard.writeText;
    Object.defineProperty(navigator.clipboard, 'writeText', {
      value: async function(text) {
        const cleanedText = await cleanTextViaMessage(text);
        return originalWriteText.call(navigator.clipboard, cleanedText);
      },
      writable: true,
      configurable: true
    });

    // Override navigator.clipboard.write
    const originalWrite = navigator.clipboard.write;
    Object.defineProperty(navigator.clipboard, 'write', {
      value: async function(data) {
        if (data instanceof ClipboardItem) {
          const textBlob = await data.getType('text/plain').catch(() => null);
          if (textBlob) {
            const text = await textBlob.text();
            const cleanedText = await cleanTextViaMessage(text);
            const cleanedBlob = new Blob([cleanedText], { type: 'text/plain' });
            const cleanedItem = new ClipboardItem({ 'text/plain': cleanedBlob });
            return originalWrite.call(navigator.clipboard, cleanedItem);
          }
        } else if (Array.isArray(data)) {
          const cleanedItems = await Promise.all(
            data.map(async (item) => {
              if (item instanceof ClipboardItem) {
                const textBlob = await item.getType('text/plain').catch(() => null);
                if (textBlob) {
                  const text = await textBlob.text();
                  const cleanedText = await cleanTextViaMessage(text);
                  const cleanedBlob = new Blob([cleanedText], { type: 'text/plain' });
                  return new ClipboardItem({ 'text/plain': cleanedBlob });
                }
              }
              return item;
            })
          );
          return originalWrite.call(navigator.clipboard, cleanedItems);
        }
        return originalWrite.call(navigator.clipboard, data);
      },
      writable: true,
      configurable: true
    });
  }

  // Override document.execCommand('copy') - legacy API
  document.addEventListener('copy', async (e) => {
    const selection = window.getSelection().toString();
    if (selection) {
      const cleanedText = await cleanTextViaMessage(selection);
      if (cleanedText !== selection) {
        e.clipboardData.setData('text/plain', cleanedText);
        e.preventDefault();
      }
    }
  }, true);

  // Also intercept execCommand('copy') directly
  const originalExecCommand = document.execCommand;
  document.execCommand = function(command, showUI, value) {
    if (command === 'copy') {
      // Let the copy event handler deal with it
      return originalExecCommand.apply(this, arguments);
    }
    return originalExecCommand.apply(this, arguments);
  };
})();

