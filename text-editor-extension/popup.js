// Get current tab URL and display it
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const currentUrl = tabs[0].url;
  const urlElement = document.getElementById("currentUrl");
  
  // Display a shortened version of the URL
  try {
    const url = new URL(currentUrl);
    urlElement.textContent = url.hostname + url.pathname;
  } catch (e) {
    urlElement.textContent = currentUrl;
  }
  
  // Load and display edits for current page
  loadPageEdits(currentUrl);
});

function loadPageEdits(currentUrl) {
  chrome.storage.local.get("edits", (data) => {
    const allEdits = data.edits || {};
    const pageEdits = [];
    
    // Filter edits for current page
    for (const [id, editData] of Object.entries(allEdits)) {
      if (editData.url && isSamePage(editData.url, currentUrl)) {
        pageEdits.push({ id, ...editData });
      }
    }
    
    displayEdits(pageEdits);
  });
}

function isSamePage(url1, url2) {
  try {
    const u1 = new URL(url1);
    const u2 = new URL(url2);
    
    // Compare hostname and pathname (ignore hash and search params for flexibility)
    return u1.hostname === u2.hostname && u1.pathname === u2.pathname;
  } catch (e) {
    return url1 === url2;
  }
}

function displayEdits(edits) {
  const editsList = document.getElementById("editsList");
  const editCount = document.getElementById("editCount");
  
  editCount.textContent = edits.length;
  
  if (edits.length === 0) {
    editsList.innerHTML = '<div class="no-edits">No edits made on this page yet</div>';
    return;
  }
  
  // Sort edits by timestamp (newest first)
  edits.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  
  editsList.innerHTML = edits.map(edit => {
    const originalText = edit.fingerprint?.textContent || 'Unknown original text';
    const newText = edit.text;
    const timeAgo = edit.timestamp ? formatTimeAgo(edit.timestamp) : 'Recently';
    
    return `
      <div class="edit-item" title="Click to highlight element" data-edit-id="${edit.id}">
        <div class="edit-original">From: "${truncateText(originalText, 50)}"</div>
        <div class="edit-new">To: "${truncateText(newText, 50)}"</div>
        <div class="edit-time">${timeAgo}</div>
      </div>
    `;
  }).join('');
  
  // Add click handlers to highlight elements
  editsList.querySelectorAll('.edit-item').forEach(item => {
    item.addEventListener('click', () => {
      const editId = item.dataset.editId;
      highlightEditElement(editId);
    });
  });
}

function truncateText(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

function formatTimeAgo(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
}

function highlightEditElement(editId) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { 
      action: "highlight-edit", 
      editId: editId 
    });
  });
}

// Button event listeners
document.getElementById("editMode").addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { action: "enable-edit" });
    window.close(); // Close popup after enabling edit mode
  });
});

document.getElementById("clearPageEdits").addEventListener("click", () => {
  if (confirm("Clear all edits made on this page?")) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentUrl = tabs[0].url;
      
      chrome.storage.local.get("edits", (data) => {
        const allEdits = data.edits || {};
        const remainingEdits = {};
        
        // Keep only edits that are NOT from the current page
        for (const [id, editData] of Object.entries(allEdits)) {
          if (!editData.url || !isSamePage(editData.url, currentUrl)) {
            remainingEdits[id] = editData;
          }
        }
        
        chrome.storage.local.set({ edits: remainingEdits }, () => {
          // Refresh the current page to remove visual edits
          chrome.tabs.sendMessage(tabs[0].id, { action: "refresh-page" });
          
          // Reload the popup display
          loadPageEdits(currentUrl);
        });
      });
    });
  }
});

document.getElementById("clearAllEdits").addEventListener("click", () => {
  if (confirm("Clear ALL edits made with this extension? This cannot be undone.")) {
    chrome.storage.local.remove("edits", () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { action: "refresh-page" });
        
        // Reset the display
        document.getElementById("editCount").textContent = "0";
        document.getElementById("editsList").innerHTML = 
          '<div class="no-edits">No edits made on this page yet</div>';
      });
    });
  }
});

// Refresh edits list when popup is opened (in case edits were made)
document.addEventListener('DOMContentLoaded', () => {
  // Small delay to ensure everything is loaded
  setTimeout(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        loadPageEdits(tabs[0].url);
      }
    });
  }, 100);
});