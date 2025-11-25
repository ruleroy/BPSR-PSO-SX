// src/services/ModuleOptimizer.js
// Port of C# ModuleOptimizer algorithm to JavaScript

/**
 * ModuleOptimizer - Optimizes module combinations using greedy + local search
 * Ported from StarResonanceDps C# implementation
 */
class ModuleOptimizer {
    constructor(config = {}) {
        // Attribute thresholds for level calculation (1, 4, 8, 12, 16, 20)
        this.attrThresholds = config.attrThresholds || [1, 4, 8, 12, 16, 20];

        // Power maps (from C# ModuleMaps)
        this.basicAttrPowerMap = config.basicAttrPowerMap || {
            1: 7, 2: 14, 3: 29, 4: 44, 5: 167, 6: 254,
        };
        this.specialAttrPowerMap = config.specialAttrPowerMap || {
            1: 14, 2: 29, 3: 59, 4: 89, 5: 298, 6: 448,
        };
        this.totalAttrPowerMap = config.totalAttrPowerMap || this._buildTotalAttrPowerMap();

        // Basic and special attribute IDs
        this.basicAttrIds = config.basicAttrIds || new Set([
            1110, 1111, 1112, 1113, 1114, 1205, 1206, 1307, 1308, 1407, 1408, 1409, 1410,
        ]);
        this.specialAttrIds = config.specialAttrIds || new Set([
            2104, 2105, 2204, 2205, 2304, 2404, 2405, 2406,
        ]);

        // Attribute name to type mapping
        this.attrNameTypeMap = config.attrNameTypeMap || this._buildAttrNameTypeMap();

        // Module category mapping
        this.moduleCategoryMap = config.moduleCategoryMap || {};

        // Priority attributes and desired levels
        this.priorityAttrs = new Set(config.priorityAttrs || []);
        // Convert desiredLevels object to Map if needed
        if (config.desiredLevels) {
            if (config.desiredLevels instanceof Map) {
                this.desiredLevels = new Map(config.desiredLevels);
            } else if (Array.isArray(config.desiredLevels)) {
                this.desiredLevels = new Map(config.desiredLevels);
            } else {
                // Plain object - convert to Map
                this.desiredLevels = new Map();
                for (const [name, level] of Object.entries(config.desiredLevels)) {
                    if (level > 0) {
                        this.desiredLevels.set(name, level);
                    }
                }
            }
        } else {
            this.desiredLevels = new Map();
        }

        // Level weights
        this.levelWeights = {
            1: 1.0, 2: 4.0, 3: 8.0, 4: 12.0, 5: 16.0, 6: 20.0,
        };

        // Algorithm parameters
        this.localSearchIterations = config.localSearchIterations || 30;
        this.maxSolutions = config.maxSolutions || 60;

        // Overshoot tolerance
        this.overshootToleranceLevels = 1;
        this.overshootHardPenaltyPerLevel = 50;
    }

    _buildTotalAttrPowerMap() {
        // Build the total attribute power map (simplified version)
        const map = { 0: 0 };
        for (let i = 1; i <= 120; i++) {
            // Simplified formula - should match C# implementation
            if (i <= 18) {
                map[i] = Math.floor(5 + (i - 1) * 6);
            } else {
                map[i] = Math.floor(104 + (i - 18) * 6);
            }
        }
        return map;
    }

    _buildAttrNameTypeMap() {
        return {
            'Strength Boost': 'basic', 'Agility Boost': 'basic', 'Intelligence Boost': 'basic',
            'Special Attack Damage': 'basic', 'Elite Strike': 'basic', 'Special Healing Boost': 'basic',
            'Expert Healing Boost': 'basic', 'Casting Focus': 'basic', 'Attack Speed Focus': 'basic',
            'Critical Focus': 'basic', 'Luck Focus': 'basic', 'Magic Resistance': 'basic',
            'Physical Resistance': 'basic',
            'Extreme Damage Stack': 'special', 'Extreme Flexible Movement': 'special',
            'Extreme Life Convergence': 'special', 'Extreme Emergency Measures': 'special',
            'Extreme Life Fluctuation': 'special', 'Extreme Life Drain': 'special',
            'Extreme Team Crit': 'special', 'Extreme Desperate Guardian': 'special',
        };
    }

