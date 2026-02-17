# video_scroll/__init__.py
from flask import send_from_directory, send_file, make_response, request
import json
from pathlib import Path
import os
import random
import base64
import cv2
import re
import time
import jieba

def getDir() -> Path:
    print("getDir 函数未被注入！或调用位置在模块级别，请检查调用位置确保其在函数内。")
    return Path(__file__).parent

class Video:
    """视频对象，包含id、路径、标签，封面按需生成"""
    def __init__(self, id: str, path: str, tags: list):
        self.id = id          # 唯一标识符
        self.path = path      # 视频文件路径
        self.tags = tags      # 标签数组
        # 不再在初始化时生成封面和时长，只在需要时生成
    
    def generate_cover(self):
        """生成视频封面（截取第一帧）并返回base64字符串"""
        try:
            # 检查视频文件是否存在
            if not os.path.exists(self.path):
                print(f"视频文件不存在: {self.path}")
                return ""
            
            # 使用OpenCV打开视频
            cap = cv2.VideoCapture(self.path)
            if not cap.isOpened():
                print(f"无法打开视频文件: {self.path}")
                return ""
            
            # 读取第一帧
            ret, frame = cap.read()
            cap.release()
            
            if not ret or frame is None:
                print(f"无法读取视频帧: {self.path}")
                return ""
            
            # 调整图片尺寸（保持宽高比，最大宽度640px）
            height, width = frame.shape[:2]
            if width > 640:
                new_width = 640
                new_height = int(height * (new_width / width))
                frame = cv2.resize(frame, (new_width, new_height))
            
            # 将图片转换为JPEG格式并编码为base64
            _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
            cover_base64 = base64.b64encode(buffer).decode('utf-8')
            
            # 添加data URI前缀并返回
            return f"data:image/jpeg;base64,{cover_base64}"
            
        except Exception as e:
            print(f"生成封面失败 {self.path}: {e}")
            return ""
    
    def get_duration(self):
        """获取视频时长（秒）"""
        try:
            # 检查视频文件是否存在
            if not os.path.exists(self.path):
                print(f"视频文件不存在: {self.path}")
                return 0
            
            # 使用OpenCV打开视频
            cap = cv2.VideoCapture(self.path)
            if not cap.isOpened():
                print(f"无法打开视频文件: {self.path}")
                return 0
            
            # 获取视频的帧率
            fps = cap.get(cv2.CAP_PROP_FPS)
            
            # 获取视频的总帧数
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            
            cap.release()
            
            if fps <= 0 or total_frames <= 0:
                return 0
            
            # 计算时长（秒）
            duration = total_frames / fps
            
            # 返回格式化的时长（秒，保留2位小数）
            return round(duration, 2)
            
        except Exception as e:
            print(f"获取视频时长失败 {self.path}: {e}")
            return 0

def video_recommendation_algorithm():
    """
    视频推荐算法
    目前使用随机选择，后续可以扩展为基于用户历史、标签匹配等复杂算法
    """
    # 目前使用简单的随机推荐
    return random.choice(videos)

