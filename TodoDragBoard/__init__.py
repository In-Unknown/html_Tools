# <toolNmaeDir>/__init__.py
from flask import send_from_directory
import json
from flask import make_response, request
from pathlib import Path
import base64
import hashlib
from datetime import datetime
import time
import os
from bs4 import BeautifulSoup

def getDir() -> Path:
    """获取当前模块所在目录路径
    
    Returns:
        Path对象，指向当前__init__.py文件所在目录
    """
    # 保持原有逻辑
    # print("getDir 函数未被注入...")
    return Path(__file__).parent

def handle_request(path, request):
    """处理HTTP请求路由
    
    Args:
        path: 请求路径
        request: Flask请求对象
        
    Returns:
        静态文件响应或API响应
    """
    print("进入todoDragBoard")
    base_dir = getDir()
    file_path = base_dir / path
    
    if path and file_path.is_file():
        return send_from_directory(base_dir, path)
    
    if path.startswith("api/"):
        return api_rt[path[4:]](request)
    
    return send_from_directory(base_dir, "index.html")

# --- 核心辅助函数：JS句柄风格读写 ---

def get_by_path(data, path):
    """通过 'key.key.index' 字符串获取嵌套数据值
    
    Args:
        data: 原始数据（字典或列表）
        path: 点号分隔的路径字符串，如 "workspaces.0.title"
        
    Returns:
        路径对应的值，路径无效时返回 None
    """
    keys = path.split('.')
    current = data
    try:
        for key in keys:
            if isinstance(current, list):
                # 如果当前是列表，尝试将key转为数字索引
                key = int(key)
            current = current[key]
        return current
    except (KeyError, IndexError, ValueError, TypeError):
        return None # 或者抛出错误，看你需求

def set_by_path(data, path, value):
    """通过 'key.key.index' 字符串修改嵌套数据值
    
    Args:
        data: 原始数据（字典或列表），会被直接修改
        path: 点号分隔的路径字符串，如 "workspaces.0.title"
        value: 要设置的值
    """
    keys = path.split('.')
    current = data
    
    # 遍历直到倒数第二个元素，找到目标位置的父级
    for i, key in enumerate(keys[:-1]):
        if isinstance(current, list):
            # 处理列表索引
            idx = int(key)
            current = current[idx]
        else:
            # 处理字典，如果key不存在，这里选择自动创建字典（可选）
            if key not in current:
                current[key] = {}
            current = current[key]
            
    # 设置最终的值
    last_key = keys[-1]
    if isinstance(current, list):
        idx = int(last_key)
        current[idx] = value
    else:
        current[last_key] = value

# --- 读写文件json ---------

def json_read(request):
    """读取JSON文件API处理器
    
    支持通过path参数读取指定路径的嵌套数据
    
    Args:
        request: Flask请求对象，期望包含JSON体：
            - filename: 文件名（不含扩展名）
            - path: 可选，点号分隔的路径句柄
            
    Returns:
        JSON响应，包含读取的数据或错误信息
    """
    try:
        payload = request.get_json()
    except Exception as e:
        return make_response(json.dumps({"error": "Invalid JSON"}), 400)

    filename = payload.get('filename')
    # 获取句柄路径 (例如: "workspaces.design.title")
    path_handle = payload.get('path')
    
    if not filename:
        return make_response(json.dumps({"error": "Filename required"}), 400)

    data_dir = getDir() / "data"
    json_file = data_dir / f"{filename}.json"

    if not json_file.exists():
        return make_response(json.dumps({"error": "File not found"}), 404)

    with open(json_file, 'r', encoding='utf-8') as f:
        full_data = json.load(f)

    # 如果有路径句柄，只返回特定部分
    if path_handle:
        result_data = get_by_path(full_data, path_handle)
        return make_response(json.dumps(result_data))
    
    # 否则返回全部
    return make_response(json.dumps(full_data))

def create_daily_backup(json_file, data_dir):
    """创建每日备份
    
    备份策略：
    - 检查 backups/ 目录中是否存在今天日期的备份文件
    - 如果不存在，则创建今天的备份
    - 如果日期变更（昨天 → 今天），保留昨天的备份
    
    备份文件命名格式：YYYY-MM-DD.json
    
    Args:
        json_file: 原始JSON文件路径
        data_dir: 数据目录路径
    """
    backups_dir = data_dir / "backups"
    backups_dir.mkdir(exist_ok=True)
    
    today = datetime.now().strftime('%Y-%m-%d')
    today_backup = backups_dir / f"{today}.json"
    
    # 如果今天的备份已存在，无需再次备份
    if today_backup.exists():
        return
    
    # 获取所有备份文件并按日期排序
    backup_files = sorted(backups_dir.glob('*.json'), key=lambda x: x.name)
    
    # 删除所有超过2天的旧备份（只保留最近2天）
    # 如果有超过2个文件，删除除了最后2个之外的所有文件
    if len(backup_files) >= 2:
        for old_file in backup_files[:-2]:
            try:
                old_file.unlink()
            except Exception:
                pass
    
    # 复制今天的备份
    try:
        with open(json_file, 'r', encoding='utf-8') as src:
            with open(today_backup, 'w', encoding='utf-8') as dst:
                dst.write(src.read())
    except Exception as e:
        print(f"Backup failed: {e}")

