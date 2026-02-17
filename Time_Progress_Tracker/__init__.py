"""
Time_Progress_Tracker/__init__.py
智能活动日程表 - 新架构兼容版本
"""

import json
import os
import sys
import re
from datetime import datetime, time as dt_time, timedelta
from typing import Dict, List, Optional, Tuple, Any
import pytz
from flask import request, jsonify, make_response, send_file, send_from_directory
from pathlib import Path

# ============================================
# 全局配置 - 迁移到函数内部，避免模块级别状态
# ============================================

BEIJING_TZ = pytz.timezone('Asia/Shanghai')

# 硬编码的默认模板（当没有任何历史数据时使用）- 已修改：移除type字段
DEFAULT_TEMPLATE = {
    "overall_start": "09:00",
    "tasks": [
        {"id": 0, "name": "游戏开发", "duration": 90},
        {"id": 1, "name": "MC整合包制作", "duration": 90},
        {"id": 2, "name": "午休", "duration": 75},
        {"id": 3, "name": "学习：英语", "duration": 10},
        {"id": 4, "name": "学习：软件", "duration": 90},
        {"id": 5, "name": "工作收尾与规划", "duration": 60},
        {"id": 6, "name": "看电影 / 娱乐", "duration": 150}
    ]
}

# ============================================
# 辅助函数
# ============================================

def get_beijing_now() -> datetime:
    """获取当前北京时间"""
    return datetime.now(BEIJING_TZ)

def get_beijing_date() -> str:
    """获取当前北京日期（字符串格式）"""
    return get_beijing_now().strftime("%Y-%m-%d")

def parse_time(time_str: str) -> Optional[Tuple[int, int]]:
    """解析时间字符串为（小时, 分钟）"""
    if not time_str:
        return None
    try:
        if ':' in time_str:
            hour_str, minute_str = time_str.split(':')
        else:
            if len(time_str) == 4:
                hour_str = time_str[:2]
                minute_str = time_str[2:]
            else:
                return None
        
        hour = int(hour_str)
        minute = int(minute_str)
        
        if 0 <= hour < 24 and 0 <= minute < 60:
            return (hour, minute)
        else:
            return None
    except (ValueError, AttributeError):
        return None

def time_to_minutes(time_str: str) -> Optional[int]:
    """将时间字符串转换为分钟数"""
    parsed = parse_time(time_str)
    if parsed:
        hour, minute = parsed
        return hour * 60 + minute
    return None

def minutes_to_time(minutes: int) -> str:
    """将分钟数转换为时间字符串"""
    if minutes < 0:
        minutes = 0
    hour = minutes // 60
    minute = minutes % 60
    return f"{hour:02d}:{minute:02d}"

# ============================================
# 数据管理函数
# ============================================

