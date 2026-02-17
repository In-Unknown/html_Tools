import json
import requests
from mcp.server.fastmcp import FastMCP
from pathlib import Path

ROOT_DIR = Path(__file__).parent.absolute()

# 初始化 MCP
mcp = FastMCP("HtmlToolsBridge")

# 你的 Flask 服务器地址
BASE_URL = "http://localhost:5000"

@mcp.tool()
def call_tool_api(tool_name: str, api_path: str, payload: dict) -> str:
    """
    通过 HTTP 访问本地工具服务器的 API。
    
    :param tool_name: 工具文件夹名 (例如 'tododragboard')
    :param api_path: API 路径 (例如 'api/json/r' 或 'api/json/w')
    :param payload: 发送给 API 的 JSON 数据字典
    """
    # 构造完整的 URL
    # 例如: http://localhost:5000/tododragboard/api/json/r
    url = f"{BASE_URL}/{tool_name.lower()}/{api_path}"
    
    try:
        # 发送 POST 请求 (因为你的 API 都是处理 JSON 的)
        response = requests.post(url, json=payload, timeout=10)
        
        # 返回结果
        if response.status_code == 200:
            return response.text
        else:
            return f"服务器返回错误 (状态码 {response.status_code}): {response.text}"
            
    except Exception as e:
        return f"请求失败: {str(e)}"

@mcp.tool()
def list_available_tools() -> str:
    """
    获取当前所有可用的工具列表（基于你的项目结构）。
    由于这是动态加载的，AI 可以先调用这个看有哪些工具。
    """
    
    tools = [d.name for d in ROOT_DIR.iterdir() if d.is_dir() and not d.name.startswith(('.', '_'))]
    if not tools:
            return f"在目录 {ROOT_DIR} 下未找到任何工具文件夹。"
            
    return f"当前项目下的工具文件夹: {', '.join(tools)}"

if __name__ == "__main__":
    mcp.run()