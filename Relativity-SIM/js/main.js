// ===========================================================================
// 高精度相对论模拟器 - 主交互逻辑（统一严格版）
// ===========================================================================

// 核心数据结构：66位数字系统
// ===========================================================================

// 66位数字数组，表示速度值 0.xxxxxxxx... (66位小数)
let speedDigits = new Array(66).fill(0);
speedDigits[0] = 5; // 默认 0.5 (第一位小数)
speedDigits[1] = 0; // 第二位小数

// 全局变量：存储当前精度序列
let currentPrecisionSequence = [];

// 参考系状态
let currentReferenceFrame = 'earth'; // 'earth' 或 'ship'

// 时间单位状态
let currentTimeUnit = 'day'; // 'day', 'month', 'year'

// 模拟器实例（由simulation.js提供）
let simulator = null;

// 动画循环控制
let animationFrameId = null;
let lastFrameTime = null;

// 模拟状态（与按钮状态同步）
let simulationStatus = {
    isRunning: false,
    isPaused: false
};

// ===========================================================================
// 新增：配置管理器（自动保存和加载功能）
// ===========================================================================

const ConfigManager = {
    // 配置文件名（自动保存在工具的data目录下）
    configFilename: 'relativity_config',
    
    // 默认配置
    defaultConfig: {
        version: "1.0",
        distance: 1000,
        speedDigits: new Array(66).fill(0),
        coarseValue: 0.5,
        fineIndex: 0,
        multiplier: 1,
        timeUnit: "day",
        referenceFrame: "earth",
        lastSaveTime: null
    },
    
    // 当前配置
    currentConfig: null,
    
    // 防抖保存计时器
    saveDebounceTimer: null,
    
    // 初始化配置管理器
    init: function() {
        console.log('[ConfigManager] 初始化配置管理器');
        this.currentConfig = { ...this.defaultConfig };
        this.currentConfig.speedDigits[0] = 5; // 设置默认速度
        
        // 立即尝试加载配置
        this.loadConfig();
    },
    
    // 加载配置
    loadConfig: async function() {
        console.log('[ConfigManager] 开始加载配置');
        try {
            const formData = new FormData();
            formData.append('filename', this.configFilename);
            
            const response = await fetch('api/json/r', {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('[ConfigManager] 加载的配置数据:', data);
            
            // 合并加载的配置
            if (data && Object.keys(data).length > 0) {
                this.currentConfig = { ...this.defaultConfig, ...data };
                console.log('[ConfigManager] 配置加载成功:', this.currentConfig);
                this.applyConfig();
            } else {
                console.log('[ConfigManager] 配置文件为空，使用默认配置');
                this.saveConfig(); // 创建默认配置文件
            }
        } catch (error) {
            console.warn('[ConfigManager] 加载配置失败，使用默认配置:', error);
            this.saveConfig(); // 创建默认配置文件
        }
    },
    
    // 保存配置（防抖版本）
    saveConfig: function() {
        if (this.saveDebounceTimer) {
            clearTimeout(this.saveDebounceTimer);
        }
        
        this.saveDebounceTimer = setTimeout(() => {
            this._saveConfigNow();
        }, 500); // 500ms防抖延迟
    },
    
    // 立即保存配置
    _saveConfigNow: async function() {
        console.log('[ConfigManager] 开始保存配置');
        
        try {
            // 更新当前配置
            this.updateCurrentConfigFromUI();
            
            // 添加时间戳
            this.currentConfig.lastSaveTime = new Date().toISOString();
            
            const formData = new FormData();
            formData.append('filename', this.configFilename);
            formData.append('data', JSON.stringify(this.currentConfig));
            
            const response = await fetch('api/json/w', {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            console.log('[ConfigManager] 配置保存成功:', this.currentConfig);
        } catch (error) {
            console.error('[ConfigManager] 保存配置失败:', error);
        }
    },
    
    // 从UI更新当前配置
    updateCurrentConfigFromUI: function() {
        console.log('[ConfigManager] 从UI更新配置');
        
        // 获取距离
        const distanceInput = document.getElementById('inputDistance');
        if (distanceInput) {
            this.currentConfig.distance = parseFloat(distanceInput.value) || 1000;
        }
        
        // 获取速度数字
        this.currentConfig.speedDigits = [...speedDigits];
        
        // 计算粗调值
        const coarseValue = speedDigits[0] * 0.1 + speedDigits[1] * 0.01;
        this.currentConfig.coarseValue = coarseValue;
        
        // 获取微调索引
        const fineSlider = document.getElementById('sliderFine');
        if (fineSlider) {
            this.currentConfig.fineIndex = parseInt(fineSlider.value) || 0;
        }
        
        // 获取时间倍率
        const multiplierSlider = document.getElementById('sliderMultiplier');
        if (multiplierSlider) {
            this.currentConfig.multiplier = parseInt(multiplierSlider.value) || 1;
        }
        
        // 获取时间单位
        const timeUnitSelect = document.getElementById('timeUnitSelect');
        if (timeUnitSelect) {
            this.currentConfig.timeUnit = timeUnitSelect.value || 'day';
        }
        
        // 获取参考系
        this.currentConfig.referenceFrame = currentReferenceFrame;
        
        console.log('[ConfigManager] 更新的配置:', this.currentConfig);
    },
    
    // 应用配置到UI
    applyConfig: function() {
        console.log('[ConfigManager] 开始应用配置到UI');
        
        try {
            // 1. 设置距离
            const distanceInput = document.getElementById('inputDistance');
            if (distanceInput) {
                distanceInput.value = this.currentConfig.distance;
                console.log(`[ConfigManager] 设置距离: ${this.currentConfig.distance}`);
            }
            
            // 2. 设置速度数字数组
            if (this.currentConfig.speedDigits && this.currentConfig.speedDigits.length === 66) {
                speedDigits = [...this.currentConfig.speedDigits];
                console.log(`[ConfigManager] 设置速度数组: [${speedDigits.slice(0, 5)}...]`);
            }
            
            // 3. 设置粗调滑块
            const coarseSlider = document.getElementById('sliderSpeed');
            if (coarseSlider && this.currentConfig.coarseValue !== undefined) {
                coarseSlider.value = this.currentConfig.coarseValue;
                console.log(`[ConfigManager] 设置粗调滑块: ${this.currentConfig.coarseValue}`);
            }
            
            // 4. 更新精度序列和微调滑块
            updatePrecisionSequence();
            
            // 5. 设置时间倍率
            const multiplierSlider = document.getElementById('sliderMultiplier');
            if (multiplierSlider && this.currentConfig.multiplier !== undefined) {
                multiplierSlider.value = this.currentConfig.multiplier;
                console.log(`[ConfigManager] 设置时间倍率: ${this.currentConfig.multiplier}`);
            }
            
            // 6. 设置时间单位
            if (this.currentConfig.timeUnit) {
                currentTimeUnit = this.currentConfig.timeUnit;
                const timeUnitSelect = document.getElementById('timeUnitSelect');
                if (timeUnitSelect) {
                    timeUnitSelect.value = currentTimeUnit;
                    console.log(`[ConfigManager] 设置时间单位: ${currentTimeUnit}`);
                }
            }
            
            // 7. 设置参考系
            if (this.currentConfig.referenceFrame) {
                currentReferenceFrame = this.currentConfig.referenceFrame;
                console.log(`[ConfigManager] 设置参考系: ${currentReferenceFrame}`);
            }
            
            // 8. 更新所有UI显示
            setTimeout(() => {
                updateAllUI();
                updateMultiplierDisplay();
                updateReferenceSwitchUI();
                updateTimeUnitDisplay();
                
                // 更新模拟器参数（如果模拟器已初始化）
                if (simulator && !simulationStatus.isRunning) {
                    updateSimulatorParameters();
                    updateUINow();
                }
                
                console.log('[ConfigManager] 配置应用完成');
            }, 100);
            
        } catch (error) {
            console.error('[ConfigManager] 应用配置失败:', error);
        }
    },
    
    // 配置变更时的回调（供事件监听器调用）
    onConfigChange: function(source) {
        console.log(`[ConfigManager] 配置变更（来源: ${source}），触发自动保存`);
        this.saveConfig();
    }
};

// ===========================================================================
// 运行时间计时器功能
// ===========================================================================

let runTimer = {
    startTime: null,
    elapsedTime: 0,
    timerRunning: false,
    animationFrameId: null,
    timerElement: null,
    valueElement: null,
    progressObserver: null,
    
    init: function() {
        console.log('[runTimer] 初始化运行时间计时器');
        this.timerElement = document.getElementById('runTimeDisplay');
        this.valueElement = document.getElementById('runTimeValue');
        
        const btnPlay = document.getElementById('btnPlay');
        const btnPause = document.getElementById('btnPause');
        const btnReset = document.getElementById('btnReset');
        
        if (btnPlay) btnPlay.addEventListener('click', () => this.start());
        if (btnPause) btnPause.addEventListener('click', () => this.pause());
        if (btnReset) btnReset.addEventListener('click', () => this.reset());
        
        this.setupProgressObserver();
        this.updateDisplay();
        if (this.timerElement) this.timerElement.style.display = 'block';
    },
    
    start: function() {
        if (this.timerRunning) return;
        console.log('[runTimer] 启动计时器');
        this.timerRunning = true;
        this.startTime = Date.now() - this.elapsedTime * 1000;
        this.update();
    },
    
    pause: function() {
        if (!this.timerRunning) return;
        console.log('[runTimer] 暂停计时器');
        this.timerRunning = false;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    },
    
    resume: function() {
        if (this.timerRunning) return;
        console.log('[runTimer] 恢复计时器');
        this.timerRunning = true;
        this.startTime = Date.now() - this.elapsedTime * 1000;
        this.update();
    },
    
    reset: function() {
        console.log('[runTimer] 重置计时器');
        this.pause();
        this.elapsedTime = 0;
        this.updateDisplay();
    },
    
    update: function() {
        if (!this.timerRunning) return;
        const now = Date.now();
        this.elapsedTime = (now - this.startTime) / 1000;
        this.updateDisplay();
        this.animationFrameId = requestAnimationFrame(() => this.update());
    },
    
    updateDisplay: function() {
        if (this.valueElement) {
            this.valueElement.textContent = this.elapsedTime.toFixed(2);
        }
    },
    
    setupProgressObserver: function() {
        const progressElement = document.getElementById('dispProgressPercent');
        if (!progressElement) return;
        
        this.progressObserver = new MutationObserver(() => this.checkIfTargetReached());
        this.progressObserver.observe(progressElement, { 
            childList: true, 
            subtree: true,
            characterData: true 
        });
    },
    
    checkIfTargetReached: function() {
        const progressElement = document.getElementById('dispProgressPercent');
        if (!progressElement) return;
        
        try {
            const progressText = progressElement.textContent.trim();
            const percentMatch = progressText.match(/(\d+\.?\d*)%/);
            if (percentMatch) {
                const percent = parseFloat(percentMatch[1]);
                if (percent >= 100.0) {
                    console.log('[runTimer] 进度达到100%，停止计时器');
                    this.pause();
                    
                    const btnPlay = document.getElementById('btnPlay');
                    const btnPause = document.getElementById('btnPause');
                    if (btnPlay && btnPause) {
                        const playState = btnPlay.getAttribute('data-state');
                        const pauseState = btnPause.getAttribute('data-state');
                        if (playState === 'disabled' && pauseState === 'enabled') {
                            btnPause.click();
                        }
                    }
                }
            }
        } catch (error) {
            console.error('[runTimer] 检测进度时出错:', error);
        }
    }
};

// 初始化原位更新UI
updateUINow();

// ===========================================================================
// 时间单位转换系数
// ===========================================================================

const timeUnitConversion = {
    'day': 1,
    'month': 30.4380302503333, // 恒星月
    'year': 365.256363004      // 恒星年
};

const timeUnitDisplay = {
    'day': '天',
    'month': '月',
    'year': '年'
};

// ===========================================================================
// 中文单位映射表（已扩展为连续）
// ===========================================================================

const CHINESE_UNIT_MAP = [
    // 1. 检查并确认现有单位表已经是正确的万进制 ✅
    { threshold: 1e6, unit: '百万', digits: 7 },    // 10^6
    { threshold: 1e7, unit: '千万', digits: 8 },    // 10^7
    
    // 从 10^8 开始完全遵循：基础单位 → 十基础单位 → 百基础单位 → 千基础单位 → 下一个基础单位
    { threshold: 1e8, unit: '亿', digits: 9 },      // 基础单位
    { threshold: 1e9, unit: '十亿', digits: 10 },   // 十 + 基础单位
    { threshold: 1e10, unit: '百亿', digits: 11 },  // 百 + 基础单位
    { threshold: 1e11, unit: '千亿', digits: 12 },  // 千 + 基础单位

    { threshold: 1e12, unit: '兆', digits: 13 },    // 下一个基础单位
    { threshold: 1e13, unit: '十兆', digits: 14 },
    { threshold: 1e14, unit: '百兆', digits: 15 },
    { threshold: 1e15, unit: '千兆', digits: 16 },

    { threshold: 1e16, unit: '京', digits: 17 },
    { threshold: 1e17, unit: '十京', digits: 18 },
    { threshold: 1e18, unit: '百京', digits: 19 },
    { threshold: 1e19, unit: '千京', digits: 20 },

    { threshold: 1e20, unit: '垓', digits: 21 },
    { threshold: 1e21, unit: '十垓', digits: 22 },
    { threshold: 1e22, unit: '百垓', digits: 23 },
    { threshold: 1e23, unit: '千垓', digits: 24 },

    { threshold: 1e24, unit: '秭', digits: 25 },
    { threshold: 1e25, unit: '十秭', digits: 26 },
    { threshold: 1e26, unit: '百秭', digits: 27 },
    { threshold: 1e27, unit: '千秭', digits: 28 },

    { threshold: 1e28, unit: '穰', digits: 29 },
    { threshold: 1e29, unit: '十穰', digits: 30 },
    { threshold: 1e30, unit: '百穰', digits: 31 },
    { threshold: 1e31, unit: '千穰', digits: 32 },

    { threshold: 1e32, unit: '沟', digits: 33 },
    { threshold: 1e33, unit: '十沟', digits: 34 },
    { threshold: 1e34, unit: '百沟', digits: 35 },
    { threshold: 1e35, unit: '千沟', digits: 36 },

    { threshold: 1e36, unit: '涧', digits: 37 },
    { threshold: 1e37, unit: '十涧', digits: 38 },
    { threshold: 1e38, unit: '百涧', digits: 39 },
    { threshold: 1e39, unit: '千涧', digits: 40 },

    { threshold: 1e40, unit: '正', digits: 41 },    // 下一个基础单位
    { threshold: 1e41, unit: '十正', digits: 42 },   // 十 + 基础单位
    { threshold: 1e42, unit: '百正', digits: 43 },   // 百 + 基础单位
    { threshold: 1e43, unit: '千正', digits: 44 },   // 千 + 基础单位

    { threshold: 1e44, unit: '载', digits: 45 },     // 下一个基础单位
    { threshold: 1e45, unit: '十载', digits: 46 },
    { threshold: 1e46, unit: '百载', digits: 47 },
    { threshold: 1e47, unit: '千载', digits: 48 },

    { threshold: 1e48, unit: '极', digits: 49 },     // 下一个基础单位
    { threshold: 1e49, unit: '十极', digits: 50 },
    { threshold: 1e50, unit: '百极', digits: 51 },
    { threshold: 1e51, unit: '千极', digits: 52 },

    { threshold: 1e52, unit: '恒河沙', digits: 53 }, // 下一个基础单位
    { threshold: 1e53, unit: '十恒河沙', digits: 54 },
    { threshold: 1e54, unit: '百恒河沙', digits: 55 },
    { threshold: 1e55, unit: '千恒河沙', digits: 56 },

    { threshold: 1e56, unit: '阿僧祇', digits: 57 },
    { threshold: 1e57, unit: '十阿僧祇', digits: 58 },
    { threshold: 1e58, unit: '百阿僧祇', digits: 59 },
    { threshold: 1e59, unit: '千阿僧祇', digits: 60 },

    { threshold: 1e60, unit: '那由他', digits: 61 },
    { threshold: 1e61, unit: '十那由他', digits: 62 },
    { threshold: 1e62, unit: '百那由他', digits: 63 },
    { threshold: 1e63, unit: '千那由他', digits: 64 },

    { threshold: 1e64, unit: '不可思议', digits: 65 },
    { threshold: 1e65, unit: '十不可思议', digits: 66 },
    { threshold: 1e66, unit: '百不可思议', digits: 67 },
    { threshold: 1e67, unit: '千不可思议', digits: 68 },

    { threshold: 1e68, unit: '无量大数', digits: 69 },
    { threshold: 1e69, unit: '十无量大数', digits: 70 },
    { threshold: 1e70, unit: '百无量大数', digits: 71 },
    { threshold: 1e71, unit: '千无量大数', digits: 72 },
    
    { threshold: 1e72, unit: '古戈尔', digits: 73 },  // googol
];



// ===========================================================================
// 新增：将科学记数法转换为完整数字字符串
// ===========================================================================

function convertScientificToFull(sciNotation) {
    console.log(`[convertScientificToFull] 转换科学记数法: ${sciNotation}`);
    
    if (typeof sciNotation !== 'string') {
        return sciNotation.toString();
    }
    
    // 检查是否为科学记数法
    if (!sciNotation.includes('e') && !sciNotation.includes('E')) {
        return sciNotation;
    }
    
    try {
        const [baseStr, expStr] = sciNotation.toLowerCase().split('e');
        const base = parseFloat(baseStr);
        const exponent = parseInt(expStr, 10);
        
        // 分离整数和小数部分
        const [intPartStr, decPartStr = ''] = baseStr.split('.');
        
        if (exponent === 0) {
            return baseStr;
        }
        
        if (exponent > 0) {
            // 正指数：移动小数点向右
            const totalDigits = intPartStr.length + (decPartStr || '').length;
            const moveRight = exponent;
            
            if (moveRight <= decPartStr.length) {
                // 移动后仍在小数部分内
                const newIntPart = intPartStr + decPartStr.substring(0, moveRight);
                const newDecPart = decPartStr.substring(moveRight);
                return newDecPart ? `${newIntPart}.${newDecPart}` : newIntPart;
            } else {
                // 移动到整数部分
                const combined = intPartStr + (decPartStr || '');
                const zerosNeeded = moveRight - decPartStr.length;
                const result = combined + '0'.repeat(zerosNeeded);
                return result;
            }
        } else {
            // 负指数：移动小数点向左
            const absExp = Math.abs(exponent);
            if (absExp <= intPartStr.length) {
                // 移动后仍有整数部分
                const newIntPart = intPartStr.substring(0, intPartStr.length - absExp);
                const newDecPart = intPartStr.substring(intPartStr.length - absExp) + (decPartStr || '');
                return `${newIntPart}.${newDecPart}`;
            } else {
                // 移动后变成纯小数
                const zerosNeeded = absExp - intPartStr.length;
                const allDigits = intPartStr + (decPartStr || '');
                return `0.${'0'.repeat(zerosNeeded)}${allDigits}`;
            }
        }
    } catch (error) {
        console.error('[convertScientificToFull] 转换失败:', error, '输入:', sciNotation);
        return sciNotation; // 如果转换失败，返回原字符串
    }
}
/**
 * // 新增：将γ因子格式化为中文单位
 * @param {*} gamma 
 * @param {*} strID 
 * @returns 
 */
function formatGammaChinese(gamma, strID = "未知") {
    console.log(`[formatGammaChinese] 格式化γ因子: ${gamma}, 调用自：${strID}`);
    
    // 确保gamma是字符串
    const gammaStr = gamma.toString();
    
    // 分割整数和小数部分
    const [intPart, decimalPart = ''] = gammaStr.split('.');
    const intLength = intPart.length;
    
    // 获取最小和最大digits
    const minDigits = CHINESE_UNIT_MAP[0]?.digits || 7; // 百万是7位
    const maxDigits = CHINESE_UNIT_MAP[CHINESE_UNIT_MAP.length - 1]?.digits || 73; // 古戈尔是73位
    
    // 1. 整数位数小于7位，直接显示整数+两位小数
    if (intLength < minDigits) {
        // 截断小数部分，保留2位
        const truncatedDecimal = decimalPart.substring(0, 2).padEnd(2, '0');
        const result = `${intPart}.${truncatedDecimal}`;
        console.log(`[formatGammaChinese] 早期格式化γ因子结果: ${result}`);
        return result;
    }
    
    // 2. 整数位数在7-73位之间，查找对应的单位
    for (let i = 0; i < CHINESE_UNIT_MAP.length; i++) {
        const unitInfo = CHINESE_UNIT_MAP[i];
        
        if (intLength === unitInfo.digits) {
            // 整数位数正好等于单位对应的digits
            // 取第一位作为整数，第二和第三位作为小数
            const integerDigit = intPart[0];
            const decimalDigit1 = intPart[1] || '0';
            const decimalDigit2 = intPart[2] || '0';
            
            const result = `${integerDigit}.${decimalDigit1}${decimalDigit2}${unitInfo.unit}`;
            console.log(`[formatGammaChinese] 单位格式化γ因子结果: ${result}`);
            return result;
        }
    }
    
    // 3. 整数位数超过73位，使用科学计数法
    if (intLength > maxDigits) {
        const integerDigit = intPart[0];
        const decimalDigit1 = intPart[1] || '0';
        const decimalDigit2 = intPart[2] || '0';
        const exponent = intLength - 1;
        
        const result = `${integerDigit}.${decimalDigit1}${decimalDigit2}e+${exponent}`;
        console.log(`[formatGammaChinese] 科学记数法格式化γ因子结果: ${result}`);
        return result;
    }
    
    // 4. 整数位数在7-73位之间，但没有精确匹配的digits
    // 这种情况不应该发生，因为你的常量表涵盖了7-73的所有digits
    // 但为了安全，我们使用最接近的较小单位
    for (let i = CHINESE_UNIT_MAP.length - 1; i >= 0; i--) {
        const unitInfo = CHINESE_UNIT_MAP[i];
        
        if (intLength > unitInfo.digits) {
            // 计算偏移量：需要左移多少位
            const shift = intLength - unitInfo.digits;
            
            // 取整数部分的前(shift+1)位，加上小数点，然后取两位小数
            const beforeDecimal = intPart.substring(0, shift + 1);
            const afterDecimal1 = intPart[shift + 1] || '0';
            const afterDecimal2 = intPart[shift + 2] || '0';
            
            const result = `${beforeDecimal}.${afterDecimal1}${afterDecimal2}${unitInfo.unit}`;
            console.log(`[formatGammaChinese] 特别情况错差格式化γ因子结果: ${result}`);
            return result;
        }
    }
    
    // 5. 如果所有情况都不匹配，返回原始值
    const truncatedDecimal = decimalPart.substring(0, 2).padEnd(2, '0');
    const result = `${intPart}.${truncatedDecimal}`;
    console.log(`[formatGammaChinese] 不匹配原始格式化γ因子结果: ${result}`);
    return result;
}

// ===========================================================================
// 新增：将天数转换为人类可读格式
// ===========================================================================

function formatDaysToHumanReadable(days) {
    console.log(`[formatDaysToHumanReadable] 转换天数: ${days}`);
    
    if (days >= 365.256) {
        // 转换为年
        const years = days / 365.256;
        return formatLargeNumberWithUnit(years, '年');
    } else if (days >= 30.438) {
        // 转换为月
        const months = days / 30.438;
        return formatLargeNumberWithUnit(months, '月');
    } else {
        // 直接使用天
        return formatLargeNumberWithUnit(days/1, '天');
    }
}

// ===========================================================================
// 新增：格式化大数并添加单位
// ===========================================================================

function formatLargeNumberWithUnit(num, unit) {
    console.log(`[formatLargeNumberWithUnit] 格式化数字: ${num}, 单位: ${unit}`);
    
    // 如果数字小于100万，直接显示2位小数
    if (num < 1000000) {
        return `${num.toFixed(2)}${unit}`;
    }
    
    // 使用中文单位映射表
    for (let i = CHINESE_UNIT_MAP.length - 1; i >= 0; i--) {
        if (num >= CHINESE_UNIT_MAP[i].threshold) {
            const value = num / CHINESE_UNIT_MAP[i].threshold;
            const formattedValue = value.toFixed(2); // 保留2位小数
            
            // 检查是否需要进一步拆分（如十、百、千前缀）
            let finalUnit = CHINESE_UNIT_MAP[i].unit;
            let finalValue = formattedValue;
            
            return `${finalValue}${finalUnit}${unit}`;
        }
    }
    
    // 如果单位表中没有对应的单位，使用科学计数法
    return `${num.toExponential(2)}${unit}`;
}

// ===========================================================================
// 新增：更新γ因子换算描述
// ===========================================================================

function updateGammaConversionDesc(gamma) {
    console.log(`[updateGammaConversionDesc] 更新γ因子换算描述: ${gamma}`);
    
    const gammaConversionDesc = document.getElementById('gammaConversionDesc');
    if (!gammaConversionDesc) {
        console.warn('[updateGammaConversionDesc] 元素未找到，将在HTML中添加');
        return;
    }
    
    try {
        // 计算飞船上的1日对应的地球时间（天数）
        // γ因子的物理意义：地球时间 = γ × 飞船时间
        // 所以飞船上的1日 = γ 地球日
        const earthDaysPerShipDay = gamma;
        
        // 转换为人类可读格式
        const humanReadable = formatDaysToHumanReadable(earthDaysPerShipDay);
        
        // 更新显示
        gammaConversionDesc.textContent = `相当于倍率: 飞船上的1日等于${humanReadable}`;
        
        console.log(`[updateGammaConversionDesc] 更新完成: ${gammaConversionDesc.textContent}`);
    } catch (error) {
        console.error('[updateGammaConversionDesc] 更新失败:', error);
        gammaConversionDesc.textContent = '相当于倍率: 计算中...';
    }
}



// ===========================================================================
// 新增：格式化工具函数（已修复，添加科学记数法处理）
// ===========================================================================

/**
 * 分析数字特征（添加科学记数法检测）
 */
function analyzeNumber(num) {
    // 如果是字符串且包含科学记数法，先转换
    if (typeof num === 'string' && (num.includes('e') || num.includes('E'))) {
        num = convertScientificToFull(num);
    }
    
    const str = typeof num === 'string' ? num : num.toString();
    const [intPartStr, decPartStr = ''] = str.split('.');
    
    const intPart = parseInt(intPartStr, 10);
    const intDigits = intPartStr.replace('-', '').length;
    const decDigits = decPartStr.length;
    
    let leadingZeros = 0;
    if (decPartStr) {
        for (let i = 0; i < decPartStr.length; i++) {
            if (decPartStr[i] === '0') leadingZeros++;
            else break;
        }
    }
    
    let significantDecDigits = '';
    if (decPartStr && leadingZeros < decPartStr.length) {
        significantDecDigits = decPartStr.substring(leadingZeros, Math.min(leadingZeros + 3, decPartStr.length));
    }
    
    return {
        original: num,
        string: str,
        intPart,
        intPartStr,
        intDigits,
        decPartStr,
        decDigits,
        leadingZeros,
        significantDecDigits,
        isLargeNumber: Math.abs(intPart) >= 1000000,
        isPureDecimal: intPart === 0 && decPartStr.length > 0,
        isMixed: Math.abs(intPart) >= 1000000 && decPartStr.length > 0
    };
}

/**
 * 根据10的幂次获取对应的中文单位（已修复）
 */
function getChineseUnitForPower(power) {
    const value = Math.pow(10, power);
    for (let i = CHINESE_UNIT_MAP.length - 1; i >= 0; i--) {
        if (value >= CHINESE_UNIT_MAP[i].threshold) {
            return {
                ...CHINESE_UNIT_MAP[i],
                exactThreshold: CHINESE_UNIT_MAP[i].threshold
            };
        }
    }
    return null;
}

/**
 * 获取数字对应的中文单位（支持 number 或 string 输入）
 * @param {string} input - 只允许字符串输入
 * @returns {Object | null} 匹配的单位对象，或 null（若 < 1e6）
 */
function getChineseUnitForNumber(input) {
    // 1. 统一转换为 字符串形式
    let numStr;
    if (typeof input === 'string') {
        // 1. 去除首尾空格并处理空字符串
        const trimmed = input.trim();
        if (trimmed === '') {
            return null;
        }
        // todo: 此处需要添加对不合法字符串的处理，比如非数字字符等
        // 轻量校验：允许可选的前导符号（+、-、±）、整数、小数和科学计数法
        const numericPattern = /^[+\-±]?[0-9]*\.?[0-9]+([eE][+-]?\d+)?$/;
        if (!numericPattern.test(trimmed)) {
            return null;
        }

        // 统一处理：三步走
        // 1) 展开科学记数法（若存在）——使用 Decimal 避免精度/指数表示问题；
        // 2) 处理前导符号并记录（函数后续需要绝对值字符串用于位数判定）；
        // 3) 用 split('.') 截取小数点前部分，并去除整数位的前导0（保留单个 "0").

        // 处理前导符号
        let unsigned = trimmed;
        const firstChar = trimmed.charAt(0);
        if (firstChar === '+' || firstChar === '-' || firstChar === '±') {
            unsigned = trimmed.slice(1);
        }

        try {
            // 第一步：如果包含 e/E，使用 Decimal 将科学记数法其转换为普通数字字符串
            let normalized = unsigned;
            if (/[eE]/.test(unsigned)) {
                const dec = new Decimal(unsigned);
                // 获取小数位数并以该精度输出，确保不使用指数记法
                const dp = dec.decimalPlaces();
                normalized = dp > 0 ? dec.toFixed(dp) : dec.toFixed(0);
            }

            // 第二步：以 '.' 分割，取整数部分（处理 ".5" 的情况）
            const parts = normalized.split('.');
            let integerPart = parts[0] || '0';

            // 第三步：去除整数部分的前导0（但保留单个 0）以正确反映位数
            // 例如："000123" -> "123"；"000" -> "0"；"" -> "0"
            integerPart = integerPart.replace(/^0+(?=\d)/, '');
            if (integerPart === '') integerPart = '0';

            numStr = integerPart;
        } catch (e) {
            // 解析或转换失败，视为非法输入
            return null;
        }
    } else if (typeof input === 'number') {
        // 通过 Decimal 处理数字类型，避免科学计数法和精度问题
        try {
            const dec = new Decimal(input);
            // 截断小数位只保留整数部分
            const intDec = dec.trunc();
            // toFixed(0) 确保不使用指数表示，得到完整整数字符串
            let integerStr = intDec.toFixed(0);

            // 如果有负号，移除以便后续按位数判断（函数使用绝对值）
            if (integerStr.startsWith('-')) integerStr = integerStr.slice(1);

            // 去除整数部分的前导0，但保留单个 '0'
            integerStr = integerStr.replace(/^0+(?=\d)/, '');
            if (integerStr === '') integerStr = '0';

            numStr = integerStr;
        } catch (e) {
            return null;
        }
    } else {
        // 不支持其他类型
        return null;
    }

    // 2. 验证结果有效性（使用字符串校验，避免 Number 导致的溢出/精度问题）
    if (!/^[0-9]+$/.test(numStr)) {
        return null; // 非纯数字字符串视为非法
    }

    // 3. 查找匹配的单位（从大到小）
    for (let i = CHINESE_UNIT_MAP.length - 1; i >= 0; i--) { 
        if (numStr.length >= CHINESE_UNIT_MAP[i].digits) {
            const numDecimal = new Decimal(numStr);
            const thresholdDecimal = new Decimal(CHINESE_UNIT_MAP[i].threshold);
            return {
                ...CHINESE_UNIT_MAP[i],
                exactThreshold: CHINESE_UNIT_MAP[i].threshold,
                // 在该单位下的值键：
                valueInUnit: numDecimal.div(thresholdDecimal).toFixed(2, Decimal.ROUND_DOWN) // 保留2位小数，向下取整
            };
        }
    }

    // 4. 小于最小阈值（1e6）返回 null
    return null;
}

/**
 * 按照新规则格式化小数部分
 */
function formatDecimalPartNew(decStr, hasIntegerPart = false) {
    if (!decStr || decStr === '0') return '';
    
    const match = decStr.match(/^([0-9]*?[1-9][0-9]*?)(0*)$/);
    if (!match) return '';
    
    const effectivePart = match[1];
    const t = effectivePart.length;
    
    if (t <= 5) return '';
    
    const decimalPrefix = hasIntegerPart ? '.' : '0.';
    const hasLeadingZero = decStr[0] === '0';
    
    if (hasLeadingZero) {
        const leadingZeroMatch = decStr.match(/^(0+)/);
        const a = leadingZeroMatch ? leadingZeroMatch[1].length : 0;
        let k = effectivePart.slice(-3);
        k = k.replace(/^0+/, '');
        return `${decimalPrefix}0[${a}]末${k}[${t}]`;
    } else {
        let x = effectivePart.slice(0, 3);
        x = x.replace(/0+$/, '');
        let k = effectivePart.slice(-3);
        k = k.replace(/^0+/, '');
        return `${decimalPrefix}${x}末${k}[${t}]`;
    }
}

/**
 * 格式化小数部分（独立决策）
 */
function formatDecimalPart(decStr, hasIntegerPart) {
    if (!decStr || decStr === '0') return '';
    
    const specialFormat = formatDecimalPartNew(decStr, hasIntegerPart);
    if (specialFormat) return specialFormat;
    
    const numericValue = parseFloat("0." + decStr);
    let formattedDecimal;
    
    if (decStr.length <= 2) {
        formattedDecimal = numericValue.toFixed(Math.min(2, decStr.length)).substring(1);
    } else {
        formattedDecimal = numericValue.toFixed(2).substring(1);
    }
    
    return formattedDecimal;
}

/**
 * 判断是否需要分行显示
 */
function shouldUseLineBreak(integerStr, decimalStr) {
    if (!decimalStr) return false;
    
    if (decimalStr.includes('[') || decimalStr.includes('末')) return true;
    
    let cleanDecimal = decimalStr;
    if (cleanDecimal.startsWith('0.')) cleanDecimal = cleanDecimal.substring(2);
    else if (cleanDecimal.startsWith('.')) cleanDecimal = cleanDecimal.substring(1);
    
    if (cleanDecimal.length > 2) return true;
    if (integerStr.includes('<br>')) return true;
    
    return false;
}

/**
 * 将字符串数字转换为绝对值的字符串（不丢失精度）
 * @param {string} numStr - 数字字符串，可能包含负号
 * @returns {string} - 绝对值的字符串
 */
function stringAbs(numStr) {
    // 如果已经是字符串
    if (typeof numStr === 'string') {
        // 检查是否以负号开头
        if (numStr.startsWith('-')) {
            // 移除开头的负号
            return numStr.substring(1);
        }
        // 没有负号，直接返回
        return numStr;
    }
    
    // 如果不是字符串，转为字符串再处理
    const str = numStr.toString();
    return str.startsWith('-') ? str.substring(1) : str;
}

/**
 * 智能格式化数字（统一格式化函数，已修复大数处理和科学记数法）
 */
/**
 * 智能数字格式化函数
 * 将各种形式的数字（包括极大数、科学记数法）格式化为人类可读的中文格式
 * 支持特殊格式如："23.25亿[10]<br>.701末548[14]"
 * 
 * @param {number|string} num - 输入的数字，可以是数字类型或字符串，最好输入字符串
 * @returns {string} - 格式化后的字符串，可能包含HTML标签和特殊格式
 */
function formatNumberSmart(num) {
    // 记录开始格式化的日志
    console.log(`[formatNumberSmart] 开始格式化: ${num}`);
    
    // ================ 第一步：处理科学记数法 ================
    // 如果在字符串，检查输入是否包含科学记数法标记（e或E）
    if (typeof num === 'string' && (num.includes('e') || num.includes('E'))) {
        console.log(`[formatNumberSmart] 检测到科学记数法: ${num}`);
        // 将科学记数法转换为完整数字字符串，例如："1.23e+4" → "12300"
        num = convertScientificToFull(num);
        console.log(`[formatNumberSmart] 转换后: ${num}`);
        console.log("[formatNumberSmart] 注意科学记数法可能已经丢失精度，后续处理请谨慎。");
    }
    
    // ================ 第二步：处理无效数字 ================
    // 检查输入是否为NaN（非数字）或无限大/小
    if (isNaN(num) || !isFinite(num)) {
        // 将输入转为字符串
        const numStr = num.toString();
        // 如果是科学记数法，转换为完整形式，否则直接返回
        return numStr.includes('e') || numStr.includes('E') ? 
            convertScientificToFull(numStr) : numStr;
    }
    
    // ================ 第三步：处理零值 ================
    if (num === 0) return '0.00';
    
    // ================ 第四步：处理符号 ================
    const isNegative = num < 0;         // 检查是否为负数
    const prefix = isNegative ? '-' : ''; // 负号前缀
    const absNum = stringAbs(num);       // 取绝对值进行后续处理，使用字符串形式避免精度丢失，去除负号方便后续处理
    console.log(`[formatNumberSmart] 绝对值处理: 从${num} 到 ${absNum}`);

    // ================ 第五步：将数字转为字符串，避免科学记数法 ================
    let numStr;
    if (typeof num === 'number') {
        console.log(`[formatNumberSmart] 处理数字类型: ${num}`);
        // 对于非常大的数字（>= 1e21），Number.toString()会产生科学记数法
        if (absNum >= 1e21) {
            // 使用toLocaleString避免科学记数法，'fullwide'使用全角数字
            numStr = absNum.toLocaleString('fullwide', { useGrouping: false });
        } else {
            // 正常数字直接转为字符串
            numStr = absNum.toString();
        }
    } else {
        // 如果已经是字符串，直接使用
        numStr = absNum.toString();
        console.log(`[formatNumberSmart] 字符转字符串类型: ${numStr}`);
    }
    
    // ================ 第六步：分割整数和小数部分 ================
    // 将字符串按小数点分割，例如："1234.5678" → ["1234", "5678"]
    const [intPartStr, decPartStr = ''] = numStr.split('.');
    // intPartStr: 整数部分字符串（如"1234"）
    // decPartStr: 小数部分字符串（如"5678"），默认为空字符串
    
    // ================ 第七步：格式化整数部分 ================
    let integerStr = '';
    const intPart = parseInt(intPartStr, 10);  // 将整数部分转为数字
    
    if (intPart >= 1000000) {
        // 处理大数（>= 100万）
        const absIntStr = stringAbs(intPartStr);
        const intDigits = intPartStr.replace('-', '').length;  // 整数位数
        const unitInfo = getChineseUnitForNumber(absIntStr);      // 获取中文单位信息
        
        if (unitInfo) {
            // 计算数值部分：原始值 ÷ 单位阈值
            const formattedValue = unitInfo.valueInUnit; // 使用预计算的单位下的值
            
            let finalUnit = unitInfo.unit;     // 单位（如"亿"）
            let finalValue = formattedValue;   // 数值部分，被保留了2位小数
            
            // 最终整数部分格式：数值 + 单位 + [位数]，例如："23.25亿[10]"
            integerStr = `${finalValue}${finalUnit}[${intDigits}]`;
            console.log(`[formatNumberSmart] 格式化大数整数部分: ${integerStr}`);
        } else {
            // 如果没有匹配的单位，直接使用原始字符串转提取前四个字符展示
            if(intPart === Infinity || intPart === -Infinity) {
                integerStr = `${intPartStr.substring(0, 4)}[${intDigits}]`;
            }else if(intPart !== Infinity || intPart !== -Infinity && intDigits <= 4) {
                integerStr = `${intPartStr.substring(0, 2)}.${intPartStr.substring(2, 4)}[极巅峰][${intDigits}]`;
            }else {
                integerStr = '这究竟是什么？'
                console.log(`[formatNumberSmart] 无法格式化整数部分: ${intPartStr}`);
            }
            
        }
    } else if (intPart > 0) {
        // 小于100万的正常整数，直接使用
        integerStr = intPartStr;
    }
    // 注意：intPart === 0 的情况会在后面处理
    
    // ================ 第八步：格式化小数部分 ================
    let decimalStr = '';
    const hasIntegerPart = intPart > 0;  // 是否有整数部分
    
    if (decPartStr && decPartStr !== '0') {
        // 首先尝试特殊格式化规则（对于多位小数）
        const specialDecimalFormat = formatDecimalPartNew(decPartStr, hasIntegerPart);
        if (specialDecimalFormat) {
            // 使用特殊格式，如："0.0[5]末123[15]"
            decimalStr = specialDecimalFormat;
        } else {
            // 常规小数格式化
            const numericDec = parseFloat("0." + decPartStr);  // 将小数部分转为数字
            let formattedDecimal;
            
            if (decPartStr.length <= 2) {
                // 小数位数少，按实际位数显示
                formattedDecimal = numericDec.toFixed(Math.min(2, decPartStr.length)).substring(1);
            } else {
                // 小数位数多，固定显示2位
                formattedDecimal = numericDec.toFixed(2).substring(1);
            }
            
            // 根据是否有整数部分添加前缀
            if (hasIntegerPart) {
                decimalStr = formattedDecimal;          // 有整数部分：".567"
            } else {
                decimalStr = '0' + formattedDecimal;    // 无整数部分："0.567"
            }
        }
    }
    
    // ================ 第九步：组合整数和小数部分 ================
    let result = '';
    if (integerStr === '' || integerStr === '0') {
        // 情况1：没有整数部分或整数为0
        if (decimalStr) {
            result = decimalStr;        // 只有小数部分："0.567"
        } else {
            result = '0.00';            // 完全为0
        }
    } else if (!decimalStr) {
        // 情况2：只有整数部分，没有小数部分
        result = integerStr;            // 例如："1234"
    } else {
        // 情况3：同时有整数和小数部分
        const needsLineBreak = shouldUseLineBreak(integerStr, decimalStr);
        if (needsLineBreak) {
            // 需要换行显示，用<br>分隔
            result = integerStr + '<br>' + decimalStr;  // 例如："55<br>.701末548[14]"
        } else {
            // 不需要换行，直接拼接
            if (decimalStr.startsWith('0.')) {
                result = integerStr + decimalStr.substring(1);  // 移除多余的"0"
            } else if (decimalStr.startsWith('.')) {
                result = integerStr + decimalStr;               // 直接拼接
            } else {
                result = integerStr + decimalStr;               // 其他情况
            }
        }
    }
    
    // ================ 第十步：添加符号前缀并返回 ================
    const finalResult = prefix + result;  // 添加负号（如果有）
    console.log(`[formatNumberSmart] 格式化完成: "${finalResult}"`);
    return finalResult;
}
 
/**
 * 格式化天数显示：保留2位小数，添加"Days"后缀，使用科学记数法表示大数
 * TODO: 已修复大数处理精度问题，现在全都是截断而非四舍五入。
 * @param {number|string|Decimal} timeValue - 时间值（以天为单位），全精度原始字符串
 * @returns {string} 格式化后的字符串，例如："123.45 Days" 或 "1.23e+32 Days"
 */
function formatDaysWithSuffix(timeValue) {
    try {
        const d = new Decimal(timeValue);
        if (!d.isFinite()) return `${timeValue} Days`;

        // 定义阈值：大于 10^6 或 小于 0.01（且不为0）时使用科学记数法
        const isVeryLarge = d.gt(1e6);
        const isVerySmall = !d.isZero() && d.abs().lt(0.01);

        if (isVeryLarge || isVerySmall) {
            // 转为科学记数法，保留 2 位小数
            return d.toExponential(2, Decimal.ROUND_DOWN) + " Days";
        }

        // 常规数值显示
        return d.toFixed(2, Decimal.ROUND_DOWN) + " Days";
    } catch (e) {
        console.error('[formatDaysWithSuffix] 格式化失败:', e);
        console.error('[formatDaysWithSuffix] 输入值:', {'text': timeValue});
        return `${timeValue} Days`;
    }
}

// ===========================================================================
// UI锁定函数
// ===========================================================================

function lockInputs(locked) {
    const shouldLock = simulationStatus.isRunning;
    
    const inputs = [
        document.getElementById('inputDistance'),
        document.getElementById('sliderSpeed'),
        document.getElementById('sliderMultiplier'),
        document.getElementById('sliderFine'),
        document.getElementById('precisionGrid'),
        document.getElementById('timeUnitSelect')
    ];
    
    inputs.forEach((input) => {
        if (input) {
            input.disabled = shouldLock;
            input.style.opacity = shouldLock ? '0.6' : '1';
            input.style.cursor = shouldLock ? 'not-allowed' : '';
            input.style.pointerEvents = shouldLock ? 'none' : 'auto';
        }
    });
    
    const precisionTools = [
        document.getElementById('btnMaxPrecision'),
        document.getElementById('btnResetFine')
    ];
    
    precisionTools.forEach((btn) => {
        if (btn) {
            btn.disabled = shouldLock;
            btn.style.opacity = shouldLock ? '0.6' : '1';
            btn.style.cursor = shouldLock ? 'not-allowed' : '';
        }
    });
    
    updateReferenceSwitchUI();
}

// ===========================================================================
// 更新按钮状态
// ===========================================================================

function updateButtonStates() {
    const playBtn = document.getElementById('btnPlay');
    const pauseBtn = document.getElementById('btnPause');
    
    if (!playBtn || !pauseBtn) return;
    
    if (simulationStatus.isRunning) {
        playBtn.classList.remove('btn-primary');
        playBtn.classList.add('btn-disabled');
        playBtn.disabled = true;
        playBtn.setAttribute('data-state', 'disabled');
        
        pauseBtn.classList.remove('btn-disabled');
        pauseBtn.classList.add('btn-active');
        pauseBtn.disabled = false;
        pauseBtn.setAttribute('data-state', 'enabled');
    } else {
        playBtn.classList.remove('btn-disabled');
        playBtn.classList.add('btn-primary');
        playBtn.disabled = false;
        playBtn.setAttribute('data-state', 'enabled');
        
        pauseBtn.classList.remove('btn-active');
        pauseBtn.classList.add('btn-disabled');
        pauseBtn.disabled = true;
        pauseBtn.setAttribute('data-state', 'disabled');
    }
    
    lockInputs(simulationStatus.isRunning);
}

// ===========================================================================
// 动画循环（统一严格模式）
// ===========================================================================

function startAnimationLoop() {
    console.log('[startAnimationLoop] 启动动画循环');
    
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }
    
    function animate(currentTime) {
        if (!simulationStatus.isRunning || !simulator || !simulator.isRunning) {
            return;
        }
        
        const state = simulator.getCurrentState(currentTime);
        if (!state) return;
        // updateUIAtomically(formatStateSync(simulator.getCurrentState()));
        try {
            const formattedState = formatStateSync(state);
            updateUIAtomically(formattedState);
            
            if (state.isComplete) {
                pauseSimulation();
                return;
            }
            
            animationFrameId = requestAnimationFrame(animate);
        } catch (error) {
            console.error('[animate] 格式化或更新失败:', error);
        }
    }
    
    animationFrameId = requestAnimationFrame(animate);
}

/**
 * 立即更新UI（不传时间戳）原位更新
 * @returns 
 */
function updateUINow() {
    if (!simulator) return;
    
    // 关键：不传时间戳！
    const state = simulator.getCurrentState();  // ← 不传参数！
    const formattedState = formatStateSync(state);
    updateUIAtomically(formattedState);
}

function stopAnimationLoop() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    
    if (window.timeoutId) {
        clearTimeout(window.timeoutId);
        window.timeoutId = null;
    }
    
    lastFrameTime = null;
}

// ===========================================================================
// 同步格式化函数
// ===========================================================================

// ===========================================================================
// 同步格式化函数（已修复：添加 totalDistance 字段）
// ===========================================================================

/**
 * 同步格式化函数
 * 将模拟器返回的原始状态格式化为UI可直接使用的状态
 * 
 * 主要问题：这里进行数学计算，由模拟器完成高精度计算
 * 
 * @param {Object} state - 模拟器返回的原始状态对象
 * @param {number} currentTime - 当前时间戳（用于动画帧计算）
 * @returns {Object} - 格式化后的状态对象，包含UI所需的所有数据
 */
function formatStateSync(state, currentTime) {
    // 日志：开始格式化过程
    console.log('[formatStateSync] 开始同步格式化');
    // 性能监控：记录格式化耗时
    console.time('formatStateSync');
    
    try {
        // 日志：显示计算出的原始值
        console.log('[formatStateSync] 计算出的原始值:', state.allTime);
        
        // ================ 第四步：智能格式化每个值 ================
        // 储存格式化为特殊文本格式后的年月日时数据
        const formattedValues = {};
        
        // 遍历所有计算出的值
        for (const [key, value] of Object.entries(state.allTime)) {
            console.log(`[formatStateSync] 格式化 ${key}: ${value}`);
            
            // 使用智能格式化函数处理，格式化为类似  23.25亿[10].701末548[14]  的格式，输入的是字符串
            formattedValues[key] = formatNumberSmart(value);
            
            console.log(`[formatStateSync] ${key} 格式化结果: "${formattedValues[key]}"`);
        }
        console.log('[formatStateSync] 所有格式化结果:', formattedValues);
        // ================ 第五步：构建完整格式化状态对象 ================
        // 关键修复：确保返回完整的格式化状态，包括 totalDistance
        const formattedState = {
            // 直接复制原始字符串数据，一模一样重构
            earthTime: state.earthTime,       // 用于 地球时间显示
            shipTime: state.shipTime,         // 用于 飞船时间显示
            position: state.position,         // 位置信息
            gamma: state.gamma,               // γ因子
            progressPercent: state.progressPercent,    // 进度百分比
            
            // 新增：计算并格式化后为特殊格式后的年月日时数据
            formattedValues: formattedValues,          // 用于年月日小时显示
            
            // 关键修复：添加缺失的 totalDistance 字段
            // 优先使用格式化版本，如果没有则使用原始值
            totalDistance: state.totalDistance,
            
            // 确保其他必要字段也存在
            isComplete: state.isComplete,              // 模拟是否完成
            isRunning: state.isRunning                 // 模拟是否运行中
        };
        
        // 日志：显示最终格式化结果
        console.log('[formatStateSync] 格式化完成（已添加 totalDistance）:', formattedState);
        
        // 返回UI可以直接使用的格式化状态
        return formattedState;
        
    } catch (error) {
        // 错误处理：如果格式化过程出错
        console.error('[formatStateSync] 格式化失败:', error);
        // 抛出错误让调用者处理
        throw error;
        
    } finally {
        // 无论成功还是失败，都结束性能计时
        console.timeEnd('formatStateSync');
        console.log('[formatStateSync] 格式化结束');
    }
}

// ===========================================================================
// 原子性UI更新
// ===========================================================================

// ===========================================================================
// 原子性UI更新（已修复：确保状态完整传递）
// ===========================================================================

// ===========================================================================
// 原子性UI更新（已修复：确保状态完整传递和γ因子格式化一致）
// ===========================================================================
/**
 * 原子性UI更新函数
 * 将格式化后的状态一次性更新到所有相关UI元素，确保一致性
 * 
 * @param {Object} formattedState - 经过 formatStateSync 格式化后的状态对象
 */
function updateUIAtomically(formattedState) {
    console.log('[updateUIAtomically] 开始原子更新');
    console.time('updateUIAtomically');
    
    console.log('[updateUIAtomically] 更新状态来源数据为:', formattedState);
    try {
        // 批量更新DOM-更新年月日时显示
        const updates = [
            { id: 'earthConvertYear', value: formattedState.formattedValues.earthYear || '0.00' },
            { id: 'earthConvertMonth', value: formattedState.formattedValues.earthMonth || '0.00' },
            { id: 'earthConvertDay', value: formattedState.formattedValues.earthDay || '0.00' },
            { id: 'earthConvertHour', value: formattedState.formattedValues.earthHour || '0.00' },
            { id: 'shipConvertYear', value: formattedState.formattedValues.shipYear || '0.00' },
            { id: 'shipConvertMonth', value: formattedState.formattedValues.shipMonth || '0.00' },
            { id: 'shipConvertDay', value: formattedState.formattedValues.shipDay || '0.00' },
            { id: 'shipConvertHour', value: formattedState.formattedValues.shipHour || '0.00' }
        ];
        
        console.log('[updateUIAtomically] 开始更新DOM元素');
        
        updates.forEach(update => {
            const element = document.getElementById(update.id);
            if (element) {
                const oldValue = element.innerHTML;
                element.innerHTML = update.value;
                console.log(`[updateUIAtomically] 更新 ${update.id}: "${oldValue}" -> "${update.value}"`);
            } else {
                console.error(`[updateUIAtomically] 元素 ${update.id} 未找到!`);
            }
        });
        
        // 更新主显示
        if (formattedState.earthTime) {
            const element = document.getElementById('dispEarthTime');
            if (element) {
                const oldValue = element.textContent;
                const newValue = formatDaysWithSuffix(formattedState.earthTime);
                element.textContent = newValue;
                console.log(`[updateUIAtomically] 更新 dispEarthTime: "${oldValue}" -> "${newValue}"`);
            }
        }
        
        if (formattedState.shipTime) {
            const element = document.getElementById('dispShipTime');
            if (element) {
                const oldValue = element.textContent;
                const newValue = formatDaysWithSuffix(formattedState.shipTime);
                element.textContent = newValue;
                console.log(`[updateUIAtomically] 更新 dispShipTime: "${oldValue}" -> "${newValue}"`);
            }
        }
        
        // 更新时间单位标签
        const earthTimeUnit = document.getElementById('earthTimeUnit');
        const shipTimeUnit = document.getElementById('shipTimeUnit');
        if (earthTimeUnit) {
            earthTimeUnit.textContent = timeUnitDisplay[currentTimeUnit];
            console.log(`[updateUIAtomically] 更新 earthTimeUnit: "${timeUnitDisplay[currentTimeUnit]}"`);
        }
        if (shipTimeUnit) {
            shipTimeUnit.textContent = timeUnitDisplay[currentTimeUnit];
            console.log(`[updateUIAtomically] 更新 shipTimeUnit: "${timeUnitDisplay[currentTimeUnit]}"`);
        }
        
        // 修复：更新γ因子显示 - 使用中文单位格式化，与暂停时保持一致
        if (formattedState.gamma) {
            const gammaValue = parseFloat(formattedState.gamma);
            // 使用中文单位格式化γ因子，与暂停时保持一致
            const gammaChinese = formatGammaChinese(gammaValue,"updateUIAtomically,if (formattedState.gamma) {...此处...}");
            console.log(`[updateUIAtomically] 格式化γ因子结束: ${gammaValue} -> ${gammaChinese}`);
            const gammaRatioElement = document.getElementById('dispGammaRatio');
            const gammaValueElement = document.getElementById('gammaValue');
            
            if (gammaRatioElement) {
                const oldValue = gammaRatioElement.textContent;
                const newValue = `1 : ${gammaChinese}`;
                gammaRatioElement.textContent = newValue;
                console.log(`[updateUIAtomically] 更新 dispGammaRatio: "${oldValue}" -> "${newValue}"`);
            }
            
            if (gammaValueElement) {
                const oldValue = gammaValueElement.textContent;
                const newValue = gammaChinese;
                gammaValueElement.textContent = newValue;
                console.log(`[updateUIAtomically] 更新 gammaValue: "${oldValue}" -> "${newValue}"`);
            }
            
            // 更新换算描述（确保与暂停时行为一致）
            updateGammaConversionDesc(gammaValue);
        }
        
        // 更新行程进度
        if (formattedState.progressPercent !== undefined) {
            const progressPercentElement = document.getElementById('dispProgressPercent');
            if (progressPercentElement) {
                const oldValue = progressPercentElement.textContent;
                const newValue = formattedState.progressPercent.toFixed(3) + '%';
                progressPercentElement.textContent = newValue;
                console.log(`[updateUIAtomically] 更新 dispProgressPercent: "${oldValue}" -> "${newValue}"`);
            }
            
            const progressBar = document.getElementById('progressBar');
            if (progressBar) {
                const oldWidth = progressBar.style.width;
                const newWidth = `${formattedState.progressPercent}%`;
                progressBar.style.width = newWidth;
                console.log(`[updateUIAtomically] 更新 progressBar: "${oldWidth}" -> "${newWidth}"`);
            }
            
            const journeyMask = document.getElementById('journeyProgressMask');
            if (journeyMask) {
                const oldWidth = journeyMask.style.width;
                const newWidth = `${100 - formattedState.progressPercent}%`;
                journeyMask.style.width = newWidth;
                console.log(`[updateUIAtomically] 更新 journeyProgressMask: "${oldWidth}" -> "${newWidth}"`);
            }
            
            // 更新距离显示
            const distanceElement = document.getElementById('dispDistance');
            if (distanceElement && formattedState.position) {
                const oldValue = distanceElement.textContent;
                const newValue = formattedState.position + ' 光年';
                distanceElement.textContent = newValue;
                console.log(`[updateUIAtomically] 更新 dispDistance: "${oldValue}" -> "${newValue}"`);
            }
        }
        
        // 关键修复：确保传入完整的状态对象到 updateCanvasShipPosition
        console.log('[updateUIAtomically] 准备更新Canvas飞船位置');
        console.log('[updateUIAtomically] formattedState:', formattedState);
        
        // 构建完整的状态对象传递给 updateCanvasShipPosition
        const canvasState = {
            position: formattedState.position,
            totalDistance: formattedState.totalDistance,
            progressPercent: formattedState.progressPercent,
            isComplete: formattedState.isComplete,
            isRunning: formattedState.isRunning
        };
        
        updateCanvasShipPosition(canvasState);
        
        console.log('[updateUIAtomically] 原子更新完成');
    } catch (error) {
        console.error('[updateUIAtomically] 原子更新失败:', error);
    } finally {
        console.timeEnd('updateUIAtomically');
    }
}

// ===========================================================================
// 模拟控制函数
// ===========================================================================

function startSimulation() {
    console.log('[startSimulation] 开始模拟');
    
    if (!simulator) {
        console.error('[startSimulation] 模拟器未初始化');
        return;
    }
    
    if (simulationStatus.isRunning) {
        console.warn('[startSimulation] 模拟已经在运行中');
        return;
    }
    
    try {
        updateSimulatorParameters();
        const state = simulator.start(performance.now());
        
        simulationStatus.isRunning = true;
        simulationStatus.isPaused = false;
        
        updateButtonStates();
        startAnimationLoop();
        
        const runTimeDisplay = document.getElementById('runTimeDisplay');
        if (runTimeDisplay) runTimeDisplay.style.display = 'block';
        
        console.log('[startSimulation] 模拟开始成功');
    } catch (error) {
        console.error('[startSimulation] 启动模拟失败:', error);
        simulationStatus.isRunning = false;
        updateButtonStates();
    }
}
/**
 * 暂停模拟
 * @returns 
 */
function pauseSimulation() {
    console.log('[pauseSimulation] 暂停模拟');
    
    if (!simulator || !simulationStatus.isRunning) {
        console.log('[pauseSimulation] 模拟未运行，无需暂停');
        return;
    }
    
    try {
        const state = simulator.pause(performance.now());
        
        simulationStatus.isRunning = false;
        simulationStatus.isPaused = true;
        
        stopAnimationLoop();
        updateButtonStates();
        updateSimulationUI(state);
        console.log('[pauseSimulation] 模拟暂停成功');
    } catch (error) {
        console.error('[pauseSimulation] 暂停模拟失败:', error);
    }
}

function resetSimulation() {
    console.log('[resetSimulation] 重置模拟');
    
    stopAnimationLoop();
    
    if (simulator) {
        try {
            const state = simulator.reset();
            simulationStatus.isRunning = false;
            simulationStatus.isPaused = false;
            updateButtonStates();
            resetTimeDisplay(false);
        } catch (error) {
            console.error('[resetSimulation] 重置模拟失败:', error);
        }
    } else {
        resetTimeDisplay();
        simulationStatus.isRunning = false;
        simulationStatus.isPaused = false;
        updateButtonStates();
    }
}

// ===========================================================================
// 模拟器参数更新（已修复：移除时间单位系数的乘法）
// ===========================================================================

function updateSimulatorParameters() {
    console.log('[updateSimulatorParameters] 更新模拟器参数');
    
    if (!simulator) {
        console.error('[updateSimulatorParameters] 模拟器未初始化');
        return;
    }
    
    try {
        const distance = document.getElementById('inputDistance').value;
        const multiplier = parseInt(document.getElementById('sliderMultiplier').value);
        
        console.log(`[updateSimulatorParameters] 距离: ${distance}, 倍率: ${multiplier}`);
        
        // 关键修复：只传递基础倍率，不乘以时间单位系数
        simulator.initialize({
            totalDistance: distance,
            speedDigits: speedDigits,
            timeMultiplier: multiplier, // 注意：这里只传递基础倍率
            referenceFrame: currentReferenceFrame
        });
        
        // 通知模拟器当前的时间单位
        simulator.updateTimeUnit(currentTimeUnit);
        
        console.log('[updateSimulatorParameters] 模拟器参数已更新');
    } catch (error) {
        console.error('[updateSimulatorParameters] 更新模拟器参数失败:', error);
    }
}

function updateSimulatorSpeed() {
    console.log('[updateSimulatorSpeed] 更新模拟器速度');
    
    if (!simulator) {
        console.error('[updateSimulatorSpeed] 模拟器未初始化');
        return;
    }
    
    try {
        const state = simulator.updateSpeed(speedDigits);
        if (!simulationStatus.isRunning) updateSimulationUI(state);
    } catch (error) {
        console.error('[updateSimulatorSpeed] 更新模拟器速度失败:', error);
    }
}

function updateSimulatorDistance() {
    console.log('[updateSimulatorDistance] 更新模拟器距离');
    
    if (!simulator) {
        console.error('[updateSimulatorDistance] 模拟器未初始化');
        return;
    }
    
    try {
        const distance = document.getElementById('inputDistance').value;
        console.log(`[updateSimulatorDistance] 新距离: ${distance}`);
        
        // 更新模拟器参数（不获取返回状态）
        simulator.updateTotalDistance(distance);
        
        // 如果模拟未运行，直接更新UI
        if (!simulationStatus.isRunning) {
            updateUINow();  // ← 这里！使用统一更新函数
        }
    } catch (error) {
        console.error('[updateSimulatorDistance] 更新模拟器距离失败:', error);
    }
}

// 关键修复：updateSimulatorMultiplier函数（已修复双重乘法问题）
function updateSimulatorMultiplier() {
    console.log('[updateSimulatorMultiplier] 更新模拟器倍率');
    
    if (!simulator) {
        console.error('[updateSimulatorMultiplier] 模拟器未初始化');
        return;
    }
    
    try {
        const multiplier = parseInt(document.getElementById('sliderMultiplier').value);
        console.log(`[updateSimulatorMultiplier] 新倍率: ${multiplier}`);
        
        // 关键修复：只传递基础倍率，不乘以时间单位系数
        const state = simulator.updateTimeMultiplier(multiplier);
        
        // 如果模拟未运行，更新UI预览
        if (!simulationStatus.isRunning) {
            updateSimulationUI(state);
        }
        
        updateMultiplierDisplay();
        
        console.log('[updateSimulatorMultiplier] 模拟器倍率已更新');
    } catch (error) {
        console.error('[updateSimulatorMultiplier] 更新模拟器倍率失败:', error);
    }
}

// ===========================================================================
// UI更新函数
// ===========================================================================

// ===========================================================================
// UI更新函数（已添加γ因子换算描述更新）
// ===========================================================================

function updateSimulationUI(state) {
    console.log('[updateSimulationUI] 更新模拟UI');
    
    if (!state) {
        console.warn('[updateSimulationUI] 状态为空');
        return;
    }
    
    try {
        const earthTimeElement = document.getElementById('dispEarthTime');
        const shipTimeElement = document.getElementById('dispShipTime');
        
        if (earthTimeElement) earthTimeElement.textContent = formatDaysWithSuffix(state.earthTime || '0');
        if (shipTimeElement) shipTimeElement.textContent = formatDaysWithSuffix(state.shipTime || '0');
        
        const earthTimeUnit = document.getElementById('earthTimeUnit');
        const shipTimeUnit = document.getElementById('shipTimeUnit');
        if (earthTimeUnit) earthTimeUnit.textContent = timeUnitDisplay[currentTimeUnit];
        if (shipTimeUnit) shipTimeUnit.textContent = timeUnitDisplay[currentTimeUnit];
        
        updateJourneyProgress(state);
        
        // 修复：更新γ因子显示 - 保持与播放时一致的中文单位格式化
        if (state.gammaFormatted) {
            console.log('[updateSimulationUI] 使用预格式化的γ因子的原始完整信息:', state);
            const gammaValue = state.gamma;
            // 使用中文单位格式化γ因子
            const gammaChinese = formatGammaChinese(gammaValue,"updateSimulationUI(state),if (state.gammaFormatted) {..此处..}");
            
            const gammaRatio = document.getElementById('dispGammaRatio');
            const gammaValueElement = document.getElementById('gammaValue');
            
            if (gammaRatio && gammaValueElement) {
                gammaRatio.textContent = `1 : ${gammaChinese}`;
                gammaValueElement.textContent = gammaChinese;
                
                // 更新换算描述
                updateGammaConversionDesc(gammaValue);
            }
        }
        
        updateProgressBar(state);// 更新百分比进度条
        updateCanvasShipPosition(state);// 更新Canvas飞船位置
        
        console.log('[updateSimulationUI] UI更新完成');
    } catch (error) {
        console.error('[updateSimulationUI] 更新UI失败:', error);
    }
}
/**
 * 重置时间显示函数
 * 将所有时间显示和进度条重置为初始状态
 * @param {boolean} isOffGammaReset - 是否重置γ因子显示，默认为true
 * @returns {void}
 */
function resetTimeDisplay(isOffGammaReset = true) {
    console.log('[resetTimeDisplay] 重置时间显示');
    
    const earthTimeElement = document.getElementById('dispEarthTime');
    const shipTimeElement = document.getElementById('dispShipTime');
    if (earthTimeElement) earthTimeElement.textContent = '0.00 Days';
    if (shipTimeElement) shipTimeElement.textContent = '0.00 Days';
    
    const earthTimeUnit = document.getElementById('earthTimeUnit');
    const shipTimeUnit = document.getElementById('shipTimeUnit');
    if (earthTimeUnit) earthTimeUnit.textContent = timeUnitDisplay[currentTimeUnit];
    if (shipTimeUnit) shipTimeUnit.textContent = timeUnitDisplay[currentTimeUnit];
    
    const progressPercentElement = document.getElementById('dispProgressPercent');
    const distanceElement = document.getElementById('dispDistance');
    const journeyMask = document.getElementById('journeyProgressMask');
    if (progressPercentElement) progressPercentElement.textContent = '0.000%';
    if (distanceElement) distanceElement.textContent = '0.000000 光年';
    if (journeyMask) journeyMask.style.width = '100%';
    
    const gammaRatio = document.getElementById('dispGammaRatio');
    const gammaValue = document.getElementById('gammaValue');
    if(isOffGammaReset){
        if (gammaRatio) gammaRatio.textContent = '1 : 1.00';
        if (gammaValue) gammaValue.textContent = '1.0000';
    }
    
    const progressBar = document.getElementById('progressBar');
    if (progressBar) progressBar.style.width = '0%';
    
    const timeConversionIds = [
        'earthConvertYear', 'earthConvertMonth', 'earthConvertDay', 'earthConvertHour',
        'shipConvertYear', 'shipConvertMonth', 'shipConvertDay', 'shipConvertHour'
    ];
    
    timeConversionIds.forEach(id => {
        const element = document.getElementById(id);
        if (element) element.textContent = '0.00';
    });
    
    if (canvas && ctx) drawStaticScene();
}
/**
 * 更新行程进度显示
 * @param {Object} state - 模拟器当前状态对象
 */
function updateProgressBar(state) {
    // 更新进度条宽度
    const progressBar = document.getElementById('progressBar');
    if (!progressBar) return;
    
    if (state && state.progressPercent !== undefined) {
        progressBar.style.width = `${state.progressPercent}%`;
    } else {
        progressBar.style.width = '0%';
    }
}

// ===========================================================================
// 更新Canvas飞船位置（已修复：增强状态验证和错误处理）
// ===========================================================================

function updateCanvasShipPosition(state) {
    console.log('[updateCanvasShipPosition] 更新Canvas飞船位置');
    
    if (!canvas || !ctx) {
        console.warn('[updateCanvasShipPosition] Canvas上下文未初始化');
        return;
    }
    
    if (!state) {
        console.warn('[updateCanvasShipPosition] 状态为空');
        return;
    }
    
    try {
        // 清除画布
        ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
        
        // 根据canvas尺寸动态计算
        const width = canvas.width / dpr;
        const height = canvas.height / dpr;
        const padding = Math.min(width, height) * 0.05;
        const w = width - padding * 2;
        const cy = height / 2;
        const startX = padding;
        const endX = padding + w;
        
        console.log(`[updateCanvasShipPosition] 绘制参数: width=${width}, height=${height}, padding=${padding}, w=${w}, cy=${cy}`);
        
        // 计算飞船当前位置
        let progress = 0;
        let position = 0;
        let totalDistance = 1;
        
        // 关键修复：更健壮的状态验证和解析
        if (state && state.position !== undefined) {
            try {
                // 尝试从 state.position 解析位置
                if (typeof state.position === 'string') {
                    position = parseFloat(state.position) || 0;
                } else if (typeof state.position === 'number') {
                    position = state.position;
                } else {
                    console.warn('[updateCanvasShipPosition] state.position 类型无效:', typeof state.position);
                    position = 0;
                }
                
                // 尝试从 state.totalDistance 解析总距离
                if (state.totalDistance !== undefined) {
                    if (typeof state.totalDistance === 'string') {
                        totalDistance = parseFloat(state.totalDistance) || 1;
                    } else if (typeof state.totalDistance === 'number') {
                        totalDistance = state.totalDistance;
                    } else {
                        console.warn('[updateCanvasShipPosition] state.totalDistance 类型无效:', typeof state.totalDistance);
                        totalDistance = 1;
                    }
                } else {
                    console.warn('[updateCanvasShipPosition] state.totalDistance 未定义，使用默认值1');
                    totalDistance = 1;
                }
                
                // 防止除以零
                if (totalDistance <= 0) {
                    console.warn('[updateCanvasShipPosition] totalDistance <= 0，重置为1');
                    totalDistance = 1;
                }
                
                // 计算进度
                progress = Math.min(1, position / totalDistance);
                console.log(`[updateCanvasShipPosition] 进度: ${progress} (${position}/{totalDistance})`);
            } catch (e) {
                console.error('[updateCanvasShipPosition] 计算进度失败:', e);
                progress = 0;
            }
        } else {
            console.warn('[updateCanvasShipPosition] state.position 未定义');
        }
        
        const shipX = startX + (progress * w);
        console.log(`[updateCanvasShipPosition] 飞船X位置: ${shipX} (进度: ${progress})`);
        
        // 绘制星空背景
        drawStars();
        
        // 绘制航线
        ctx.beginPath();
        ctx.moveTo(startX, cy);
        ctx.lineTo(endX, cy);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // 绘制地球和目标星球
        drawPlanet(ctx, startX, cy, '#3498db', '地球'); 
        drawPlanet(ctx, endX, cy, '#e74c3c', '目标'); 
        
        // 绘制飞船
        drawShip(ctx, shipX, cy);
        
        console.log('[updateCanvasShipPosition] 飞船位置更新完成');
    } catch (error) {
        console.error('[updateCanvasShipPosition] 更新飞船位置失败:', error);
    }
}

// ===========================================================================
// 参考系切换功能
// ===========================================================================

function initializeReferenceSwitch() {
    console.log('[initializeReferenceSwitch] 初始化参考系切换');
    
    const switchOptions = document.querySelectorAll('.switch-option');
    switchOptions.forEach((option) => option.addEventListener('click', handleReferenceSwitch));
    
    updateReferenceSwitchUI();
    updateMultiplierDisplay();
}

function handleReferenceSwitch(event) {
    const selectedValue = event.currentTarget.dataset.value;
    console.log(`[handleReferenceSwitch] 参考系切换: ${selectedValue}`);
    
    if (simulationStatus.isRunning) {
        console.warn('[handleReferenceSwitch] 模拟正在运行中，无法切换参考系');
        event.preventDefault();
        return;
    }
    
    if (selectedValue === currentReferenceFrame) {
        console.log(`[handleReferenceSwitch] 参考系未改变，仍是 ${selectedValue}`);
        return;
    }
    
    currentReferenceFrame = selectedValue;
    console.log(`[handleReferenceSwitch] 参考系已切换为: ${currentReferenceFrame}`);
    
    updateReferenceSwitchUI();
    updateMultiplierDisplay();
    updateSimulatorReferenceFrame();
}

function updateReferenceSwitchUI() {
    const switchOptions = document.querySelectorAll('.switch-option');
    
    switchOptions.forEach((option) => {
        const isSelected = option.dataset.value === currentReferenceFrame;
        const isDisabled = simulationStatus.isRunning;
        
        if (isSelected) option.classList.add('active');
        else option.classList.remove('active');
        
        if (isDisabled) {
            option.classList.add('disabled');
            option.style.cursor = 'not-allowed';
            option.style.opacity = '0.6';
            option.style.pointerEvents = 'none';
        } else {
            option.classList.remove('disabled');
            option.style.cursor = 'pointer';
            option.style.opacity = '1';
            option.style.pointerEvents = 'auto';
        }
    });
}

function updateMultiplierDisplay() {
    console.log('[updateMultiplierDisplay] 更新倍率显示');
    
    const multiplier = document.getElementById('sliderMultiplier').value;
    const multiplierDisplay = document.getElementById('multiplierDisplay');
    const currentReference = document.getElementById('currentReference');
    const multiplierValue = document.getElementById('multiplierValue');
    const timeUnitLabel = document.getElementById('timeUnitLabel');
    
    if (timeUnitLabel) {
        timeUnitLabel.textContent = timeUnitDisplay[currentTimeUnit];
    }
    
    if (currentReferenceFrame === 'earth') {
        if (multiplierDisplay) multiplierDisplay.textContent = `${multiplier}x 地球时间`;
        if (currentReference) currentReference.textContent = '地球';
    } else {
        if (multiplierDisplay) multiplierDisplay.textContent = `${multiplier}x 飞船时间`;
        if (currentReference) currentReference.textContent = '飞船';
    }
    
    if (multiplierValue) multiplierValue.textContent = multiplier;
}

function updateSimulatorReferenceFrame() {
    console.log('[updateSimulatorReferenceFrame] 更新模拟器参考系');
    
    if (!simulator) {
        console.error('[updateSimulatorReferenceFrame] 模拟器未初始化');
        return;
    }
    
    try {
        const state = simulator.setReferenceFrame(currentReferenceFrame);
        if (!simulationStatus.isRunning) updateSimulationUI(state);
    } catch (error) {
        console.error('[updateSimulatorReferenceFrame] 更新模拟器参考系失败:', error);
    }
}

// ===========================================================================
// 时间单位切换功能（已修复暂停逻辑）
// ===========================================================================

function initializeTimeUnitSwitch() {
    console.log('[initializeTimeUnitSwitch] 初始化时间单位切换');
    
    const timeUnitSelect = document.getElementById('timeUnitSelect');
    if (timeUnitSelect) {
        timeUnitSelect.addEventListener('change', handleTimeUnitSwitch);
    } else {
        console.error('[initializeTimeUnitSwitch] 时间单位选择器未找到');
    }
}

/**
 * 处理时间单位切换事件
 * @param {Event} event - 事件对象
 */
function handleTimeUnitSwitch(event) {
    const selectedValue = event.target.value;
    console.log(`[handleTimeUnitSwitch] 时间单位切换: ${selectedValue}`);
    
    currentTimeUnit = selectedValue;
    console.log(`[handleTimeUnitSwitch] 时间单位已切换为: ${timeUnitDisplay[currentTimeUnit]}`);
    
    updateMultiplierDisplay();
    updateTimeUnitDisplay();

    if (!simulationStatus.isRunning) {
        updateUINow();  // 立即更新显示
    }
}

// 新增：统一更新时间单位显示
function updateTimeUnitDisplay() {
    console.log('[updateTimeUnitDisplay] 更新时间单位显示');
    
    const timeUnitLabel = document.getElementById('timeUnitLabel');
    const selectedTimeUnit = document.getElementById('selectedTimeUnit');
    const earthTimeUnit = document.getElementById('earthTimeUnit');
    const shipTimeUnit = document.getElementById('shipTimeUnit');
    
    const displayText = timeUnitDisplay[currentTimeUnit];
    
    if (timeUnitLabel) timeUnitLabel.textContent = displayText;
    if (selectedTimeUnit) selectedTimeUnit.textContent = displayText;
    if (earthTimeUnit) earthTimeUnit.textContent = displayText;
    if (shipTimeUnit) shipTimeUnit.textContent = displayText;
    
    console.log(`[updateTimeUnitDisplay] 时间单位显示已更新为: ${displayText}`);
}

// ===========================================================================
// 行程进度显示功能
// ===========================================================================

function updateJourneyProgress(state) {
    if (!state) {
        console.warn('[updateJourneyProgress] 状态为空');
        return;
    }
    
    try {
        const position = parseFloat(state.position) || 0;
        const totalDistance = parseFloat(state.totalDistance) || 1;
        const progressPercent = Math.min(100, (position / totalDistance) * 100);
        
        const progressPercentElement = document.getElementById('dispProgressPercent');
        if (progressPercentElement) {
            progressPercentElement.textContent = progressPercent.toFixed(3) + '%';
        }
        
        const journeyMask = document.getElementById('journeyProgressMask');
        if (journeyMask) journeyMask.style.width = `${100 - progressPercent}%`;
        
        const distanceElement = document.getElementById('dispDistance');
        if (distanceElement) distanceElement.textContent = state.positionFormatted + ' 光年';
    } catch (error) {
        console.error('[updateJourneyProgress] 更新行程进度失败:', error);
    }
}

// ===========================================================================
// 伽马因子格式化功能
// ===========================================================================

// ===========================================================================
// 伽马因子格式化功能（修改为使用中文单位格式化，确保一致性）
// ===========================================================================

function formatGammaValue(gamma) {
    // 直接使用中文单位格式化γ因子，确保与播放和暂停时的一致性
    return formatGammaChinese(gamma,"formatGammaValue(gamma) {");
}

// ===========================================================================
// 按钮事件注册
// ===========================================================================

function registerButtonEvents() {
    console.log('[registerButtonEvents] 注册按钮事件');
    
    const playBtn = document.getElementById('btnPlay');
    const pauseBtn = document.getElementById('btnPause');
    const resetBtn = document.getElementById('btnReset');
    const multiplierSlider = document.getElementById('sliderMultiplier');
    
    if (playBtn) {
        playBtn.addEventListener('click', function() {
            console.log('[playBtn] 播放按钮点击');
            if (simulationStatus.isPaused) {
                startSimulation();
            } else {
                startSimulation();
            }
        });
    }
    
    if (pauseBtn) {
        pauseBtn.addEventListener('click', function() {
            console.log('[pauseBtn] 暂停按钮点击');
            if (!simulationStatus.isRunning) return;
            pauseSimulation();
        });
    }
    
    if (resetBtn) {
        resetBtn.addEventListener('click', function() {
            console.log('[resetBtn] 重置按钮点击');
            resetSimulation();
        });
    }
    
    if (multiplierSlider) {
        multiplierSlider.oninput = function(e) {
            const mult = parseInt(e.target.value);
            console.log(`[multiplierSlider] 倍率滑块变化: ${mult}`);
            
            if (simulationStatus.isRunning) {
                console.warn('[multiplierSlider] 模拟运行中，阻止倍率修改');
                const currentMultiplier = simulator ? simulator.timeMultiplier : 1;
                e.target.value = currentMultiplier;
                return;
            }
            
            updateMultiplierDisplay();
            updateSimulatorMultiplier();
        };
    }
    
    [playBtn, pauseBtn, resetBtn].forEach((btn, index) => {
        if (btn) {
            btn.addEventListener('mouseenter', function() {
                if (!this.disabled) {
                    this.style.transform = 'translateY(-2px)';
                    this.style.boxShadow = this.id === 'btnReset' 
                        ? '0 5px 15px rgba(255, 71, 87, 0.3)'
                        : '0 5px 15px rgba(0, 242, 255, 0.3)';
                }
            });
            
            btn.addEventListener('mouseleave', function() {
                if (!this.disabled) {
                    this.style.transform = 'translateY(0)';
                    this.style.boxShadow = 'none';
                }
            });
        }
    });
}

// ===========================================================================
// 核心功能函数
// ===========================================================================

function digitsToString(digits) {
    return "0." + digits.join('');
}

function stringToDigits(str) {
    if (!str.startsWith("0.")) str = "0." + str.replace(/^0\.?/, '');
    const decimalPart = str.substring(2);
    const newDigits = new Array(66).fill(0);
    for (let i = 0; i < Math.min(66, decimalPart.length); i++) {
        newDigits[i] = parseInt(decimalPart[i]) || 0;
    }
    return newDigits;
}

function findLastNonZeroIndex(digits, startIndex = 0) {
    for (let i = digits.length - 1; i >= startIndex; i--) {
        if (digits[i] !== 0) return i;
    }
    return -1;
}

function arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
}

function findLastNonZeroPosition(digits) {
    for (let i = digits.length - 1; i >= 2; i--) {
        if (digits[i] !== 0) return i;
    }
    return -1;
}

function calculateDisplayPercentages(digits) {
    const percentages = new Array(66).fill(0);
    const lastNonZeroIndex = findLastNonZeroIndex(digits, 0);
    
    for (let i = 0; i < 66; i++) {
        const digit = digits[i];
        if (digit === 0) percentages[i] = (i <= lastNonZeroIndex) ? 100 : 0;
        else if (digit === 9) percentages[i] = 100;
        else percentages[i] = digit * 10;
    }
    
    return percentages;
}

function areLast64DigitsZero(digits) {
    for (let i = 2; i < 66; i++) if (digits[i] !== 0) return false;
    return true;
}

function areLast64DigitsNine(digits) {
    for (let i = 2; i < 66; i++) if (digits[i] !== 9) return false;
    return true;
}

// ===========================================================================
// 进度条映射函数
// ===========================================================================

/**
 * 根据给定的数字数组计算新的进度百分比（重构版本）
 * 采用"基础百分比 + 高精度附加值"的双层模型
 * 
 * @param {number[]} digits - 数字数组，包含66个数字（0-9之间的整数）
 * @returns {number} - 计算出的进度百分比，范围在0到100之间
 */
function calculateNewProgress(digits) {
    try {
        // ========== 阶段1：计算基础百分比 ==========
        
        // 提取前两位数字构成的基础速度值 (0.01 到 0.99)
        const baseValue = digits[0] * 0.1 + digits[1] * 0.01;
        
        // 基础百分比：0.01 → 0%, 0.99 → 50%
        // 公式: (基础值 - 0.01) / 0.98 × 50
        const basePercentage = (baseValue - 0.01) / 0.98 * 50;
        
        // 确保基础百分比在有效范围内
        const clampedBasePercentage = Math.max(0, Math.min(50, basePercentage));
        
        // ========== 阶段2：计算高精度附加值 ==========
        

        // 高精度比例（0~1）实质是0%到100%
        let highPrecisionRatio = 0;
        
        // 高精度附加值映射到576个离散点（0~576）
        let precisionPoints = 0;

        // 计算离散映射点，映射原理是9100一定大于1000因为规则要求高位大于低位导致1000..一定对应1，而91000一定对应10，而64个9一定对应576。
        for (let i = 2; i < 66; i++) {
            precisionPoints += speedDigits[i];
        }

        // 计算高精度附加值（0 到 1）实质是0%到100%
        highPrecisionRatio = precisionPoints / 576;
        
        // 计算高精度附加值
        let fineAddition = 0;
        
        // 情况A：基础百分比 < 50%（前两位不是0.99）
        if (clampedBasePercentage < 50) {
            // 后64位全为0 → 附加值 = 0%
            // 后64位全为9 → 附加值 = 1%
            fineAddition = highPrecisionRatio //从100%映射到1%;
        }
        // 情况B：基础百分比 = 50%（前两位为0.99）
        else if (clampedBasePercentage === 50) {
            // 后64位全为0 → 附加值 = 0%
            // 后64位全为9 → 附加值 = 50%
            fineAddition = highPrecisionRatio * 50; //从100%映射到50%;
        }
        
        // ========== 阶段3：计算最终总进度 ==========
        
        const totalProgress = clampedBasePercentage + fineAddition;
        console.log(`[calculateNewProgress] 基础百分比: ${clampedBasePercentage.toFixed(4)}%, 高精度附加值: ${fineAddition.toFixed(4)}%, 总进度: ${totalProgress.toFixed(4)}%`);
        // 确保总进度不超过100%
        return Math.min(100, totalProgress);
    } catch (error) {
        console.error('[calculateNewProgress] 计算新进度失败:', error);
        return 0;
    }
}

// ===========================================================================
// 简化的序列生成算法
// ===========================================================================

function generatePrecisionSequence(coarseValue) {
    const sequence = [];
    
    const allZeros = new Array(66).fill(0);
    allZeros[0] = Math.floor(coarseValue * 10);
    allZeros[1] = Math.floor(coarseValue * 100) % 10;
    sequence.push(allZeros);
    
    for (let position = 2; position < 66; position++) {
        for (let digit = 1; digit <= 9; digit++) {
            const digits = new Array(66).fill(0);
            digits[0] = Math.floor(coarseValue * 10);
            digits[1] = Math.floor(coarseValue * 100) % 10;
            
            for (let i = 2; i < position; i++) digits[i] = 9;
            digits[position] = digit;
            
            sequence.push(digits);
        }
    }
    
    const allNines = new Array(66).fill(0);
    allNines[0] = Math.floor(coarseValue * 10);
    allNines[1] = Math.floor(coarseValue * 100) % 10;
    for (let i = 2; i < 66; i++) allNines[i] = 9;
    sequence.push(allNines);
    
    sequence.sort((a, b) => {
        for (let i = 0; i < 66; i++) if (a[i] !== b[i]) return a[i] - b[i];
        return 0;
    });
    
    return sequence;
}

function updatePrecisionSequence() {
    console.log('[updatePrecisionSequence] 更新精度序列');
    
    const coarseValue = speedDigits[0] * 0.1 + speedDigits[1] * 0.01;
    currentPrecisionSequence = generatePrecisionSequence(coarseValue);
    
    let currentIndex = 0;
    for (let i = 0; i < currentPrecisionSequence.length; i++) {
        if (arraysEqual(speedDigits, currentPrecisionSequence[i])) {
            currentIndex = i;
            break;
        }
    }
    
    if (currentIndex === 0 && !arraysEqual(speedDigits, currentPrecisionSequence[0])) {
        speedDigits = currentPrecisionSequence[0].slice();
        currentIndex = 0;
    }
    
    const fineSlider = document.getElementById('sliderFine');
    if (fineSlider) fineSlider.value = currentIndex;
    
    const fineSliderPosition = document.getElementById('fineSliderPosition');
    if (fineSliderPosition) fineSliderPosition.textContent = currentIndex;
}

// ===========================================================================
// UI 更新函数
// ===========================================================================

function updateAllUI() {
    updateSpeedDisplay();
    updatePrecisionGrid();
    updateGammaDisplay();
    updateFullPrecisionDisplay();
    updateLogProgressBar();
}

function updateSpeedDisplay() {
    const coarseValue = speedDigits[0] * 10 + speedDigits[1];
    const displayElement = document.getElementById('speedDisplayValue');
    
    if (!displayElement) return;
    
    if (areLast64DigitsZero(speedDigits)) {
        displayElement.textContent = `${coarseValue}.00%`;
    } else {
        const thirdDigit = speedDigits[2] || 0;
        const fourthDigit = speedDigits[3] || 0;
        displayElement.textContent = `${coarseValue}.${thirdDigit}${fourthDigit} x%`;
    }
}

/**
 * 更新日志进度条的显示状态和速度数值显示
 * 该函数每帧被调用，用于实时更新界面上的进度条和速度数值
 */
function updateLogProgressBar() {
    // 1. 计算并更新进度条
    // 使用当前速度数字计算新的进度百分比
    const progress = calculateNewProgress(speedDigits);
    console.log(`[updateLogProgressBar] 计算出的新进度: ${progress.toFixed(4)}%`);
    // 获取进度条的遮罩元素，该元素通过覆盖部分进度条来实现进度显示
    const maskElement = document.getElementById('logProgressMask');
    
    // 如果遮罩元素存在，则更新其宽度
    // 注意：这里使用100-progress是因为遮罩是从右向左覆盖（或者进度条是反向显示）
    // progress值越大（进度越多），遮罩宽度越小
    if (maskElement) maskElement.style.width = `${100 - progress}%`;
    
    // 2. 更新速度显示
    // 获取显示速度的主元素
    const speedDisplay = document.getElementById('speedDisplay');
    
    // 将速度数字数组转换为字符串表示
    const speedStr = digitsToString(speedDigits);
    
    // 提取速度字符串的前6位字符并转换为浮点数
    // 注意：这里使用substring(0,6)是为了限制显示精度，避免显示过长的数字
    const speedNum = parseFloat(speedStr.substring(0, 6));
    
    // 如果速度显示元素存在，更新其内容为4位小数的速度值
    if (speedDisplay) speedDisplay.textContent = speedNum.toFixed(4);
    
    // 3. 更新其他相关显示
    // 更新完整精度显示（可能在其他地方显示更多位数）
    updateFullPrecisionDisplay();
    
    // 获取另一个当前速度显示元素（可能是不同的UI组件）
    const currentSpeedElement = document.getElementById('dispCurrentSpeed');
    
    // 如果元素存在，更新其显示内容
    // 注意：这里也显示4位小数，保持UI显示的一致性
    if (currentSpeedElement) currentSpeedElement.textContent = speedNum.toFixed(4);
    
    // 函数结束，没有返回值，因为主要目的是更新UI状态
}

function updatePrecisionGrid() {
    const percentages = calculateDisplayPercentages(speedDigits);
    const container = document.getElementById('precisionGridContainer');
    
    if (!container) return;
    
    if (container.children.length !== 64) generatePrecisionGrid();
    
    for (let i = 0; i < 64; i++) {
        const cell = container.children[i];
        const fillElement = cell.querySelector('.precision-cell-fill');
        const digitElement = cell.querySelector('.precision-cell-digit');
        
        if (!fillElement || !digitElement) continue;
        
        const digitIndex = i + 2;
        const digit = speedDigits[digitIndex];
        const percentage = percentages[digitIndex];
        
        fillElement.style.height = `${percentage}%`;
        digitElement.textContent = digit;
        
        if (digit === 0 && percentage === 0) cell.classList.add('zero-digit');
        else cell.classList.remove('zero-digit');
        
        if (percentage === 0) fillElement.style.backgroundColor = "#333";
        else fillElement.style.backgroundColor = "var(--accent-color)";
        
        const position = digitIndex + 1;
        cell.title = `小数点后第 ${position} 位\n值: ${digit}\n显示: ${percentage}%`;
    }
}

function generatePrecisionGrid() {
    const container = document.getElementById('precisionGridContainer');
    if (!container) return;
    
    container.innerHTML = '';
    
    for (let i = 0; i < 64; i++) {
        const cell = document.createElement('div');
        cell.className = 'precision-cell';
        cell.dataset.index = i;
        
        const fill = document.createElement('div');
        fill.className = 'precision-cell-fill';
        cell.appendChild(fill);
        
        const digitLabel = document.createElement('div');
        digitLabel.className = 'precision-cell-digit';
        digitLabel.textContent = '0';
        cell.appendChild(digitLabel);
        
        container.appendChild(cell);
    }
    
    const cellStartIndex = document.getElementById('cellStartIndex');
    const cellEndIndex = document.getElementById('cellEndIndex');
    if (cellStartIndex) cellStartIndex.textContent = '3';
    if (cellEndIndex) cellEndIndex.textContent = '66';
}

function handleGridClick(event) {
    if (simulationStatus.isRunning) {
        console.warn('[handleGridClick] 模拟运行中，阻止网格点击');
        event.preventDefault();
        return;
    }
    
    event.preventDefault();
    
    const lastNonZeroPos = findLastNonZeroPosition(speedDigits);
    let targetPos = lastNonZeroPos === -1 ? 2 : lastNonZeroPos;
    const currentDigit = speedDigits[targetPos];
    
    let newDigit;
    if (currentDigit === 9) newDigit = 1;
    else newDigit = currentDigit + 1;
    if (newDigit > 9) newDigit = 9;
    
    speedDigits[targetPos] = newDigit;
    updatePrecisionSequence();
    updateAllUI();
    updateSimulatorSpeed();
}

function handleGridWheel(event) {
    if (simulationStatus.isRunning) {
        console.warn('[handleGridWheel] 模拟运行中，阻止网格滚轮');
        event.preventDefault();
        return;
    }
    
    event.preventDefault();
    
    const lastNonZeroPos = findLastNonZeroPosition(speedDigits);
    let targetPos = lastNonZeroPos === -1 ? 2 : lastNonZeroPos;
    const currentDigit = speedDigits[targetPos];
    
    let step = 1;
    if (event.ctrlKey) step = 0.1;
    else if (event.shiftKey) step = 5;
    
    const direction = event.deltaY > 0 ? -1 : 1;
    
    let newDigit;
    if (event.ctrlKey) {
        const percentages = calculateDisplayPercentages(speedDigits);
        let currentPercentage = percentages[targetPos];
        currentPercentage = Math.max(10, Math.min(100, currentPercentage + direction * step));
        
        if (currentPercentage === 100) newDigit = 9;
        else if (currentPercentage === 0) newDigit = 1;
        else {
            newDigit = Math.round(currentPercentage / 10);
            if (newDigit === 0) newDigit = 1;
        }
    } else {
        newDigit = currentDigit + direction * step;
        if (newDigit > 9) newDigit = 9;
        if (newDigit < 1) newDigit = 1;
        if (currentDigit === 9 && direction === 1) newDigit = 9;
    }
    
    speedDigits[targetPos] = newDigit;
    updatePrecisionSequence();
    updateAllUI();
    updateSimulatorSpeed();
}

// ===========================================================================
// 修改：更新伽马因子显示（使用中文单位）
// ===========================================================================

// ===========================================================================
// 修改：更新伽马因子显示（使用中文单位）
// ===========================================================================

function updateGammaDisplay() {
    console.log('[updateGammaDisplay] 无效函数调用，已弃用');
}

function updateFullPrecisionDisplay() {
    const displayElement = document.getElementById('fullPrecisionDisplay');
    if (!displayElement) return;
    
    const speedStr = digitsToString(speedDigits);
    displayElement.textContent = `完整值: ${speedStr}`;
}

// ===========================================================================
// 控制函数
// ===========================================================================

function enterMaxPrecision() {
    if (simulationStatus.isRunning) {
        console.warn('[enterMaxPrecision] 模拟运行中，阻止操作');
        return;
    }
    
    for (let i = 2; i < 66; i++) speedDigits[i] = 9;
    updatePrecisionSequence();
    updateAllUI();
    updateSimulatorSpeed();
}

function resetFineSlider() {
    if (simulationStatus.isRunning) {
        console.warn('[resetFineSlider] 模拟运行中，阻止操作');
        return;
    }
    
    for (let i = 2; i < 66; i++) speedDigits[i] = 0;
    updatePrecisionSequence();
    updateAllUI();
    updateSimulatorSpeed();
}

function handleCoarseSliderChange(event) {
    if (simulationStatus.isRunning) {
        console.warn('[handleCoarseSliderChange] 模拟运行中，阻止滑块修改');
        const currentSpeed = speedDigits[0] * 0.1 + speedDigits[1] * 0.01;
        event.target.value = currentSpeed;
        return;
    }
    
    const value = parseFloat(event.target.value);
    const intValue = Math.round(value * 100);
    const firstDigit = Math.floor(intValue / 10);
    const secondDigit = intValue % 10;
    
    speedDigits[0] = firstDigit;
    speedDigits[1] = secondDigit;
    
    for (let i = 2; i < 66; i++) speedDigits[i] = 0;
    
    updatePrecisionSequence();
    updateAllUI();
    updateSimulatorSpeed();
}

function handleFineSliderChange(event) {
    if (simulationStatus.isRunning) {
        console.warn('[handleFineSliderChange] 模拟运行中，阻止滑块修改');
        const fineSlider = document.getElementById('sliderFine');
        const currentIndex = fineSlider ? fineSlider.value : 0;
        event.target.value = currentIndex;
        return;
    }
    
    const index = parseInt(event.target.value);
    if (currentPrecisionSequence && index >= 0 && index < currentPrecisionSequence.length) {
        speedDigits = currentPrecisionSequence[index].slice();
        updateAllUI();
        
        const fineSliderPosition = document.getElementById('fineSliderPosition');
        if (fineSliderPosition) fineSliderPosition.textContent = index;
        
        updateSimulatorSpeed();
    }
}

// ===========================================================================
// Canvas绘图函数
// ===========================================================================

const canvas = document.getElementById('simCanvas');
const ctx = canvas ? canvas.getContext('2d') : null;
let dpr = window.devicePixelRatio || 1;

function resizeCanvas() {
    console.log('[resizeCanvas] 调整Canvas大小');
    
    if (!canvas || !canvas.parentElement) return;
    
    const container = canvas.parentElement;
    const width = container.clientWidth;
    const height = container.clientHeight * 0.7;
    
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    
    if (ctx) ctx.scale(dpr, dpr);
    
    drawStaticScene();
}

function drawStaticScene() {
    if (!ctx) return;
    
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    const padding = Math.min(width, height) * 0.05;
    const w = width - padding * 2;
    const cy = height / 2;
    const startX = padding;
    const endX = padding + w;

    drawStars();
    
    ctx.beginPath();
    ctx.moveTo(startX, cy);
    ctx.lineTo(endX, cy);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 2;
    ctx.stroke();

    drawPlanet(ctx, startX, cy, '#3498db', '地球'); 
    drawPlanet(ctx, endX, cy, '#e74c3c', '目标'); 
    drawShip(ctx, startX, cy);
}

function drawStars() {
    if (!ctx) return;
    
    let seed = 1;
    function random() {
        var x = Math.sin(seed++) * 10000;
        return x - Math.floor(x);
    }
    
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    
    ctx.fillStyle = '#FFF';
    for(let i=0; i<150; i++) {
        let x = random() * width;
        let y = random() * height;
        let size = random() * 2.0;
        ctx.globalAlpha = random() * 0.8 + 0.2;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI*2);
        ctx.fill();
    }
    ctx.globalAlpha = 1.0;
}