    /**
     * Convert attribute value to level (1-6)
     */
    toLevel(value) {
        let level = 0;
        for (let i = 0; i < this.attrThresholds.length; i++) {
            if (value >= this.attrThresholds[i]) {
                level = i + 1;
            } else {
                break;
            }
        }
        return level;
    }

    /**
     * Get module category
     */
    getModuleCategory(module) {
        return this.moduleCategoryMap[module.configId] || 'ATTACK';
    }

    /**
     * Get attribute type (basic/special) by name
     */
    getAttrTypeByName(attrName, modules) {
        if (this.attrNameTypeMap[attrName]) {
            return this.attrNameTypeMap[attrName];
        }

        // Fallback: check module parts
        for (const m of modules) {
            for (const p of m.parts) {
                if (p.name === attrName) {
                    if (this.basicAttrIds.has(p.id)) return 'basic';
                    if (this.specialAttrIds.has(p.id)) return 'special';
                    return 'basic';
                }
            }
        }
        return 'basic';
    }

    /**
     * Evaluate a module combination
     * Returns: { priorityLevel, combatPower, breakdown }
     */
    evaluate(modules) {
        const breakdown = new Map();
        
        for (const m of modules) {
            for (const p of m.parts) {
                const current = breakdown.get(p.name) || 0;
                breakdown.set(p.name, current + p.value);
            }
        }

        // Calculate priority level (highest level of priority attributes)
        let priorityLevel = 0;
        if (this.priorityAttrs.size > 0) {
            for (const attrName of this.priorityAttrs) {
                const value = breakdown.get(attrName) || 0;
                const level = this.toLevel(value);
                priorityLevel = Math.max(priorityLevel, level);
            }
        }

        const combatPower = this.calculateCombatPower(modules).power;
        return {
            priorityLevel,
            combatPower,
            breakdown: Object.fromEntries(breakdown),
        };
    }

    /**
     * Calculate combat power for modules
     * Returns: { power, breakdown }
     */
    calculateCombatPower(modules) {
        const breakdown = new Map();
        
        for (const m of modules) {
            for (const p of m.parts) {
                const current = breakdown.get(p.name) || 0;
                breakdown.set(p.name, current + p.value);
            }
        }

        let thresholdPower = 0;
        for (const [attrName, attrValue] of breakdown.entries()) {
            let maxLevel = 0;
            for (let i = 0; i < this.attrThresholds.length; i++) {
                if (attrValue >= this.attrThresholds[i]) {
                    maxLevel = i + 1;
                } else {
                    break;
                }
            }

            const attrType = this.getAttrTypeByName(attrName, modules);
            const map = attrType === 'special' ? this.specialAttrPowerMap : this.basicAttrPowerMap;
            
            if (maxLevel > 0 && map[maxLevel]) {
                thresholdPower += map[maxLevel];
            }
        }

        const totalAttrValue = Array.from(breakdown.values()).reduce((a, b) => a + b, 0);
        const totalAttrPower = this.totalAttrPowerMap[totalAttrValue] || 0;
        const totalPower = thresholdPower + totalAttrPower;

        return {
            power: totalPower,
            breakdown: Object.fromEntries(breakdown),
        };
    }

    /**
     * Compute closeness score for desired levels
     */
    computeCloseness(breakdown) {
        if (this.desiredLevels.size === 0) return 0.0;

        let closeness = 0.0;
        const maxPerAttr = 6;

        // Handle both Map and plain object
        const getValue = (name) => {
            if (breakdown instanceof Map) {
                return breakdown.get(name) || 0;
            }
            return breakdown[name] || 0;
        };

        for (const [name, desired] of this.desiredLevels.entries()) {
            if (desired <= 0) continue;

            const value = getValue(name);
            const level = this.toLevel(value);

            if (level >= desired) {
                closeness += maxPerAttr;
            } else {
                const diff = desired - level;
                const score = maxPerAttr - diff;
                closeness += Math.max(0, score);
            }
        }

        return closeness;
    }

