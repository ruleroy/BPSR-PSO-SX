// src/services/ModuleManager.js
// Module data extraction and management service

import logger from './Logger.js';

/**
 * ModuleManager - Extracts and stores module data from game packets
 * Similar to UserDataManager but focused on module/equipment data
 */
class ModuleManager {
    constructor() {
        // Store modules per user (key: userId, value: Map<uuid, ModuleInfo>)
        this.userModules = new Map();
        
        // Module type mappings (from C# ModuleType.cs)
        this.moduleTypes = {
            BASIC_ATTACK: 5500101,
            HIGH_PERFORMANCE_ATTACK: 5500102,
            EXCELLENT_ATTACK: 5500103,
            BASIC_HEALING: 5500201,
            HIGH_PERFORMANCE_HEALING: 5500202,
            EXCELLENT_HEALING: 5500203,
            BASIC_PROTECTION: 5500301,
            HIGH_PERFORMANCE_PROTECTION: 5500302,
            EXCELLENT_PROTECTION: 5500303,
        };

        // Module attribute type mappings (from C# ModuleAttrType.cs)
        this.attrTypes = {
            STRENGTH_BOOST: 1110,
            AGILITY_BOOST: 1111,
            INTELLIGENCE_BOOST: 1112,
            SPECIAL_ATTACK_DAMAGE: 1113,
            ELITE_STRIKE: 1114,
            SPECIAL_HEALING_BOOST: 1205,
            EXPERT_HEALING_BOOST: 1206,
            MAGIC_RESISTANCE: 1307,
            PHYSICAL_RESISTANCE: 1308,
            CASTING_FOCUS: 1407,
            ATTACK_SPEED_FOCUS: 1408,
            CRITICAL_FOCUS: 1409,
            LUCK_FOCUS: 1410,
            EXTREME_DAMAGE_STACK: 2104,
            EXTREME_FLEXIBLE_MOVEMENT: 2105,
            EXTREME_LIFE_CONVERGENCE: 2204,
            EXTREME_EMERGENCY_MEASURES: 2205,
            EXTREME_DESPERATE_GUARDIAN: 2304,
            EXTREME_LIFE_FLUCTUATION: 2404,
            EXTREME_LIFE_DRAIN: 2405,
            EXTREME_TEAM_CRIT: 2406,
        };

        // Module name mappings
        this.moduleNames = {
            [this.moduleTypes.BASIC_ATTACK]: 'Basic Attack',
            [this.moduleTypes.HIGH_PERFORMANCE_ATTACK]: 'High Performance Attack',
            [this.moduleTypes.EXCELLENT_ATTACK]: 'Excellent Attack',
            [this.moduleTypes.BASIC_HEALING]: 'Basic Support',
            [this.moduleTypes.HIGH_PERFORMANCE_HEALING]: 'High Performance Support',
            [this.moduleTypes.EXCELLENT_HEALING]: 'Excellent Support',
            [this.moduleTypes.BASIC_PROTECTION]: 'Basic Guardian',
            [this.moduleTypes.HIGH_PERFORMANCE_PROTECTION]: 'High Performance Guardian',
            [this.moduleTypes.EXCELLENT_PROTECTION]: 'Excellent Guardian',
        };

        // Attribute name mappings
        this.attrNames = {
            [this.attrTypes.STRENGTH_BOOST]: 'Strength Boost',
            [this.attrTypes.AGILITY_BOOST]: 'Agility Boost',
            [this.attrTypes.INTELLIGENCE_BOOST]: 'Intelligence Boost',
            [this.attrTypes.SPECIAL_ATTACK_DAMAGE]: 'Special Attack Damage',
            [this.attrTypes.ELITE_STRIKE]: 'Elite Strike',
            [this.attrTypes.SPECIAL_HEALING_BOOST]: 'Special Healing Boost',
            [this.attrTypes.EXPERT_HEALING_BOOST]: 'Expert Healing Boost',
            [this.attrTypes.CASTING_FOCUS]: 'Casting Focus',
            [this.attrTypes.ATTACK_SPEED_FOCUS]: 'Attack Speed Focus',
            [this.attrTypes.CRITICAL_FOCUS]: 'Critical Focus',
            [this.attrTypes.LUCK_FOCUS]: 'Luck Focus',
            [this.attrTypes.MAGIC_RESISTANCE]: 'Magic Resistance',
            [this.attrTypes.PHYSICAL_RESISTANCE]: 'Physical Resistance',
            [this.attrTypes.EXTREME_DAMAGE_STACK]: 'Extreme Damage Stack',
            [this.attrTypes.EXTREME_FLEXIBLE_MOVEMENT]: 'Extreme Flexible Movement',
            [this.attrTypes.EXTREME_LIFE_CONVERGENCE]: 'Extreme Life Convergence',
            [this.attrTypes.EXTREME_EMERGENCY_MEASURES]: 'Extreme Emergency Measures',
            [this.attrTypes.EXTREME_DESPERATE_GUARDIAN]: 'Extreme Desperate Guardian',
            [this.attrTypes.EXTREME_LIFE_FLUCTUATION]: 'Extreme Life Fluctuation',
            [this.attrTypes.EXTREME_LIFE_DRAIN]: 'Extreme Life Drain',
            [this.attrTypes.EXTREME_TEAM_CRIT]: 'Extreme Team Crit',
        };

        // Module category mapping
        this.moduleCategories = {
            [this.moduleTypes.BASIC_ATTACK]: 'ATTACK',
            [this.moduleTypes.HIGH_PERFORMANCE_ATTACK]: 'ATTACK',
            [this.moduleTypes.EXCELLENT_ATTACK]: 'ATTACK',
            [this.moduleTypes.BASIC_PROTECTION]: 'GUARDIAN',
            [this.moduleTypes.HIGH_PERFORMANCE_PROTECTION]: 'GUARDIAN',
            [this.moduleTypes.EXCELLENT_PROTECTION]: 'GUARDIAN',
            [this.moduleTypes.BASIC_HEALING]: 'SUPPORT',
            [this.moduleTypes.HIGH_PERFORMANCE_HEALING]: 'SUPPORT',
            [this.moduleTypes.EXCELLENT_HEALING]: 'SUPPORT',
        };
    }

