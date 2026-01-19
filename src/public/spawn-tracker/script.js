// src/public/spawn-tracker/script.js

const API_BASE = 'http://localhost:8990/api';

let state = {
    mobsDescriptors: [],
    statusDescriptors: [],
    bptimerRegions: [],
    selectedRegionIndex: 0,
    trackedMonsters: {},
    spawnDataLoaded: 0, // SpawnDataLoadStatus
    spawnDataRealtimeConnection: 0,
    settings: null,
    collapseToContentOnly: false,
    selectedCategory: 'all', // 'all' or 'magical-creatures'
    monsterSearchQuery: '', // Search query for filtering monsters
};

const SpawnDataLoadStatus = {
    NotLoaded: 0,
    InProgress: 1,
    Complete: 2,
    Error: 3,
    Cancelled: 4,
};

async function loadSettings() {
    try {
        const res = await fetch(`${API_BASE}/bptimer/settings`);
        const data = await res.json();
        if (data.code === 0) {
            state.settings = data.data;
            state.selectedRegionIndex = data.data?.spawnTracker?.selectedRegionIndex || 0;
            state.trackedMonsters = data.data?.spawnTracker?.trackedMonsters || {};
        }
    } catch (error) {
        console.error('[SpawnTracker] Failed to load settings:', error);
    }
}

async function saveSettings() {
    try {
        await fetch(`${API_BASE}/bptimer/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                spawnTracker: {
                    selectedRegionIndex: state.selectedRegionIndex,
                    trackedMonsters: state.trackedMonsters,
                },
            }),
        });
    } catch (error) {
        console.error('[SpawnTracker] Failed to save settings:', error);
    }
}

async function fetchBPTimerData() {
    try {
        const res = await fetch(`${API_BASE}/bptimer/fetch`, { method: 'POST' });
        
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            console.error('[SpawnTracker] HTTP error:', res.status, res.statusText, text);
            showError(`HTTP ${res.status}: ${res.statusText}`);
            return;
        }
        
        const contentType = res.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await res.text().catch(() => '');
            console.error('[SpawnTracker] Non-JSON response:', contentType, text.substring(0, 200));
            showError('Server returned non-JSON response');
            return;
        }
        
        const data = await res.json();
        if (data.code === 0) {
            // JSON_OK spreads properties directly, not under 'data'
            updateState(data);
            render();
        } else {
            console.error('[SpawnTracker] Fetch failed:', data.msg, data);
            showError(data.msg || 'Failed to fetch data from BPTimer');
        }
    } catch (error) {
        console.error('[SpawnTracker] Failed to fetch data:', error);
        showError(error.message || 'Network error while fetching data');
    }
}

async function startRealtime() {
    try {
        await fetch(`${API_BASE}/bptimer/realtime/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ regionIndex: state.selectedRegionIndex }),
        });
    } catch (error) {
        console.error('[SpawnTracker] Failed to start realtime:', error);
    }
}

function updateState(data) {
    // JSON_OK spreads properties directly, so data.mobsDescriptors, not data.data.mobsDescriptors
    if (data && data.mobsDescriptors !== undefined) state.mobsDescriptors = data.mobsDescriptors || [];
    if (data && data.statusDescriptors !== undefined) {
        // Convert updateTimestamp strings to Date objects (JSON serialization converts Date to string)
        state.statusDescriptors = (data.statusDescriptors || []).map(s => ({
            ...s,
            updateTimestamp: s.updateTimestamp 
                ? (s.updateTimestamp instanceof Date 
                    ? s.updateTimestamp 
                    : new Date(s.updateTimestamp))
                : null
        }));
    }
    if (data && data.bptimerRegions !== undefined) state.bptimerRegions = data.bptimerRegions || [];
    if (data && data.spawnDataLoaded !== undefined) state.spawnDataLoaded = data.spawnDataLoaded;
    if (data && data.spawnDataRealtimeConnection !== undefined) {
        state.spawnDataRealtimeConnection = data.spawnDataRealtimeConnection;
    }
}

