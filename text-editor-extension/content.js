function generateEditId() {
  return 'edit-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

// Create a fingerprint of an element using multiple attributes
function getElementFingerprint(element) {
  const rect = element.getBoundingClientRect();
  
  return {
    // Text-based identification
    textContent: element.textContent.trim().substring(0, 100),
    textLength: element.textContent.trim().length,
    
    // Structure-based identification
    tagName: element.tagName.toLowerCase(),
    className: element.className,
    id: element.id,
    
    // Position-based identification (relative to viewport)
    relativePosition: {
      top: Math.round(rect.top),
      left: Math.round(rect.left),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    },
    
    // Context-based identification
    parentTag: element.parentElement?.tagName.toLowerCase(),
    parentClass: element.parentElement?.className,
    previousSiblingTag: element.previousElementSibling?.tagName.toLowerCase(),
    nextSiblingTag: element.nextElementSibling?.tagName.toLowerCase(),
    
    // Hierarchy-based identification
    depth: getElementDepth(element),
    indexInParent: Array.from(element.parentElement?.children || []).indexOf(element),
    
    // Attribute-based identification
    attributes: getRelevantAttributes(element)
  };
}

function getElementDepth(element) {
  let depth = 0;
  while (element.parentElement) {
    depth++;
    element = element.parentElement;
  }
  return depth;
}

function getRelevantAttributes(element) {
  const relevantAttrs = ['data-testid', 'data-cy', 'data-qa', 'aria-label', 'title', 'alt', 'role', 'name'];
  const attrs = {};
  relevantAttrs.forEach(attr => {
    if (element.hasAttribute(attr)) {
      attrs[attr] = element.getAttribute(attr);
    }
  });
  return attrs;
}

// Score how well an element matches a fingerprint
function scoreElementMatch(element, fingerprint) {
  let score = 0;
  let maxScore = 0;
  
  // Text content match (highest weight)
  maxScore += 30;
  if (element.textContent.trim() === fingerprint.textContent) {
    score += 30;
  } else if (element.textContent.trim().includes(fingerprint.textContent) || 
             fingerprint.textContent.includes(element.textContent.trim())) {
    score += 15;
  } else if (element.textContent.trim().length === fingerprint.textLength) {
    score += 5;
  }
  
  // Exact attribute matches
  maxScore += 20;
  if (element.tagName.toLowerCase() === fingerprint.tagName) score += 8;
  if (element.className === fingerprint.className && fingerprint.className) score += 6;
  if (element.id === fingerprint.id && fingerprint.id) score += 6;
  
  // Context matches
  maxScore += 15;
  if (element.parentElement?.tagName.toLowerCase() === fingerprint.parentTag) score += 5;
  if (element.parentElement?.className === fingerprint.parentClass && fingerprint.parentClass) score += 5;
  if (Array.from(element.parentElement?.children || []).indexOf(element) === fingerprint.indexInParent) score += 5;
  
  // Position similarity (less reliable but helpful)
  maxScore += 10;
  const rect = element.getBoundingClientRect();
  const posDiff = Math.abs(rect.top - fingerprint.relativePosition.top) + 
                  Math.abs(rect.left - fingerprint.relativePosition.left);
  if (posDiff < 50) score += 10;
  else if (posDiff < 200) score += 5;
  
  // Special attributes
  maxScore += 15;
  Object.keys(fingerprint.attributes).forEach(attr => {
    if (element.getAttribute(attr) === fingerprint.attributes[attr]) {
      score += 3;
    }
  });
  
  // Sibling context
  maxScore += 10;
  if (element.previousElementSibling?.tagName.toLowerCase() === fingerprint.previousSiblingTag) score += 5;
  if (element.nextElementSibling?.tagName.toLowerCase() === fingerprint.nextSiblingTag) score += 5;
  
  return { score, maxScore, percentage: (score / maxScore) * 100 };
}

// Find the best matching element using fingerprint
function findElementByFingerprint(fingerprint) {
  const allElements = document.querySelectorAll('*');
  let bestMatch = null;
  let bestScore = 0;
  
  for (const element of allElements) {
    const match = scoreElementMatch(element, fingerprint);
    if (match.score > bestScore && match.percentage > 60) { // Minimum 60% match
      bestScore = match.score;
      bestMatch = element;
    }
  }
  
  return bestMatch;
}

// Enhanced CSS selector generation as fallback
function getElementSelector(element) {
  // Try ID first
  if (element.id) {
    return '#' + element.id;
  }
  
  // Try data attributes
  const dataAttrs = ['data-testid', 'data-cy', 'data-qa'];
  for (const attr of dataAttrs) {
    if (element.hasAttribute(attr)) {
      return `[${attr}="${element.getAttribute(attr)}"]`;
    }
  }
  
  // Build path with more specific selectors
  let path = [];
  let currentElement = element;
  
  while (currentElement && currentElement.nodeType === Node.ELEMENT_NODE) {
    let selector = currentElement.nodeName.toLowerCase();
    
    // Add class if available and specific
    if (currentElement.className && currentElement.className.split(' ').length <= 3) {
      selector += '.' + currentElement.className.split(' ').join('.');
    }
    
    // Add nth-child for specificity
    let sibling = currentElement;
    let nth = 1;
    while (sibling = sibling.previousElementSibling) {
      if (sibling.nodeName.toLowerCase() === currentElement.nodeName.toLowerCase()) {
        nth++;
      }
    }
    if (nth > 1 || !currentElement.className) {
      selector += `:nth-child(${nth})`;
    }
    
    path.unshift(selector);
    
    // Stop if have a unique enough selector
    if (currentElement.id || (currentElement.className && path.length > 2)) {
      break;
    }
    
    currentElement = currentElement.parentNode;
  }
  
  return path.slice(-4).join(' > '); // Limit depth to prevent overly long selectors
}

function applySavedEdits() {
  chrome.storage.local.get("edits", (data) => {
    const edits = data.edits || {};
    
    for (const editData of Object.values(edits)) {
      let element = null;
      
      // Try fingerprint matching first
      if (editData.fingerprint) {
        element = findElementByFingerprint(editData.fingerprint);
      }
      
      // Fallback to CSS selector
      if (!element && editData.selector) {
        try {
          element = document.querySelector(editData.selector);
        } catch (e) {
          console.warn('Invalid selector:', editData.selector);
        }
      }
      
      // Fallback to existing data-edit-id
      if (!element) {
        element = document.querySelector(`[data-edit-id="${editData.id}"]`);
      }
      
      // Apply the edit if element found
      if (element) {
        // Only update if text is different to avoid unnecessary changes
        if (element.textContent !== editData.text) {
          element.textContent = editData.text;
        }
        // Re-add the edit ID for future edits
        element.setAttribute("data-edit-id", editData.id);
      }
    }
  });
}

// Enhanced observer for better dynamic content handling
let applySavedEditsTimeout;
function debouncedApplySavedEdits() {
  clearTimeout(applySavedEditsTimeout);
  applySavedEditsTimeout = setTimeout(applySavedEdits, 500);
}

// Patch the page after it finishes loading
if (document.readyState === "complete") {
  applySavedEdits();
} else {
  window.addEventListener("load", () => {
    requestIdleCallback(applySavedEdits);
  });
}

// Watch for dynamic DOM changes with debouncing
const observer = new MutationObserver((mutations) => {
  // Only react to significant changes
  const significantChange = mutations.some(mutation => 
    mutation.type === 'childList' && 
    (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0)
  );
  
  if (significantChange) {
    debouncedApplySavedEdits();
  }
});

observer.observe(document.body, { 
  childList: true, 
  subtree: true,
  attributes: false, // Don't watch attribute changes to reduce noise
  characterData: false // Don't watch text changes to reduce noise
});

function startEditMode() {
  document.body.style.cursor = "crosshair";
  
  let hoveredElement = null;
  
  // Hover handler to show preview border
  const hoverHandler = (e) => {
    // Remove previous hover effect
    if (hoveredElement && hoveredElement !== e.target) {
      hoveredElement.style.outline = hoveredElement.dataset.originalOutline || '';
      hoveredElement.removeAttribute('data-original-outline');
    }
    
    const el = e.target;
    
    // Don't highlight inputs/forms/media
    if (["INPUT", "TEXTAREA", "IMG", "SVG", "BUTTON", "VIDEO", "AUDIO"].includes(el.tagName)) {
      return;
    }
    
    // Store original outline and apply hover effect
    if (el !== hoveredElement) {
      el.dataset.originalOutline = el.style.outline || '';
      el.style.outline = "2px dashed #2196F3";
      hoveredElement = el;
    }
  };
  
  // Mouseleave handler to clean up
  const mouseLeaveHandler = () => {
    if (hoveredElement) {
      hoveredElement.style.outline = hoveredElement.dataset.originalOutline || '';
      hoveredElement.removeAttribute('data-original-outline');
      hoveredElement = null;
    }
  };
  
  // Add hover listeners
  document.addEventListener("mouseover", hoverHandler);
  document.addEventListener("mouseleave", mouseLeaveHandler);
  
  const handler = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Clean up hover effects
    document.removeEventListener("mouseover", hoverHandler);
    document.removeEventListener("mouseleave", mouseLeaveHandler);
    if (hoveredElement) {
      hoveredElement.style.outline = hoveredElement.dataset.originalOutline || '';
      hoveredElement.removeAttribute('data-original-outline');
    }
    
    let el = e.target;
    
    // Don't allow editing inputs/forms/media
    if (["INPUT", "TEXTAREA", "IMG", "SVG", "BUTTON", "VIDEO", "AUDIO"].includes(el.tagName)) {
      document.removeEventListener("click", handler, true);
      document.body.style.cursor = "";
      return;
    }
    
    // If element has no text, wrap it in an editable span
    if (!el.textContent.trim()) {
      const wrapper = document.createElement("span");
      wrapper.textContent = "[Editable]";
      wrapper.style.background = "#fffa";
      wrapper.setAttribute("data-edit-id", generateEditId());
      wrapper.setAttribute("contenteditable", "true");
      el.appendChild(wrapper);
      el = wrapper;
    }
    
    // Assign ID if not yet set
    let id = el.getAttribute("data-edit-id");
    if (!id) {
      id = generateEditId();
      el.setAttribute("data-edit-id", id);
    }
    
    // Create fingerprint and selector
    const fingerprint = getElementFingerprint(el);
    const selector = getElementSelector(el);
    
    // Store original text for comparison
    const originalText = el.textContent;
    
    // Make editable
    el.setAttribute("contenteditable", "true");
    el.style.outline = "2px dashed orange";
    el.focus();
    
    const save = () => {
      const newText = el.textContent;
      
      // Only save if text actually changed
      if (newText !== originalText) {
        chrome.storage.local.get("edits", (data) => {
          const edits = data.edits || {};
          edits[id] = {
            id: id,
            text: newText,
            selector: selector,
            fingerprint: fingerprint,
            timestamp: Date.now(),
            url: window.location.href
          };
          chrome.storage.local.set({ edits });
        });
      }
      
      el.removeAttribute("contenteditable");
      el.style.outline = "";
    };
    
    el.addEventListener("blur", save, { once: true });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        el.blur();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        el.textContent = originalText; // Restore original text
        el.blur();
      }
    });
    
    // Cleanup
    document.removeEventListener("click", handler, true);
    document.body.style.cursor = "";
  };
  
  document.addEventListener("click", handler, true);
}

