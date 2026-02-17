import requests
import sys
import time
import os
import json
from flask import Blueprint, request, jsonify
from collections import defaultdict
import threading

CONFIG_FILE = os.path.join(os.path.dirname(__file__), 'project.json')

debug_command_queue = defaultdict(lambda: None)
debug_results = defaultdict(lambda: None)
debug_logs = defaultdict(list)
debug_command_ids = defaultdict(lambda: 0)
debug_lock = threading.Lock()

debug_comm_blueprint = Blueprint('debug_comm', __name__)

@debug_comm_blueprint.route('/poll', methods=['GET'])
def poll_command():
    tool_name = request.args.get('tool')
    if not tool_name:
        print(f"[调试通信] 错误: 缺少tool参数, 请求路径: {request.path}, 完整URL: {request.url}")
        return jsonify({'error': '缺少tool参数'}), 400
    
    with debug_lock:
        command_data = debug_command_queue[tool_name]
        debug_command_queue[tool_name] = None
    
    if command_data:
        print(f"[调试通信] 工具 {tool_name} 获取命令 (ID:{command_data['id']}): {command_data['command']}")
        return jsonify({'command': command_data['command'], 'command_id': command_data['id']})
    print(f"[调试通信] 工具 {tool_name} 轮询无命令")
    return jsonify({'command': None, 'command_id': None})

@debug_comm_blueprint.route('/submit', methods=['POST'])
def submit_result():
    data = request.json
    if not data:
        print(f"[调试通信] 错误: 请求体为空")
        return jsonify({'error': '请求体为空'}), 400
    
    tool_name = data.get('tool')
    result = data.get('result')
    logs = data.get('logs', [])
    command_id = data.get('command_id')
    
    if not tool_name:
        print(f"[调试通信] 错误: 缺少tool参数, 数据: {data}")
        return jsonify({'error': '缺少tool参数'}), 400
    
    with debug_lock:
        if result is not None:
            debug_results[tool_name] = {'id': command_id, 'result': result}
        if logs:
            debug_logs[tool_name].extend(logs)
    
    print(f"[调试通信] 工具 {tool_name} 提交结果 (ID:{command_id})")
    if result:
        print(f"[调试通信] JS执行结果: {result}")
    for log in logs:
        print(f"[调试通信] 前端日志 [{log['level']}]: {log['message']}")
    
    return jsonify({'status': 'ok'})

@debug_comm_blueprint.route('/result', methods=['GET'])
def get_result():
    tool_name = request.args.get('tool')
    command_id = request.args.get('command_id')
    if not tool_name:
        print(f"[调试通信] 错误: 缺少tool参数, 请求路径: {request.path}")
        return jsonify({'error': '缺少tool参数'}), 400
    
    with debug_lock:
        result_data = debug_results[tool_name]
        logs = debug_logs[tool_name]
        if result_data and (command_id is None or str(result_data.get('id')) == command_id):
            debug_results[tool_name] = None
            debug_logs[tool_name] = []
            result = result_data.get('result')
        else:
            result = None
    
    print(f"[调试通信] 工具 {tool_name} 获取结果 (ID:{command_id}): {result}, 日志数: {len(logs)}")
    return jsonify({'result': result, 'logs': logs})

@debug_comm_blueprint.route('/send', methods=['POST'])
def send_command():
    data = request.json
    if not data:
        print(f"[调试通信] 错误: 请求体为空")
        return jsonify({'error': '请求体为空'}), 400
    
    tool_name = data.get('tool')
    command = data.get('command')
    
    if not tool_name or not command:
        print(f"[调试通信] 错误: 缺少参数, 数据: {data}")
        return jsonify({'error': '缺少tool或command参数'}), 400
    
    with debug_lock:
        debug_command_ids[tool_name] += 1
        command_id = debug_command_ids[tool_name]
        debug_command_queue[tool_name] = {'id': command_id, 'command': command}
    print(f"[调试通信] 发送命令到工具 {tool_name} (ID:{command_id}): {command}")
    return jsonify({'status': 'sent', 'tool': tool_name, 'command': command, 'command_id': command_id})

@debug_comm_blueprint.route('/logs', methods=['POST'])
def collect_logs():
    data = request.json
    if not data:
        print(f"[调试通信] 错误: 请求体为空")
        return jsonify({'error': '请求体为空'}), 400
    
    tool_name = data.get('tool')
    logs = data.get('logs', [])
    
    if not tool_name:
        print(f"[调试通信] 错误: 缺少tool参数, 数据: {data}")
        return jsonify({'error': '缺少tool参数'}), 400
    
    if logs:
        with debug_lock:
            debug_logs[tool_name].extend(logs)
        
        for log in logs:
            level = log.get('level', 'info')
            message = log.get('message', '')
            print(f"[调试通信] 前端日志 [{level}]: {message}")
    
    return jsonify({'status': 'ok'})

