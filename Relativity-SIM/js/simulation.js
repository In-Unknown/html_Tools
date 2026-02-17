// ===========================================================================
// 高精度相对论模拟引擎 - simulation.js（已修复）
// ===========================================================================

// 全局配置：禁用科学记数法，保持完整精度
Decimal.set({
    precision: 100,
    rounding: Decimal.ROUND_HALF_EVEN,
    toExpNeg: -9e15,       // 极小值，避免科学记数法，相当于在指数小于-9千万亿也就是十的负九千万亿时才使用科学记数法
    toExpPos: 9e15,        // 极大值，避免科学记数法，相当于在指数大于9千万亿也就是十的九千万亿时才使用科学记数法
    minE: -9e15,
    maxE: 9e15
});

// ===========================================================================
// 物理常数（高精度定义）
// ===========================================================================

const PHYSICAL_CONSTANTS = {
    LIGHT_SPEED: Decimal('299792458'),
    METERS_PER_LIGHT_YEAR: Decimal('9460730472580800'),
    SECONDS_PER_DAY: Decimal('86400'),
    DAYS_PER_YEAR: Decimal('365.256363004'),
    SECONDS_PER_YEAR: Decimal('31558149.7635456'),
    SPEED_OF_LIGHT_FRACTION: Decimal(1)
};

// ===========================================================================
// 核心计算函数
// ===========================================================================

function calculateLorentzFactor(speedDecimal) {
    if (!speedDecimal || speedDecimal.lessThan(0) || speedDecimal.greaterThanOrEqualTo(1)) {
        console.warn(`无效的速度值: ${speedDecimal}, 使用默认值1`);
        return Decimal(1);
    }
    
    const one = Decimal(1);
    const vSquared = speedDecimal.pow(2);
    
    if (vSquared.greaterThanOrEqualTo(one)) {
        return Decimal(Number.POSITIVE_INFINITY);
    }
    
    const denominator = one.minus(vSquared).sqrt();
    return one.div(denominator);
}

function calculateTimeDilation(earthTimeDelta, gamma) {
    if (!gamma || gamma.lessThan(1)) {
        console.warn(`无效的γ因子: ${gamma}, 使用默认值1`);
        return earthTimeDelta;
    }
    
    return earthTimeDelta.div(gamma);
}

function calculateTimeReverseDilation(shipTimeDelta, gamma) {
    if (!gamma || gamma.lessThan(1)) {
        console.warn(`无效的γ因子: ${gamma}, 使用默认值1`);
        return shipTimeDelta;
    }
    
    return shipTimeDelta.times(gamma);
}

function calculateDisplacement(speedDecimal, earthTimeDelta) {
    return speedDecimal.times(earthTimeDelta)
                      .div(PHYSICAL_CONSTANTS.DAYS_PER_YEAR);
}

// 关键修复：简化convertRealTimeToEarthTime函数
function convertRealTimeToEarthTime(realTimeMs, timeMultiplier) {
    // 关键修复：只进行基础转换，不包含时间单位
    return Decimal(realTimeMs)
        .div(1000)                    // 毫秒 → 秒
        .times(timeMultiplier);       // 应用倍率
    // 注意：这里不乘以时间单位系数，时间单位系数在updateState中处理
}

function digitsToDecimal(digits) {
    if (!digits || digits.length === 0) return Decimal(0);
    
    let decimalStr = '0.';
    for (let i = 0; i < 66; i++) {
        const digit = digits[i] || 0;
        decimalStr += digit.toString();
    }
    
    return Decimal(decimalStr);
}