def json_write(request):
    """写入JSON文件API处理器
    
    支持全量覆盖或通过path参数局部修改嵌套数据
    自动处理Base64图片转换为文件
    
    Args:
        request: Flask请求对象，期望包含JSON体：
            - filename: 文件名（不含扩展名）
            - path: 可选，点号分隔的路径
            - data: 要写入的数据
            
    Returns:
        JSON响应，包含成功标记或错误信息
    """
    try:
        payload = request.get_json()
    except Exception as e:
        return make_response(json.dumps({"error": "Invalid JSON"}), 400)

    filename = payload.get('filename')
    path_handle = payload.get('path') # 句柄路径
    
    if not filename:
        return make_response(json.dumps({"error": "Filename required"}), 400)

    data_dir = getDir() / "data" # 构建数据目录路径
    data_dir.mkdir(exist_ok=True) # 确保数据目录存在
    images_dir = data_dir / "images" # 构建图片目录路径
    images_dir.mkdir(exist_ok=True) # 确保图片目录存在

    json_file = data_dir / f"{filename}.json"
    
    # 1. 读取现有文件（如果不存在则初始化为空字典），读取到full_data
    if json_file.exists():
        with open(json_file, 'r', encoding='utf-8') as f:
            full_data = json.load(f)
    else:
        full_data = {}

    # 2. 准备要写入的数据
    incoming_data = payload.get('data')

    # 3. 处理图片 (Base64 -> File)
    # 我们只处理这次传进来的数据，这样比处理整个文件快得多
    processed_incoming_data = process_value(incoming_data, images_dir)
    # 4. 根据是否有 path_handle 决定如何合并数据
    try:
        if path_handle:
            # 局部修改模式：将处理好的数据塞入 full_data 的指定位置
            set_by_path(full_data, path_handle, processed_incoming_data)
        else:
            # 全量覆盖模式
            full_data = processed_incoming_data
    except Exception as e:
        print(f"Path Error: {e}")
        return make_response(json.dumps({"error": f"Invalid path structure: {str(e)}"}), 400)
    
    # 5. 写入文件
    try:
        # 为了安全，建议先写临时文件再重命名，防止写入中断导致文件损坏
        temp_file = json_file.with_suffix('.tmp')
        with open(temp_file, 'w', encoding='utf-8') as f:
            json.dump(full_data, f, ensure_ascii=False, indent=2)
        
        if os.path.exists(json_file):
            os.remove(json_file)
        os.rename(temp_file, json_file)
        
        # 6. 每日备份
        create_daily_backup(json_file, data_dir)
            
        return make_response(json.dumps({"ok": True}))
    except Exception as e:
        print(e)
        return make_response(json.dumps({"error": "Failed to write file"}), 500)

# --- 处理数据中的Base64图片 ---------

def process_value(value, images_dir, img_counter=None):
    """递归处理数据中的Base64图片
    
    将HTML中的Base64编码图片提取并保存为文件，
    同时添加拖拽相关的class和id属性
    
    Args:
        value: 要处理的数据，可以是字符串、字典或列表
        images_dir: 图片保存目录路径
        img_counter: 图片计数器（内部使用）
        
    Returns:
        处理后的数据，Base64图片被替换为文件路径引用
    """
    if isinstance(value, str) and '<img' in value:
        soup = BeautifulSoup(value, 'html.parser')
        
        for img in soup.find_all('img'):
            src = img.get('src', '')
            if not src.startswith('data:image/'):
                continue
            
            if ';base64,' not in src:
                continue
            
            header, base64_data = src.split(';base64,', 1)
            
            try:
                image_data = base64.b64decode(base64_data)
                hash_obj = hashlib.sha256(image_data)
                hash_str = hash_obj.hexdigest()
                
                ext = 'png' if 'png' in header else 'jpg'
                filename = f"{hash_str}.{ext}"
                image_path = images_dir / filename
                
                if not image_path.exists():
                    with open(image_path, 'wb') as img_file:
                        img_file.write(image_data)
                
                img['src'] = f'/tododragboard/data/images/{filename}'
                img['class'] = img.get('class', []) + ['drag-img']
                
                if img_counter is None:
                    img_counter = [0]
                img_id = f"img-{int(time.time())}-{img_counter[0]}"
                img_counter[0] += 1
                img['id'] = img_id
                
            except Exception:
                continue
        
        return str(soup)
    elif isinstance(value, dict):
        return {k: process_value(v, images_dir, img_counter) for k, v in value.items()}
    elif isinstance(value, list):
        return [process_value(item, images_dir, img_counter) for item in value]
    return value

api_rt = {
    "json/r": json_read,
    "json/w": json_write,
}