function showError(message) {
    const errorState = document.getElementById('errorState');
    const errorMsg = errorState.querySelector('p');
    if (message) {
        errorMsg.textContent = `Error: ${message}. Click reconnect to retry.`;
    } else {
        errorMsg.textContent = 'Error loading data from BPTimer. Click reconnect to retry.';
    }
    document.getElementById('loadingState').classList.add('hidden');
    document.getElementById('mainContent').classList.add('hidden');
    errorState.classList.remove('hidden');
}

function render() {
    if (state.spawnDataLoaded === SpawnDataLoadStatus.InProgress) {
        document.getElementById('loadingState').classList.remove('hidden');
        document.getElementById('mainContent').classList.add('hidden');
        document.getElementById('errorState').classList.add('hidden');
        return;
    }

    if (state.spawnDataLoaded === SpawnDataLoadStatus.Complete) {
        document.getElementById('loadingState').classList.add('hidden');
        document.getElementById('mainContent').classList.remove('hidden');
        document.getElementById('errorState').classList.add('hidden');
        renderContent();
    } else {
        showError();
    }
}

function renderContent() {
    renderRegionSelector();
    renderMonsterFilters();
    renderSpawnList();
}

function renderRegionSelector() {
    const select = document.getElementById('regionSelect');
    select.innerHTML = '';
    state.bptimerRegions.forEach((region, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = region;
        if (index === state.selectedRegionIndex) option.selected = true;
        select.appendChild(option);
    });

    select.onchange = (e) => {
        state.selectedRegionIndex = parseInt(e.target.value);
        saveSettings();
        startRealtime();
        render();
    };
}

/**
 * Determines which category a monster belongs to
 * @param {Object} mob - Mob descriptor object
 * @returns {string} - Category name: 'magical-creatures' or 'all'
 */
function getMonsterCategory(mob) {
    const name = (mob.gameMobName || mob.mobName || '').toLowerCase();
    if (name.includes('piglet') || name.includes('nabo')) {
        return 'magical-creatures';
    }
    return 'all';
}

function renderMonsterFilters() {
    const container = document.getElementById('monsterFilters');
    container.innerHTML = '';

    // Create category tabs
    const tabsContainer = document.createElement('div');
    tabsContainer.className = 'category-tabs';
    
    const bossesTab = document.createElement('button');
    bossesTab.className = 'category-tab';
    bossesTab.textContent = 'Bosses';
    bossesTab.dataset.category = 'all';
    if (state.selectedCategory === 'all') {
        bossesTab.classList.add('active');
    }
    bossesTab.onclick = () => {
        state.selectedCategory = 'all';
        renderMonsterFilters();
    };
    
    const magicalTab = document.createElement('button');
    magicalTab.className = 'category-tab';
    magicalTab.textContent = 'Magical Creatures';
    magicalTab.dataset.category = 'magical-creatures';
    if (state.selectedCategory === 'magical-creatures') {
        magicalTab.classList.add('active');
    }
    magicalTab.onclick = () => {
        state.selectedCategory = 'magical-creatures';
        renderMonsterFilters();
    };
    
    tabsContainer.appendChild(bossesTab);
    tabsContainer.appendChild(magicalTab);
    container.appendChild(tabsContainer);

    // Create search input
    const searchContainer = document.createElement('div');
    searchContainer.className = 'monster-search-container';
    
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'monster-search-input';
    searchInput.placeholder = 'Search monsters...';
    searchInput.value = state.monsterSearchQuery;
    searchInput.oninput = (e) => {
        state.monsterSearchQuery = e.target.value.toLowerCase().trim();
        renderMonsterFilters();
    };
    
    searchContainer.appendChild(searchInput);
    container.appendChild(searchContainer);

    // Create monsters container
    const monstersContainer = document.createElement('div');
    monstersContainer.className = 'monsters-list';
    
    const regionName = state.bptimerRegions[state.selectedRegionIndex] || 'NA';

    // Filter monsters by selected category and search query
    const filteredMobs = state.mobsDescriptors.filter(mob => {
        // First filter by category
        let matchesCategory = false;
        if (state.selectedCategory === 'all') {
            // Bosses tab: exclude magical creatures (piglet and nabo)
            matchesCategory = getMonsterCategory(mob) !== 'magical-creatures';
        } else {
            matchesCategory = getMonsterCategory(mob) === state.selectedCategory;
        }
        
        if (!matchesCategory) {
            return false;
        }
        
        // Then filter by search query if present
        if (state.monsterSearchQuery) {
            const name = (mob.gameMobName || mob.mobName || '').toLowerCase();
            const mapName = (mob.mobMapName || '').toLowerCase();
            const searchLower = state.monsterSearchQuery.toLowerCase();
            return name.includes(searchLower) || mapName.includes(searchLower);
        }
        
        return true;
    });

    filteredMobs.forEach(mob => {
        const item = document.createElement('div');
        item.className = 'monster-filter-item';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `mob-${mob.mobId}`;
        checkbox.checked = state.trackedMonsters[mob.mobId] || false;
        checkbox.onchange = (e) => {
            state.trackedMonsters[mob.mobId] = e.target.checked;
            saveSettings();
            renderSpawnList();
        };

        const totalLines = mob.mobMapTotalChannels[regionName] || 0;
        const name = mob.gameMobName || mob.mobName;

        const label = document.createElement('label');
        label.htmlFor = checkbox.id;
        label.textContent = `${name} [${mob.mobMapName}] (${totalLines} Lines)`;

        item.appendChild(checkbox);
        item.appendChild(label);
        monstersContainer.appendChild(item);
    });
    
    container.appendChild(monstersContainer);
}