function drawPlanet(ctx, x, y, color, label) {
    if (!ctx) return;
    
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    const baseSize = Math.min(width, height);
    const radius = baseSize * 0.03;
    
    ctx.beginPath();
    ctx.arc(x, y, radius * 1.5, 0, Math.PI * 2);
    const gradient = ctx.createRadialGradient(x, y, radius, x, y, radius * 1.5);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fill();
    
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.shadowBlur = 25;
    ctx.shadowColor = color;
    ctx.fill();
    ctx.shadowBlur = 0;
    
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${baseSize * 0.025}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y - radius * 2.5);
}

function drawShip(ctx, x, y) {
    if (!ctx) return;
    
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    const baseSize = Math.min(width, height);
    const size = baseSize * 0.04;
    
    ctx.save();
    ctx.translate(x, y);

    ctx.beginPath();
    ctx.moveTo(size * 1.5, 0);
    ctx.lineTo(-size * 0.8, size * 0.6);
    ctx.lineTo(-size * 0.8, -size * 0.6);
    ctx.closePath();
    const gradient = ctx.createRadialGradient(0, 0, size * 0.5, 0, 0, size * 1.2);
    gradient.addColorStop(0, '#00f2ff');
    gradient.addColorStop(1, 'rgba(0, 242, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.fill();
    
    ctx.beginPath();
    ctx.moveTo(size, 0);
    ctx.lineTo(-size * 0.67, size * 0.53);
    ctx.lineTo(-size * 0.67, -size * 0.53);
    ctx.closePath();
    ctx.fillStyle = '#00f2ff';
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#00f2ff';
    ctx.fill();
    ctx.shadowBlur = 0;
    
    ctx.restore();
    
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${baseSize * 0.025}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText("飞船", x, y + size * 2.5);
}

// ===========================================================================
// 新增：配置变更监听器（自动保存功能）
// ===========================================================================

function initializeConfigListeners() {
    console.log('[initializeConfigListeners] 初始化配置变更监听器');
    
    // 1. 监听距离输入框变化
    const distanceInput = document.getElementById('inputDistance');
    if (distanceInput) {
        distanceInput.addEventListener('input', () => {
            ConfigManager.onConfigChange('distance');
        });
        distanceInput.addEventListener('change', () => {
            ConfigManager.onConfigChange('distance_change');
        });
    }
    
    // 2. 监听粗调滑块变化
    const coarseSlider = document.getElementById('sliderSpeed');
    if (coarseSlider) {
        coarseSlider.addEventListener('input', () => {
            ConfigManager.onConfigChange('coarse_slider');
        });
    }
    
    // 3. 监听微调滑块变化
    const fineSlider = document.getElementById('sliderFine');
    if (fineSlider) {
        fineSlider.addEventListener('input', () => {
            ConfigManager.onConfigChange('fine_slider');
        });
    }
    
    // 4. 监听倍率滑块变化
    const multiplierSlider = document.getElementById('sliderMultiplier');
    if (multiplierSlider) {
        multiplierSlider.addEventListener('input', () => {
            ConfigManager.onConfigChange('multiplier_slider');
        });
    }
    
    // 5. 监听时间单位选择器变化
    const timeUnitSelect = document.getElementById('timeUnitSelect');
    if (timeUnitSelect) {
        timeUnitSelect.addEventListener('change', () => {
            ConfigManager.onConfigChange('time_unit');
        });
    }
    
    // 6. 监听参考系切换
    const switchOptions = document.querySelectorAll('.switch-option');
    switchOptions.forEach((option) => {
        option.addEventListener('click', (event) => {
            if (!simulationStatus.isRunning) {
                ConfigManager.onConfigChange('reference_frame');
            }
        });
    });
    
    // 7. 监听精度网格点击和滚轮
    const precisionGrid = document.getElementById('precisionGrid');
    if (precisionGrid) {
        // 创建包装函数来处理点击事件
        const originalGridClick = precisionGrid.onclick;
        precisionGrid.addEventListener('click', (event) => {
            if (!simulationStatus.isRunning) {
                setTimeout(() => {
                    ConfigManager.onConfigChange('precision_grid_click');
                }, 100);
            }
        });
        
        // 创建包装函数来处理滚轮事件
        const originalGridWheel = precisionGrid.onwheel;
        precisionGrid.addEventListener('wheel', (event) => {
            if (!simulationStatus.isRunning) {
                setTimeout(() => {
                    ConfigManager.onConfigChange('precision_grid_wheel');
                }, 100);
            }
        });
    }
    
    // 8. 监听最大精度按钮
    const btnMaxPrecision = document.getElementById('btnMaxPrecision');
    if (btnMaxPrecision) {
        btnMaxPrecision.addEventListener('click', () => {
            if (!simulationStatus.isRunning) {
                setTimeout(() => {
                    ConfigManager.onConfigChange('max_precision_button');
                }, 100);
            }
        });
    }
    
    // 9. 监听重置微调按钮
    const btnResetFine = document.getElementById('btnResetFine');
    if (btnResetFine) {
        btnResetFine.addEventListener('click', () => {
            if (!simulationStatus.isRunning) {
                setTimeout(() => {
                    ConfigManager.onConfigChange('reset_fine_button');
                }, 100);
            }
        });
    }
    
    console.log('[initializeConfigListeners] 配置变更监听器初始化完成');
}

// ===========================================================================
// 初始化和主函数
// ===========================================================================

function initializeUI() {
    console.log('[initializeUI] 开始初始化UI');
    
    // 初始化配置管理器
    ConfigManager.init();
    
    if (typeof window !== 'undefined' && window.relativitySimulator) {
        simulator = window.relativitySimulator;
        console.log('高精度相对论模拟器已加载');
        updateSimulatorParameters();
    } else {
        console.error('simulation.js未加载或模拟器未初始化');
    }
    
    generatePrecisionGrid();
    initializeReferenceSwitch();
    initializeTimeUnitSwitch();
    
    const coarseSlider = document.getElementById('sliderSpeed');
    const fineSlider = document.getElementById('sliderFine');
    const multiplierSlider = document.getElementById('sliderMultiplier');
    const precisionGrid = document.getElementById('precisionGrid');
    const distanceInput = document.getElementById('inputDistance');
    const timeUnitSelect = document.getElementById('timeUnitSelect');
    
    if (coarseSlider) coarseSlider.oninput = function(e) {
        handleCoarseSliderChange(e);
        if (!simulationStatus.isRunning) {
            ConfigManager.onConfigChange('coarse_slider_input');
        }
    };
    
    if (fineSlider) fineSlider.oninput = function(e) {
        handleFineSliderChange(e);
        if (!simulationStatus.isRunning) {
            ConfigManager.onConfigChange('fine_slider_input');
        }
    };
    
    if (precisionGrid) {
        precisionGrid.addEventListener('click', handleGridClick);
        precisionGrid.addEventListener('wheel', handleGridWheel, { passive: false });
    }
    
    if (distanceInput) {
        distanceInput.onchange = function() {
            if (simulationStatus.isRunning) {
                console.warn('[distanceInput] 模拟运行中，阻止距离修改');
                return;
            }
            updateSimulatorDistance();
            ConfigManager.onConfigChange('distance_change');
        };
    }
    
    if (timeUnitSelect) {
        timeUnitSelect.addEventListener('change', function() {
            if (simulationStatus.isRunning) {
                console.warn('[timeUnitSelect] 模拟运行中，阻止时间单位修改');
                this.value = currentTimeUnit;
                return;
            }
        });
    }
    
    registerButtonEvents();
    
    const btnMaxPrecision = document.getElementById('btnMaxPrecision');
    const btnResetFine = document.getElementById('btnResetFine');
    if (btnMaxPrecision) btnMaxPrecision.onclick = function() {
        enterMaxPrecision();
        if (!simulationStatus.isRunning) {
            ConfigManager.onConfigChange('max_precision');
        }
    };
    if (btnResetFine) btnResetFine.onclick = function() {
        resetFineSlider();
        if (!simulationStatus.isRunning) {
            ConfigManager.onConfigChange('reset_fine');
        }
    };
    
    // 初始化配置变更监听器
    initializeConfigListeners();
    
    updatePrecisionSequence();
    updateAllUI();
    updateButtonStates();
    resizeCanvas();
    
    runTimer.init();
    
    console.log('[initializeUI] UI初始化完成');
}

window.onload = function() {
    console.log('[window.onload] 页面加载完成，开始初始化UI');
    initializeUI();
    window.addEventListener('resize', resizeCanvas);
    console.log('[window.onload] 页面初始化完成');
}

console.log('main.js 加载完成 - 统一严格模式版本（已添加自动保存配置功能）');