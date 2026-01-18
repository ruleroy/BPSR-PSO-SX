// src/services/BPTimer/BPTimerManager.js
// ESM, Node 18+

import webManager from './WebManager.js';
import monsterNames from '../../tables/monster_names.json' with { type: 'json' };

const HOST = 'https://db.bptimer.com';
const API_KEY = 'o5he1b5mnykg5mursljw18dixak68h1ue9515dvuthoxtih79w';
const REPORT_HP_INTERVAL = 5; // Report every 5% HP change

// Supported entity IDs for reporting (will be updated from server)
let supportedEntityReportList = [
    10007, 10009, 10010, 10018, 10029, 10032, 10056,
    10059, 10069, 10077, 10081, 10084, 10085, 10086,
    10900, 10901, 10902, 10903, 10904,
];

export const SpawnDataLoadStatus = {
    NotLoaded: 0,
    InProgress: 1,
    Complete: 2,
    Error: 3,
    Cancelled: 4,
};

class BPTimerManager {
    constructor(settingsManager, instanceTracker, userDataManager) {
        this.settingsManager = settingsManager;
        this.instanceTracker = instanceTracker;
        this.userDataManager = userDataManager;

        this.spawnDataLoaded = SpawnDataLoadStatus.NotLoaded;
        this.spawnDataRealtimeConnection = SpawnDataLoadStatus.NotLoaded;
        this.mobsDescriptors = [];
        this.statusDescriptors = [];
        this.bptimerRegions = [];

        this.lastSentRequest = null;
        this.realtimeAbortController = null;
        this.isEncounterBound = false;

        // Event emitters (simple callback system)
        this.onEntityHpUpdatedCallbacks = [];
    }

    /**
     * Initialize bindings - hook into entity HP updates
     */
    initializeBindings() {
        // This will be called from PacketProcessor when entity HP changes
        console.log('[BPTimer] InitializeBindings');
    }

    /**
     * Called when entity HP is updated
     * @param {number} entityUuid - Entity UUID
     * @param {number} entityId - Entity ID (AttrId)
     * @param {number} hp - Current HP
     * @param {number} maxHp - Max HP
     */
    onEntityHpUpdated(entityUuid, entityId, hp, maxHp) {
        // Only care about updates while in Open World
        const isOpenWorld = this.isOpenWorld();
        if (!isOpenWorld) {
            return;
        }

        const channelLine = this.instanceTracker?.currentLineId || 0;
        if (channelLine <= 0) {
            return;
        }

        if (!supportedEntityReportList.includes(entityId)) {
            return;
        }

        // Check if reporting is enabled
        if (!this.settingsManager?.get('bptimer.enabled')) {
            return;
        }

        if (!this.settingsManager?.get('bptimer.fieldBossHpReportsEnabled')) {
            return;
        }

        this.sendHpReport(entityUuid, entityId, hp, maxHp, channelLine);
    }

    /**
     * Check if currently in open world (not dungeon)
     */
    isOpenWorld() {
        if (!this.instanceTracker) return false;
        
        // If there's a dungeonGuid, levelUuid, sceneGuid, or recordId, it's a dungeon
        const scene = this.instanceTracker._scene || {};
        const isDungeon = !!(scene.dungeonGuid || scene.levelUuid || scene.sceneGuid || scene.recordId);
        
        return !isDungeon;
    }

    /**
     * Send HP report to BPTimer
     */
    async sendHpReport(entityUuid, entityId, hp, maxHp, line) {
        if (!maxHp || maxHp <= 0) return;

        const hpPct = Math.round((hp / maxHp) * 100);
        const canReport = 
            hpPct % REPORT_HP_INTERVAL === 0 &&
            (this.lastSentRequest?.hpPct !== hpPct ||
             this.lastSentRequest?.monsterId !== entityId ||
             this.lastSentRequest?.line !== line);

        if (!canReport) return;

        const entity = this.userDataManager?.enemyCache?.hp?.has(entityUuid)
            ? {
                hp: this.userDataManager.enemyCache.hp.get(entityUuid),
                maxHp: this.userDataManager.enemyCache.maxHp.get(entityUuid) || maxHp,
                position: null, // TODO: Get position if available
            }
            : { hp, maxHp, position: null };

        const hasPositionData = entity.position != null;

        const report = {
            monster_id: entityId,
            hp_pct: hpPct,
            line: line,
            pos_x: hasPositionData ? entity.position.x : null,
            pos_y: hasPositionData ? entity.position.y : null,
            pos_z: hasPositionData ? entity.position.z : null,
            account_id: null, // TODO: Get account ID if available
            uid: this.settingsManager?.get('bptimer.includeCharacterId')
                ? this.instanceTracker?.currentPlayerUid || null
                : null,
        };

        this.lastSentRequest = report;

        try {
            await webManager.submitHpReport(report);
        } catch (error) {
            console.error('[BPTimer] SendHpReport error:', error);
        }
    }