/**
 * 格式化Decimal值为适合显示的字符串
 * 
 * 功能描述：
 * 将高精度Decimal值转换为易于阅读的字符串格式，处理大数、科学记数法等情况。
 * 对于非常大或非常小的数字，使用科学记数法；对于长数字进行截断。
 * 
 * 使用示例：
 * // 格式化普通数字
 * formatDecimalForDisplay(Decimal('123.456789'), 6); // '123.457'
 * 
 * // 处理科学记数法
 * formatDecimalForDisplay(Decimal('1.23e-15'), 8); // '1.23e-15'
 * 
 * // 处理无效值
 * formatDecimalForDisplay(null, 12); // '000000000000'
 * 
 * // 截断长数字
 * formatDecimalForDisplay(Decimal('123.456789012345678901234567890'), 20); // '123.456789012345678901234...'
 * 
 * @param {Decimal} value - 要格式化的Decimal值。如果为null、undefined或非有限值，会返回零字符串。
 * @param {number} precision - 显示精度（小数位数），默认12位。对于科学记数法，最多显示10位精度。
 * 
 * @returns {string} 格式化后的字符串，可能的返回值类型：
 *  1. 零字符串：当输入值无效时（如null、Infinity）
 *  2. 科学记数法字符串：当原值包含'e'或'E'时（如"1.23e-10"）
 *  3. 截断字符串：当字符串长度超过30字符时（如"123.456789012345678901234..."）
 *  4. 固定小数位数字符串：默认情况（如"123.456789012"）
 * 
 * @throws {Error} 如果Decimal库方法调用失败（如toFixed、toExponential）
 */
function formatDecimalForDisplay(value, precision = 12) {
    // 输入验证：检查值是否有效
    // 条件：value存在且value.isFinite()返回true（排除Infinity、NaN等）
    if (!value || !value.isFinite()) return '0'.repeat(precision);
    
    // 将Decimal值转换为原始字符串表示
    // 示例：Decimal('123.456') → '123.456'
    //        Decimal('1e-10') → '1e-10'
    const str = value.toString();
    
    // 情况1：处理科学记数法表示
    // 科学记数法通常用于极大或极小的数字（如1.23e+100, 5.67e-30）
    if (str.includes('e') || str.includes('E')) {
        // 使用科学记数法格式化，限制精度避免过长显示
        // Math.min(10, precision)：科学记数法最多显示10位精度
        return value.toExponential(Math.min(10, precision));
    }
    
    // 情况2：处理过长的数字字符串
    // 当数字非常长时（如π的小数扩展），进行截断
    if (str.length > 30) {
        // 截取前30个字符并添加省略号
        return str.substring(0, 30) + '...';
    }
    
    // 情况3：常规数字，使用固定小数位数格式化
    // 使用Decimal.js的toFixed方法，四舍五入到指定精度
    return value.toFixed(precision);
}

// ===========================================================================
// 主模拟器类（已添加时间单位状态）
// ===========================================================================

class RelativitySimulator {
    constructor() {
        // 模拟参数
        this.totalDistance = Decimal(4.22);
        this.timeMultiplier = Decimal(1);
        this.speedDigits = null;
        this.referenceFrame = 'earth';
        
        // 关键修复：新增时间单位状态
        this.currentTimeUnit = 'day'; // 'day', 'month', 'year'
        
        // 状态变量
        this.earthTime = Decimal(0);
        this.shipTime = Decimal(0);
        this.position = Decimal(0);
        this.currentSpeed = Decimal(0.5);
        this.gamma = Decimal(1);
        
        // 控制状态
        this.isRunning = false;
        this.startRealTime = null;
        this.lastUpdateTime = null;
        this.accumulatedPauseTime = 0;
        
        // 计算缓存
        this.cache = { lastSpeedStr: null, lastGamma: null };
        
        if (this.speedDigits) {
            this.currentSpeed = digitsToDecimal(this.speedDigits);
            this.gamma = calculateLorentzFactor(this.currentSpeed);
        }
        Decimal.set({
            precision: 2000, // 确保足够高的精度
            rounding: Decimal.ROUND_HALF_EVEN,
            toExpNeg: -9e15,       // 极小值，避免科学记数法，相当于在指数小于-9千万亿也就是十的负九千万亿时才使用科学记数法
            toExpPos: 9e15,        // 极大值，避免科学记数法，相当于在指数大于9千万亿也就是十的九千万亿时才使用科学记数法
            minE: -9e15,
            maxE: 9e15
        });
    }
    
    // ===========================================================================
    // 公共API接口
    // ===========================================================================
    
