/**
 * PrompthaKCer Options Page Script v2.0
 */

let rulesEngine;

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  rulesEngine = new RulesEngine();
  await rulesEngine.init();

  setupNavigation();
  await loadSettings();
  renderSites();
  renderRules();
  await loadDataStats();
  await loadRulesInfo();
  setupEventListeners();

  // Listen for navigation messages from popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'navigateToSection' && message.section) {
      navigateToSection(message.section);
    }
  });

  // Check URL hash for direct section navigation
  if (window.location.hash) {
    const section = window.location.hash.substring(1);
    navigateToSection(section);
  }
});

function navigateToSection(sectionId) {
  const btn = document.querySelector(`.nav-btn[data-section="${sectionId}"]`);
  if (btn) {
    btn.click();
  }
}

// ============================================================================
// RULES INFO & UPDATE
// ============================================================================

async function loadRulesInfo() {
  const info = await rulesEngine.getLastUpdateInfo();

  if (info) {
    document.getElementById('rulesVersion').textContent = `v${info.version}`;
    document.getElementById('rulesCount').textContent = info.rulesCount;

    if (info.updated) {
      document.getElementById('rulesUpdated').textContent = info.updated;
    } else if (info.cachedAt) {
      const date = new Date(info.cachedAt);
      document.getElementById('rulesUpdated').textContent = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    }
  } else {
    document.getElementById('rulesVersion').textContent = 'Not loaded';
    document.getElementById('rulesCount').textContent = rulesEngine.getRules().length;
    document.getElementById('rulesUpdated').textContent = 'Never';
  }
}

async function pullLatestRules() {
  const btn = document.getElementById('pullLatestRulesBtn');
  const originalText = btn.innerHTML;

  btn.disabled = true;
  btn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin">
      <path d="M21 12a9 9 0 1 1-9-9"/>
    </svg>
    Updating...
  `;

  try {
    const result = await rulesEngine.refreshRemoteRules();

    if (result.success) {
      await loadRulesInfo();
      renderRules();
      showToast(`Updated to v${result.version} (${result.rulesCount} rules)`, 'success');
    } else {
      showToast(`Update failed: ${result.error}`, 'error');
    }
  } catch (e) {
    showToast(`Update failed: ${e.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

// ============================================================================
// NAVIGATION
// ============================================================================

function setupNavigation() {
  const navBtns = document.querySelectorAll('.nav-btn');
  const sections = document.querySelectorAll('.section');
  
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const sectionId = btn.dataset.section;
      
      navBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      sections.forEach(s => s.classList.remove('active'));
      document.getElementById(`${sectionId}-section`).classList.add('active');
    });
  });
  
  // Handle shortcuts link
  document.getElementById('shortcutsLink').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });
}

// ============================================================================
// SETTINGS
// ============================================================================

async function loadSettings() {
  const settings = await chrome.storage.sync.get([
    'enabled',
    'compressionPreset',
    'showNotifications',
    'autoSaveHistory',
    'buttonOpacity'
  ]);

  document.getElementById('enabled').checked = settings.enabled !== false;
  document.getElementById('compressionPreset').value = settings.compressionPreset || 'medium';
  document.getElementById('showNotifications').checked = settings.showNotifications !== false;
  document.getElementById('autoSaveHistory').checked = settings.autoSaveHistory !== false;

  // Button opacity
  const opacity = settings.buttonOpacity !== undefined ? settings.buttonOpacity : 1;
  document.getElementById('buttonOpacity').value = opacity;
  document.getElementById('opacityValue').textContent = `${Math.round(opacity * 100)}%`;
}

async function saveSettings() {
  await chrome.storage.sync.set({
    enabled: document.getElementById('enabled').checked,
    compressionPreset: document.getElementById('compressionPreset').value,
    showNotifications: document.getElementById('showNotifications').checked,
    autoSaveHistory: document.getElementById('autoSaveHistory').checked
  });

  showToast('Settings saved', 'success');
}

async function saveButtonOpacity() {
  const opacity = parseFloat(document.getElementById('buttonOpacity').value);
  document.getElementById('opacityValue').textContent = `${Math.round(opacity * 100)}%`;
  await chrome.storage.sync.set({ buttonOpacity: opacity });
}

async function resetButtonPosition() {
  await chrome.storage.sync.remove('buttonPosition');
  showToast('Button position reset. Reload the AI chat page to see changes.', 'success');
}