    /**
     * Calculate priority-aware score
     * Returns: { score, breakdown, priorityMaxLevel }
     */
    calculatePriorityAwareScore(modules) {
        const { power, breakdown } = this.calculateCombatPower(modules);

        // Calculate levels for all attributes
        const levelByAttr = new Map();
        let priorityMaxLevel = 0;

        for (const [attr, value] of Object.entries(breakdown)) {
            let lvl = 0;
            for (let i = 0; i < this.attrThresholds.length; i++) {
                if (value >= this.attrThresholds[i]) {
                    lvl = i + 1;
                } else {
                    break;
                }
            }
            levelByAttr.set(attr, lvl);
            if (lvl > priorityMaxLevel) priorityMaxLevel = lvl;
        }

        // Three-tier scoring
        let tier1 = 0.0; // Priority with desired
        let tier2 = 0.0; // Priority without desired
        let tier3 = 0.0; // Non-priority

        const globalCloseness = this.computeCloseness(breakdown);

        for (const [attr, lvl] of levelByAttr.entries()) {
            const w = this.levelWeights[lvl] || 0;
            const isWhite = this.priorityAttrs.has(attr);
            const hasTarget = this.desiredLevels.has(attr);
            const targetLvl = this.desiredLevels.get(attr) || 0;

            if (isWhite && hasTarget) {
                const aimLevel = 6;
                if (lvl >= aimLevel) {
                    tier1 += 2000.0;
                } else if (lvl >= targetLvl) {
                    const overshoot = lvl - targetLvl;
                    if (overshoot <= this.overshootToleranceLevels) {
                        tier1 += 2000.0;
                    } else {
                        const hard = overshoot - this.overshootToleranceLevels;
                        tier1 += 2000.0 - hard * this.overshootHardPenaltyPerLevel;
                    }
                } else {
                    const diff = Math.min(6, targetLvl - lvl);
                    const closenessLocal = 6 - diff;
                    tier1 += closenessLocal * 20.0;
                }
            } else if (isWhite) {
                tier2 += w;
            } else {
                tier3 += w;
            }
        }

        const score = tier1 * 1_000_000_000.0 +
                     tier2 * 1_000_000.0 +
                     tier3 * 10_000.0 +
                     globalCloseness * 1_000.0 +
                     power;

        return { score, breakdown, priorityMaxLevel };
    }

    /**
     * Prefilter modules - take top 30 per attribute
     */
    prefilterModules(modules) {
        const attrModules = new Map();

        for (const module of modules) {
            for (const part of module.parts) {
                if (!attrModules.has(part.name)) {
                    attrModules.set(part.name, []);
                }
                attrModules.get(part.name).push({ module, value: part.value });
            }
        }

        const candidates = new Set();
        for (const [attrName, list] of attrModules.entries()) {
            const top = list
                .sort((a, b) => b.value - a.value)
                .slice(0, 30)
                .map(x => x.module);
            top.forEach(m => candidates.add(m));
        }

        return Array.from(candidates);
    }

    /**
     * Greedy construction of initial solution
     */
    greedyConstructSolution(modules) {
        if (modules.length < 4) return null;

        const current = [modules[Math.floor(Math.random() * modules.length)]];

        for (let k = 0; k < 3; k++) {
            let pick = null;
            let bestScore = -Infinity;

            for (const m of modules) {
                if (current.includes(m)) continue;

                const test = [...current, m];
                const { score } = this.calculatePriorityAwareScore(test);

                if (score > bestScore) {
                    bestScore = score;
                    pick = m;
                }
            }

            if (!pick) break;
            current.push(pick);
        }

        const { priorityLevel, combatPower, breakdown } = this.evaluate(current);
        return {
            modules: current,
            score: combatPower,
            breakdown,
            priorityLevel,
            totalAttrValue: Object.values(breakdown).reduce((a, b) => a + b, 0),
        };
    }