@debug_comm_blueprint.route('/set_config', methods=['POST'])
def set_config():
    data = request.json
    if not data:
        return jsonify({'error': '请求体为空'}), 400
    
    default_comm_tool = data.get('default_comm_tool')
    if not default_comm_tool:
        return jsonify({'error': '缺少default_comm_tool参数'}), 400
    
    config = load_config()
    config['default_comm_tool'] = default_comm_tool
    save_config(config)
    print(f"[配置] 默认调试通信工具已设置为: {default_comm_tool}")
    
    return jsonify({'status': 'ok', 'default_comm_tool': default_comm_tool})

@debug_comm_blueprint.route('/get_config', methods=['GET'])
def get_config():
    config = load_config()
    return jsonify(config)

@debug_comm_blueprint.route('/reset', methods=['POST'])
def reset_tool():
    tool_name = request.args.get('tool')
    if not tool_name:
        return jsonify({'error': '缺少tool参数'}), 400
    
    with debug_lock:
        debug_command_queue[tool_name] = None
        debug_results[tool_name] = None
        debug_logs[tool_name] = []
    
    print(f"[调试通信] 工具 {tool_name} 数据已重置")
    return jsonify({'status': 'ok', 'tool': tool_name})

def load_config():
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}

def save_config(config):
    with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
        json.dump(config, f, ensure_ascii=False, indent=2)

def set_default_comm_tool(tool_name):
    config = load_config()
    config['default_comm_tool'] = tool_name
    save_config(config)
    print(f"[配置] 默认调试通信工具已设置为: {tool_name}")

def get_default_comm_tool():
    config = load_config()
    return config.get('default_comm_tool')

def send_command_to_server(tool_name, command):
    try:
        response = requests.post(
            'http://127.0.0.1:5000/debug_comm/send',
            json={'tool': tool_name, 'command': command},
            timeout=5
        )
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"[错误] 无法连接到服务器: {e}")
        return None

def wait_for_result(tool_name, command_id, timeout=10):
    start = time.time()
    while time.time() - start < timeout:
        try:
            response = requests.get(
                f'http://127.0.0.1:5000/debug_comm/result?tool={tool_name}&command_id={command_id}',
                timeout=5
            )
            data = response.json()
            if data.get('result') is not None or data.get('logs'):
                return data
        except requests.exceptions.RequestException as e:
            print(f"[错误] 获取结果失败: {e}")
            break
        time.sleep(0.5)
    return {'result': 'Timeout', 'logs': []}

def main():
    if len(sys.argv) < 2:
        print("用法: python dc.py [set <tool_name>] | [<tool_name>] <javascript_code>")
        print("示例:")
        print("  # 设置默认调试通信工具")
        print("  python dc.py set deduplicate_string")
        print("  # 使用默认工具执行命令")
        print("  python dc.py \"document.title = '测试'\"")
        print("  # 指定工具执行命令")
        print("  python dc.py deduplicate_string \"document.querySelector('h1')?.textContent\"")
        print("  python dc.py deduplicate_string \"console.log('测试日志')\"")
        return
    
    if sys.argv[1] == 'set':
        if len(sys.argv) < 3:
            print("[错误] 请提供工具名称")
            return
        set_default_comm_tool(sys.argv[2])
        return
    
    default_comm_tool = get_default_comm_tool()
    if default_comm_tool:
        command = ' '.join(sys.argv[1:])
        tool_name = default_comm_tool
        print(f"[配置] 使用默认调试通信工具: {tool_name}")
    else:
        tool_name = sys.argv[1]
        if len(sys.argv) < 3:
            print("[错误] 请提供 JavaScript 代码")
            return
        command = ' '.join(sys.argv[2:])
    
    print(f"[调试通信] 发送命令到工具 '{tool_name}': {command}")
    
    send_result = send_command_to_server(tool_name, command)
    if not send_result:
        return
    
    if send_result.get('status') != 'sent':
        print(f"[错误] 发送失败: {send_result}")
        return
    
    command_id = send_result.get('command_id')
    print(f"[调试通信] 命令已发送 (ID:{command_id})，等待执行结果...")
    
    result_data = wait_for_result(tool_name, command_id, timeout=10)
    
    if result_data.get('result') != 'Timeout':
        print(f"[调试通信] 执行结果: {result_data.get('result')}")
        for log in result_data.get('logs', []):
            print(f"[调试通信] 前端日志 [{log['level']}]: {log['message']}")
    else:
        print("[调试通信] 等待超时，请检查:")
        print("  1. 工具是否已启动调试通信（是否添加了前端轮询代码）")
        print("  2. 工具页面是否在浏览器中打开")
        print("  3. 服务器是否正常运行")

if __name__ == '__main__':
    main()