// ============================================================================
// SITES
// ============================================================================

async function renderSites() {
  const stored = await chrome.storage.sync.get(['customSites', 'siteSettings']);
  const siteSettings = stored.siteSettings || {};
  const customSites = stored.customSites || [];
  
  const defaultSites = [
    { id: 'chatgpt', name: 'ChatGPT', icon: 'GPT', patterns: ['chat.openai.com', 'chatgpt.com'], enabled: true },
    { id: 'claude', name: 'Claude', icon: 'C', patterns: ['claude.ai'], enabled: true },
    { id: 'gemini', name: 'Gemini', icon: 'G', patterns: ['gemini.google.com', 'bard.google.com'], enabled: true },
    { id: 'grok', name: 'Grok', icon: 'X', patterns: ['grok.x.ai', 'x.com/i/grok'], enabled: true },
    { id: 'perplexity', name: 'Perplexity', icon: 'P', patterns: ['perplexity.ai'], enabled: true },
    { id: 'copilot', name: 'Microsoft Copilot', icon: 'MS', patterns: ['copilot.microsoft.com', 'bing.com/chat'], enabled: true },
    { id: 'poe', name: 'Poe', icon: 'POE', patterns: ['poe.com'], enabled: true },
    { id: 'huggingface', name: 'HuggingFace Chat', icon: 'HF', patterns: ['huggingface.co/chat'], enabled: true }
  ];
  
  // Merge with settings
  const sites = defaultSites.map(site => ({
    ...site,
    enabled: siteSettings[site.id]?.enabled !== false
  }));
  
  // Add custom sites
  customSites.forEach(site => {
    sites.push({ ...site, isCustom: true });
  });
  
  const container = document.getElementById('sitesList');
  container.innerHTML = sites.map(site => `
    <div class="site-item ${site.enabled ? '' : 'disabled'}" data-site-id="${site.id}">
      <div class="site-icon">${site.icon || '[S]'}</div>
      <div class="site-info">
        <div class="site-name">${escapeHtml(site.name)}</div>
        <div class="site-patterns">${site.patterns.join(', ')}</div>
      </div>
      <div class="site-actions">
        <label class="toggle">
          <input type="checkbox" ${site.enabled ? 'checked' : ''} data-site-toggle="${site.id}">
          <span class="toggle-slider"></span>
        </label>
        ${site.isCustom ? `
          <button class="delete-btn" data-site-delete="${site.id}" title="Delete">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        ` : ''}
      </div>
    </div>
  `).join('');
}

async function toggleSite(siteId, enabled) {
  const stored = await chrome.storage.sync.get(['siteSettings']);
  const siteSettings = stored.siteSettings || {};
  siteSettings[siteId] = { enabled };
  await chrome.storage.sync.set({ siteSettings });
  renderSites();
}

async function addSite() {
  const name = document.getElementById('customSiteName').value.trim();
  const icon = document.getElementById('customSiteIcon').value.trim() || '[S]';
  const patterns = document.getElementById('customSitePatterns').value.trim();
  const selectors = document.getElementById('customSiteSelectors').value.trim();
  
  if (!name || !patterns) {
    showToast('Please enter a name and URL patterns', 'error');
    return;
  }
  
  const newSite = {
    id: `custom-${Date.now()}`,
    name,
    icon,
    patterns: patterns.split(',').map(p => p.trim()),
    inputSelectors: selectors ? selectors.split(',').map(s => s.trim()) : ['textarea', 'div[contenteditable="true"]'],
    enabled: true,
    isCustom: true
  };
  
  const stored = await chrome.storage.sync.get(['customSites']);
  const customSites = stored.customSites || [];
  customSites.push(newSite);
  await chrome.storage.sync.set({ customSites });
  
  // Clear form
  document.getElementById('customSiteName').value = '';
  document.getElementById('customSiteIcon').value = '';
  document.getElementById('customSitePatterns').value = '';
  document.getElementById('customSiteSelectors').value = '';
  
  renderSites();
  showToast('Site added successfully', 'success');
}

async function deleteSite(siteId) {
  if (!confirm('Delete this custom site?')) return;
  
  const stored = await chrome.storage.sync.get(['customSites']);
  const customSites = (stored.customSites || []).filter(s => s.id !== siteId);
  await chrome.storage.sync.set({ customSites });
  
  renderSites();
  showToast('Site deleted', 'success');
}

// ============================================================================
// RULES
// ============================================================================