    /**
     * Send force dead report
     */
    async sendForceDeadReport(entityId, line) {
        if (!this.settingsManager?.get('bptimer.enabled')) return;
        if (!this.settingsManager?.get('bptimer.fieldBossHpReportsEnabled')) return;

        const canReport = 
            this.lastSentRequest?.hpPct !== 0 ||
            this.lastSentRequest?.monsterId !== entityId ||
            this.lastSentRequest?.line !== line;

        if (!canReport) return;

        const report = {
            monster_id: entityId,
            hp_pct: 0,
            line: line,
            pos_x: null,
            pos_y: null,
            pos_z: null,
            account_id: null,
            uid: this.settingsManager?.get('bptimer.includeCharacterId')
                ? this.instanceTracker?.currentPlayerUid || null
                : null,
        };

        this.lastSentRequest = report;

        try {
            await webManager.submitHpReport(report);
        } catch (error) {
            console.error('[BPTimer] SendForceDeadReport error:', error);
        }
    }

    /**
     * Fetch all mobs from BPTimer
     */
    async fetchAllMobs() {
        this.spawnDataLoaded = SpawnDataLoadStatus.InProgress;
        this.mobsDescriptors = [];
        this.statusDescriptors = [];

        try {
            // Fetch mobs
            const mobs = await webManager.fetchAllMobs(
                `${HOST}/api/collections/mobs/records?page=1&perPage=100&sort=uid&expand=map&skipTotal=1`
            );

            if (!mobs || !mobs.items) {
                console.error('[BPTimer] FetchAllMobs: No data received');
                this.spawnDataLoaded = SpawnDataLoadStatus.Error;
                return;
            }

            // Fetch mob channel status (paginated)
            const statusItems = [];
            let pageNum = 1;
            const itemsPerPage = 200;

            while (true) {
                const statusResponse = await webManager.fetchMobChannelStatus(
                    `${HOST}/api/collections/mob_channel_status/records?page=${pageNum}&perPage=${itemsPerPage}&skipTotal=1`
                );

                if (!statusResponse || !statusResponse.items) {
                    break;
                }

                statusItems.push(...statusResponse.items);
                if (statusResponse.items.length < itemsPerPage) {
                    break;
                }
                pageNum++;
            }

            if (statusItems.length === 0) {
                console.error('[BPTimer] FetchAllMobs: No status data received');
                this.spawnDataLoaded = SpawnDataLoadStatus.Error;
                return;
            }

            // Process mobs - monster names are already imported at top of file

            for (const mob of mobs.items) {
                const monsterId = mob.monster_id;
                const gameMonsterName = monsterNames[String(monsterId)] || '';

                const regionData = mob.expand?.map?.region_data || {};
                for (const region of Object.keys(regionData)) {
                    if (!this.bptimerRegions.includes(region)) {
                        this.bptimerRegions.push(region);
                    }
                }

                this.mobsDescriptors.push({
                    mobId: mob.id,
                    mobName: mob.name,
                    mobType: mob.type,
                    mobRespawnTime: mob.respawn_time,
                    mobUID: mob.uid,
                    mobMapId: mob.expand?.map?.id || '',
                    mobMapName: mob.expand?.map?.name || '',
                    mobMapTotalChannels: regionData,
                    mobMapUID: mob.expand?.map?.uid || 0,
                    hasMultipleLocations: mob.location || false,
                    monsterId: monsterId,
                    gameMobName: gameMonsterName,
                });
            }

            // Process status
            for (const status of statusItems) {
                const lastUpdate = status.last_update || status.update || '';
                const mob = this.mobsDescriptors.find(m => m.mobId === status.mob);
                const monsterId = mob ? mob.monsterId : 0;

                this.statusDescriptors.push({
                    mobId: status.mob,
                    channelNumber: status.channel_number,
                    updateTime: lastUpdate,
                    lastHp: status.last_hp,
                    updateTimestamp: lastUpdate
                        ? new Date(lastUpdate)
                        : null,
                    location: status.location_image || '',
                    monsterId: monsterId,
                    region: status.region || 'NA',
                });
            }

            this.spawnDataLoaded = SpawnDataLoadStatus.Complete;
            console.log(`[BPTimer] FetchAllMobs complete: ${this.mobsDescriptors.length} mobs, ${this.statusDescriptors.length} statuses`);
        } catch (error) {
            console.error('[BPTimer] FetchAllMobs error:', error);
            console.error('[BPTimer] Error stack:', error.stack);
            this.spawnDataLoaded = SpawnDataLoadStatus.Error;
            throw error; // Re-throw so API route can catch it
        }
    }