    initialize(params = {}) {
        try {
            if (params.totalDistance !== undefined) {
                this.totalDistance = Decimal(params.totalDistance);
            }
            
            if (params.speedDigits && Array.isArray(params.speedDigits)) {
                this.speedDigits = [...params.speedDigits];
                this.currentSpeed = digitsToDecimal(this.speedDigits);
                this.gamma = calculateLorentzFactor(this.currentSpeed);
            }
            
            if (params.timeMultiplier !== undefined) {
                this.timeMultiplier = Decimal(params.timeMultiplier);
            }
            
            if (params.referenceFrame !== undefined) {
                this.setReferenceFrame(params.referenceFrame);
            }
            
            console.log('模拟器初始化完成:', {
                totalDistance: this.totalDistance.toString(),
                currentSpeed: this.currentSpeed.toString(),
                gamma: this.gamma.toString(),
                timeMultiplier: this.timeMultiplier.toString(),
                referenceFrame: this.referenceFrame,
                currentTimeUnit: this.currentTimeUnit
            });
            
            return this.getCurrentState();
        } catch (error) {
            console.error('模拟器初始化失败:', error);
            throw error;
        }
    }
    
    /**
     * 更新时间单位（新增方法）
     * @param {string} timeUnit - 时间单位
     */
    updateTimeUnit(timeUnit) {
        if (['day', 'month', 'year'].includes(timeUnit)) {
            this.currentTimeUnit = timeUnit;
            console.log(`时间单位已更新: ${timeUnit}`);
        }
        return this.getCurrentState();
    }
    
    setReferenceFrame(frame) {
        if (frame !== 'earth' && frame !== 'ship') {
            console.warn(`无效的参考系: ${frame}, 使用默认值earth`);
            frame = 'earth';
        }
        
        this.referenceFrame = frame;
        console.log(`参考系已设置为: ${frame}`);
        
        return this.getCurrentState();
    }
    
    start(currentRealTime) {
        if (this.isRunning) {
            console.warn('模拟已经在运行中');
            return this.getCurrentState();
        }
        
        try {
            const now = currentRealTime || performance.now();
            
            if (this.startRealTime === null) {
                this.startRealTime = now;
            }
            
            this.lastUpdateTime = now - this.accumulatedPauseTime;
            this.isRunning = true;
            
            console.log('模拟开始/继续');
            return this.getCurrentState();
        } catch (error) {
            console.error('启动模拟失败:', error);
            this.isRunning = false;
            throw error;
        }
    }
    
    pause(currentRealTime) {
        if (!this.isRunning) {
            console.warn('模拟已经暂停或未开始');
            return this.getCurrentState();
        }
        
        try {
            const now = currentRealTime || performance.now();
            
            if (this.lastUpdateTime !== null) {
                this.accumulatedPauseTime += (now - this.lastUpdateTime);
            }
            
            this.isRunning = false;
            
            console.log('模拟暂停');
            return this.getCurrentState();
        } catch (error) {
            console.error('暂停模拟失败:', error);
            throw error;
        }
    }
    
    reset() {
        try {
            this.earthTime = Decimal(0);
            this.shipTime = Decimal(0);
            this.position = Decimal(0);
            
            this.isRunning = false;
            this.startRealTime = null;
            this.lastUpdateTime = null;
            this.accumulatedPauseTime = 0;
            
            console.log('模拟已重置（仅时间状态）');
            return this.getCurrentState();
        } catch (error) {
            console.error('重置模拟失败:', error);
            throw error;
        }
    }
    
    resetAll() {
        const state = this.reset();
        
        this.totalDistance = Decimal(4.22);
        this.timeMultiplier = Decimal(1);
        this.referenceFrame = 'earth';
        this.currentTimeUnit = 'day';
        
        console.log('模拟完全重置');
        return state;
    }
    
    getCurrentState(currentRealTime = null) {
        try {
            if (this.isRunning && currentRealTime !== null && this.lastUpdateTime !== null) {
                return this.updateState(currentRealTime);
            }
            return this.computeState();
        } catch (error) {
            console.error('获取状态失败:', error);
            return this.computeState();
        }
    }
    
