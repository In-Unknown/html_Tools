# server.pyw
import importlib
import sys
from pathlib import Path
from flask import Flask, request, make_response, abort, redirect, send_from_directory
import webbrowser
import os
from log_stream import RenormalizedLogStream


# 切换工作目录到脚本所在目录
os.chdir(os.path.dirname(os.path.abspath(__file__)))

# 重定向所有输出到重整化日志流
log_stream = RenormalizedLogStream()
sys.stdout = sys.stderr = log_stream


app = Flask(__name__)

import dc
app.register_blueprint(dc.debug_comm_blueprint, url_prefix='/debug_comm')

@app.route('/debug_comm.js')
def serve_debug_comm_js():
    return send_from_directory(os.path.dirname(__file__), 'debug_comm.js')

class CaseInsensitiveDict(dict):
    """当存入或读取键值对时，自动将 Key 转换为小写"""
    def __setitem__(self, k, v): super().__setitem__(k.lower(), v)
    def __getitem__(self, k): return super().__getitem__(k.lower())
    def __contains__(self, k): return super().__contains__(k.lower())
    def get(self, k, default=None): return super().get(k.lower(), default)

def getDir() -> Path:
    from inspect import stack
    caller_file = stack()[1].filename
    return Path(caller_file).parent.relative_to(Path(__file__).parent)

class ToolManager:
    def __init__(self):
        self.tools = CaseInsensitiveDict()
        
        current_dir = Path(__file__).parent
        
        for item in current_dir.iterdir():
            if (item.is_dir() and 
                not item.name.startswith('.') and 
                not item.name.startswith('_')):
                
                try:
                    if str(current_dir) not in sys.path:
                        sys.path.insert(0, str(current_dir))
                    
                    module = importlib.import_module(item.name)
                    module.getDir = getDir
                    
                    self.tools[item.name] = module
                    
                    name_lowered = item.name.lower()
                    print(f"加载工具: {name_lowered} (原始文件夹名: {item.name})")
                    
                    app.add_url_rule(
                        f'/{name_lowered}/', defaults={'path': ''},
                        view_func=self.make_view(module), methods=['GET', 'POST'],
                        endpoint=f"{name_lowered}_root"
                    )
                    app.add_url_rule(
                        f'/{name_lowered}/<path:path>',
                        view_func=self.make_view(module), methods=['GET', 'POST'],
                        endpoint=f"{name_lowered}_path"
                    )
                except Exception as e:
                    print(f"加载失败 {item.name}: {e}")

    @staticmethod
    def make_view(module):
        def view(path):
            if hasattr(module, 'handle_request'):
                return module.handle_request(path, request)
            return make_response(f"工具 {module.__name__} 未实现请求处理函数", 404)
        return view

manager = ToolManager()

@app.before_request
def handle_tool_case():

    path_parts = request.path.strip('/').split('/')
    if not path_parts or path_parts[0] == "":
        return
    
    first_part = path_parts[0] # 工具名部分
    
    if any(c.isupper() for c in first_part):
        lowered_tool = first_part.lower()
        if lowered_tool in manager.tools:

            remaining = "/".join(path_parts[1:])
            new_path = f"/{lowered_tool}/{remaining}"

            if request.path.endswith('/') and not new_path.endswith('/'):
                new_path += '/'

            return redirect(new_path, code=301)

@app.route('/')
def empty_root():
    abort(404, description="请访问具体的工具路径，例如: /start_menu/")

if __name__ == '__main__':
    print("已加载工具数量:", len(manager.tools))
    print("可用工具:", list(manager.tools.keys()))

    # 打开导航工具列表页面
    if 'tool_nav' in manager.tools:
        url = "http://localhost:5000/tool_nav/"
        print(f"正在打开浏览器访问: {url}")
        webbrowser.open(url)
    else:
        print("注意: 未找到 tool_nav 工具")

    app.run(host='0.0.0.0', debug=False, port=5000)