def scan_videos_from_directories(directories: list) -> list:
    """
    扫描多个目录下的所有.mp4文件，生成视频对象数组
    
    Args:
        directories: 要扫描的目录路径列表
        
    Returns:
        list[Video]: 生成的视频对象列表
    """
    def extract_tags_from_path(video_path: str, base_dir: str) -> list:
        """从视频路径提取标签（内部函数）"""
        # 中文停用词集合（可以根据需要扩展）
        stop_words = {
            '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', 
            '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这', '那', '中', '得', '里', '过', '与', '对', 
            '下', '个', '之', '将', '等', '把', '来', '还', '又', '但', '从', '以', '并', '向', '它', '她', '他', '而',
            '被', '让', '给', '于', '或', '且', '如果', '因为', '所以', '但是', '然后', '而且', '或者', '虽然', '即使',
            '系列', '视频', '电影', '影视', '影片', '短片', '录像', '录制'
        }
        
        # 特殊字符和数字字母白名单（单个字符如果在这个白名单中则保留）
        char_whitelist = set('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789')
        
        def is_pure_number(text: str) -> bool:
            """检查是否为纯数字"""
            return text.isdigit()
        
        def is_pure_symbol(text: str) -> bool:
            """检查是否为纯符号（包括各种标点、括号、特殊字符等）"""
            if not text:
                return True
            
            for char in text:
                # 如果字符是中文、英文或数字，则不是纯符号
                if '\u4e00' <= char <= '\u9fff':  # 中文
                    return False
                if char in char_whitelist:  # 英文数字
                    return False
            
            return True
        
        def contains_emoji(text: str) -> bool:
            """检查是否包含表情符号"""
            # 表情符号的Unicode范围
            emoji_ranges = [
                (0x1F600, 0x1F64F),  # 表情符号
                (0x1F300, 0x1F5FF),  # 符号和象形文字
                (0x1F680, 0x1F6FF),  # 交通和地图符号
                (0x1F1E0, 0x1F1FF),  # 国旗
                (0x2600, 0x26FF),    # 杂项符号
                (0x2700, 0x27BF),    # 装饰符号
                (0xFE00, 0xFE0F),    # 变体选择器
                (0x1F900, 0x1F9FF),  # 补充符号
                (0x1F018, 0x1F0F5),  # 国际象棋等
                (0x1F200, 0x1F270),  # 封闭式字母数字
            ]
            
            for char in text:
                code_point = ord(char)
                for start, end in emoji_ranges:
                    if start <= code_point <= end:
                        return True
            
            return False
        
        def split_complex_name(text: str) -> list:
            """处理包含多种分隔符的复杂名称"""
            # 将各种分隔符统一替换为空格
            separators = ['_', '-', '.', ' ', '～', '~', '—', '–', '|', '·']
            for sep in separators:
                text = text.replace(sep, ' ')
            
            # 处理中英文混合（在中文和英文/数字间添加空格）
            # 例如：魔法师abc -> 魔法师 abc
            text = re.sub(r'([\u4e00-\u9fff])([a-zA-Z0-9])', r'\1 \2', text)
            text = re.sub(r'([a-zA-Z0-9])([\u4e00-\u9fff])', r'\1 \2', text)
            
            return text.split()
        
        # 获取相对于基目录的路径
        rel_path = os.path.relpath(video_path, base_dir)
        
        # 获取父目录部分（去掉文件名）
        parent_dirs = os.path.dirname(rel_path)
        
        if not parent_dirs or parent_dirs == '.':  # 如果视频就在根目录下
            return []
        
        # 按路径分隔符分割目录名
        dir_parts = []
        for part in parent_dirs.split(os.sep):
            if part and part != '.':  # 跳过空目录和当前目录标识
                dir_parts.append(part)
        
        # 分词处理
        all_tags = []
        for dir_name in dir_parts:
            # 先进行复杂名称分割
            complex_parts = split_complex_name(dir_name)
            
            for part in complex_parts:
                # 使用jieba进行中文分词
                words = jieba.lcut(part)
                
                for word in words:
                    word = word.strip()
                    
                    # 跳过空词
                    if not word:
                        continue
                    
                    # 跳过停用词
                    if word in stop_words:
                        continue
                    
                    # 过滤纯数字标签
                    if is_pure_number(word):
                        continue
                    
                    # 过滤包含表情符号的标签
                    if contains_emoji(word):
                        continue
                    
                    # 过滤纯符号标签
                    if is_pure_symbol(word):
                        continue
                    
                    # 过滤处理
                    if len(word) == 1:
                        # 单个字符：只有在白名单中或不是中文时才保留
                        if word in char_whitelist:
                            # 确保英文字母是大写的，保持一致性
                            word_upper = word.upper()
                            if word_upper not in all_tags:
                                all_tags.append(word_upper)
                        elif not '\u4e00' <= word <= '\u9fff':  # 不是中文字符
                            # 保留非中文的单个字符（可能是特殊符号）
                            if word not in all_tags:
                                all_tags.append(word)
                    else:
                        # 多字符词：检查是否包含无意义的符号
                        if any(char in word for char in ['(', ')', '[', ']', '{', '}', '<', '>']):
                            # 去除括号等符号
                            cleaned_word = re.sub(r'[()\[\]{}<>]', '', word)
                            
                            # 去除符号后再次检查
                            if not cleaned_word or is_pure_number(cleaned_word) or is_pure_symbol(cleaned_word) or contains_emoji(cleaned_word):
                                continue
                            
                            if cleaned_word not in all_tags and cleaned_word not in stop_words:
                                all_tags.append(cleaned_word)
                        elif word not in all_tags:
                            all_tags.append(word)
        
        # 移除可能因处理而产生的空字符串
        all_tags = [tag for tag in all_tags if tag]
        
        return all_tags
    
    videos_list = []
    video_counter = 0
    processed_paths = set()  # 记录已处理的路径，避免重复添加
    
    # 处理每个目录
    for directory in directories:
        base_path = Path(directory)
        
        # 检查目录是否存在
        if not base_path.exists():
            print(f"警告：目录不存在，跳过: {directory}")
            continue
            
        if not base_path.is_dir():
            print(f"警告：路径不是目录，跳过: {directory}")
            continue
        
        print(f"正在扫描目录: {directory}")
        
        # 遍历目录下所有文件
        for video_file in base_path.rglob("*"):
            # 检查是否是文件且扩展名是.mp4（严格匹配）
            if video_file.is_file() and video_file.suffix.lower() == '.mp4':
                # 检查是否已处理过此路径（避免重复添加）
                video_path_str = str(video_file)
                if video_path_str in processed_paths:
                    continue
                processed_paths.add(video_path_str)
                
                # 生成唯一ID：时间戳+随机数+序号（使用全局计数器）
                timestamp = int(time.time() * 1000)
                random_num = random.randint(1000, 9999)
                video_id = f"video_{timestamp}_{random_num}_{video_counter}"
                video_counter += 1
                
                # 提取标签（使用当前目录作为基目录）
                tags = extract_tags_from_path(video_path_str, directory)
                
                # 创建Video对象
                try:
                    video = Video(
                        id=video_id,
                        path=video_path_str,
                        tags=tags
                    )
                    videos_list.append(video)
                except Exception as e:
                    print(f"创建视频对象失败 {video_file}: {e}")
    
    return videos_list