function renderRules() {
  const filter = document.getElementById('categoryFilter').value;
  let rules = rulesEngine.getRules();
  
  if (filter !== 'all') {
    rules = rules.filter(r => r.category === filter);
  }
  
  const container = document.getElementById('rulesList');
  container.innerHTML = rules.map(rule => `
    <div class="rule-item ${rule.enabled ? '' : 'disabled'}" data-rule-id="${rule.id}">
      <label class="toggle">
        <input type="checkbox" ${rule.enabled ? 'checked' : ''} data-rule-toggle="${rule.id}">
        <span class="toggle-slider"></span>
      </label>
      <div class="rule-info">
        <div class="rule-name">${escapeHtml(rule.name)}</div>
        <div class="rule-desc">${escapeHtml(rule.description)}</div>
      </div>
      <span class="rule-category">${rule.category}</span>
      ${rule.isCustom ? `
        <div class="rule-actions">
          <button class="delete-btn" data-rule-delete="${rule.id}" title="Delete">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      ` : ''}
    </div>
  `).join('');
}

function toggleRule(ruleId, enabled) {
  rulesEngine.toggleRule(ruleId, enabled);
  renderRules();
}

async function enableAllRules() {
  const rules = rulesEngine.getRules();
  for (const rule of rules) {
    rule.enabled = true;
  }
  await rulesEngine.saveRules();
  renderRules();
  showToast(`Enabled all ${rules.length} rules`, 'success');
}

async function addRule() {
  const name = document.getElementById('customRuleName').value.trim();
  const description = document.getElementById('customRuleDesc').value.trim();
  const pattern = document.getElementById('customRulePattern').value.trim();
  const replace = document.getElementById('customRuleReplace').value;
  const flags = document.getElementById('customRuleFlags').value.trim() || 'gi';
  
  if (!name || !pattern) {
    showToast('Please enter a name and pattern', 'error');
    return;
  }
  
  // Validate regex
  try {
    new RegExp(pattern, flags);
  } catch (e) {
    showToast(`Invalid regex: ${e.message}`, 'error');
    return;
  }
  
  const rule = {
    name,
    description,
    patternString: pattern,
    patternFlags: flags,
    replaceString: replace,
    patterns: [{ find: new RegExp(pattern, flags), replace }]
  };
  
  rulesEngine.addCustomRule(rule);
  
  // Clear form
  document.getElementById('customRuleName').value = '';
  document.getElementById('customRuleDesc').value = '';
  document.getElementById('customRulePattern').value = '';
  document.getElementById('customRuleReplace').value = '';
  
  renderRules();
  showToast('Rule added successfully', 'success');
}

function deleteRule(ruleId) {
  if (!confirm('Delete this custom rule?')) return;
  
  rulesEngine.removeCustomRule(ruleId);
  renderRules();
  showToast('Rule deleted', 'success');
}

async function resetRules() {
  if (!confirm('Reset all rules to defaults? Custom rules will be deleted.')) return;
  
  await rulesEngine.resetToDefaults();
  renderRules();
  showToast('Rules reset to defaults', 'success');
}

function testRules() {
  const input = document.getElementById('testInput').value;
  
  if (!input.trim()) {
    showToast('Please enter text to test', 'error');
    return;
  }
  
  const result = rulesEngine.analyze(input);
  
  const resultsEl = document.getElementById('testResults');
  resultsEl.style.display = 'block';
  
  document.getElementById('testStats').innerHTML = `
    <span>Tokens saved: ${result.stats.tokensSaved}</span>
    <span>Reduction: ${result.stats.percentSaved}%</span>
    <span>Rules applied: ${result.appliedRules.length}</span>
  `;
  
  document.getElementById('testOutput').textContent = result.optimized;
}

// ============================================================================
// DATA MANAGEMENT
// ============================================================================

async function loadDataStats() {
  const stored = await chrome.storage.local.get(['promptHistory', 'totalStats']);
  const history = stored.promptHistory || [];
  const stats = stored.totalStats || {};

  document.getElementById('historyCount').textContent = history.length;
  document.getElementById('totalTokensSaved').textContent = stats.tokensSaved || 0;

  // Update Real World Impact section
  updateRealWorldImpact(stats, history);
}

// ============================================================================
// REAL WORLD IMPACT CALCULATIONS
// ============================================================================

