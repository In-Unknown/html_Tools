"""
工具导航模块 - 极简版本
只提供两个功能：
1. 返回工具列表的JSON API
2. 提供静态HTML页面
"""
import os
from pathlib import Path
from flask import jsonify, send_from_directory
import json

# 导入拼音排序库
try:
    from pypinyin import lazy_pinyin, Style
    HAS_PINYIN = True
except ImportError:
    HAS_PINYIN = False
    print("警告：未安装 pypinyin 库，将使用普通排序")

def get_sort_key(name):
    """
    获取排序键：如果是中文，转换为拼音首字母；否则使用原字符串
    返回小写字符串以便不区分大小写排序
    """
    if not HAS_PINYIN:
        return name.lower()
    
    try:
        # 将中文转换为拼音首字母，非中文部分保留原样
        pinyin_list = lazy_pinyin(name, style=Style.FIRST_LETTER)
        # 组合成字符串并转为小写
        return ''.join(pinyin_list).lower()
    except Exception:
        # 如果转换失败，回退到普通排序
        return name.lower()

def get_tools_list():
    """动态获取可用工具列表"""
    tools = []
    
    # 获取当前目录的父目录（server.py所在目录）
    project_root = Path(__file__).parent.parent
    
    # 扫描所有符合条件的目录
    for item in project_root.iterdir():
        if not item.is_dir():
            continue
            
        # 跳过隐藏目录、以_开头的目录、当前目录
        if (item.name.startswith('.') or 
            item.name.startswith('_') or 
            item.name == Path(__file__).parent.name):
            continue
        
        # 检查是否有__init__.py文件
        if (item / "__init__.py").exists():
            # 检查是否有index.html
            has_html = (item / "index.html").exists()
            
            # 默认值：使用文件夹名
            name_zh = item.name
            icon = item.name[0].upper()  # 首字母大写
            icon_padding = 10  # 默认留白
            icon_color = ""    # 默认颜色（空）
            description = ""   # 默认描述为空
            
            # 尝试读取元数据文件（优先级1：JSON）
            meta_json = item / "tool_meta.json"
            meta_txt = item / "tool_info.txt"
            
            if meta_json.exists():
                try:
                    import json
                    with open(meta_json, 'r', encoding='utf-8') as f:
                        meta = json.load(f)
                    name_zh = meta.get("name_zh", name_zh)
                    icon = meta.get("icon", icon)
                    icon_padding = meta.get("icon_padding", icon_padding)
                    icon_color = meta.get("icon_color", icon_color)
                    description = meta.get("description", description)  # 添加描述读取
                except Exception as e:
                    print(f"警告：读取 {item.name}/tool_meta.json 失败: {e}")
            
            elif meta_txt.exists():
                try:
                    with open(meta_txt, 'r', encoding='utf-8') as f:
                        lines = f.readlines()
                    for line in lines:
                        if '=' in line:
                            key, value = line.strip().split('=', 1)
                            if key == 'name_zh':
                                name_zh = value
                            elif key == 'icon':
                                icon = value
                            elif key == 'icon_padding':
                                icon_padding = int(value)
                            elif key == 'icon_color':
                                icon_color = value
                            elif key == 'description':  # 添加描述读取
                                description = value
                except Exception as e:
                    print(f"警告：读取 {item.name}/tool_info.txt 失败: {e}")
            
            # 处理图标路径：只有包含文件扩展名的相对路径才转换为绝对路径（使用小写文件夹名）
            if icon and not icon.startswith('http') and not icon.startswith('data:') and not icon.startswith('<'):
                if '.' in icon and icon.split('.')[-1].lower() in ['svg', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico']:
                    clean_icon = icon.lstrip('./\\')
                    icon = f"/{item.name.lower()}/{clean_icon}"
            
            # 添加到工具列表
            tools.append({
                "name": item.name,           # 原始文件夹名
                "name_zh": name_zh,          # 中文名
                "icon": icon,                # 图标
                "icon_padding": icon_padding, # 图标留白
                "icon_color": icon_color,    # 图标颜色
                "description": description,  # 工具描述
                "path": f"/{item.name}/",
                "hasHtml": has_html
            })
    
    # 按拼音首字母排序（中文）或字母排序（英文）
    tools.sort(key=lambda x: get_sort_key(x["name_zh"]))
    return tools

def handle_request(path, request):
    """处理请求"""
    if path == "api/tools":
        # 返回工具列表的JSON
        return jsonify({
            "success": True,
            "tools": get_tools_list(),
            "count": len(get_tools_list())
        })
    
    if path == "exit":
        print("收到退出请求，正在关闭程序...")
        os._exit(0)
    elif path == "" or path == "index.html":
        # 返回静态HTML页面
        return send_from_directory(Path(__file__).parent, "index.html")
    
    else:
        return "Not Found", 404