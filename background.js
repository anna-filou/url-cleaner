// Default UTM parameters
const DEFAULT_PARAMS = [
  'utm_source',
  'utm_source*',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'origin',
  'ref',
  '?crid // Amazon',
  'gclid // Google Ads',
  'fbclid // Facebook',
  'dclid // DoubleClick',
  'msclkid // Microsoft/Bing',
  'twclid // Twitter/X',
  'yclid // Yandex',
  '?spm // Alibaba/Taobao',
  '?dib',
  '&highlightedUpdateType // LinkedIn'
];

// Rule storage structure
let rules = {
  globalQuery: [],
  globalHash: [],
  globalQuerySingle: [], // Only remove single parameter, not everything after
  globalHashSingle: [],
  globalNegations: [],
  domainWhitelist: [],
  domainSpecific: new Map(), // domain -> {query: [], hash: []}
  domainSpecificSingle: new Map(), // domain -> {query: [], hash: []}
  domainNegations: new Map()  // domain -> {query: [], hash: []}
};

// Initialize on extension install
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(['rules'], (result) => {
    if (!result.rules) {
      // First install - set default parameters
      const defaultRules = DEFAULT_PARAMS.join('\n');
      chrome.storage.sync.set({ rules: defaultRules }, () => {
        loadRules();
      });
    } else {
      loadRules();
    }
  });
});

// Load rules from storage
function loadRules() {
  chrome.storage.sync.get(['rules'], (result) => {
    if (result.rules) {
      parseRules(result.rules);
    }
  });
}

// Listen for storage changes to reload rules
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' && changes.rules) {
    parseRules(changes.rules.newValue);
  }
});

// Parse rules from text
function parseRules(rulesText) {
  // Reset rules
  rules = {
    globalQuery: [],
    globalHash: [],
    globalQuerySingle: [],
    globalHashSingle: [],
    globalNegations: [],
    domainWhitelist: [],
    domainSpecific: new Map(),
    domainSpecificSingle: new Map(),
    domainNegations: new Map()
  };

  const lines = rulesText.split('\n');
  
  for (const line of lines) {
    let trimmed = line.trim();
    
    // Skip blank lines and comment-only lines
    if (!trimmed || trimmed.startsWith('//')) {
      continue;
    }
    
    // Strip inline comments (everything after // that's not at the start)
    const commentIndex = trimmed.indexOf(' //');
    if (commentIndex > 0) {
      trimmed = trimmed.substring(0, commentIndex).trim();
    }

    // Parse rule
    if (trimmed.startsWith('!')) {
      // Negation or whitelist
      const rest = trimmed.substring(1);
      if (rest.includes(':')) {
        // Domain-specific negation: !domain.com:param
        const [domain, param] = rest.split(':', 2);
        const normalizedDomain = domain.toLowerCase().trim();
        if (normalizedDomain && param) {
          if (!rules.domainNegations.has(normalizedDomain)) {
            rules.domainNegations.set(normalizedDomain, { query: [], hash: [] });
          }
        const paramTrimmed = param.trim();
        if (paramTrimmed.startsWith('?')) {
          rules.domainNegations.get(normalizedDomain).query.push(paramTrimmed.substring(1));
        } else if (paramTrimmed.startsWith('&')) {
          rules.domainNegations.get(normalizedDomain).query.push(paramTrimmed.substring(1));
        } else if (paramTrimmed.startsWith('#')) {
          rules.domainNegations.get(normalizedDomain).hash.push(paramTrimmed.substring(1));
        } else {
          // No prefix - matches both
          rules.domainNegations.get(normalizedDomain).query.push(paramTrimmed);
          rules.domainNegations.get(normalizedDomain).hash.push(paramTrimmed);
        }
        }
      } else {
        // Could be global negation or domain whitelist
        if (rest.includes('.')) {
          // Domain whitelist: !domain.com
          rules.domainWhitelist.push(rest.toLowerCase().trim());
        } else {
          // Global negation: !param
          const paramTrimmed = rest.trim();
          if (paramTrimmed.startsWith('?')) {
            rules.globalNegations.push(paramTrimmed.substring(1));
          } else if (paramTrimmed.startsWith('&')) {
            rules.globalNegations.push(paramTrimmed.substring(1));
          } else if (paramTrimmed.startsWith('#')) {
            rules.globalNegations.push(paramTrimmed.substring(1));
          } else {
            // No prefix - matches ?param, &param, and #param
            // globalNegations is checked for both query and hash parameters
            rules.globalNegations.push(paramTrimmed);
          }
        }
      }
    } else if (trimmed.includes(':')) {
      // Domain-specific rule: domain.com:param
      const [domain, param] = trimmed.split(':', 2);
      const normalizedDomain = domain.toLowerCase().trim();
      if (normalizedDomain && param) {
        if (!rules.domainSpecific.has(normalizedDomain)) {
          rules.domainSpecific.set(normalizedDomain, { query: [], hash: [] });
        }
        const paramTrimmed = param.trim();
        const isSingleOnly = paramTrimmed.endsWith('~');
        const paramWithoutSuffix = isSingleOnly ? paramTrimmed.slice(0, -1) : paramTrimmed;
        const targetMap = isSingleOnly ? rules.domainSpecificSingle : rules.domainSpecific;
        
        if (!targetMap.has(normalizedDomain)) {
          targetMap.set(normalizedDomain, { query: [], hash: [] });
        }
        
        if (paramWithoutSuffix.startsWith('?')) {
          const paramName = paramWithoutSuffix.substring(1);
          targetMap.get(normalizedDomain).query.push(paramName);
        } else if (paramWithoutSuffix.startsWith('&')) {
          const paramName = paramWithoutSuffix.substring(1);
          targetMap.get(normalizedDomain).query.push(paramName);
        } else if (paramWithoutSuffix.startsWith('#')) {
          const paramName = paramWithoutSuffix.substring(1);
          targetMap.get(normalizedDomain).hash.push(paramName);
        } else {
          // No prefix - matches both
          targetMap.get(normalizedDomain).query.push(paramWithoutSuffix);
          targetMap.get(normalizedDomain).hash.push(paramWithoutSuffix);
        }
      }
    } else {
      // Global rule: ?param, &param, #param, or param (with optional ~ suffix for single parameter only)
      const isSingleOnly = trimmed.endsWith('~');
      const paramWithoutSuffix = isSingleOnly ? trimmed.slice(0, -1) : trimmed;
      
      if (paramWithoutSuffix.startsWith('?')) {
        const paramName = paramWithoutSuffix.substring(1);
        if (isSingleOnly) {
          rules.globalQuerySingle.push(paramName);
        } else {
          rules.globalQuery.push(paramName);
        }
      } else if (paramWithoutSuffix.startsWith('&')) {
        const paramName = paramWithoutSuffix.substring(1);
        if (isSingleOnly) {
          rules.globalQuerySingle.push(paramName);
        } else {
          rules.globalQuery.push(paramName);
        }
      } else if (paramWithoutSuffix.startsWith('#')) {
        const paramName = paramWithoutSuffix.substring(1);
        if (isSingleOnly) {
          rules.globalHashSingle.push(paramName);
        } else {
          rules.globalHash.push(paramName);
        }
      } else {
        // No prefix - matches ?param, &param, and #param
        if (isSingleOnly) {
          rules.globalQuerySingle.push(paramWithoutSuffix);
          rules.globalHashSingle.push(paramWithoutSuffix);
        } else {
          rules.globalQuery.push(paramWithoutSuffix);
          rules.globalHash.push(paramWithoutSuffix);
        }
      }
    }
  }
}