/**
 * Calculates the age of a status update in minutes
 * @param {Date|string|null|undefined} updateTimestamp - The timestamp to calculate age from
 * @param {Date} now - Current date/time
 * @returns {number|null} - Age in minutes, or null if no timestamp
 */
function getStatusAgeMinutes(updateTimestamp, now) {
    if (!updateTimestamp) {
        return null;
    }
    
    const updateDate = updateTimestamp instanceof Date 
        ? updateTimestamp 
        : new Date(updateTimestamp);
    return (now - updateDate) / 60000;
}

/**
 * Checks if a monster should show assumed respawn (respawn timer hit 0 within last 5 minutes)
 * @param {Object} mob - Mob descriptor object
 * @param {Date} now - Current date/time
 * @returns {Object|null} - Returns { assumedRespawnTime: Date } if should show assumed respawn, null otherwise
 */
function getMonsterAssumedRespawn(mob, now) {
    // Only apply to monsters with respawn_time > 0
    if (!mob.mobRespawnTime || mob.mobRespawnTime === 0) {
        return null;
    }
    
    // Calculate when the respawn should have occurred
    // respawn_time is the minute of the hour (0 = :00, 30 = :30, etc.)
    const lastRespawn = new Date(now);
    lastRespawn.setMinutes(mob.mobRespawnTime, 0, 0);
    if (now < lastRespawn) {
        // If the respawn time hasn't occurred yet this hour, check the previous hour
        lastRespawn.setHours(lastRespawn.getHours() - 1);
    }
    
    // Check if respawn timer has hit 0 (respawn should have occurred)
    // The respawn timer hits 0 when the respawn time has passed
    const timeSinceRespawn = now - lastRespawn;
    const minutesSinceRespawn = timeSinceRespawn / 60000;
    
    // If respawn occurred within the last 5 minutes (timer hit 0 and within 5 min window), show assumed 100%
    if (minutesSinceRespawn >= 0 && minutesSinceRespawn <= 5) {
        return {
            assumedRespawnTime: lastRespawn,
        };
    }
    
    return null;
}

