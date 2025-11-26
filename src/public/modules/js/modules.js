// src/public/modules/js/modules.js
// Module Optimizer UI

(() => {
    'use strict';

    const API_BASE = '/api';
    let currentUserId = null;
    let availableAttrs = new Set();
    let currentCategory = 'ALL';
    let currentSortMode = 'ByTotalAttr';
    let priorityAttrs = new Set();
    let desiredLevels = {};

    // DOM elements
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const elements = {
        btnOptimize: $('#btnOptimize'),
        btnClose: $('#btnClose'),
        moduleCount: $('#moduleCount'),
        resultsContainer: $('#resultsContainer'),
        footerInfo: $('#footerInfo'),
        priorityAttrsList: $('#priorityAttrsList'),
        desiredLevelsList: $('#desiredLevelsList'),
    };

    // Fetch modules for current user
    async function fetchModules(userId) {
        try {
            const res = await fetch(`${API_BASE}/modules/${userId}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (data.code !== 0) throw new Error(data.msg || 'Failed to fetch modules');
            return data.data || [];
        } catch (error) {
            console.error('[modules] Failed to fetch modules:', error);
            return [];
        }
    }

    // Optimize modules
    async function optimizeModules() {
        if (!currentUserId) {
            elements.footerInfo.textContent = 'No user selected';
            return;
        }

        elements.btnOptimize.disabled = true;
        elements.footerInfo.textContent = 'Optimizing...';

        try {
            const res = await fetch(`${API_BASE}/modules/optimize`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: currentUserId,
                    category: currentCategory,
                    priorityAttrs: Array.from(priorityAttrs),
                    desiredLevels: desiredLevels,
                    sortMode: currentSortMode,
                    topN: 40,
                }),
            });

            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (data.code !== 0) throw new Error(data.msg || 'Optimization failed');

            displayResults(data.data || []);
            elements.footerInfo.textContent = `Found ${data.data.length} solutions`;
        } catch (error) {
            console.error('[modules] Optimization failed:', error);
            elements.footerInfo.textContent = `Error: ${error.message}`;
            elements.resultsContainer.innerHTML = '<div class="solution-card"><p>Optimization failed</p></div>';
        } finally {
            elements.btnOptimize.disabled = false;
        }
    }

    // Display optimization results as cards
    function displayResults(solutions) {
        if (solutions.length === 0) {
            elements.resultsContainer.innerHTML = '<div class="solution-card empty-state"><div class="empty-message"><p>No solutions found</p><p class="empty-hint">Try adjusting your filters or priority attributes</p></div></div>';
            return;
        }

        elements.resultsContainer.innerHTML = solutions.map((sol, idx) => {
            const rank = idx + 1;
            const isTopThree = rank <= 3;
            const rankClass = isTopThree ? `rank-${rank}` : '';
            const medalEmoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '';
            
            // Build module items with full attributes
            const modulesHtml = sol.modules.map(m => {
                const partsHtml = (m.parts || []).map(p => 
                    `<span class="module-part">${p.name}<span class="part-value">+${p.value}</span></span>`
                ).join('');
                
                const category = m.category || 'UNKNOWN';
                const categoryIcon = category === 'ATTACK' ? '⚔️' : category === 'GUARDIAN' ? '🛡️' : category === 'SUPPORT' ? '💚' : '📦';
                
                return `
                    <div class="card-module-item category-${category}">
                        <div class="module-item-header">
                            <div class="module-item-title">
                                <span class="module-category-icon">${categoryIcon}</span>
                                <span class="module-item-name">${m.name || 'Unknown Module'}</span>
                            </div>
                            <span class="module-item-quality quality-${m.quality || 0}">Q${m.quality || 0}</span>
                        </div>
                        <div class="module-item-parts">${partsHtml}</div>
                    </div>
                `;
            }).join('');

            // Build attribute breakdown
            const attrsHtml = Object.entries(sol.breakdown || {})
                .sort((a, b) => b[1] - a[1])
                .map(([name, value]) => {
                    const isPriority = priorityAttrs.has(name);
                    return `<span class="attr-chip ${isPriority ? 'priority' : ''}">
                        <span class="attr-name">${name}</span>
                        <span class="attr-value">+${value}</span>
                    </span>`;
                })
                .join('');

            return `
                <div class="solution-card ${rankClass}">
                    <div class="card-header">
                        <div class="card-rank-badge ${rankClass}">
                            ${medalEmoji ? `<span class="rank-medal">${medalEmoji}</span>` : ''}
                            <span class="rank-number">#${rank}</span>
                        </div>
                        <div class="card-stats">
                            <div class="card-stat">
                                <span class="card-stat-icon">⭐</span>
                                <div class="card-stat-content">
                                    <span class="card-stat-label">Score</span>
                                    <span class="card-stat-value">${sol.score.toFixed(0)}</span>
                                </div>
                            </div>
                            <div class="card-stat">
                                <span class="card-stat-icon">📊</span>
                                <div class="card-stat-content">
                                    <span class="card-stat-label">Total Attributes</span>
                                    <span class="card-stat-value">${sol.totalAttrValue || 0}</span>
                                </div>
                            </div>
                            <div class="card-stat">
                                <span class="card-stat-icon">🎯</span>
                                <div class="card-stat-content">
                                    <span class="card-stat-label">Priority</span>
                                    <span class="card-stat-value">${sol.priorityLevel || 0}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="card-body">
                        <div class="card-modules">
                            <div class="card-section-label">Modules (${sol.modules.length})</div>
                            ${modulesHtml}
                        </div>
                        
                        <div class="card-attributes">
                            <div class="card-section-label">Attribute Breakdown</div>
                            <div class="attr-list">${attrsHtml}</div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Build attribute checkboxes
    function buildAttributeFilters(modules) {
        const attrs = new Set();
        for (const m of modules) {
            for (const p of m.parts) {
                attrs.add(p.name);
            }
        }
        availableAttrs = attrs;

        const sortedAttrs = Array.from(attrs).sort();
        
        elements.priorityAttrsList.innerHTML = sortedAttrs.map(attr => `
            <div class="attr-checkbox-item">
                <input type="checkbox" id="attr-${attr}" data-attr="${attr}" />
                <label for="attr-${attr}">${attr}</label>
            </div>
        `).join('');

        elements.desiredLevelsList.innerHTML = sortedAttrs.map(attr => `
            <div class="attr-level-item">
                <label for="level-${attr}">${attr}:</label>
                <input type="number" id="level-${attr}" data-attr="${attr}" 
                       min="0" max="6" value="0" />
            </div>
        `).join('');

        // Attach event listeners
        $$('#priorityAttrsList input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const attr = e.target.dataset.attr;
                if (e.target.checked) {
                    priorityAttrs.add(attr);
                } else {
                    priorityAttrs.delete(attr);
                }
            });
        });

        $$('#desiredLevelsList input[type="number"]').forEach(input => {
            input.addEventListener('change', (e) => {
                const attr = e.target.dataset.attr;
                const level = parseInt(e.target.value, 10) || 0;
                if (level > 0) {
                    desiredLevels[attr] = level;
                } else {
                    delete desiredLevels[attr];
                }
            });
        });
    }

    // Load modules for a user
    async function loadModulesForUser(userId) {
        if (!userId) {
            elements.footerInfo.textContent = 'No user ID provided';
            return;
        }

        elements.footerInfo.textContent = 'Loading modules...';
        currentUserId = userId;
        
        try {
            const modules = await fetchModules(currentUserId);
            elements.moduleCount.textContent = `Loaded ${modules.length} modules`;
            
            if (modules.length === 0) {
                elements.footerInfo.textContent = 'No modules found. Waiting for game data...';
                buildAttributeFilters(modules);
                // Set up periodic refresh to check for modules
                if (!window.moduleRefreshInterval) {
                    window.moduleRefreshInterval = setInterval(async () => {
                        if (currentUserId) {
                            const refreshedModules = await fetchModules(currentUserId);
                            if (refreshedModules.length > 0) {
                                clearInterval(window.moduleRefreshInterval);
                                window.moduleRefreshInterval = null;
                                elements.moduleCount.textContent = `Loaded ${refreshedModules.length} modules`;
                                elements.footerInfo.textContent = `Ready - ${refreshedModules.length} modules available`;
                                buildAttributeFilters(refreshedModules);
                            }
                        }
                    }, 2000); // Check every 2 seconds
                }
            } else {
                elements.footerInfo.textContent = `Ready - ${modules.length} modules available`;
                buildAttributeFilters(modules);
                // Clear any existing refresh interval
                if (window.moduleRefreshInterval) {
                    clearInterval(window.moduleRefreshInterval);
                    window.moduleRefreshInterval = null;
                }
            }
        } catch (error) {
            console.error('[modules] Failed to load modules:', error);
            elements.footerInfo.textContent = `Error loading modules: ${error.message}`;
        }
    }

    // Initialize
    async function init() {
        let messageReceived = false;
        let retryCount = 0;
        const maxRetries = 10;

        // Get user ID from parent window or URL
        window.addEventListener('message', async (ev) => {
            if (ev.data?.type === 'module-optimize') {
                messageReceived = true;
                await loadModulesForUser(ev.data.userId);
            }
        });

        // Request user ID from parent
        if (window.opener) {
            // Send ready message immediately
            window.opener.postMessage({ type: 'module-optimizer-ready' }, '*');
            
            // Retry sending ready message if no response after a delay
            const retryReady = setInterval(() => {
                if (!messageReceived && retryCount < maxRetries) {
                    window.opener.postMessage({ type: 'module-optimizer-ready' }, '*');
                    retryCount++;
                } else {
                    clearInterval(retryReady);
                }
            }, 500);
        }

        // Category buttons
        $$('[data-category]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                $$('[data-category]').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                currentCategory = e.target.dataset.category;
            });
        });

        // Sort mode buttons
        $$('[data-sort]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                $$('[data-sort]').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                currentSortMode = e.target.dataset.sort;
            });
        });

        // Optimize button
        elements.btnOptimize.addEventListener('click', optimizeModules);

        // Close button
        elements.btnClose.addEventListener('click', () => {
            // Clean up intervals
            if (window.moduleRefreshInterval) {
                clearInterval(window.moduleRefreshInterval);
                window.moduleRefreshInterval = null;
            }
            window.close();
        });

        // Clean up on page unload
        window.addEventListener('beforeunload', () => {
            if (window.moduleRefreshInterval) {
                clearInterval(window.moduleRefreshInterval);
                window.moduleRefreshInterval = null;
            }
        });

        elements.footerInfo.textContent = 'Waiting for module data...';
    }

    document.addEventListener('DOMContentLoaded', init);
})();