// Convert pattern to regex (handle wildcards)
function patternToRegex(pattern) {
  // Escape special regex characters except *
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  // Convert * to .*
  const regexStr = escaped.replace(/\*/g, '.*');
  return new RegExp('^' + regexStr, 'i');
}

// Check if parameter matches a pattern
function matchesPattern(paramName, patterns) {
  for (const pattern of patterns) {
    const regex = patternToRegex(pattern);
    if (regex.test(paramName)) {
      return true;
    }
  }
  return false;
}

// Extract domain from URL
function getDomain(url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    // Remove 'www.' prefix for consistent matching
    return hostname.replace(/^www\./, '');
  } catch (e) {
    return '';
  }
}

// Clean URL based on rules
function cleanURL(url) {
  try {
    const urlObj = new URL(url);
    const domain = getDomain(url);
    
    // Check domain whitelist first
    if (rules.domainWhitelist.includes(domain)) {
      return url; // Don't clean whitelisted domains
    }

    // Get domain-specific rules and negations
    const domainRules = rules.domainSpecific.get(domain) || { query: [], hash: [] };
    const domainRulesSingle = rules.domainSpecificSingle.get(domain) || { query: [], hash: [] };
    const domainNegs = rules.domainNegations.get(domain) || { query: [], hash: [] };

    // Check query parameters first
    if (urlObj.search) {
      const searchParams = urlObj.search.substring(1); // Remove '?'
      const params = searchParams.split('&');
      
      for (let i = 0; i < params.length; i++) {
        const param = params[i];
        const paramName = param.split('=')[0];
        
        // Check domain-specific negation
        if (matchesPattern(paramName, domainNegs.query)) {
          continue;
        }
        
        // Check global negation
        if (matchesPattern(paramName, rules.globalNegations)) {
          continue;
        }
        
        // Check domain-specific single-parameter rules first (they take precedence)
        if (matchesPattern(paramName, domainRulesSingle.query)) {
          // Found match - remove only this single parameter
          const remainingParams = [...params];
          remainingParams.splice(i, 1);
          if (remainingParams.length > 0) {
            return urlObj.origin + urlObj.pathname + '?' + remainingParams.join('&') + (urlObj.hash || '');
          } else {
            return urlObj.origin + urlObj.pathname + (urlObj.hash || '');
          }
        }
        
        // Check global single-parameter rules
        if (matchesPattern(paramName, rules.globalQuerySingle)) {
          // Found match - remove only this single parameter
          const remainingParams = [...params];
          remainingParams.splice(i, 1);
          if (remainingParams.length > 0) {
            return urlObj.origin + urlObj.pathname + '?' + remainingParams.join('&') + (urlObj.hash || '');
          } else {
            return urlObj.origin + urlObj.pathname + (urlObj.hash || '');
          }
        }
        
        // Check domain-specific rules (remove everything after)
        if (matchesPattern(paramName, domainRules.query)) {
          // Found match - remove this param and everything after
          if (i > 0) {
            // Keep params before the matching one
            const keptParams = params.slice(0, i).join('&');
            return urlObj.origin + urlObj.pathname + '?' + keptParams + (urlObj.hash || '');
          } else {
            // First param matches - remove all query params
            return urlObj.origin + urlObj.pathname + (urlObj.hash || '');
          }
        }
        
        // Check global rules (remove everything after)
        if (matchesPattern(paramName, rules.globalQuery)) {
          // Found match - remove this param and everything after
          if (i > 0) {
            // Keep params before the matching one
            const keptParams = params.slice(0, i).join('&');
            return urlObj.origin + urlObj.pathname + '?' + keptParams + (urlObj.hash || '');
          } else {
            // First param matches - remove all query params
            return urlObj.origin + urlObj.pathname + (urlObj.hash || '');
          }
        }
      }
    }

    // Check hash parameters
    if (urlObj.hash) {
      const hash = urlObj.hash.substring(1); // Remove '#'
      // Hash parameters can contain multiple parts separated by & or ?
      // For simplicity, we treat the entire hash as one unit for single-parameter removal
      // For "remove everything after", we remove the entire hash
      
      // Check if hash is negated
      let isNegated = false;
      for (const pattern of domainNegs.hash) {
        const regex = patternToRegex(pattern);
        if (regex.test(hash)) {
          isNegated = true;
          break;
        }
      }
      
      if (!isNegated) {
        for (const pattern of rules.globalNegations) {
          const regex = patternToRegex(pattern);
          if (regex.test(hash)) {
            isNegated = true;
            break;
          }
        }
      }
      
      // If not negated, check if it should be removed
      if (!isNegated) {
        // Check single-parameter rules first (for hash, this means remove only if it matches the pattern)
        for (const pattern of domainRulesSingle.hash) {
          const regex = patternToRegex(pattern);
          if (regex.test(hash)) {
            // For hash single-parameter, we remove the hash entirely (hash is typically a single unit)
            return urlObj.origin + urlObj.pathname + (urlObj.search || '');
          }
        }
        
        for (const pattern of rules.globalHashSingle) {
          const regex = patternToRegex(pattern);
          if (regex.test(hash)) {
            // For hash single-parameter, we remove the hash entirely
            return urlObj.origin + urlObj.pathname + (urlObj.search || '');
          }
        }
        
        // Check regular rules (remove everything after - same behavior for hash)
        for (const pattern of domainRules.hash) {
          const regex = patternToRegex(pattern);
          if (regex.test(hash)) {
            // Found match - remove hash
            return urlObj.origin + urlObj.pathname + (urlObj.search || '');
          }
        }
        
        for (const pattern of rules.globalHash) {
          const regex = patternToRegex(pattern);
          if (regex.test(hash)) {
            // Found match - remove hash
            return urlObj.origin + urlObj.pathname + (urlObj.search || '');
          }
        }
      }
    }

    return url; // No match found
  } catch (e) {
    return url; // Invalid URL, return as-is
  }
}

// Intercept navigation
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  // Only handle main frame navigations (not iframes/subframes)
  if (details.frameId !== 0) {
    return;
  }

  // Skip chrome:// and extension:// URLs
  if (details.url.startsWith('chrome://') || details.url.startsWith('chrome-extension://')) {
    return;
  }

  const cleanedURL = cleanURL(details.url);
  
  if (cleanedURL !== details.url) {
    // URL was cleaned, redirect
    chrome.tabs.update(details.tabId, { url: cleanedURL });
  }
}, {
  url: [{ schemes: ['http', 'https'] }]
});

// Handle messages from content script for clipboard cleaning
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'cleanURL') {
    const cleanedURL = cleanURL(request.url);
    sendResponse({ cleanedURL: cleanedURL });
    return true; // Indicates we will send a response asynchronously
  } else if (request.action === 'getDefaultParams') {
    sendResponse({ defaultParams: DEFAULT_PARAMS });
    return true;
  }
});

// Handle extension icon click - open options page
chrome.action.onClicked.addListener((tab) => {
  chrome.runtime.openOptionsPage();
});

// Load rules on startup
loadRules();


