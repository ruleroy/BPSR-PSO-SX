// src/client/SpawnTrackerWindow.js
// CommonJS (like Window.js)

const { BrowserWindow, app } = require('electron');
const path = require('path');
const fs = require('fs');

const iconPath = fs.existsSync(path.join(__dirname, '../resources/app.ico'))
    ? path.join(__dirname, '../resources/app.ico')
    : path.join(process.cwd(), 'resources', 'app.ico');
const preloadPath = path.join(__dirname, '../preload.cjs');
const htmlPath = path.join(__dirname, '../public/spawn-tracker/index.html');

class SpawnTrackerWindow {
    _window = null;
    _saveTimeout = null;
    defaultConfig = {
        width: 700,
        height: 600,
        x: undefined,
        y: undefined,
    };

    _getSettingsPath() {
        const userDataDir = app.getPath('userData');
        return path.join(userDataDir, 'settings.json');
    }

    _loadWindowConfig() {
        try {
            const settingsPath = this._getSettingsPath();
            if (!fs.existsSync(settingsPath)) {
                return { ...this.defaultConfig, topMost: false };
            }
            const settingsData = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            const spawnTracker = settingsData.spawnTracker || {};
            const windowSize = spawnTracker.windowSize || {};
            const windowPosition = spawnTracker.windowPosition;
            
            return {
                width: windowSize.width || this.defaultConfig.width,
                height: windowSize.height || this.defaultConfig.height,
                x: windowPosition?.x !== undefined ? windowPosition.x : this.defaultConfig.x,
                y: windowPosition?.y !== undefined ? windowPosition.y : this.defaultConfig.y,
                topMost: spawnTracker.topMost ?? false,
            };
        } catch (error) {
            console.error('[SpawnTrackerWindow] Failed to load window config:', error);
            return { ...this.defaultConfig, topMost: false };
        }
    }

    _saveWindowConfig() {
        if (!this._window || this._window.isDestroyed()) {
            return;
        }
        
        try {
            const bounds = this._window.getBounds();
            const settingsPath = this._getSettingsPath();
            
            // Load existing settings
            let settingsData = {};
            if (fs.existsSync(settingsPath)) {
                try {
                    settingsData = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
                } catch (error) {
                    console.error('[SpawnTrackerWindow] Failed to read existing settings:', error);
                }
            }
            
            // Update spawnTracker section
            if (!settingsData.spawnTracker) {
                settingsData.spawnTracker = {};
            }
            
            settingsData.spawnTracker.windowSize = {
                width: bounds.width,
                height: bounds.height,
            };
            
            settingsData.spawnTracker.windowPosition = {
                x: bounds.x,
                y: bounds.y,
            };
            
            // Save to file
            fs.writeFileSync(settingsPath, JSON.stringify(settingsData, null, 2), 'utf8');
        } catch (error) {
            console.error('[SpawnTrackerWindow] Failed to save window config:', error);
        }
    }

    _debouncedSaveWindowConfig() {
        // Debounce saves to avoid too many file writes
        if (this._saveTimeout) {
            clearTimeout(this._saveTimeout);
        }
        this._saveTimeout = setTimeout(() => {
            this._saveWindowConfig();
        }, 500);
    }

    create() {
        if (this._window && !this._window.isDestroyed()) {
            this._window.show();
            this._window.focus();
            return this._window;
        }

        const config = this._loadWindowConfig();

        this._window = new BrowserWindow({
            width: config.width,
            height: config.height,
            x: config.x,
            y: config.y,
            minWidth: 400,
            minHeight: 300,
            title: 'BPTimer Spawn Tracker',
            icon: iconPath,
            autoHideMenuBar: true,
            webPreferences: {
                preload: preloadPath,
                contextIsolation: true,
                nodeIntegration: false,
                sandbox: false,
            },
        });

        this._window.loadFile(htmlPath);

        // Apply topMost state if configured
        if (config.topMost) {
            this._window.setAlwaysOnTop(true, 'normal');
        }

        // Save window size and position when changed
        this._window.on('resized', () => {
            this._debouncedSaveWindowConfig();
        });

        this._window.on('moved', () => {
            this._debouncedSaveWindowConfig();
        });

        this._window.on('closed', () => {
            // Save one final time before closing
            this._saveWindowConfig();
            if (this._saveTimeout) {
                clearTimeout(this._saveTimeout);
            }
            this._window = null;
        });

        return this._window;
    }

    getWindow() {
        return this._window;
    }

    isOpen() {
        return this._window && !this._window.isDestroyed();
    }

    close() {
        if (this._window && !this._window.isDestroyed()) {
            this._window.close();
        }
    }
}

const spawnTrackerWindow = new SpawnTrackerWindow();
module.exports = spawnTrackerWindow;

if (module && module.exports && module.exports !== exports) {
    module.exports.default = module.exports;
}