function clearEdits() {
  chrome.storage.local.remove("edits", () => {
    document.querySelectorAll("[data-edit-id]").forEach((el) => {
      el.removeAttribute("data-edit-id");
    });
    location.reload();
  });
}

// Periodic re-application for very dynamic content
setInterval(() => {
  if (document.hidden) return; // Don't run when tab is not visible
  applySavedEdits();
}, 10000); // Re-apply every 10 seconds

// Listen from popup
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "enable-edit") startEditMode();
  if (msg.action === "clear-edits") clearEdits();
  if (msg.action === "highlight-edit") highlightEditElement(msg.editId);
  if (msg.action === "refresh-page") location.reload();
});

function highlightEditElement(editId) {
  // Remove any existing highlights
  document.querySelectorAll('.temp-highlight').forEach(el => {
    el.classList.remove('temp-highlight');
    el.style.outline = '';
    el.style.backgroundColor = '';
  });
  
  // Find and highlight the element
  const element = document.querySelector(`[data-edit-id="${editId}"]`);
  if (element) {
    element.classList.add('temp-highlight');
    element.style.outline = '3px solid #ff4444';
    element.style.backgroundColor = '#ffff0033';
    
    // Scroll to element
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Remove highlight after 3 seconds
    setTimeout(() => {
      element.classList.remove('temp-highlight');
      element.style.outline = '';
      element.style.backgroundColor = '';
    }, 3000);
  }
}