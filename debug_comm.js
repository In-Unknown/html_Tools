(function(window) {
    'use strict';

    var DEFAULT_POLL_INTERVAL = 200;
    var DEFAULT_SERVER_BASE = '/debug_comm';

    var DebugComm = function(toolName, options) {
        if (!toolName) {
            throw new Error('DebugComm: toolName is required');
        }

        this.toolName = toolName;
        this.options = options || {};
        this.pollInterval = this.options.pollInterval || DEFAULT_POLL_INTERVAL;
        this.serverBase = this.options.serverBase || DEFAULT_SERVER_BASE;
        
        this.pollIntervalId = null;
        this.logs = [];
        this.isRunning = false;
        
        this.originalConsole = {
            log: console.log.bind(console),
            error: console.error.bind(console),
            warn: console.warn.bind(console)
        };

        this._interceptConsole();
    };

    DebugComm.prototype._interceptConsole = function() {
        var self = this;

        console.log = function() {
            self.logs.push({
                level: 'log',
                message: Array.from(arguments).join(' ')
            });
            self.originalConsole.log.apply(console, arguments);
        };

        console.error = function() {
            self.logs.push({
                level: 'error',
                message: Array.from(arguments).join(' ')
            });
            self.originalConsole.error.apply(console, arguments);
        };

        console.warn = function() {
            self.logs.push({
                level: 'warn',
                message: Array.from(arguments).join(' ')
            });
            self.originalConsole.warn.apply(console, arguments);
        };
    };

    DebugComm.prototype._poll = function() {
        var self = this;
        
        fetch(this.serverBase + '/poll?tool=' + this.toolName)
            .then(function(response) {
                return response.json();
            })
            .then(function(data) {
                if (data.command) {
                    try {
                        var result = eval(data.command);
                        self._submitResult(result, data.command_id);
                    } catch(e) {
                        self._submitResult('Error: ' + e.message, data.command_id);
                    }
                }
            })
            .catch(function(err) {
                self.originalConsole.error('DebugComm 轮询失败:', err);
            });
    };

    DebugComm.prototype._submitResult = function(result, commandId) {
        var self = this;
        
        fetch(this.serverBase + '/submit', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                tool: this.toolName,
                result: String(result),
                logs: this.logs,
                command_id: commandId
            })
        })
        .then(function() {
            self.logs = [];
        })
        .catch(function(err) {
            self.originalConsole.error('DebugComm 提交结果失败:', err);
        });
    };

    DebugComm.prototype.start = function() {
        if (this.pollIntervalId !== null) {
            clearInterval(this.pollIntervalId);
        }
        
        this.pollIntervalId = setInterval(
            this._poll.bind(this), 
            this.pollInterval
        );
        this.isRunning = true;
        
        return 'DebugComm 轮询已启动，间隔: ' + this.pollInterval + 'ms';
    };

    DebugComm.prototype.stop = function() {
        if (this.pollIntervalId !== null) {
            clearInterval(this.pollIntervalId);
            this.pollIntervalId = null;
            this.isRunning = false;
            return 'DebugComm 轮询已停止';
        }
        return 'DebugComm 轮询未运行';
    };

    DebugComm.prototype.setInterval = function(newInterval) {
        this.pollInterval = newInterval;
        
        if (this.isRunning) {
            return this.start();
        }
        
        return 'DebugComm 轮询间隔已设置为: ' + newInterval + 'ms (未启动)';
    };

    DebugComm.prototype.getInterval = function() {
        return this.pollInterval;
    };

    DebugComm.prototype.getStatus = function() {
        return {
            running: this.isRunning,
            interval: this.pollInterval,
            toolName: this.toolName,
            pendingLogs: this.logs.length
        };
    };

    DebugComm.prototype.restoreConsole = function() {
        console.log = this.originalConsole.log;
        console.error = this.originalConsole.error;
        console.warn = this.originalConsole.warn;
    };

    DebugComm.create = function(toolName, options, autoStart) {
        var debugComm = new DebugComm(toolName, options);
        
        if (autoStart !== false) {
            debugComm.start();
        }
        
        return debugComm;
    };

    window.DebugComm = DebugComm;

    var _extractToolNameFromUrl = function() {
        var path = window.location.pathname;
        
        path = path.replace(/^\/+|\/+$/g, '');
        
        var parts = path.split('/');
        
        if (parts.length > 0 && parts[0]) {
            return parts[0];
        }
        
        return null;
    };

    var _autoInit = function() {
        var toolName = _extractToolNameFromUrl();
        
        if (toolName) {
            var debugComm = DebugComm.create(toolName, {pollInterval: DEFAULT_POLL_INTERVAL}, true);
            window.debugComm = debugComm;
            debugComm.originalConsole.log('DebugComm: 自动初始化工具: ' + toolName);
        }
    };

    if (typeof document !== 'undefined' && document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _autoInit);
    } else {
        _autoInit();
    }

})(typeof window !== 'undefined' ? window : global);