    /**
     * Extract module data from SyncContainerData VData
     * @param {number} userId - User ID
     * @param {object} vData - VData from SyncContainerData protobuf
     */
    extractModulesFromVData(userId, vData) {
        try {
            if (!vData) return;

            // Get ModInfos and ItemPackage from VData
            const modInfos = vData.Mod?.ModInfos;
            const itemPackage = vData.ItemPackage?.Packages;

            if (!modInfos || !itemPackage) return;

            const modules = new Map();

            // Iterate through all packages
            for (const [packageType, packageData] of Object.entries(itemPackage)) {
                if (!packageData?.Items) continue;

                // Iterate through items in package
                for (const [itemKey, item] of Object.entries(packageData.Items)) {
                    if (!item?.ModNewAttr?.ModParts || item.ModNewAttr.ModParts.length === 0) {
                        continue;
                    }

                    const configId = item.ConfigId;
                    // Check if this is a recognized module type
                    const isModuleType = Object.values(this.moduleTypes).includes(configId);
                    if (!isModuleType) {
                        // Not a module type we recognize, skip
                        continue;
                    }

                    // Get module name
                    const moduleName = this.moduleNames[configId] || `Unknown Module (${configId})`;

                    // Get ModInfo for this item (contains InitLinkNums)
                    // Try multiple key formats (string, number, Long)
                    let modInfo = modInfos[itemKey] || modInfos[String(itemKey)] || modInfos[Number(itemKey)];
                    // Also try with Long conversion if itemKey is a Long
                    if (!modInfo && itemKey && typeof itemKey.toNumber === 'function') {
                        modInfo = modInfos[itemKey.toNumber()] || modInfos[String(itemKey.toNumber())];
                    }
                    if (!modInfo) continue;

                    const initLinkNums = modInfo.InitLinkNums || [];
                    const modParts = item.ModNewAttr.ModParts || [];

                    // Create module parts (attributes)
                    const parts = [];
                    const partCount = Math.min(modParts.length, initLinkNums.length);

                    for (let i = 0; i < partCount; i++) {
                        const partId = modParts[i];
                        const partValue = initLinkNums[i];
                        const partName = this.attrNames[partId] || `Unknown Attr (${partId})`;

                        parts.push({
                            id: partId,
                            name: partName,
                            value: partValue,
                        });
                    }

                    // Create module info
                    const moduleInfo = {
                        name: moduleName,
                        configId: configId,
                        uuid: String(item.Uuid || itemKey),
                        quality: item.Quality || 0,
                        parts: parts,
                        category: this.moduleCategories[configId] || 'UNKNOWN',
                    };

                    modules.set(moduleInfo.uuid, moduleInfo);
                }
            }

            // Store modules for this user
            this.userModules.set(userId, modules);

            if (modules.size > 0) {
                logger.debug(`[ModuleManager] Extracted ${modules.size} modules for user ${userId}`);
            }
        } catch (error) {
            logger.error(`[ModuleManager] Error extracting modules for user ${userId}:`, error);
        }
    }

    /**
     * Get all modules for a user
     * @param {number} userId - User ID
     * @returns {Array} Array of module info objects
     */
    getModules(userId) {
        const modules = this.userModules.get(userId);
        if (!modules) return [];
        return Array.from(modules.values());
    }

    /**
     * Clear modules for a user
     * @param {number} userId - User ID
     */
    clearModules(userId) {
        this.userModules.delete(userId);
    }

    /**
     * Clear all modules
     */
    clearAll() {
        this.userModules.clear();
    }

    /**
     * Get module count for a user
     * @param {number} userId - User ID
     * @returns {number}
     */
    getModuleCount(userId) {
        const modules = this.userModules.get(userId);
        return modules ? modules.size : 0;
    }
}

// Export singleton instance
const moduleManager = new ModuleManager();
export default moduleManager;