/**
 * Checks if a channel should show assumed 100% health after respawn
 * @param {Object} status - Status descriptor object (can be null/undefined for no data)
 * @param {Object} mob - Mob descriptor object
 * @param {Date} now - Current date/time
 * @returns {Object|null} - Returns { assumedRespawnTime: Date } if should show 100%, null otherwise
 */
function getAssumedRespawn(status, mob, now) {
    const monsterAssumedRespawn = getMonsterAssumedRespawn(mob, now);
    if (!monsterAssumedRespawn) {
        return null;
    }
    
    // If no status data, still show assumed respawn
    if (!status) {
        return monsterAssumedRespawn;
    }
    
    // Only apply to channels that were previously dead or unknown/stale
    const ageMinutes = getStatusAgeMinutes(status.updateTimestamp, now);
    const wasDead = status.lastHp === 0;
    const wasUnknownOrStale = ageMinutes !== null && ageMinutes > 5 && status.lastHp !== undefined && status.lastHp !== null && status.lastHp > 0;
    
    if (!wasDead && !wasUnknownOrStale) {
        return null;
    }
    
    return monsterAssumedRespawn;
}

/**
 * Determines if a status entry is considered stale
 * @param {Object} status - Status descriptor object
 * @param {Date} now - Current date/time
 * @param {Date|null} assumedRespawnTime - Assumed respawn time if channel is showing assumed 100%
 * @returns {boolean} - True if the status is stale
 */
function isStatusStale(status, now, assumedRespawnTime = null) {
    if (!status.updateTimestamp) {
        // No timestamp means stale if HP is not 0
        return status.lastHp !== undefined && status.lastHp !== null && status.lastHp > 0;
    }
    
    const ageMinutes = getStatusAgeMinutes(status.updateTimestamp, now);
    
    // Stale if:
    // - Age > 15 minutes, OR
    // - Age > 5 minutes with HP > 0 (unknown), OR
    // - HP is undefined/null/0
    return ageMinutes > 15 || 
           (ageMinutes > 5 && status.lastHp !== undefined && status.lastHp !== null && status.lastHp > 0) ||
           status.lastHp === undefined || 
           status.lastHp === null || 
           status.lastHp === 0;
}