    updateSpeed(newDigits) {
        if (!newDigits || !Array.isArray(newDigits)) {
            console.error('无效的速度数组');
            return this.getCurrentState();
        }
        
        try {
            if (this.isRunning) {
                this.recordSpeedChange(this.earthTime, newDigits);
            }
            
            this.speedDigits = [...newDigits];
            this.currentSpeed = digitsToDecimal(newDigits);
            this.gamma = calculateLorentzFactor(this.currentSpeed);
            
            this.cache.lastSpeedStr = null;
            this.cache.lastGamma = null;
            
            console.log('速度已更新:', this.currentSpeed.toString());
            return this.getCurrentState();
        } catch (error) {
            console.error('更新速度失败:', error);
            throw error;
        }
    }
    
    updateTotalDistance(newDistance) {
        try {
            this.totalDistance = Decimal(newDistance);
            
            if (this.position.greaterThan(this.totalDistance)) {
                this.position = this.totalDistance;
            }
            
            console.log('总距离已更新:', this.totalDistance.toString());
            return this.getCurrentState();
        } catch (error) {
            console.error('更新总距离失败:', error);
            throw error;
        }
    }
    
    updateTimeMultiplier(newMultiplier) {
        try {
            this.timeMultiplier = Decimal(newMultiplier);
            console.log('时间倍率已更新:', this.timeMultiplier.toString());
            return this.getCurrentState();
        } catch (error) {
            console.error('更新时间倍率失败:', error);
            throw error;
        }
    }
    
    // ===========================================================================
    // 内部方法
    // ===========================================================================
    
    recordSpeedChange(earthTime, digits) {
        this.speedHistory.push({
            time: earthTime,
            digits: [...digits],
            speed: digitsToDecimal(digits)
        });
        
        if (this.speedHistory.length > 100) {
            this.speedHistory.shift();
        }
    }
    
    // 关键修复：updateState函数中的时间计算
    updateState(currentRealTime) {
        if (!this.isRunning || this.lastUpdateTime === null) {
            return this.computeState();
        }
        
        try {
            const deltaRealMs = currentRealTime - this.lastUpdateTime;
            
            if (deltaRealMs <= 0) {
                return this.computeState();
            }
            
            // 关键修复：根据当前时间单位计算转换系数
            let timeUnitFactor;
            switch(this.currentTimeUnit) {
                case 'month':
                    timeUnitFactor = Decimal('30.4380302503333'); // 天/月
                    break;
                case 'year':
                    timeUnitFactor = Decimal('365.256363004'); // 天/年
                    break;
                case 'day':
                default:
                    timeUnitFactor = Decimal(1); // 天/天
            }
            
            // 关键修复：计算模拟时间增量 = 真实时间 × 倍率 × 单位系数
            const deltaSimTime = Decimal(deltaRealMs)
                .div(1000)                      // 毫秒 → 秒
                .times(this.timeMultiplier)     // 应用倍率
                .times(timeUnitFactor);         // 应用时间单位转换
            
            let deltaEarthTime, deltaShipTime;
            
            if (this.referenceFrame === 'earth') {
                deltaEarthTime = deltaSimTime;
                deltaShipTime = calculateTimeDilation(deltaEarthTime, this.gamma);
            } else {
                deltaShipTime = deltaSimTime;
                deltaEarthTime = calculateTimeReverseDilation(deltaShipTime, this.gamma);
            }
            
            const deltaPosition = calculateDisplacement(this.currentSpeed, deltaEarthTime);
            
            this.earthTime = this.earthTime.plus(deltaEarthTime);
            this.shipTime = this.shipTime.plus(deltaShipTime);
            this.position = this.position.plus(deltaPosition);
            
            if (this.position.greaterThanOrEqualTo(this.totalDistance)) {
                return this.handleArrival();
            }
            
            this.lastUpdateTime = currentRealTime;
            return this.computeState();
        } catch (error) {
            console.error('更新状态失败:', error);
            this.isRunning = false;
            return this.computeState();
        }
    }
    