# 模块导入时自动扫描目录
print("正在扫描视频目录...")
scanned_videos = scan_videos_from_directories([r"D:\xz"])

# 如果扫描到了视频，就用扫描的结果；否则使用硬编码的视频列表作为后备
if scanned_videos:
    videos = scanned_videos
    print(f"扫描完成，共找到 {len(videos)} 个视频")
else:
    # 扫描失败或没有找到视频，使用硬编码的视频列表
    print("扫描失败或未找到视频，使用硬编码的视频列表")
    videos = [
        Video(id="video_001", path=r"D:\xz\黄药师系列\视频\黄药师10.mp4", tags=["教程", "药师", "医疗"]),
        Video(id="video_002", path=r"D:\xz\黄药师系列\视频\黄药师11.mp4", tags=["教程", "药师", "医疗"]),
        Video(id="video_003", path=r"D:\xz\黄药师系列\视频\黄药师12.mp4", tags=["教程", "药师", "医疗"]),
    ]

# 在模块级别添加缓存字典
_search_cache = {}  # 搜索缓存：key -> 处理后的视频列表

def _get_cache_key(q, search_in, seed_str):
    """生成缓存键"""
    return f"{q}_{search_in}_{seed_str}"

def _get_or_create_search_results(q, search_in, seed_str):
    """
    获取或创建搜索结果
    返回：经过排序和随机处理后的视频列表
    """
    cache_key = _get_cache_key(q, search_in, seed_str)
    
    # 如果缓存中有，直接返回
    if cache_key in _search_cache:
        return _search_cache[cache_key]
    
    # 如果没有查询字符串，返回空列表
    if not q:
        _search_cache[cache_key] = []
        return []
    
    # 解析搜索字段配置
    search_fields = search_in.split('+')
    
    # 搜索视频
    matched_videos = []
    query_lower = q.lower()
    
    for video in videos:
        matched = False
        
        # 检查每个搜索字段
        for field in search_fields:
            if field == 'id':
                if query_lower in video.id.lower():
                    matched = True
                    break
            elif field == 'name':
                # 从路径中提取文件名（不含扩展名）
                filename = os.path.splitext(os.path.basename(video.path))[0]
                if query_lower in filename.lower():
                    matched = True
                    break
            elif field == 'label':
                # 在标签中搜索
                for tag in video.tags:
                    if query_lower in tag.lower():
                        matched = True
                        break
                if matched:
                    break
        
        if matched:
            matched_videos.append(video)
    
    # 如果没有匹配结果，缓存空列表并返回
    if not matched_videos:
        _search_cache[cache_key] = []
        return []
    
    # 按ID中的时间戳排序（假设ID格式为 video_时间戳_随机数_序号）
    def extract_timestamp(video_obj):
        """从视频ID中提取时间戳"""
        try:
            # ID格式: video_时间戳_随机数_序号
            parts = video_obj.id.split('_')
            if len(parts) >= 2:
                return int(parts[1])  # 时间戳部分
        except (ValueError, IndexError):
            pass
        return 0  # 如果解析失败，返回0
    
    # 先按时间戳排序
    matched_videos.sort(key=extract_timestamp)
    
    # 使用随机种子确保结果的一致性
    # 将种子字符串转换为整数种子
    try:
        seed_int = int(seed_str)
    except (ValueError, TypeError):
        # 如果种子不是数字，则使用其哈希值
        seed_int = hash(seed_str) % (2**32)  # 限制在32位整数范围内
    
    # 创建本地随机数生成器，使用指定的种子
    local_random = random.Random(seed_int)
    
    # 给结果列表添加随机性（使用相同的种子保证一致性）
    if len(matched_videos) > 1:
        total = len(matched_videos)
        half = total // 2
        second_half_end = half + (total - half) // 2  # 后一半的后二分之一起始位置
        
        # 从后二分之一中抽取1/3的视频
        if second_half_end < total:
            num_to_select = max(1, (total - second_half_end) // 3)
            if num_to_select > 0:
                # 随机选择视频（使用本地随机生成器）
                selected_indices = local_random.sample(
                    range(second_half_end, total), 
                    min(num_to_select, total - second_half_end)
                )
                selected_videos = [matched_videos[i] for i in selected_indices]
                
                # 从原列表删除选中的视频
                for i in sorted(selected_indices, reverse=True):
                    del matched_videos[i]
                
                # 随机插入到前一半中（使用本地随机生成器）
                for selected_video in selected_videos:
                    insert_position = local_random.randint(0, half - 1)
                    matched_videos.insert(insert_position, selected_video)
    
    # 缓存结果
    _search_cache[cache_key] = matched_videos
    
    # 限制缓存大小，避免内存占用过多
    if len(_search_cache) > 100:
        # 删除最旧的缓存（按插入顺序）
        oldest_key = next(iter(_search_cache))
        del _search_cache[oldest_key]
    
    return matched_videos

def get_video_by_id(video_id: str):
    """根据ID查找视频"""
    for video in videos:
        if video.id == video_id:
            return video
    return None

def handle_request(path, request):
    base_dir = getDir()
    
    file_path = base_dir / path
    
    
    # 1. 如果路径指向现有文件，则直接发送（如 index.html, css, js）
    if path and file_path.is_file():
        return send_from_directory(base_dir, path)
    
    # 2. 匹配 API 路由表
    if path.startswith("api/"):
        api_key = path[4:]
        if api_key in api_rt:
            return api_rt[api_key](request)
        return make_response(json.dumps({"error": f"API {api_key} not found"}), 404)
    
    # 3. 默认返回首页，根据User-Agent判断是否返回移动端页面
    print(f"当前设备信息: {request.headers.get('User-Agent', '没有User-Agent')}")
    return send_from_directory(base_dir, "mobile.html" if bool(re.search(r'android|iphone|mobile', request.headers.get('User-Agent', '').lower())) else "index.html")

def video_feed(request):
    """视频推荐API：返回推荐视频信息，根据参数决定是否生成封面"""
    # 获取是否需要生成封面的参数
    need_cover = request.args.get('need_cover', '').lower()
    
    # 根据参数判断是否需要生成封面（支持多种true表示法）
    generate_cover = need_cover in ['true', '1', 'yes', 'on', 'y']
    
    # 使用推荐算法获取视频
    video = video_recommendation_algorithm()
    
    # 只在需要时才生成封面
    cover = video.generate_cover() if generate_cover else ""
    
    # 构建响应数据
    video_data = {
        "id": video.id,
        "path": video.path,
        "tags": video.tags,
        "cover": cover  # 根据参数决定是否生成封面
        # 注意：video_feed不返回时长，只有搜索API返回
    }
    
    return make_response(json.dumps(video_data, ensure_ascii=False))

def video_stream(request):
    """视频流API：根据ID返回视频流"""
    video_id = request.args.get('id')
    
    if not video_id:
        # 如果没有提供id，返回第一个视频（向后兼容）
        video = videos[0]
    else:
        video = get_video_by_id(video_id)
    
    if not video or not os.path.exists(video.path):
        return make_response(json.dumps({"error": "Video file not found"}), 404)
    
    # Flask的send_file自动支持HTTP Range，允许前端拖动进度条
    return send_file(video.path, mimetype='video/mp4')

def video_search(request):
    """
    视频搜索API：根据查询字符串在指定字段中搜索视频
    
    参数:
        q: 查询字符串
        in: 搜索字段，可选值: "id", "name", "label", "id+name", "id+label", "name+label", "id+name+label"
            (默认: "name+label")
        seed: 随机种子，用于保证分页结果的一致性
        start: 起始索引（包含），从0开始
        end: 结束索引（不包含），从1开始
        need_cover: 是否生成封面，默认: true
        need_duration: 是否返回视频时长，默认: true
    
    返回:
        {
            "start": 实际起始索引,
            "end": 实际结束索引,
            "all": 总结果数,
            "list": [视频对象数组]
        }
    """
    # 获取查询参数
    query = request.args.get('q', '').strip()
    search_in = request.args.get('in', 'name+label').strip().lower()
    seed_str = request.args.get('seed', 'default_seed')
    need_cover_param = request.args.get('need_cover', 'true').lower()
    need_cover = need_cover_param in ['true', '1', 'yes', 'on', 'y']
    need_duration_param = request.args.get('need_duration', 'true').lower()
    need_duration = need_duration_param in ['true', '1', 'yes', 'on', 'y']
    
    # 尝试解析分页参数
    try:
        start = int(request.args.get('start', 0))
        start = max(0, start)  # 确保起始索引非负
    except (ValueError, TypeError):
        start = 0
    
    try:
        end = int(request.args.get('end', 20))
        end = max(start + 1, end)  # 确保结束索引大于起始索引
    except (ValueError, TypeError):
        end = max(start + 1, 20)  # 默认返回20条
    
    # 获取搜索结果（使用缓存）
    matched_videos = _get_or_create_search_results(query, search_in, seed_str)
    
    # 计算总结果数
    total_results = len(matched_videos)
    
    # 调整分页参数，确保不越界
    if start >= total_results:
        # 如果起始位置超出范围，返回空结果
        start = total_results
        end = total_results
        paginated_videos = []
    else:
        # 如果结束位置超出范围，截断到最大位置
        end = min(end, total_results)
        # 获取分页数据
        paginated_videos = matched_videos[start:end]
    
    # 准备返回数据
    result_videos = []
    for video in paginated_videos:
        # 生成封面（根据参数决定）
        cover = video.generate_cover() if need_cover else ""
        
        # 获取视频时长（根据参数决定）
        duration = video.get_duration() if need_duration else 0
        
        video_data = {
            "id": video.id,
            "path": video.path,
            "tags": video.tags,
            "cover": cover,
            "duration": duration  # 视频时长（秒），0表示未知或出错
        }
        result_videos.append(video_data)
    
    # 返回分页结果
    response_data = {
        "start": start,
        "end": end,
        "all": total_results,
        "list": result_videos
    }
    
    return make_response(json.dumps(response_data, ensure_ascii=False), 200)

def video_search_recommend(request):
    """
    基于搜索词的视频推荐API：在全屏模式下推荐下一个视频
    
    参数:
        q: 查询字符串
        in: 搜索字段，可选值: "id", "name", "label", "id+name", "id+label", "name+label", "id+name+label"
            (默认: "name+label")
        seed: 随机种子，用于保证结果的一致性
        index: 当前索引位置，从0开始，用于获取下一个视频
        need_cover: 是否生成封面，默认: false
        need_duration: 是否返回视频时长，默认: true
    
    返回:
        单个视频对象，如果没有匹配结果则返回空对象
    """
    # 获取查询参数
    query = request.args.get('q', '').strip()
    search_in = request.args.get('in', 'name+label').strip().lower()
    seed_str = request.args.get('seed', 'default_seed')
    need_cover_param = request.args.get('need_cover', 'false').lower()
    need_cover = need_cover_param in ['true', '1', 'yes', 'on', 'y']
    need_duration_param = request.args.get('need_duration', 'true').lower()
    need_duration = need_duration_param in ['true', '1', 'yes', 'on', 'y']
    
    # 获取索引参数
    try:
        current_index = int(request.args.get('index', 0))
        current_index = max(0, current_index)  # 确保索引非负
    except (ValueError, TypeError):
        current_index = 0
    
    # 获取搜索结果（使用缓存）
    matched_videos = _get_or_create_search_results(query, search_in, seed_str)
    
    # 如果没有匹配结果，返回空对象
    if not matched_videos:
        return make_response(json.dumps({}), 200)
    
    # 计算下一个索引（循环播放）
    next_index = current_index % len(matched_videos)
    
    # 获取视频对象
    video = matched_videos[next_index]
    
    # 生成封面（根据参数决定）
    cover = video.generate_cover() if need_cover else ""
    
    # 获取视频时长（根据参数决定）
    duration = video.get_duration() if need_duration else 0
    
    # 构建响应数据
    video_data = {
        "id": video.id,
        "path": video.path,
        "tags": video.tags,
        "cover": cover,
        "duration": duration,  # 视频时长（秒）
        "index": next_index,  # 返回实际使用的索引
        "total": len(matched_videos)  # 返回总结果数
    }
    
    return make_response(json.dumps(video_data, ensure_ascii=False), 200)

def json_read(request):
    """读取JSON数据"""
    filename = request.form.get('filename')
    if not filename:
        return make_response(json.dumps({"error": "Filename required"}), 400)
    
    data_dir = getDir() / "data"
    json_file = data_dir / f"{filename}.json"
    
    if not json_file.exists():
        return make_response(json.dumps({"error": "File not found"}), 404)
    
    try:
        with open(json_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return make_response(json.dumps(data, ensure_ascii=False))
    except Exception as e:
        return make_response(json.dumps({"error": str(e)}), 500)

def json_write(request):
    """写入JSON数据"""
    filename = request.form.get('filename')
    if not filename:
        return make_response(json.dumps({"error": "Filename required"}), 400)
    
    data_dir = getDir() / "data"
    data_dir.mkdir(exist_ok=True)
    
    json_file = data_dir / f"{filename}.json"
    
    json_data = request.form.get('data')
    if json_data is None:
        return make_response(json.dumps({"error": "json data is None"}), 400)
    
    if json_data == "":
        data = {}
    else:
        try:
            data = json.loads(json_data)
        except json.JSONDecodeError:
            return make_response(json.dumps({"error": "Invalid JSON data"}), 400)
    
    try:
        with open(json_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return make_response(json.dumps({"ok": True}))
    except Exception as e:
        return make_response(json.dumps({"error": str(e)}), 500)

# API 路由表：所有功能通过 api/<key> 访问
api_rt = {
    "video/feed": video_feed,           # 获取推荐视频信息（包含封面）
    "video/stream": video_stream,       # 获取视频流
    "video/search": video_search,       # 搜索视频（分页）
    "video/search/recommend": video_search_recommend,  # 基于搜索词的推荐（新增）
    "json/r": json_read,
    "json/w": json_write,
}