function renderSpawnList() {
    const container = document.getElementById('spawnList');
    container.innerHTML = '';

    const regionName = state.bptimerRegions[state.selectedRegionIndex] || 'NA';
    const now = new Date();

    state.mobsDescriptors.forEach(mob => {
        if (!state.trackedMonsters[mob.mobId]) return;

        const group = document.createElement('div');
        group.className = 'mob-group';

        const header = document.createElement('div');
        header.className = 'mob-header';

        const name = document.createElement('div');
        name.className = 'mob-name';
        const displayName = mob.gameMobName || mob.mobName;
        name.textContent = displayName;

        const map = document.createElement('span');
        map.className = 'mob-map';
        map.textContent = `[${mob.mobMapName}]`;

        header.appendChild(name);
        name.appendChild(map);

        // Always show respawn time next to mob-map in header
        // respawn_time is the minute of the hour (0 = :00, 30 = :30, etc.)
        const respawn = document.createElement('span');
        respawn.className = 'mob-respawn-time';
        respawn.textContent = formatRespawnCountdown(mob, now);
        
        // Change color to red if countdown is under 1 minute
        if (mob.mobRespawnTime !== undefined && mob.mobRespawnTime !== null) {
            const { diff } = timeUntilOccurrence(now, mob.mobRespawnTime);
            const totalSeconds = diff.minutes * 60 + diff.seconds;
            if (totalSeconds < 60) {
                respawn.classList.add('respawn-urgent');
            }
        }
        
        name.appendChild(respawn);

        const channels = document.createElement('div');
        channels.className = 'mob-channels';

        const orderByIndex = document.getElementById('orderByIndexCheck')?.checked || false;
        const hideStale = document.getElementById('hideStaleCheck')?.checked || false;
        
        const statuses = state.statusDescriptors
            .filter(s => {
                // Filter by mobId and region
                if (s.mobId !== mob.mobId || s.region !== regionName) {
                    return false;
                }
                // If "Order by Index" is checked, filter out dead and unknown statuses
                if (orderByIndex) {
                    if (s.lastHp === 0) {
                        return false; // Filter out dead
                    }
                }
                // Check if channel should show assumed 100% after respawn
                const assumedRespawn = getAssumedRespawn(s, mob, now);
                
                // If "Hide Stale" is checked, filter out stale channels
                // Use assumed respawn time for stale calculation if applicable
                if (hideStale && isStatusStale(s, now, assumedRespawn?.assumedRespawnTime)) {
                    return false; // Filter out stale channels
                }
                // Filter out stale data: if status is > 30 minutes old and HP is not 0, exclude it
                // (This prevents showing "alive" status for monsters that haven't been updated in a long time)
                if (s.updateTimestamp) {
                    const ageMinutes = getStatusAgeMinutes(s.updateTimestamp, now);
                    // Exclude stale "alive" data older than 30 minutes
                    // Keep dead status (HP = 0) even if old, as it's still valid information
                    if (ageMinutes !== null && ageMinutes > 30 && s.lastHp !== 0) {
                        return false; // Exclude stale "alive" data
                    }
                } else if (s.lastHp !== 0) {
                    // If there's no timestamp but HP is not 0, exclude it (likely stale/invalid)
                    return false;
                }
                return true;
            })
            .sort((a, b) => {
                if (orderByIndex) {
                    return a.channelNumber - b.channelNumber;
                }
                // Sort by recency, dead last
                const aAge = getStatusAgeMinutes(a.updateTimestamp, now) ?? 999;
                const bAge = getStatusAgeMinutes(b.updateTimestamp, now) ?? 999;
                if (aAge > 5 && a.lastHp !== 0) return 1;
                if (bAge > 5 && b.lastHp !== 0) return -1;
                if (a.lastHp === 0) return 1;
                if (b.lastHp === 0) return -1;
                return a.lastHp - b.lastHp;
            });

        const limit = parseInt(document.getElementById('channelLimitSlider')?.value || 5);
        const displayStatuses = limit > 0 ? statuses.slice(0, limit) : statuses;

        // Check if monster should show assumed respawn channels (even with no data)
        const monsterAssumedRespawn = getMonsterAssumedRespawn(mob, now);
        
        if (displayStatuses.length === 0) {
            // If no status data but respawn timer hit 0, create assumed channels
            if (monsterAssumedRespawn) {
                // Get total channels for this region from mobMapTotalChannels
                const totalChannels = mob.mobMapTotalChannels?.[regionName] || 0;
                
                // If we don't have channel data, create channels 1-15 as fallback
                const maxChannels = totalChannels > 0 ? totalChannels : 15;
                const channelsToShow = Array.from({ length: maxChannels }, (_, i) => i + 1);
                
                channelsToShow.slice(0, limit > 0 ? limit : channelsToShow.length).forEach(channelNumber => {
                    // Create a dummy status object for assumed respawn
                    const assumedStatus = {
                        mobId: mob.mobId,
                        channelNumber: channelNumber,
                        updateTimestamp: null,
                        lastHp: 100,
                        region: regionName,
                    };
                    const channelItem = createChannelItem(mob, assumedStatus, now);
                    channels.appendChild(channelItem);
                });
            } else {
                const noChannels = document.createElement('div');
                noChannels.className = 'no-channels';
                noChannels.textContent = 'No channel data available';
                channels.appendChild(noChannels);
            }
        } else {
            displayStatuses.forEach(status => {
                const channelItem = createChannelItem(mob, status, now);
                channels.appendChild(channelItem);
            });
        }

        group.appendChild(header);
        group.appendChild(channels);
        container.appendChild(group);
    });
}