    handleArrival() {
        try {
            const overDistance = this.position.minus(this.totalDistance);
            
            if (overDistance.lessThanOrEqualTo(0)) {
                this.position = this.totalDistance;
            } else {
                const timeToSubtract = overDistance
                    .times(PHYSICAL_CONSTANTS.DAYS_PER_YEAR)
                    .div(this.currentSpeed);
                
                this.earthTime = this.earthTime.minus(timeToSubtract);
                
                if (this.referenceFrame === 'earth') {
                    this.shipTime = this.shipTime.minus(
                        calculateTimeDilation(timeToSubtract, this.gamma)
                    );
                } else {
                    this.shipTime = this.shipTime.minus(
                        timeToSubtract.div(this.gamma)
                    );
                }
                
                this.position = this.totalDistance;
            }
            
            this.isRunning = false;
            
            console.log('已到达目的地!', {
                earthTime: this.earthTime.toString(),
                shipTime: this.shipTime.toString(),
                position: this.position.toString(),
                referenceFrame: this.referenceFrame
            });
            
            return this.computeState();
        } catch (error) {
            console.error('处理到达目的地失败:', error);
            this.position = this.totalDistance;
            this.isRunning = false;
            return this.computeState();
        }
    }
    
    // ===========================================================================
    // 计算当前状态（已修复：确保返回完整的格式化字段）
    // ===========================================================================

    /**
     * 计算当前状态（不更新时间）
     * @returns {Object} 状态对象
     */
    computeState() {
        // 时间单位转换系数
        const DAYS_PER_YEAR = Decimal('365.256363004');
        const DAYS_PER_MONTH = Decimal('30.4380302503333');
        const HOURS_PER_DAY = Decimal('24');

        const allTimeValues = {
            // 地球时间的各种单位转换
            earthYear: this.earthTime.div(DAYS_PER_YEAR).toString(),      // 地球时间 → 年（精度丢失）
            earthMonth: this.earthTime.div(DAYS_PER_MONTH).toString(),    // 地球时间 → 月（精度丢失）
            earthDay: this.earthTime.toString(),                     // 地球时间 → 天（保持不变）
            earthHour: this.earthTime.times(HOURS_PER_DAY).toString(),      // 地球时间 → 小时（精度丢失）

            // 飞船时间的各种单位转换
            shipYear: this.shipTime.div(DAYS_PER_YEAR).toString(),        // 飞船时间 → 年
            shipMonth: this.shipTime.div(DAYS_PER_MONTH).toString(),      // 飞船时间 → 月
            shipDay: this.shipTime.toString(),                       // 飞船时间 → 天（保持不变）
            shipHour: this.shipTime.times(HOURS_PER_DAY).toString()         // 飞船时间 → 小时
        };
        return {
            // 核心状态（字符串表示，保持精度-但是依然可能出现科学记数法需要配置）
            earthTime: this.earthTime.toString(),
            shipTime: this.shipTime.toString(),
            position: this.position.toString(),
            gamma: this.gamma.toString(),
            
            // 新增：参考系状态
            referenceFrame: this.referenceFrame,
            
            // 控制状态
            isComplete: this.position.greaterThanOrEqualTo(this.totalDistance),
            isRunning: this.isRunning,
            
            // 参数信息
            totalDistance: this.totalDistance.toString(),
            currentSpeed: this.currentSpeed.toString(),
            timeMultiplier: this.timeMultiplier.toString(),

            allTime: allTimeValues, // 包含各种时间单位转换值

            // 格式化版本，但是会截断数字并且固定小数位数，并且可能保留科学记数法
            earthTimeFormatted: formatDecimalForDisplay(this.earthTime, 12),// 生成地球时间格式化字符串
            shipTimeFormatted: formatDecimalForDisplay(this.shipTime, 12),// 生成飞船时间格式化字符串
            positionFormatted: formatDecimalForDisplay(this.position, 12),// 生成位置格式化字符串
            gammaFormatted: formatDecimalForDisplay(this.gamma, 6),// 生成γ因子格式化字符串
            totalDistanceFormatted: formatDecimalForDisplay(this.totalDistance, 6), // 确保这个字段存在 用于生成总距离格式化字符串
            currentSpeedFormatted: formatDecimalForDisplay(this.currentSpeed, 6),// 生成当前速度格式化字符串
            
            // 进度百分比
            progressPercent: this.totalDistance.equals(0) 
                ? 0 
                : this.position.div(this.totalDistance).times(100).toNumber()
        };
    }
    