    /**
     * Fetch supported mob list to update entity report list
     */
    async fetchSupportedMobList() {
        try {
            const mobs = await webManager.fetchAllMobs(
                `${HOST}/api/collections/mobs/records?page=1&perPage=100&sort=monster_id&expand=map&skipTotal=1`
            );

            if (!mobs || !mobs.items) {
                console.error('[BPTimer] FetchSupportedMobList: No data received');
                return;
            }

            const idList = [];
            for (const mob of mobs.items) {
                const id = Number(mob.monster_id);
                if (!isNaN(id) && !idList.includes(id)) {
                    idList.push(id);
                }
            }

            if (idList.length > 0) {
                supportedEntityReportList = idList;
                console.log(`[BPTimer] Updated supported entity list: ${idList.length} entities`);
            }
        } catch (error) {
            console.error('[BPTimer] FetchSupportedMobList error:', error);
        }
    }

    /**
     * Start realtime SSE connection
     */
    startRealtime(selectedRegion) {
        if (this.realtimeAbortController) {
            this.realtimeAbortController.abort();
        }

        this.realtimeAbortController = new AbortController();
        this.spawnDataRealtimeConnection = SpawnDataLoadStatus.InProgress;

        const region = this.bptimerRegions[selectedRegion] || 'NA';

        (async () => {
            while (!this.realtimeAbortController.signal.aborted) {
                try {
                    await webManager.openRealtimeStream(
                        `${HOST}/api/realtime`,
                        API_KEY,
                        region,
                        this.realtimeAbortController,
                        (eventType, data) => {
                            this.handleRealtimeEvent(eventType, data, region);
                        }
                    );
                } catch (error) {
                    if (error.name !== 'AbortError') {
                        console.error('[BPTimer] Realtime stream error:', error);
                        this.spawnDataRealtimeConnection = SpawnDataLoadStatus.Error;
                        // Retry after delay
                        await new Promise(resolve => setTimeout(resolve, 5000));
                    }
                }
            }
        })();

        return this.realtimeAbortController;
    }

    /**
     * Handle realtime SSE events
     */
    handleRealtimeEvent(eventType, data, region) {
        if (eventType === 'PB_CONNECT') {
            const clientId = data.clientId;
            webManager.subscribe(`${HOST}/api/realtime`, clientId, API_KEY, region)
                .then(success => {
                    if (success) {
                        console.log(`[BPTimer] Connected to realtime. Client ID: ${clientId}`);
                        this.spawnDataRealtimeConnection = SpawnDataLoadStatus.Complete;
                    } else {
                        console.error('[BPTimer] Failed to subscribe to realtime');
                        this.spawnDataRealtimeConnection = SpawnDataLoadStatus.Error;
                    }
                });
        } else if (eventType.startsWith('mob_hp_updates')) {
            const updates = Array.isArray(data) ? data : [data];
            this.handleMobHpUpdateEvent(updates, region);
        } else if (eventType.startsWith('mob_resets')) {
            const resets = Array.isArray(data) ? data : [];
            this.handleMobResetEvent(resets, region);
        }
    }

    /**
     * Handle mob HP update events
     */
    handleMobHpUpdateEvent(updates, region) {
        for (const update of updates) {
            const mobId = update[0] || update.mobId;
            const channel = update[1] || update.channel;
            const hp = update[2] || update.hp;
            const location = update[3] || update.location || null;

            const idx = this.statusDescriptors.findIndex(
                s => s.mobId === mobId && s.channelNumber === channel && s.region === region
            );

            const timestamp = new Date();

            if (idx >= 0) {
                this.statusDescriptors[idx].lastHp = hp;
                this.statusDescriptors[idx].updateTime = timestamp.toISOString();
                this.statusDescriptors[idx].updateTimestamp = timestamp;
                if (location) {
                    this.statusDescriptors[idx].location = location;
                }
            } else {
                const mob = this.mobsDescriptors.find(m => m.mobId === mobId);
                const monsterId = mob ? mob.monsterId : 0;

                this.statusDescriptors.push({
                    mobId: mobId,
                    channelNumber: channel,
                    lastHp: hp,
                    updateTime: timestamp.toISOString(),
                    updateTimestamp: timestamp,
                    location: location || '',
                    monsterId: monsterId,
                    region: region,
                });
            }
        }
    }

    /**
     * Handle mob reset events
     */
    handleMobResetEvent(resets, region) {
        for (const mobId of resets) {
            for (const status of this.statusDescriptors) {
                if (status.mobId === mobId && status.region === region) {
                    const timestamp = new Date();
                    status.lastHp = 100;
                    status.updateTime = timestamp.toISOString();
                    status.updateTimestamp = timestamp;
                }
            }
        }
    }

    /**
     * Stop realtime connection
     */
    stopRealtime() {
        if (this.realtimeAbortController) {
            this.realtimeAbortController.abort();
            this.realtimeAbortController = null;
        }
        this.spawnDataRealtimeConnection = SpawnDataLoadStatus.Cancelled;
    }
}

let bptimerManagerInstance = null;

export function getBPTimerManager(settingsManager, instanceTracker, userDataManager) {
    if (!bptimerManagerInstance) {
        bptimerManagerInstance = new BPTimerManager(settingsManager, instanceTracker, userDataManager);
    }
    return bptimerManagerInstance;
}

export default BPTimerManager;