function createChannelItem(mob, status, now) {
    const item = document.createElement('div');
    item.className = 'channel-item';
    
    const channelNumber = document.createElement('span');
    channelNumber.className = 'channel-number';
    channelNumber.textContent = status.channelNumber;
    item.appendChild(channelNumber);

    // Check if channel should show assumed 100% after respawn
    const assumedRespawn = getAssumedRespawn(status, mob, now);
    const assumedHp = assumedRespawn ? 100 : null;
    
    // Use assumed HP if available and no newer report with lower HP
    // Immediately override if there's a report with lower health
    const hasReportWithLowerHp = status.lastHp !== undefined && status.lastHp !== null && status.lastHp > 0 && status.lastHp < 100;
    const hp = (assumedHp !== null && !hasReportWithLowerHp) 
        ? assumedHp 
        : status.lastHp;
    
    // Calculate age in minutes - use assumed respawn time if applicable
    const baseTime = assumedRespawn?.assumedRespawnTime || status.updateTimestamp;
    const age = getStatusAgeMinutes(baseTime, now) ?? 999;
    const updateDate = status.updateTimestamp 
        ? (status.updateTimestamp instanceof Date 
            ? status.updateTimestamp 
            : new Date(status.updateTimestamp))
        : null;
    const isUnknown = age > 5 && hp !== 0;
    const isDead = hp === 0;
    // Use the reusable stale check function with assumed respawn time
    const isStale = isStatusStale(status, now, assumedRespawn?.assumedRespawnTime);
    
    // Mark as assumed if showing assumed 100%
    const isAssumed = assumedRespawn !== null && hp === 100;

    // Add (?) indicator for stale data (only when HP > 0)
    if (isUnknown) {
        const staleIndicator = document.createElement('span');
        staleIndicator.className = 'stale-indicator';
        staleIndicator.textContent = ' (?)';
        staleIndicator.title = `Status data is ${Math.floor(age)} minutes old - may be outdated`;
        channelNumber.appendChild(staleIndicator);
    }

    // Create progress bar
    const progressBar = document.createElement('div');
    progressBar.className = 'channel-progress-bar';
    
    // Calculate HP percentage for progress bar (0-100)
    // Handle undefined/null HP values
    const hpValue = (hp !== undefined && hp !== null) ? hp : 0;
    const hpPercent = isDead ? 0 : (isUnknown ? 0 : hpValue);
    progressBar.style.width = `${hpPercent}%`;
    
    // Set color based on HP
    if (isAssumed) {
        item.classList.add('assumed');
    } else if (isUnknown) {
        item.classList.add('unknown');
        progressBar.classList.add('progress-unknown');
    } else if (isDead) {
        item.classList.add('dead');
        progressBar.classList.add('progress-dead');
    } else if (hp < 20) {
        item.classList.add('critical', 'low');
        progressBar.classList.add('progress-low');
    } else if (hp < 60) {
        item.classList.add('medium');
        progressBar.classList.add('progress-medium');
    } else {
        item.classList.add('high');
        progressBar.classList.add('progress-high');
    }
    
    // Set progress bar color for assumed channels
    if (isAssumed) {
        progressBar.classList.add('progress-high');
    }
    
    item.appendChild(progressBar);


    item.oncontextmenu = (e) => {
        e.preventDefault();
        if (confirm(`Report Line ${status.channelNumber} as dead?`)) {
            fetch(`${API_BASE}/bptimer/report/dead`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    monsterId: mob.monsterId,
                    line: status.channelNumber,
                }),
            }).then(() => {
                fetchBPTimerData();
            });
        }
    };

    // Calculate time ago string
    const getTimeAgo = (updateDate) => {
        if (!updateDate) return 'Unknown';
        const ageMs = now - updateDate;
        const ageMinutes = Math.floor(ageMs / 60000);
        const ageHours = Math.floor(ageMinutes / 60);
        const ageDays = Math.floor(ageHours / 24);
        
        if (ageDays > 0) {
            return `${ageDays} day${ageDays > 1 ? 's' : ''} ago`;
        } else if (ageHours > 0) {
            return `${ageHours} hour${ageHours > 1 ? 's' : ''} ago`;
        } else if (ageMinutes > 0) {
            return `${ageMinutes} minute${ageMinutes > 1 ? 's' : ''} ago`;
        } else {
            const ageSeconds = Math.floor(ageMs / 1000);
            return `${ageSeconds} second${ageSeconds !== 1 ? 's' : ''} ago`;
        }
    };

    const tooltip = document.createElement('div');
    tooltip.className = 'channel-tooltip';
    const updateDateStr = updateDate ? updateDate.toLocaleString() : '';
    const timeAgo = getTimeAgo(updateDate);
    
    if (isUnknown) {
        tooltip.textContent = `Unknown\n${updateDateStr}\nReported: ${timeAgo}`;
    } else if (isDead) {
        let tooltipText = `Dead\n${updateDateStr}\nReported: ${timeAgo}`;
        // respawn_time is the minute of the hour (0 = :00, 30 = :30, etc.)
        if (mob.mobRespawnTime !== undefined && mob.mobRespawnTime !== null && updateDate) {
            const deathTime = updateDate;
            // Calculate next occurrence of respawn_time minute after death
            const nextRespawn = new Date(deathTime);
            nextRespawn.setMinutes(mob.mobRespawnTime, 0, 0);
            if (nextRespawn <= deathTime) {
                // If the respawn time has already passed today, move to next hour
                nextRespawn.setHours(nextRespawn.getHours() + 1);
            }
            const timeUntilRespawn = Math.max(0, nextRespawn - now);
            const minutes = Math.floor(timeUntilRespawn / 60000);
            const seconds = Math.floor((timeUntilRespawn % 60000) / 1000);
            if (timeUntilRespawn > 0) {
                tooltipText += `\nRespawn in: ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
            }
        }
        tooltip.textContent = tooltipText;
    } else {
        // Handle undefined/null HP values
        const hpDisplay = (hp !== undefined && hp !== null) ? `${hp}%` : 'Unknown HP';
        let tooltipText = `${hpDisplay}`;
        if (isAssumed) {
            tooltipText += ` (Assumed after respawn)`;
        }
        tooltipText += `\n${updateDateStr}\nReported: ${timeAgo}`;
        if (isStale) {
            tooltipText += `\n⚠ Data is ${Math.floor(age)} minutes old`;
        }
        tooltip.textContent = tooltipText;
    }
    item.appendChild(tooltip);

    return item;
}

/**
 * Calculates the next respawn time and time until respawn for a monster
 * @param {Date} currentDateTime - Current date/time
 * @param {number} respawnTime - Respawn time in minutes (0-59, represents minute of the hour)
 * @returns {Object} - Object with { nextRespawn: Date, diff: { minutes: number, seconds: number } }
 */
function calculateRespawnTime(currentDateTime, respawnTime) {
    if (respawnTime === undefined || respawnTime === null) {
        return null;
    }
    
    const lastOccurrence = new Date(currentDateTime);
    lastOccurrence.setMinutes(respawnTime, 0, 0);
    if (currentDateTime < lastOccurrence) {
        lastOccurrence.setHours(lastOccurrence.getHours() - 1);
    }
    const nextOccurrence = new Date(lastOccurrence);
    nextOccurrence.setHours(nextOccurrence.getHours() + 1);

    const cycle = 60 * 60 * 1000; // 1 hour
    const elapsed = currentDateTime - lastOccurrence;
    const difference = nextOccurrence - currentDateTime;

    const pct = Math.round((1 - (elapsed / cycle)) * 10000) / 100;

    return {
        nextRespawn: nextOccurrence,
        diff: {
            minutes: Math.floor(difference / 60000),
            seconds: Math.floor((difference % 60000) / 1000),
        },
        pct: pct,
    };
}

function timeUntilOccurrence(currentDateTime, intervalMinutes) {
    const lastOccurrence = new Date(currentDateTime);
    lastOccurrence.setMinutes(intervalMinutes, 0, 0);
    if (currentDateTime < lastOccurrence) {
        lastOccurrence.setHours(lastOccurrence.getHours() - 1);
    }
    const nextOccurrence = new Date(lastOccurrence);
    nextOccurrence.setHours(nextOccurrence.getHours() + 1);

    const cycle = 60 * 60 * 1000; // 1 hour
    const elapsed = currentDateTime - lastOccurrence;
    const difference = nextOccurrence - currentDateTime;

    const pct = Math.round((1 - (elapsed / cycle)) * 10000) / 100;

    return {
        diff: {
            minutes: Math.floor(difference / 60000),
            seconds: Math.floor((difference % 60000) / 1000),
        },
        pct,
    };
}

/**
 * Formats the respawn countdown text for display
 * @param {Object} mob - Mob descriptor object with mobRespawnTime property
 * @param {Date} now - Current date/time
 * @returns {string} - Formatted respawn countdown text (e.g., " | Respawn: 05m 30s" or " | Respawn: Unknown")
 */
function formatRespawnCountdown(mob, now) {
    if (mob.mobRespawnTime !== undefined && mob.mobRespawnTime !== null) {
        const { diff } = timeUntilOccurrence(now, mob.mobRespawnTime);
        return ` | Respawn: ${String(diff.minutes).padStart(2, '0')}m ${String(diff.seconds).padStart(2, '0')}s`;
    } else {
        return ` | Respawn: Unknown`;
    }
}

// Event listeners
document.getElementById('reconnectBtn').onclick = () => {
    fetchBPTimerData();
};

document.getElementById('selectAllBtn').onclick = () => {
    // Only select monsters in the current category tab
    const filteredMobs = state.mobsDescriptors.filter(mob => {
        if (state.selectedCategory === 'all') {
            // Bosses tab: exclude magical creatures (piglet and nabo)
            return getMonsterCategory(mob) !== 'magical-creatures';
        }
        return getMonsterCategory(mob) === state.selectedCategory;
    });
    
    filteredMobs.forEach(mob => {
        state.trackedMonsters[mob.mobId] = true;
    });
    saveSettings();
    render();
};

document.getElementById('selectNoneBtn').onclick = () => {
    // Only deselect monsters in the current category tab
    const filteredMobs = state.mobsDescriptors.filter(mob => {
        if (state.selectedCategory === 'all') {
            // Bosses tab: exclude magical creatures (piglet and nabo)
            return getMonsterCategory(mob) !== 'magical-creatures';
        }
        return getMonsterCategory(mob) === state.selectedCategory;
    });
    
    filteredMobs.forEach(mob => {
        state.trackedMonsters[mob.mobId] = false;
    });
    saveSettings();
    render();
};

document.getElementById('orderByIndexCheck').onchange = () => {
    renderSpawnList();
};

document.getElementById('hideStaleCheck').onchange = () => {
    renderSpawnList();
};

document.getElementById('channelLimitSlider').oninput = (e) => {
    document.getElementById('channelLimitValue').textContent = e.target.value === '0' ? 'All' : e.target.value;
    renderSpawnList();
};

document.getElementById('collapseBtn').onclick = () => {
    state.collapseToContentOnly = !state.collapseToContentOnly;
    const content = document.getElementById('content');
    if (state.collapseToContentOnly) {
        content.querySelector('.controls-panel').style.display = 'none';
    } else {
        content.querySelector('.controls-panel').style.display = 'block';
    }
};

document.getElementById('closeBtn').onclick = () => {
    window.close();
};

// Poll for updates
setInterval(async () => {
    try {
        const res = await fetch(`${API_BASE}/bptimer/data`);
        const data = await res.json();
        if (data.code === 0) {
            // JSON_OK spreads properties directly, not under 'data'
            updateState(data);
            render();
        }
    } catch (error) {
        console.error('[SpawnTracker] Poll error:', error);
    }
}, 2000);

// Initialize
(async () => {
    await loadSettings();
    await fetchBPTimerData();
    if (state.spawnDataLoaded === SpawnDataLoadStatus.Complete) {
        await startRealtime();
    }
    render();
})();