    /**
     * Local search improvement
     */
    localSearchImprove(solution, allModules) {
        if (!solution) return null;

        let best = {
            modules: [...solution.modules],
            score: solution.score,
            breakdown: { ...solution.breakdown },
            priorityLevel: solution.priorityLevel,
            totalAttrValue: solution.totalAttrValue,
        };

        let { score: bestScoreUnified } = this.calculatePriorityAwareScore(best.modules);

        for (let iter = 0; iter < this.localSearchIterations; iter++) {
            let improved = false;

            for (let i = 0; i < best.modules.length; i++) {
                const take = Math.min(20, allModules.length);
                const sample = allModules
                    .sort(() => Math.random() - 0.5)
                    .slice(0, take);

                for (const nm of sample) {
                    if (best.modules.includes(nm)) continue;

                    const newModules = [...best.modules];
                    newModules[i] = nm;

                    const { score: sc, breakdown: bd } = this.calculatePriorityAwareScore(newModules);
                    if (sc > bestScoreUnified) {
                        const { priorityLevel, combatPower } = this.evaluate(newModules);
                        best = {
                            modules: newModules,
                            score: combatPower,
                            breakdown: bd,
                            priorityLevel,
                            totalAttrValue: Object.values(bd).reduce((a, b) => a + b, 0),
                        };
                        bestScoreUnified = sc;
                        improved = true;
                        break;
                    }
                }
                if (improved) break;
            }
            if (!improved && iter > this.localSearchIterations / 2) break;
        }

        return best;
    }

    /**
     * Main optimization function
     * @param {Array} modules - Array of module objects
     * @param {string} category - 'ATTACK', 'GUARDIAN', 'SUPPORT', or 'ALL'
     * @param {number} topN - Number of top solutions to return
     * @param {string} sortMode - 'ByTotalAttr' or 'ByScore'
     */
    optimizeModules(modules, category = 'ALL', topN = 40, sortMode = 'ByTotalAttr') {
        // Filter by category
        let filtered = modules;
        if (category !== 'ALL') {
            filtered = modules.filter(m => this.getModuleCategory(m) === category);
        }

        if (filtered.length < 4) return [];

        // Prefilter
        const candidates = this.prefilterModules(filtered);

        const solutions = [];
        const seen = new Set();
        let attempts = 0;
        const maxAttempts = this.maxSolutions * 20;

        while (solutions.length < this.maxSolutions && attempts < maxAttempts) {
            attempts++;

            const init = this.greedyConstructSolution(candidates);
            if (!init) continue;

            const improved = this.localSearchImprove(init, candidates);

            const ids = improved.modules
                .map(m => m.uuid)
                .sort()
                .join('|');

            if (!seen.has(ids)) {
                seen.add(ids);
                solutions.push(improved);
            }
        }

        // Sort solutions
        let ordered;
        if (sortMode === 'ByTotalAttr') {
            ordered = solutions.sort((a, b) => {
                if (b.priorityLevel !== a.priorityLevel) return b.priorityLevel - a.priorityLevel;
                if (b.totalAttrValue !== a.totalAttrValue) return b.totalAttrValue - a.totalAttrValue;
                return b.score - a.score;
            });
        } else {
            ordered = solutions.sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                if (b.priorityLevel !== a.priorityLevel) return b.priorityLevel - a.priorityLevel;
                return b.totalAttrValue - a.totalAttrValue;
            });
        }

        return ordered.slice(0, topN);
    }

    /**
     * Set priority attributes
     */
    setPriorityAttrs(attrs) {
        this.priorityAttrs = new Set(attrs || []);
    }

    /**
     * Set desired levels
     */
    setDesiredLevels(levels) {
        this.desiredLevels = new Map();
        if (levels) {
            for (const [name, level] of Object.entries(levels)) {
                if (level > 0) {
                    this.desiredLevels.set(name, level);
                }
            }
        }
    }
}

export default ModuleOptimizer;

