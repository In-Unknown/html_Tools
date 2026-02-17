# tool_base.py
import json
from pathlib import Path
from flask import send_from_directory, make_response

class ToolBase:
    def __init__(self, tool_file_path):
        """
        :param tool_file_path: 传入子模块的 __file__ 变量
        """
        # 自动获取工具根目录
        self.base_dir = Path(tool_file_path).parent
        self.data_dir = self.base_dir / "data"
        
        # 1. 保留 api_rt 变量名，并在初始化时预置通用接口
        self.api_rt = {
            "json/r": self._default_json_read,
            "json/w": self._default_json_write,
        }

    # 2. 保留 getDir 方法，向前兼容
    def getDir(self) -> Path:
        return self.base_dir

    def handle_request(self, path, request):
        """标准请求处理流程"""
        # 优先匹配 API
        if path.startswith("api/"):
            route_key = path[4:]  # 去掉 'api/'
            if route_key in self.api_rt:
                return self.api_rt[route_key](request)
            return make_response(f"API route not found: {route_key}", 404)

        # 静态文件与 SPA 路由
        file_path = self.base_dir / path
        if path and file_path.is_file():
            return send_from_directory(self.base_dir, path)
        
        return send_from_directory(self.base_dir, "index.html")

    # --- 通用 API 实现 (带基础安全检查) ---

    def _default_json_read(self, request):
        filename = request.form.get('filename')
        if not filename: return make_response(json.dumps({"error": "Filename required"}), 400)
        
        # 简单防跨目录
        if ".." in filename or "/" in filename:
            return make_response(json.dumps({"error": "Illegal filename"}), 403)

        json_file = self.data_dir / f"{filename}.json"
        
        if not json_file.exists():
             return make_response(json.dumps({"error": "File not found"}), 404)

        try:
            with open(json_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            return make_response(json.dumps(data))
        except Exception as e:
            return make_response(json.dumps({"error": str(e)}), 500)

    def _default_json_write(self, request):
        filename = request.form.get('filename')
        if not filename: return make_response(json.dumps({"error": "Filename required"}), 400)
        
        if ".." in filename or "/" in filename:
            return make_response(json.dumps({"error": "Illegal filename"}), 403)

        self.data_dir.mkdir(exist_ok=True)
        json_file = self.data_dir / f"{filename}.json"
        
        json_data = request.form.get('data')
        if json_data is None: return make_response(json.dumps({"error": "No data"}), 400)
        
        try:
            data = json.loads(json_data) if json_data else {}
            with open(json_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            return make_response(json.dumps({"ok": True}))
        except Exception as e:
            return make_response(json.dumps({"error": str(e)}), 500)