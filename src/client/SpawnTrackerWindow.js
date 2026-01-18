// src/client/SpawnTrackerWindow.js
// CommonJS (like Window.js)

const { BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const iconPath = fs.existsSync(path.join(__dirname, '../resources/app.ico'))
    ? path.join(__dirname, '../resources/app.ico')
    : path.join(process.cwd(), 'resources', 'app.ico');
const preloadPath = path.join(__dirname, '../preload.cjs');
const htmlPath = path.join(__dirname, '../public/spawn-tracker/index.html');

class SpawnTrackerWindow {
    _window = null;
    defaultConfig = {
        width: 700,
        height: 600,
        x: undefined,
        y: undefined,
    };

    create() {
        if (this._window && !this._window.isDestroyed()) {
            this._window.show();
            this._window.focus();
            return this._window;
        }

        this._window = new BrowserWindow({
            width: this.defaultConfig.width,
            height: this.defaultConfig.height,
            x: this.defaultConfig.x,
            y: this.defaultConfig.y,
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

        this._window.on('closed', () => {
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