// Platform/Model pricing data (per 1M input tokens) - December 2025
// Each site maps to its primary/flagship model pricing
const PLATFORM_PRICING = {
  chatgpt: {
    name: 'ChatGPT',
    model: 'GPT-4o',
    costPer1M: 2.50,
    badge: 'chatgpt'
  },
  claude: {
    name: 'Claude',
    model: 'Sonnet 4',
    costPer1M: 3.00,
    badge: 'claude',
    variants: [
      { model: 'Opus 4', costPer1M: 15.00, badge: 'opus' },
      { model: 'Haiku 3.5', costPer1M: 0.80, badge: 'claude' }
    ]
  },
  gemini: {
    name: 'Gemini',
    model: '2.0 Flash',
    costPer1M: 0.10,
    badge: 'gemini',
    variants: [
      { model: '1.5 Pro', costPer1M: 1.25, badge: 'gemini' }
    ]
  },
  grok: {
    name: 'Grok',
    model: 'Grok-2',
    costPer1M: 2.00,
    badge: 'grok'
  },
  copilot: {
    name: 'Microsoft Copilot',
    model: 'GPT-4 Turbo',
    costPer1M: 10.00,
    badge: 'copilot'
  },
  perplexity: {
    name: 'Perplexity',
    model: 'Sonar Pro',
    costPer1M: 3.00,
    badge: 'perplexity'
  },
  poe: {
    name: 'Poe',
    model: 'Multi-model',
    costPer1M: 3.00,
    badge: 'poe'
  },
  deepseek: {
    name: 'DeepSeek',
    model: 'V3',
    costPer1M: 0.27,
    badge: 'deepseek'
  },
  mistral: {
    name: 'Mistral',
    model: 'Large 2',
    costPer1M: 2.00,
    badge: 'mistral'
  }
};

