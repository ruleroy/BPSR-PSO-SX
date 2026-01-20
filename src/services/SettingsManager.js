// src/services/SettingsManager.js
// ESM, Node 18+

import fsPromises from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { app } from 'electron';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class SettingsManager {
    constructor(settingsPath) {
        this.settingsPath = settingsPath;
        this.settings = null;
        this.defaultSettings = {
            bptimer: {
                enabled: false,
                includeCharacterId: false,
                fieldBossHpReportsEnabled: false,
            },
            spawnTracker: {
                opacity: 100,
                textScale: 1.0,
                lineScale: 1.0,
                displayLineCountLimit: 5,
                selectedRegionIndex: 0,
                orderLinesByIndex: false,
                trackedMonsters: {},
                windowPosition: null,
                windowSize: { width: 700, height: 600 },
                topMost: false,
            },
        };
    }

    async init() {
        await this.load();
    }

    async load() {
        try {
            const dir = path.dirname(this.settingsPath);
            await fsPromises.mkdir(dir, { recursive: true });
            
            try {
                const data = await fsPromises.readFile(this.settingsPath, 'utf8');
                const loaded = JSON.parse(data);
                this.settings = { ...this.defaultSettings, ...loaded };
            } catch (error) {
                if (error.code === 'ENOENT') {
                    // File doesn't exist, use defaults
                    this.settings = { ...this.defaultSettings };
                    await this.save();
                } else {
                    throw error;
                }
            }
        } catch (error) {
            console.error('[SettingsManager] Failed to load settings:', error);
            this.settings = { ...this.defaultSettings };
        }
    }

    async save() {
        try {
            const dir = path.dirname(this.settingsPath);
            await fsPromises.mkdir(dir, { recursive: true });
            await fsPromises.writeFile(
                this.settingsPath,
                JSON.stringify(this.settings, null, 2),
                'utf8'
            );
        } catch (error) {
            console.error('[SettingsManager] Failed to save settings:', error);
        }
    }

    get(path) {
        if (!this.settings) return null;
        const keys = path.split('.');
        let value = this.settings;
        for (const key of keys) {
            if (value == null) return null;
            value = value[key];
        }
        return value;
    }

    set(path, value) {
        if (!this.settings) this.settings = { ...this.defaultSettings };
        const keys = path.split('.');
        const lastKey = keys.pop();
        let target = this.settings;
        for (const key of keys) {
            if (target[key] == null) target[key] = {};
            target = target[key];
        }
        target[lastKey] = value;
        // Auto-save on change
        this.save().catch(err => console.error('[SettingsManager] Auto-save failed:', err));
    }

    getAll() {
        return this.settings || { ...this.defaultSettings };
    }
}

let settingsManagerInstance = null;

export function getSettingsManager(settingsPath) {
    if (!settingsManagerInstance) {
        settingsManagerInstance = new SettingsManager(settingsPath);
    }
    return settingsManagerInstance;
}

export default SettingsManager;

