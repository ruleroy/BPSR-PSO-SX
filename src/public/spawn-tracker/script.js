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
    if (data && data.statusDescriptors !== undefined) state.statusDescriptors = data.statusDescriptors || [];
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

function renderMonsterFilters() {
    const container = document.getElementById('monsterFilters');
    container.innerHTML = '';

    const regionName = state.bptimerRegions[state.selectedRegionIndex] || 'NA';

    state.mobsDescriptors.forEach(mob => {
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
        container.appendChild(item);
    });
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

        if (mob.mobType === 'Boss') {
            const respawn = document.createElement('div');
            respawn.className = 'mob-respawn';
            const { diff, pct } = timeUntilOccurrence(now, mob.mobRespawnTime);
            respawn.textContent = `Respawn: ${String(diff.minutes).padStart(2, '0')}m ${String(diff.seconds).padStart(2, '0')}s`;
            header.appendChild(respawn);
        }

        const channels = document.createElement('div');
        channels.className = 'mob-channels';

        const statuses = state.statusDescriptors
            .filter(s => s.mobId === mob.mobId && s.region === regionName)
            .sort((a, b) => {
                const orderByIndex = document.getElementById('orderByIndexCheck')?.checked || false;
                if (orderByIndex) {
                    return a.channelNumber - b.channelNumber;
                }
                // Sort by recency, dead last
                const aAge = s.updateTimestamp ? (now - s.updateTimestamp) / 60000 : 999;
                const bAge = b.updateTimestamp ? (now - b.updateTimestamp) / 60000 : 999;
                if (aAge > 5 && a.lastHp !== 0) return 1;
                if (bAge > 5 && b.lastHp !== 0) return -1;
                if (a.lastHp === 0) return 1;
                if (b.lastHp === 0) return -1;
                return a.lastHp - b.lastHp;
            });

        const limit = parseInt(document.getElementById('channelLimitSlider')?.value || 5);
        const displayStatuses = limit > 0 ? statuses.slice(0, limit) : statuses;

        displayStatuses.forEach(status => {
            const channelItem = createChannelItem(mob, status, now);
            channels.appendChild(channelItem);
        });

        group.appendChild(header);
        group.appendChild(channels);
        container.appendChild(group);
    });
}

function createChannelItem(mob, status, now) {
    const item = document.createElement('div');
    item.className = 'channel-item';
    item.textContent = status.channelNumber;

    const hp = status.lastHp;
    const age = status.updateTimestamp ? (now - status.updateTimestamp) / 60000 : 999;
    const isUnknown = age > 5 && hp !== 0;
    const isDead = hp === 0;

    if (isUnknown) {
        item.classList.add('unknown');
    } else if (isDead) {
        item.classList.add('dead');
    } else if (hp < 20) {
        item.classList.add('critical', 'low');
    } else if (hp < 60) {
        item.classList.add('medium');
    } else {
        item.classList.add('high');
    }

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

    const tooltip = document.createElement('div');
    tooltip.className = 'channel-tooltip';
    if (isUnknown) {
        tooltip.textContent = `Unknown\n${status.updateTimestamp?.toLocaleString() || ''}`;
    } else if (isDead) {
        tooltip.textContent = `Dead\n${status.updateTimestamp?.toLocaleString() || ''}`;
    } else {
        tooltip.textContent = `${hp}%\n${status.updateTimestamp?.toLocaleString() || ''}`;
    }
    item.appendChild(tooltip);

    return item;
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

// Event listeners
document.getElementById('reconnectBtn').onclick = () => {
    fetchBPTimerData();
};

document.getElementById('selectAllBtn').onclick = () => {
    state.mobsDescriptors.forEach(mob => {
        state.trackedMonsters[mob.mobId] = true;
    });
    saveSettings();
    render();
};

document.getElementById('selectNoneBtn').onclick = () => {
    state.mobsDescriptors.forEach(mob => {
        state.trackedMonsters[mob.mobId] = false;
    });
    saveSettings();
    render();
};

document.getElementById('orderByIndexCheck').onchange = () => {
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