async function updateRealWorldImpact(stats, history) {
  const tokensSaved = stats.tokensSaved || 0;
  const promptCount = history.length || 1;

  // Get enabled sites from storage
  const stored = await chrome.storage.sync.get(['siteSettings']);
  const siteSettings = stored.siteSettings || {};

  // Build list of enabled platforms with their pricing
  const enabledPlatforms = [];
  for (const [siteId, pricing] of Object.entries(PLATFORM_PRICING)) {
    const settings = siteSettings[siteId];
    const isEnabled = settings ? settings.enabled !== false : true; // Default enabled

    if (isEnabled) {
      enabledPlatforms.push({
        id: siteId,
        ...pricing,
        savings: (tokensSaved / 1_000_000) * pricing.costPer1M
      });

      // Add variants (like Claude Opus) if the platform is enabled
      if (pricing.variants) {
        for (const variant of pricing.variants) {
          enabledPlatforms.push({
            id: `${siteId}-${variant.model.toLowerCase().replace(/\s+/g, '-')}`,
            name: pricing.name,
            model: variant.model,
            costPer1M: variant.costPer1M,
            badge: variant.badge,
            isVariant: true,
            savings: (tokensSaved / 1_000_000) * variant.costPer1M
          });
        }
      }
    }
  }

  // Sort by cost (highest first for impact)
  enabledPlatforms.sort((a, b) => b.costPer1M - a.costPer1M);

  // Calculate average tokens saved per prompt
  const avgTokensPerPrompt = promptCount > 0 ? tokensSaved / promptCount : 0;

  // Use median pricing for the main display
  const medianCost = enabledPlatforms.length > 0
    ? enabledPlatforms[Math.floor(enabledPlatforms.length / 2)].costPer1M
    : 3.00;
  const totalSavings = (tokensSaved / 1_000_000) * medianCost;

  // Format currency with proper precision
  const formatCurrency = (value) => {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
    if (value >= 1) return `$${value.toFixed(2)}`;
    if (value >= 0.01) return `$${value.toFixed(2)}`;
    return `$${value.toFixed(4)}`;
  };

  // Update hero section
  const totalValue = document.getElementById('totalSavingsValue');
  if (totalValue) {
    animateValue(totalValue, totalSavings);
  }

  const tokenCount = document.getElementById('impactTokenCount');
  if (tokenCount) {
    tokenCount.textContent = tokensSaved.toLocaleString();
  }

  // Dynamically populate the model breakdown table
  const tbody = document.getElementById('impact-models-tbody');
  if (tbody) {
    tbody.innerHTML = '';

    if (enabledPlatforms.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="3" class="dim" style="text-align: center; padding: 20px;">
            No platforms enabled. Enable sites in the Sites tab to see cost savings.
          </td>
        </tr>
      `;
    } else {
      enabledPlatforms.forEach((platform, index) => {
        const isHighlight = index === 0; // Highlight the most expensive (highest savings)
        const tr = document.createElement('tr');
        if (isHighlight) tr.classList.add('highlight-row');

        const displayName = platform.isVariant
          ? `${platform.name} ${platform.model}`
          : `${platform.name} (${platform.model})`;

        tr.innerHTML = `
          <td><span class="model-badge ${platform.badge}">${displayName}</span></td>
          <td class="dim">$${platform.costPer1M.toFixed(2)}/1M</td>
          <td class="savings${isHighlight ? ' highlight' : ''}">${formatCurrency(platform.savings)}</td>
        `;
        tbody.appendChild(tr);
      });
    }
  }

  // Calculate scale projections using median pricing
  const savingsPerPrompt = avgTokensPerPrompt * (medianCost / 1_000_000);

  const scaleFactors = {
    '10k': 10_000,
    '100k': 100_000,
    '1m': 1_000_000
  };

  for (const [scale, dailyPrompts] of Object.entries(scaleFactors)) {
    const dailySavings = savingsPerPrompt * dailyPrompts;
    const monthlySavings = dailySavings * 30;
    const annualSavings = dailySavings * 365;

    const monthlyEl = document.getElementById(`scale-${scale}-monthly`);
    const annualEl = document.getElementById(`scale-${scale}-annual`);

    if (monthlyEl) monthlyEl.textContent = formatCurrency(monthlySavings);
    if (annualEl) annualEl.textContent = formatCurrency(annualSavings);
  }

  // Update "Beyond Dollar Cost" benefits
  // Latency: ~0.1ms per token (rough estimate for inference)
  const avgLatencySaved = Math.round(avgTokensPerPrompt * 0.1);
  const latencyEl = document.getElementById('latency-saved');
  if (latencyEl) {
    latencyEl.textContent = avgLatencySaved > 0 ? `~${avgLatencySaved}ms` : '~0ms';
  }

  // Context preserved (same as tokens saved per prompt on average)
  const contextEl = document.getElementById('context-saved');
  if (contextEl) {
    contextEl.textContent = Math.round(avgTokensPerPrompt).toLocaleString();
  }

  // Calculate and display energy/compute impact
  updateEnergyImpact(tokensSaved);
}

// Calculate energy savings from reduced token processing
// Based on research: ~0.0003 Wh per token for large LLMs (GPT-4 class)
function updateEnergyImpact(tokensSaved) {
  // Energy per token estimates (Wh) - based on datacenter compute for inference
  const WH_PER_TOKEN = 0.0003; // ~0.3 mWh per token for large models

  const energySaved = tokensSaved * WH_PER_TOKEN; // in Wh

  // Update the compute/energy hero box
  const computeEl = document.getElementById('computeSavedValue');
  if (computeEl) {
    animateEnergyValue(computeEl, energySaved);
  }

  // Update unit display and explanation based on scale
  const unitEl = document.getElementById('energyUnit');
  const explainEl = document.getElementById('energyExplain');

  if (unitEl && explainEl) {
    if (energySaved >= 1000000) {
      unitEl.textContent = 'MWh';
      explainEl.textContent = 'megawatt-hours of electricity';
    } else if (energySaved >= 1000) {
      unitEl.textContent = 'kWh';
      explainEl.textContent = 'kilowatt-hours of electricity';
    } else if (energySaved >= 1) {
      unitEl.textContent = 'Wh';
      explainEl.textContent = 'watt-hours of electricity';
    } else {
      unitEl.textContent = 'mWh';
      explainEl.textContent = 'milliwatt-hours of electricity';
    }
  }

  // Update with relatable real-world comparison
  const comparisonEl = document.getElementById('energyComparison');
  if (comparisonEl) {
    comparisonEl.innerHTML = getEnergyComparison(energySaved);
  }
}

// Get a relatable real-world comparison for energy saved
function getEnergyComparison(wh) {
  // Real-world energy equivalents (in Wh)
  const PHONE_CHARGE = 12;        // ~12 Wh to charge a smartphone
  const LED_BULB_HOUR = 10;       // 10W LED bulb for 1 hour
  const LAPTOP_HOUR = 50;         // Laptop running for 1 hour
  const TV_HOUR = 100;            // TV for 1 hour
  const MICROWAVE_MIN = 20;       // Microwave for 1 minute
  const GOOGLE_SEARCH = 0.0003;   // One Google search
  const EV_MILE = 250;            // ~250 Wh per mile for EV
  const HOME_DAY = 30000;         // Average US home per day (~30 kWh)
  const BITCOIN_TX = 1000000;     // ~1 MWh per Bitcoin transaction

  // Pick the most relatable comparison based on scale
  if (wh < 0.001) {
    // Very small - compare to Google searches
    const searches = Math.round(wh / GOOGLE_SEARCH);
    if (searches < 1) return `A tiny spark of saved compute`;
    return `Like <span>${searches}</span> fewer Google searches`;
  } else if (wh < 1) {
    // Small - compare to phone charge percentage
    const phonePercent = Math.round((wh / PHONE_CHARGE) * 100);
    if (phonePercent < 1) return `Like <span>${(wh * 1000).toFixed(0)}mWh</span> of phone battery`;
    return `Like <span>${phonePercent}%</span> of a phone charge`;
  } else if (wh < PHONE_CHARGE * 2) {
    // Around one phone charge
    const charges = (wh / PHONE_CHARGE).toFixed(1);
    return `Like charging your phone <span>${charges}</span> times`;
  } else if (wh < LAPTOP_HOUR * 2) {
    // Compare to LED bulb hours
    const hours = Math.round(wh / LED_BULB_HOUR);
    return `Like running an LED bulb for <span>${hours}</span> hours`;
  } else if (wh < TV_HOUR * 5) {
    // Compare to laptop hours
    const hours = (wh / LAPTOP_HOUR).toFixed(1);
    return `Like powering a laptop for <span>${hours}</span> hours`;
  } else if (wh < 1000) {
    // Compare to TV hours
    const hours = Math.round(wh / TV_HOUR);
    return `Like watching TV for <span>${hours}</span> hours`;
  } else if (wh < 10000) {
    // Compare to EV miles
    const miles = (wh / EV_MILE).toFixed(1);
    return `Like driving an EV for <span>${miles}</span> miles`;
  } else if (wh < HOME_DAY * 2) {
    // Compare to home energy
    const days = (wh / HOME_DAY).toFixed(1);
    return `Like powering a home for <span>${days}</span> days`;
  } else if (wh < BITCOIN_TX) {
    // Large - compare to homes
    const homes = Math.round(wh / HOME_DAY);
    return `Like powering <span>${homes}</span> homes for a day`;
  } else {
    // Massive - compare to Bitcoin transactions
    const btc = (wh / BITCOIN_TX).toFixed(1);
    return `Like <span>${btc}</span> Bitcoin transactions worth of energy`;
  }
}

// Animate energy value with appropriate unit conversion
function animateEnergyValue(element, endValueWh) {
  const duration = 1000;
  const startTime = performance.now();

  const animate = (currentTime) => {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easeOut = 1 - Math.pow(1 - progress, 3);
    const currentWh = endValueWh * easeOut;

    // Display value in appropriate unit
    let displayValue;
    if (endValueWh >= 1000000) {
      displayValue = (currentWh / 1000000).toFixed(1);
    } else if (endValueWh >= 1000) {
      displayValue = (currentWh / 1000).toFixed(1);
    } else if (endValueWh >= 1) {
      displayValue = currentWh.toFixed(1);
    } else {
      displayValue = (currentWh * 1000).toFixed(0);
    }

    element.textContent = displayValue;

    if (progress < 1) {
      requestAnimationFrame(animate);
    }
  };

  requestAnimationFrame(animate);
}

// Animate number counting up
function animateValue(element, endValue) {
  const duration = 1000;
  const startTime = performance.now();
  const startValue = 0;

  const formatNumber = (val) => {
    if (val >= 1) return val.toFixed(2);
    if (val >= 0.01) return val.toFixed(2);
    return val.toFixed(4);
  };

  const animate = (currentTime) => {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // Ease out cubic
    const easeOut = 1 - Math.pow(1 - progress, 3);
    const currentValue = startValue + (endValue - startValue) * easeOut;

    element.textContent = formatNumber(currentValue);

    if (progress < 1) {
      requestAnimationFrame(animate);
    }
  };

  requestAnimationFrame(animate);
}

async function exportHistory() {
  const stored = await chrome.storage.local.get(['promptHistory']);
  const history = stored.promptHistory || [];
  
  if (history.length === 0) {
    showToast('No history to export', 'error');
    return;
  }
  
  const blob = new Blob([JSON.stringify(history, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `prompthakcer-history-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  
  URL.revokeObjectURL(url);
  showToast('History exported', 'success');
}

async function importHistory() {
  document.getElementById('importFile').click();
}

async function handleImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  try {
    const text = await file.text();
    const imported = JSON.parse(text);
    
    if (!Array.isArray(imported)) {
      throw new Error('Invalid format');
    }
    
    const stored = await chrome.storage.local.get(['promptHistory']);
    const existing = stored.promptHistory || [];
    const existingIds = new Set(existing.map(e => e.id));
    
    const newEntries = imported.filter(e => !existingIds.has(e.id));
    const merged = [...existing, ...newEntries];
    
    await chrome.storage.local.set({ promptHistory: merged });
    
    loadDataStats();
    showToast(`Imported ${newEntries.length} entries`, 'success');
  } catch (e) {
    showToast(`Import failed: ${e.message}`, 'error');
  }
  
  event.target.value = '';
}

async function clearHistory() {
  if (!confirm('Clear all history? This cannot be undone.')) return;
  
  await chrome.storage.local.set({
    promptHistory: [],
    totalStats: {
      promptsOptimized: 0,
      promptsApplied: 0,
      tokensSaved: 0,
      charactersSaved: 0,
      rulesApplied: {}
    }
  });
  
  loadDataStats();
  showToast('History cleared', 'success');
}

async function resetAll() {
  if (!confirm('Reset ALL settings and data? This cannot be undone.')) return;
  if (!confirm('Are you absolutely sure?')) return;
  
  await chrome.storage.sync.clear();
  await chrome.storage.local.clear();
  
  // Reload page
  location.reload();
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function setupEventListeners() {
  // Settings
  document.getElementById('enabled').addEventListener('change', saveSettings);
  document.getElementById('compressionPreset').addEventListener('change', saveSettings);
  document.getElementById('showNotifications').addEventListener('change', saveSettings);
  document.getElementById('autoSaveHistory').addEventListener('change', saveSettings);

  // Button appearance
  document.getElementById('buttonOpacity').addEventListener('input', saveButtonOpacity);
  document.getElementById('resetButtonPosition').addEventListener('click', resetButtonPosition);

  // Sites
  document.getElementById('addSiteBtn').addEventListener('click', addSite);

  // Sites list - event delegation for dynamic elements
  document.getElementById('sitesList').addEventListener('change', (e) => {
    const siteId = e.target.dataset.siteToggle;
    if (siteId) {
      toggleSite(siteId, e.target.checked);
    }
  });
  document.getElementById('sitesList').addEventListener('click', (e) => {
    const deleteBtn = e.target.closest('[data-site-delete]');
    if (deleteBtn) {
      deleteSite(deleteBtn.dataset.siteDelete);
    }
  });

  // Rules
  document.getElementById('categoryFilter').addEventListener('change', renderRules);
  document.getElementById('resetRulesBtn').addEventListener('click', resetRules);
  document.getElementById('pullLatestRulesBtn').addEventListener('click', pullLatestRules);
  document.getElementById('enableAllRulesBtn').addEventListener('click', enableAllRules);
  document.getElementById('addRuleBtn').addEventListener('click', addRule);
  document.getElementById('testRulesBtn').addEventListener('click', testRules);

  // Rules list - event delegation for dynamic elements
  document.getElementById('rulesList').addEventListener('change', (e) => {
    const ruleId = e.target.dataset.ruleToggle;
    if (ruleId) {
      toggleRule(ruleId, e.target.checked);
    }
  });
  document.getElementById('rulesList').addEventListener('click', (e) => {
    const deleteBtn = e.target.closest('[data-rule-delete]');
    if (deleteBtn) {
      deleteRule(deleteBtn.dataset.ruleDelete);
    }
  });

  // Data
  document.getElementById('exportHistoryBtn').addEventListener('click', exportHistory);
  document.getElementById('importHistoryBtn').addEventListener('click', importHistory);
  document.getElementById('importFile').addEventListener('change', handleImport);
  document.getElementById('clearHistoryBtn').addEventListener('click', clearHistory);
  document.getElementById('resetAllBtn').addEventListener('click', resetAll);
}

// ============================================================================
// UTILITIES
// ============================================================================

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