    validate() {
        const errors = [];
        
        if (this.position.lessThan(0)) errors.push(`位置不能为负: ${this.position}`);
        if (this.gamma.lessThan(1)) errors.push(`γ因子不能小于1: ${this.gamma}`);
        if (this.earthTime.lessThan(this.shipTime)) {
            errors.push(`地球时间不应小于飞船时间: earth=${this.earthTime}, ship=${this.shipTime}`);
        }
        if (this.currentSpeed.lessThan(0) || this.currentSpeed.greaterThanOrEqualTo(1)) {
            errors.push(`速度应在0-1之间: ${this.currentSpeed}`);
        }
        
        return {
            isValid: errors.length === 0,
            errors: errors,
            summary: {
                earthTime: this.earthTime.toString(),
                shipTime: this.shipTime.toString(),
                position: this.position.toString(),
                gamma: this.gamma.toString(),
                currentSpeed: this.currentSpeed.toString(),
                totalDistance: this.totalDistance.toString(),
                referenceFrame: this.referenceFrame,
                currentTimeUnit: this.currentTimeUnit
            }
        };
    }
    
    exportState() {
        return {
            totalDistance: this.totalDistance.toString(),
            timeMultiplier: this.timeMultiplier.toString(),
            speedDigits: this.speedDigits,
            referenceFrame: this.referenceFrame,
            currentTimeUnit: this.currentTimeUnit,
            earthTime: this.earthTime.toString(),
            shipTime: this.shipTime.toString(),
            position: this.position.toString(),
            isRunning: this.isRunning,
            startRealTime: this.startRealTime,
            lastUpdateTime: this.lastUpdateTime,
            accumulatedPauseTime: this.accumulatedPauseTime,
            version: '1.1',
            timestamp: Date.now()
        };
    }
    
    importState(state) {
        try {
            if (state.totalDistance) this.totalDistance = Decimal(state.totalDistance);
            if (state.timeMultiplier) this.timeMultiplier = Decimal(state.timeMultiplier);
            if (state.speedDigits) this.updateSpeed(state.speedDigits);
            if (state.referenceFrame) this.setReferenceFrame(state.referenceFrame);
            if (state.currentTimeUnit) this.currentTimeUnit = state.currentTimeUnit;
            
            if (state.earthTime) this.earthTime = Decimal(state.earthTime);
            if (state.shipTime) this.shipTime = Decimal(state.shipTime);
            if (state.position) this.position = Decimal(state.position);
            
            if (state.isRunning !== undefined) this.isRunning = state.isRunning;
            if (state.startRealTime !== undefined) this.startRealTime = state.startRealTime;
            if (state.lastUpdateTime !== undefined) this.lastUpdateTime = state.lastUpdateTime;
            if (state.accumulatedPauseTime !== undefined) this.accumulatedPauseTime = state.accumulatedPauseTime;
            
            console.log('状态已导入');
            return this.getCurrentState();
        } catch (error) {
            console.error('导入状态失败:', error);
            throw error;
        }
    }
}

// ===========================================================================
// 全局导出
// ===========================================================================

if (typeof window !== 'undefined') {
    if (!window.relativitySimulator) {
        window.relativitySimulator = new RelativitySimulator();
    }
    
    window.RelativitySimulator = RelativitySimulator;
    
    window.RelativitySimulatorUtils = {
        calculateLorentzFactor,
        calculateTimeDilation,
        calculateTimeReverseDilation,
        calculateDisplacement,
        convertRealTimeToEarthTime,
        digitsToDecimal,
        formatDecimalForDisplay,
        PHYSICAL_CONSTANTS
    };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        RelativitySimulator,
        calculateLorentzFactor,
        calculateTimeDilation,
        calculateTimeReverseDilation,
        calculateDisplacement,
        convertRealTimeToEarthTime,
        digitsToDecimal,
        formatDecimalForDisplay,
        PHYSICAL_CONSTANTS
    };
}

console.log('高精度相对论模拟引擎已加载（已修复时间单位计算）');