// src/services/BPTimer/WebManager.js
// ESM, Node 18+

const HOST = 'https://db.bptimer.com';
const API_KEY = 'o5he1b5mnykg5mursljw18dixak68h1ue9515dvuthoxtih79w';

class BPTimerWebManager {
    constructor() {
        this.userAgent = 'BPSR-PSO-SX/0.2.0';
    }

    /**
     * Submit HP report to BPTimer
     * @param {Object} report - BPTimerHpReport object
     * @returns {Promise<Response>}
     */
    async submitHpReport(report) {
        try {
            const response = await fetch(`${HOST}/api/create-hp-report`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': API_KEY,
                    'User-Agent': this.userAgent,
                },
                body: JSON.stringify(report),
            });

            if (!response.ok) {
                const text = await response.text();
                console.error(`[BPTimer] HP report failed: ${response.status} ${text}`);
            }

            return response;
        } catch (error) {
            console.error('[BPTimer] SubmitHpReport error:', error);
            throw error;
        }
    }

    /**
     * Fetch all mobs from BPTimer
     * @param {string} endpoint - Full URL endpoint
     * @returns {Promise<Object|null>}
     */
    async fetchAllMobs(endpoint) {
        try {
            const response = await fetch(endpoint, {
                headers: {
                    'User-Agent': this.userAgent,
                },
            });

            if (!response.ok) {
                const errorText = await response.text().catch(() => '');
                console.error(`[BPTimer] FetchAllMobs failed: ${response.status} ${response.statusText}`);
                console.error(`[BPTimer] Response body: ${errorText.substring(0, 200)}`);
                return null;
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('[BPTimer] FetchAllMobs error:', error);
            console.error('[BPTimer] Error details:', {
                message: error.message,
                stack: error.stack,
                endpoint,
            });
            return null;
        }
    }

    /**
     * Fetch mob channel status from BPTimer
     * @param {string} endpoint - Full URL endpoint
     * @returns {Promise<Object|null>}
     */
    async fetchMobChannelStatus(endpoint) {
        try {
            const response = await fetch(endpoint, {
                headers: {
                    'User-Agent': this.userAgent,
                },
            });

            if (!response.ok) {
                const errorText = await response.text().catch(() => '');
                console.error(`[BPTimer] FetchMobChannelStatus failed: ${response.status} ${response.statusText}`);
                console.error(`[BPTimer] Response body: ${errorText.substring(0, 200)}`);
                return null;
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('[BPTimer] FetchMobChannelStatus error:', error);
            console.error('[BPTimer] Error details:', {
                message: error.message,
                stack: error.stack,
                endpoint,
            });
            return null;
        }
    }

    /**
     * Open realtime SSE stream
     * @param {string} endpoint - Full URL endpoint
     * @param {string} apiKey - API key
     * @param {string} userRegion - Selected region
     * @param {AbortController} abortController - Abort controller for cancellation
     * @param {Function} onMessage - Callback for SSE messages
     * @returns {Promise<void>}
     */
    async openRealtimeStream(endpoint, apiKey, userRegion, abortController, onMessage) {
        try {
            const response = await fetch(endpoint, {
                method: 'GET',
                headers: {
                    'Accept': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'X-API-Key': apiKey,
                    'User-Agent': this.userAgent,
                },
                signal: abortController.signal,
            });

            if (!response.ok) {
                console.error(`[BPTimer] OpenRealtimeStream failed: ${response.status}`);
                throw new Error(`HTTP ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                if (abortController.signal.aborted) {
                    reader.cancel();
                    return;
                }

                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                let eventType = null;
                let data = '';

                for (const line of lines) {
                    if (line.startsWith('event:')) {
                        eventType = line.substring(6).trim();
                    } else if (line.startsWith('data:')) {
                        data += line.substring(5).trim();
                    } else if (line === '') {
                        if (eventType && data) {
                            try {
                                const parsed = JSON.parse(data);
                                onMessage(eventType, parsed);
                            } catch (e) {
                                console.error('[BPTimer] Failed to parse SSE data:', e, data);
                            }
                            eventType = null;
                            data = '';
                        }
                    }
                }
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('[BPTimer] Realtime stream cancelled');
            } else {
                console.error('[BPTimer] OpenRealtimeStream error:', error);
                throw error;
            }
        }
    }

    /**
     * Subscribe to BPTimer realtime topics
     * @param {string} endpoint - Full URL endpoint
     * @param {string} clientId - Client ID from PB_CONNECT
     * @param {string} apiKey - API key
     * @param {string} userRegion - Selected region
     * @returns {Promise<boolean>}
     */
    async subscribe(endpoint, clientId, apiKey, userRegion) {
        try {
            const topics = ['mob_hp_updates', 'mob_resets'];
            const regionTopics = userRegion && userRegion !== 'NA'
                ? topics.map(t => `${t}_${userRegion.toLowerCase()}`)
                : topics;

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': apiKey,
                    'User-Agent': this.userAgent,
                },
                body: JSON.stringify({
                    clientId,
                    subscriptions: regionTopics,
                }),
            });

            if (!response.ok) {
                const text = await response.text();
                console.error(`[BPTimer] Subscribe failed: ${response.status} ${text}`);
                return false;
            }

            return true;
        } catch (error) {
            console.error('[BPTimer] Subscribe error:', error);
            return false;
        }
    }
}

export const webManager = new BPTimerWebManager();
export default webManager;