def load_data() -> Dict[str, Any]:
    """从JSON文件加载所有数据"""
    data_file = getDir() / "data" / "schedule_data.json"
    
    if not data_file.exists():
        # 文件不存在，创建初始数据结构
        data = {
            "last_updated": get_beijing_now().isoformat(),
            "schedules": []
        }
        save_data(data)
        return data
    
    try:
        with open(data_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return data
    except (json.JSONDecodeError, IOError):
        # 返回空数据结构
        return {
            "last_updated": get_beijing_now().isoformat(),
            "schedules": []
        }

def save_data(data: Dict[str, Any]) -> None:
    """保存数据到JSON文件"""
    try:
        data["last_updated"] = get_beijing_now().isoformat()
        data_file = getDir() / "data" / "schedule_data.json"
        
        # 确保目录存在
        data_file.parent.mkdir(parents=True, exist_ok=True)
        
        with open(data_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except IOError:
        pass

def find_schedule_by_date(data: Dict[str, Any], target_date: str) -> Optional[Dict[str, Any]]:
    """根据日期查找日程数据"""
    for schedule in data.get("schedules", []):
        if schedule.get("date") == target_date:
            return schedule
    return None

def find_recent_schedule(data: Dict[str, Any], target_date: str) -> Optional[Dict[str, Any]]:
    """查找最近一天的日程数据（向前追溯）"""
    schedules = data.get("schedules", [])
    
    # 按日期排序
    sorted_schedules = sorted(schedules, key=lambda x: x.get("date", ""))
    
    # 找到target_date之前的最近一天
    for schedule in reversed(sorted_schedules):
        schedule_date = schedule.get("date", "")
        if schedule_date and schedule_date < target_date:
            return schedule
    
    return None

# ============================================
# 核心业务逻辑函数
# ============================================

def calculate_time_blocks(overall_start: str, tasks: List[Dict]) -> List[Dict]:
    """计算每个任务的时间块（包含10分钟空档期）"""
    time_blocks = []
    current_minutes = time_to_minutes(overall_start)
    
    if current_minutes is None:
        return time_blocks
    
    for i, task in enumerate(tasks):
        duration = task.get("duration", 0)
        
        # 计算任务时间块
        block = {
            "task_id": task.get("id", i),
            "start": current_minutes,
            "end": current_minutes + duration,
            "duration": duration
        }
        time_blocks.append(block)
        
        # 更新当前时间（加上任务时长）
        current_minutes += duration
        
        # 如果不是最后一个任务，加上10分钟空档期
        if i < len(tasks) - 1:
            current_minutes += 10
    
    return time_blocks

def get_task_time_block(overall_start: str, tasks: List[Dict], task_id: int) -> Optional[Dict]:
    """获取指定任务的时间块"""
    time_blocks = calculate_time_blocks(overall_start, tasks)
    for block in time_blocks:
        if block["task_id"] == task_id:
            return block
    return None

def generate_daily_schedule(data: Dict[str, Any], target_date: str) -> Dict[str, Any]:
    """生成指定日期的日程模板"""
    # 1. 尝试查找最近一天的日程数据
    recent_schedule = find_recent_schedule(data, target_date)
    
    if recent_schedule:
        # 使用最近一天的数据作为模板
        template = json.loads(json.dumps(recent_schedule))  # 深拷贝
        template["date"] = target_date
        
        # 清空时间字段和描述字段
        for task in template.get("tasks", []):
            task["start_time"] = None
            task["end_time"] = None
            task["tag"] = ""
            task["description"] = ""
        
        return template
    
    # 2. 如果没有历史数据，使用硬编码模板
    schedule = {
        "date": target_date,
        "overall_start": DEFAULT_TEMPLATE["overall_start"],
        "tasks": []
    }
    
    for task_template in DEFAULT_TEMPLATE["tasks"]:
        task = {
            "id": task_template["id"],
            "name": task_template["name"],
            "duration": task_template["duration"],
            "start_time": None,
            "end_time": None,
            "tag": "",
            "description": ""
        }
        schedule["tasks"].append(task)
    
    return schedule

def infer_task_status(task: Dict[str, Any]) -> str:
    """根据任务的时间字段推断状态"""
    start_time = task.get("start_time")
    end_time = task.get("end_time")
    
    if not start_time and not end_time:
        return "not_started"
    elif start_time and not end_time:
        return "in_progress"
    elif start_time and end_time:
        return "completed"
    else:
        return "not_started"

def run_pig_logic(schedule: Dict[str, Any]) -> bool:
    """执行"小猪逻辑"：检查并补齐缺失的结束时间"""
    if not schedule:
        return False
    
    modified = False
    overall_start = schedule.get("overall_start", "09:00")
    tasks = schedule.get("tasks", [])
    
    # 计算当前时间（北京时间的分钟数）
    current_time = get_beijing_now()
    current_minutes = current_time.hour * 60 + current_time.minute
    
    # 计算最后任务结束时间
    time_blocks = calculate_time_blocks(overall_start, tasks)
    if not time_blocks:
        return False
    
    last_task_end = time_blocks[-1]["end"]
    
    # 只在最后任务结束后执行小猪逻辑
    if current_minutes < last_task_end:
        return False
    
    for task in tasks:
        start_time = task.get("start_time")
        end_time = task.get("end_time")
        
        # 情况1：有开始时间和结束时间 -> 正常，什么都不做
        if start_time and end_time:
            continue
        
        # 情况2：有开始时间，没有结束时间
        elif start_time and not end_time:
            # 获取任务的时间块结束时间
            task_id = task.get("id")
            task_block = get_task_time_block(overall_start, tasks, task_id)
            
            if task_block:
                # 设置结束时间为时间块结束时间
                task["end_time"] = minutes_to_time(task_block["end"])
                modified = True
        
        # 情况3：没有开始时间 -> 什么都不做（保持为空）
        elif not start_time:
            pass
    
    return modified

def run_immediate_timeout_logic(schedule: Dict[str, Any]) -> bool:
    """即时超时补全：对已超时的任务自动补全结束时间"""
    if not schedule:
        return False
    
    modified = False
    overall_start = schedule.get("overall_start", "09:00")
    tasks = schedule.get("tasks", [])
    
    # 计算当前时间（北京时间分钟数）
    current_time = get_beijing_now()
    current_minutes = current_time.hour * 60 + current_time.minute
    
    for task in tasks:
        start_time = task.get("start_time")
        end_time = task.get("end_time")
        
        # 只处理：有开始时间，但没有结束时间的任务
        if start_time and not end_time:
            # 获取该任务的时间块
            task_id = task.get("id")
            task_block = get_task_time_block(overall_start, tasks, task_id)
            
            if task_block:
                task_end_minutes = task_block["end"]
                
                # 关键判断：当前时间是否已超过任务的结束时间？
                if current_minutes > task_end_minutes:
                    # 补全结束时间为任务的计划结束时间
                    task["end_time"] = minutes_to_time(task_end_minutes)
                    modified = True
    
    return modified

def auto_fill_missing_days(data: Dict[str, Any]) -> bool:
    """
    自动补全从最早记录到今天之间的所有缺失日期
    返回: True 如果有补全操作发生
    """
    today = get_beijing_date()
    
    # 获取所有日程并按日期排序
    schedules = data.get("schedules", [])
    if not schedules or len(schedules) == 0:
        return False  # 没有任何历史记录，无需补全
    
    # 按日期排序
    schedules.sort(key=lambda x: x.get("date", ""))
    
    # 获取所有已存在的日期（去重并排序）
    existing_dates = sorted(list(set([s.get("date") for s in schedules if s.get("date")])))
    
    if not existing_dates:
        return False  # 没有有效日期
    
    # 找到最早和最晚的日期
    earliest_date = existing_dates[0]
    latest_before_today = None
    
    # 找到今天之前的最后一个日期
    for date in reversed(existing_dates):
        if date < today:
            latest_before_today = date
            break
    
    # 如果没有今天之前的记录，则使用最早日期作为起点
    start_date = earliest_date if latest_before_today is None else earliest_date
    
    # 目标结束日期：今天（但不包括今天）
    end_date = today
    
    # 如果开始日期 >= 结束日期，无需补全
    if start_date >= end_date:
        return False
    
    # 将日期字符串转换为datetime对象
    try:
        current_date = datetime.strptime(start_date, "%Y-%m-%d")
        end_date_dt = datetime.strptime(end_date, "%Y-%m-%d")
    except ValueError:
        # 日期格式错误
        return False
    
    # 生成从开始日期到结束日期的所有日期列表
    all_dates_in_range = []
    temp_date = current_date
    while temp_date < end_date_dt:
        all_dates_in_range.append(temp_date.strftime("%Y-%m-%d"))
        temp_date += timedelta(days=1)
    
    # 找出缺失的日期
    missing_dates = []
    for date in all_dates_in_range:
        if date not in existing_dates:
            missing_dates.append(date)
    
    if not missing_dates:
        return False  # 没有缺失日期
    
    # 为每个缺失日期找到合适的模板
    modified = False
    
    # 创建一个日期到日程的映射，方便查找
    date_to_schedule = {s.get("date"): s for s in schedules}
    
    for missing_date in missing_dates:
        # 如果已经存在，跳过
        if missing_date in date_to_schedule:
            continue
        
        # 找到缺失日期之前的最近一个日程作为模板
        template_date = None
        template_schedule = None
        
        # 按日期排序，从早到晚
        sorted_dates = sorted(date_to_schedule.keys())
        
        # 从后往前找，找到第一个小于missing_date的日期
        for date in reversed(sorted_dates):
            if date < missing_date:
                template_date = date
                break
        
        if not template_date:
            # 如果没有找到之前的记录，说明这是第一个缺失的日期
            # 这种情况不应该发生，因为我们从最早的记录开始
            continue
        
        # 获取模板日程
        template_schedule = date_to_schedule.get(template_date)
        if not template_schedule:
            continue
        
        # 创建新日程：复制模板日程的结构，但清空所有任务的时间数据
        new_schedule = {
            "date": missing_date,
            "overall_start": template_schedule.get("overall_start", "09:00"),
            "tasks": []
        }
        
        # 复制任务结构，但清空时间相关字段
        for task_template in template_schedule.get("tasks", []):
            new_task = {
                "id": task_template.get("id", 0),
                "name": task_template.get("name", ""),
                "duration": task_template.get("duration", 60),
                "start_time": None,
                "end_time": None,
                "tag": "",
                "description": ""
            }
            new_schedule["tasks"].append(new_task)
        
        # 添加到数据中
        schedules.append(new_schedule)
        date_to_schedule[missing_date] = new_schedule
        modified = True
    
    # 如果进行了修改，重新排序并更新数据
    if modified:
        schedules.sort(key=lambda x: x.get("date", ""))
        data["schedules"] = schedules
    
    return modified

def find_task_by_id(tasks: List[Dict], task_id: int) -> Optional[Dict]:
    """根据任务ID查找任务"""
    for task in tasks:
        if task.get("id") == task_id:
            return task
    return None

def reindex_tasks(tasks: List[Dict]) -> List[Dict]:
    """重新索引任务列表，确保ID连续"""
    for i, task in enumerate(tasks):
        task["id"] = i
    return tasks

# ============================================
# 请求处理函数
# ============================================

def handle_today_schedule(request):
    """获取今日日程数据"""
    try:
        # 1. 获取当前日期
        today = get_beijing_date()
        
        # 2. 加载数据
        data = load_data()
        
        # 3. 新增：自动补全缺失的日期记录
        if auto_fill_missing_days(data):
            save_data(data)
        
        # 4. 查找今天的数据
        today_schedule = find_schedule_by_date(data, today)
        
        # 5. 如果不存在，生成模板
        if not today_schedule:
            today_schedule = generate_daily_schedule(data, today)
            data["schedules"].append(today_schedule)
            save_data(data)
        else:
            # 6. 第一层：执行即时超时补全（每次访问都执行）
            if run_immediate_timeout_logic(today_schedule):
                save_data(data)
            
            # 7. 第二层：执行原有的小猪逻辑（一天结束时补全）
            if run_pig_logic(today_schedule):
                save_data(data)
        
        # 8. 为每个任务添加状态字段
        schedule_response = json.loads(json.dumps(today_schedule))  # 深拷贝
        for task in schedule_response.get("tasks", []):
            task["status"] = infer_task_status(task)
        
        # 9. 返回数据
        return jsonify({
            "success": True,
            "date": today,
            "overall_start": schedule_response.get("overall_start"),
            "tasks": schedule_response.get("tasks", [])
        })
    
    except Exception as e:
        return jsonify({
            "success": False,
            "error": f"获取日程数据失败: {str(e)}"
        }), 500

def handle_start_task(request):
    """开始任务"""
    try:
        req_data = request.json
        if not req_data:
            return jsonify({"success": False, "error": "请求数据为空"}), 400
        
        task_id = req_data.get("task_id")
        timestamp = req_data.get("timestamp")
        
        if task_id is None:
            return jsonify({"success": False, "error": "缺少task_id参数"}), 400
        if not timestamp:
            return jsonify({"success": False, "error": "缺少timestamp参数"}), 400
        
        # 提取时间部分
        try:
            dt = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
            if dt.tzinfo is None:
                dt = BEIJING_TZ.localize(dt)
            else:
                dt = dt.astimezone(BEIJING_TZ)
            time_part = dt.strftime("%H:%M")
        except ValueError:
            time_part = get_beijing_now().strftime("%H:%M")
        
        # 获取当天数据
        today = get_beijing_date()
        data = load_data()
        today_schedule = find_schedule_by_date(data, today)
        
        if not today_schedule:
            today_schedule = generate_daily_schedule(data, today)
            data["schedules"].append(today_schedule)
        
        # 查找任务
        task = find_task_by_id(today_schedule["tasks"], task_id)
        if not task:
            return jsonify({"success": False, "error": f"未找到ID为{task_id}的任务"}), 404
        
        # 更新任务开始时间，清除结束时间
        task["start_time"] = time_part
        task["end_time"] = None
        
        # 保存数据
        save_data(data)
        
        return jsonify({"success": True})
    
    except Exception as e:
        return jsonify({"success": False, "error": f"开始任务失败: {str(e)}"}), 500

def handle_complete_task(request):
    """完成任务"""
    try:
        req_data = request.json
        if not req_data:
            return jsonify({"success": False, "error": "请求数据为空"}), 400
        
        task_id = req_data.get("task_id")
        timestamp = req_data.get("timestamp")
        
        if task_id is None:
            return jsonify({"success": False, "error": "缺少task_id参数"}), 400
        if not timestamp:
            return jsonify({"success": False, "error": "缺少timestamp参数"}), 400
        
        # 提取时间部分
        try:
            dt = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
            if dt.tzinfo is None:
                dt = BEIJING_TZ.localize(dt)
            else:
                dt = dt.astimezone(BEIJING_TZ)
            time_part = dt.strftime("%H:%M")
        except ValueError:
            time_part = get_beijing_now().strftime("%H:%M")
        
        # 获取当天数据
        today = get_beijing_date()
        data = load_data()
        today_schedule = find_schedule_by_date(data, today)
        
        if not today_schedule:
            return jsonify({"success": False, "error": "未找到当天的日程数据"}), 404
        
        # 查找任务
        task = find_task_by_id(today_schedule["tasks"], task_id)
        if not task:
            return jsonify({"success": False, "error": f"未找到ID为{task_id}的任务"}), 404
        
        # 检查任务是否已开始
        if not task.get("start_time"):
            return jsonify({"success": False, "error": "任务尚未开始"}), 400
        
        # 更新任务结束时间
        task["end_time"] = time_part
        
        # 保存数据
        save_data(data)
        
        return jsonify({"success": True})
    
    except Exception as e:
        return jsonify({"success": False, "error": f"完成任务失败: {str(e)}"}), 500

def handle_reset_task(request):
    """重置任务（双击恢复）"""
    try:
        req_data = request.json
        if not req_data:
            return jsonify({"success": False, "error": "请求数据为空"}), 400
        
        task_id = req_data.get("task_id")
        if task_id is None:
            return jsonify({"success": False, "error": "缺少task_id参数"}), 400
        
        # 获取当天数据
        today = get_beijing_date()
        data = load_data()
        today_schedule = find_schedule_by_date(data, today)
        
        if not today_schedule:
            return jsonify({"success": False, "error": "未找到当天的日程数据"}), 404
        
        # 查找任务
        task = find_task_by_id(today_schedule["tasks"], task_id)
        if not task:
            return jsonify({"success": False, "error": f"未找到ID为{task_id}的任务"}), 404
        
        # 计算当前时间
        current_time = get_beijing_now()
        current_minutes = current_time.hour * 60 + current_time.minute
        
        # 计算任务时间块
        task_block = get_task_time_block(today_schedule["overall_start"], today_schedule["tasks"], task_id)
        if not task_block:
            return jsonify({"success": False, "error": "无法计算任务时间块"}), 500
        
        # 检查是否仍在时间块内
        task_end = task_block["end"]
        if current_minutes > task_end:
            return jsonify({"success": False, "error": "时间块已结束，无法恢复"}), 400
        
        # 重置任务时间
        task["start_time"] = None
        task["end_time"] = None
        
        # 保存数据
        save_data(data)
        
        return jsonify({"success": True})
    
    except Exception as e:
        return jsonify({"success": False, "error": f"重置任务失败: {str(e)}"}), 500

def handle_save_description(request):
    """保存详细描述"""
    try:
        req_data = request.json
        if not req_data:
            return jsonify({"success": False, "error": "请求数据为空"}), 400
        
        task_id = req_data.get("task_id")
        description = req_data.get("description", "")
        
        if task_id is None:
            return jsonify({"success": False, "error": "缺少task_id参数"}), 400
        
        # 获取当天数据
        today = get_beijing_date()
        data = load_data()
        today_schedule = find_schedule_by_date(data, today)
        
        if not today_schedule:
            return jsonify({"success": False, "error": "未找到当天的日程数据"}), 404
        
        # 查找任务
        task = find_task_by_id(today_schedule["tasks"], task_id)
        if not task:
            return jsonify({"success": False, "error": f"未找到ID为{task_id}的任务"}), 404
        
        # 更新任务描述
        task["description"] = description
        
        # 保存数据
        save_data(data)
        
        return jsonify({"success": True})
    
    except Exception as e:
        return jsonify({"success": False, "error": f"保存描述失败: {str(e)}"}), 500

def handle_save_tag(request):
    """保存标签 - 兼容两种格式"""
    try:
        req_data = request.json
        if not req_data:
            return jsonify({"success": False, "error": "请求数据为空"}), 400
        
        task_id = req_data.get("task_id")
        
        if task_id is None:
            return jsonify({"success": False, "error": "缺少task_id参数"}), 400
        
        # 获取当天数据
        today = get_beijing_date()
        data = load_data()
        today_schedule = find_schedule_by_date(data, today)
        
        if not today_schedule:
            return jsonify({"success": False, "error": "未找到当天的日程数据"}), 404
        
        # 查找任务
        task = find_task_by_id(today_schedule["tasks"], task_id)
        if not task:
            return jsonify({"success": False, "error": f"未找到ID为{task_id}的任务"}), 404
        
        # 处理标签字段 - 兼容两种格式
        tags = req_data.get("tags")  # 数组格式
        tag = req_data.get("tag")    # 字符串格式
        
        if tags is not None:
            # 处理数组格式的标签
            if isinstance(tags, list):
                # 将标签列表转换为逗号分隔的字符串
                tag_str = ",".join([str(t).strip() for t in tags if str(t).strip()])
                task["tag"] = tag_str
            else:
                # 如果不是数组，保持原样（字符串）
                task["tag"] = str(tags) if tags else ""
        elif tag is not None:
            # 处理原来的字符串格式
            task["tag"] = str(tag) if tag else ""
        else:
            # 如果没有提供标签，清空
            task["tag"] = ""
        
        # 保存数据
        save_data(data)
        
        return jsonify({"success": True})
    
    except Exception as e:
        return jsonify({"success": False, "error": f"保存标签失败: {str(e)}"}), 500

def handle_update_task(request):
    """更新任务属性（名称、时长）"""
    try:
        req_data = request.json
        if not req_data:
            return jsonify({"success": False, "error": "请求数据为空"}), 400
        
        task_id = req_data.get("task_id")
        updates = req_data.get("updates")
        
        if task_id is None:
            return jsonify({"success": False, "error": "缺少task_id参数"}), 400
        if not updates:
            return jsonify({"success": False, "error": "缺少updates参数"}), 400
        
        # 验证更新字段
        allowed_updates = ["name", "duration"]
        for key in updates.keys():
            if key not in allowed_updates:
                return jsonify({"success": False, "error": f"不允许更新字段: {key}"}), 400
        
        # 获取当天数据
        today = get_beijing_date()
        data = load_data()
        today_schedule = find_schedule_by_date(data, today)
        
        if not today_schedule:
            return jsonify({"success": False, "error": "未找到当天的日程数据"}), 404
        
        # 查找任务
        task = find_task_by_id(today_schedule["tasks"], task_id)
        if not task:
            return jsonify({"success": False, "error": f"未找到ID为{task_id}的任务"}), 404
        
        # 应用更新
        for key, value in updates.items():
            if key == "duration":
                try:
                    duration = int(value)
                    if duration <= 0:
                        return jsonify({"success": False, "error": "时长必须是正整数"}), 400
                    task[key] = duration
                except (ValueError, TypeError):
                    return jsonify({"success": False, "error": "时长必须是整数"}), 400
            else:
                task[key] = value
        
        # 保存数据
        save_data(data)
        
        return jsonify({"success": True})
    
    except Exception as e:
        return jsonify({"success": False, "error": f"更新任务失败: {str(e)}"}), 500

def handle_add_task(request):
    """添加新任务"""
    try:
        req_data = request.json
        if not req_data:
            return jsonify({"success": False, "error": "请求数据为空"}), 400
        
        task_data = req_data.get("task")
        if not task_data:
            return jsonify({"success": False, "error": "缺少task参数"}), 400
        
        # 验证任务数据
        required_fields = ["name", "duration"]
        for field in required_fields:
            if field not in task_data:
                return jsonify({"success": False, "error": f"缺少必要字段: {field}"}), 400
        
        # 获取当天数据
        today = get_beijing_date()
        data = load_data()
        today_schedule = find_schedule_by_date(data, today)
        
        if not today_schedule:
            today_schedule = generate_daily_schedule(data, today)
            data["schedules"].append(today_schedule)
        
        # 创建新任务
        tasks = today_schedule["tasks"]
        new_task_id = max([task.get("id", 0) for task in tasks], default=-1) + 1
        
        new_task = {
            "id": new_task_id,
            "name": task_data["name"],
            "duration": task_data["duration"],
            "start_time": None,
            "end_time": None,
            "tag": "",
            "description": ""
        }
        
        tasks.append(new_task)
        
        # 保存数据
        save_data(data)
        
        return jsonify({"success": True})
    
    except Exception as e:
        return jsonify({"success": False, "error": f"添加任务失败: {str(e)}"}), 500

def handle_delete_task(request):
    """删除任务"""
    try:
        req_data = request.json
        if not req_data:
            return jsonify({"success": False, "error": "请求数据为空"}), 400
        
        task_id = req_data.get("task_id")
        if task_id is None:
            return jsonify({"success": False, "error": "缺少task_id参数"}), 400
        
        # 获取当天数据
        today = get_beijing_date()
        data = load_data()
        today_schedule = find_schedule_by_date(data, today)
        
        if not today_schedule:
            return jsonify({"success": False, "error": "未找到当天的日程数据"}), 404
        
        # 查找任务索引
        tasks = today_schedule["tasks"]
        task_index = next((i for i, task in enumerate(tasks) if task.get("id") == task_id), -1)
        
        if task_index == -1:
            return jsonify({"success": False, "error": f"未找到ID为{task_id}的任务"}), 404
        
        # 删除任务
        del tasks[task_index]
        
        # 重新索引任务
        today_schedule["tasks"] = reindex_tasks(tasks)
        
        # 保存数据
        save_data(data)
        
        return jsonify({"success": True})
    
    except Exception as e:
        return jsonify({"success": False, "error": f"删除任务失败: {str(e)}"}), 500

def handle_move_task(request):
    """移动任务（上移/下移）"""
    try:
        req_data = request.json
        if not req_data:
            return jsonify({"success": False, "error": "请求数据为空"}), 400
        
        task_id = req_data.get("task_id")
        direction = req_data.get("direction")  # "up" 或 "down"
        
        if task_id is None:
            return jsonify({"success": False, "error": "缺少task_id参数"}), 400
        if direction not in ["up", "down"]:
            return jsonify({"success": False, "error": "direction必须是'up'或'down'"}), 400
        
        # 获取当天数据
        today = get_beijing_date()
        data = load_data()
        today_schedule = find_schedule_by_date(data, today)
        
        if not today_schedule:
            return jsonify({"success": False, "error": "未找到当天的日程数据"}), 404
        
        # 查找任务索引
        tasks = today_schedule["tasks"]
        task_index = next((i for i, task in enumerate(tasks) if task.get("id") == task_id), -1)
        
        if task_index == -1:
            return jsonify({"success": False, "error": f"未找到ID为{task_id}的任务"}), 404
        
        # 验证移动是否有效
        if direction == "up" and task_index == 0:
            return jsonify({"success": False, "error": "已经是第一个任务，无法上移"}), 400
        if direction == "down" and task_index == len(tasks) - 1:
            return jsonify({"success": False, "error": "已经是最后一个任务，无法下移"}), 400
        
        # 移动任务
        if direction == "up":
            # 上移
            tasks[task_index], tasks[task_index - 1] = tasks[task_index - 1], tasks[task_index]
        else:
            # 下移
            tasks[task_index], tasks[task_index + 1] = tasks[task_index + 1], tasks[task_index]
        
        # 重新索引任务
        today_schedule["tasks"] = reindex_tasks(tasks)
        
        # 保存数据
        save_data(data)
        
        return jsonify({"success": True})
    
    except Exception as e:
        return jsonify({"success": False, "error": f"移动任务失败: {str(e)}"}), 500

def handle_update_overall_start(request):
    """更新整体开始时间"""
    try:
        req_data = request.json
        if not req_data:
            return jsonify({"success": False, "error": "请求数据为空"}), 400
        
        overall_start = req_data.get("overall_start")
        if not overall_start:
            return jsonify({"success": False, "error": "缺少overall_start参数"}), 400
        
        # 验证时间格式
        if not parse_time(overall_start):
            return jsonify({"success": False, "error": "时间格式无效，必须是HH:MM格式"}), 400
        
        # 获取当天数据
        today = get_beijing_date()
        data = load_data()
        today_schedule = find_schedule_by_date(data, today)
        
        if not today_schedule:
            today_schedule = generate_daily_schedule(data, today)
            data["schedules"].append(today_schedule)
        
        # 更新整体开始时间
        today_schedule["overall_start"] = overall_start
        
        # 保存数据
        save_data(data)
        
        return jsonify({"success": True})
    
    except Exception as e:
        return jsonify({"success": False, "error": f"更新整体开始时间失败: {str(e)}"}), 500

def handle_health_check(request):
    """健康检查端点"""
    try:
        html_file = getDir() / "index.html"
        data_file = getDir() / "data" / "schedule_data.json"
        
        return jsonify({
            "status": "healthy",
            "service": "time_progress_tracker",
            "server_time": get_beijing_now().isoformat(),
            "data_file": str(data_file),
            "data_file_exists": data_file.exists(),
            "html_file": str(html_file),
            "html_file_exists": html_file.exists(),
            "api_endpoints": [
                "GET /api/schedule/today",
                "POST /api/schedule/start",
                "POST /api/schedule/complete",
                "POST /api/schedule/reset",
                "POST /api/schedule/desc",
                "POST /api/schedule/tag",
                "POST /api/schedule/update_task",
                "POST /api/schedule/add_task",
                "POST /api/schedule/delete_task",
                "POST /api/schedule/move_task",
                "POST /api/schedule/update_overall_start"
            ]
        })
    except Exception as e:
        return jsonify({"status": "error", "error": str(e)}), 500

def handle_get_tags_history(request):
    """获取任务的历史标签（排除今天的数据）"""
    try:
        # 获取查询参数
        task_name = request.args.get('task_name')
        
        if not task_name:
            return jsonify({"success": False, "error": "缺少task_name参数"}), 400
        
        # 获取今天的日期
        today = get_beijing_date()
        
        # 加载所有历史数据
        data = load_data()
        schedules = data.get("schedules", [])
        
        # 收集所有匹配任务的标签（排除今天的数据）
        all_tags = []
        
        for schedule in schedules:
            # 排除今天的数据
            schedule_date = schedule.get("date")
            if schedule_date == today:
                continue
                
            tasks = schedule.get("tasks", [])
            for task in tasks:
                if task.get("name") == task_name:
                    tag = task.get("tag", "")
                    
                    # 处理标签字段
                    if tag:
                        # 如果是逗号分隔的字符串
                        if isinstance(tag, str):
                            # 按逗号分割，清理每个标签
                            tag_list = [t.strip() for t in tag.split(',') if t.strip()]
                            all_tags.extend(tag_list)
                        # 如果是列表形式
                        elif isinstance(tag, list):
                            # 清理每个标签
                            tag_list = [t.strip() for t in tag if isinstance(t, str) and t.strip()]
                            all_tags.extend(tag_list)
        
        # 统计标签出现次数
        tag_count = {}
        for tag in all_tags:
            if tag in tag_count:
                tag_count[tag] += 1
            else:
                tag_count[tag] = 1
        
        # 按出现次数降序排序
        sorted_tags = sorted(tag_count.items(), key=lambda x: x[1], reverse=True)
        
        # 只返回标签（不包含计数），限制最多返回20个
        result_tags = [tag for tag, count in sorted_tags[:20]]
        
        return jsonify({
            "success": True,
            "task_name": task_name,
            "today_excluded": True,  # 添加标记，表示已排除今天的数据
            "tags": result_tags
        })
    
    except Exception as e:
        return jsonify({
            "success": False, 
            "error": f"获取标签历史失败: {str(e)}"
        }), 500

def serve_index(request):
    """提供HTML页面"""
    html_path = getDir() / "index.html"
    
    if html_path.exists():
        return send_file(str(html_path))
    else:
        return make_response(f"""
            <html>
            <body>
                <h1>智能活动日程表 - 服务器运行中</h1>
                <p>HTML文件未找到，请确保文件位于: <code>{html_path}</code></p>
                <p>API端点: <a href="/Time_Progress_Tracker/api/schedule/today">/api/schedule/today</a></p>
                <p><a href="/Time_Progress_Tracker/health">健康检查</a></p>
            </body>
            </html>
        """, 200)

# ============================================
# 路由映射和主处理函数
# ============================================

# 路由映射表：路径 -> (HTTP方法, 处理函数)
ROUTE_MAP = {
    '': ('GET', serve_index),
    'health': ('GET', handle_health_check),
    'api/schedule/today': ('GET', handle_today_schedule),
    'api/schedule/start': ('POST', handle_start_task),
    'api/schedule/complete': ('POST', handle_complete_task),
    'api/schedule/reset': ('POST', handle_reset_task),
    'api/schedule/desc': ('POST', handle_save_description),
    'api/schedule/tag': ('POST', handle_save_tag),
    'api/schedule/update_task': ('POST', handle_update_task),
    'api/schedule/add_task': ('POST', handle_add_task),
    'api/schedule/delete_task': ('POST', handle_delete_task),
    'api/schedule/move_task': ('POST', handle_move_task),
    'api/schedule/update_overall_start': ('POST', handle_update_overall_start),
    'api/tags/history': ('GET', handle_get_tags_history),
}

def handle_request(path: str, request):
    """
    新架构要求的接口函数
    path: 请求路径（不包含工具名前缀）
    request: Flask 的 request 对象
    返回: Flask 响应对象
    """
    # 标准化路径（移除首尾斜杠）
    path = path.strip('/')
    
    # 查找匹配的路由
    if path in ROUTE_MAP:
        method, handler = ROUTE_MAP[path]
        if request.method != method:
            return make_response(f"Method {request.method} not allowed for this endpoint", 405)
        return handler(request)
    
    # 如果没有精确匹配，尝试前缀匹配（用于潜在的子路径）
    for route_path, (method, handler) in ROUTE_MAP.items():
        if route_path and path.startswith(route_path + '/'):
            if request.method != method:
                return make_response(f"Method {request.method} not allowed for this endpoint", 405)
            return handler(request)
    
    # 静态文件处理
    base_dir = getDir()
    file_path = base_dir / path
    if path and file_path.is_file():
        return send_from_directory(base_dir, path)
    
    # 路径未找到
    return make_response(f"Endpoint not found: {path}", 404)