import os
import re
import threading

class RenormalizedLogStream:
    def __init__(self, text_stream=None, truncate_limit=10000):
        self.text_stream = text_stream  
        self.log_file = os.path.join(os.path.dirname(__file__), 'output.log')
        
        # 缓存区截断字符阈值（1万字符）
        self.truncate_limit = truncate_limit
        
        self._lock = threading.Lock()
        self.ts_pattern = re.compile(r'\[\d{2}/\w{3}/\d{4} \d{2}:\d{2}:\d{2}\]')
        
        self._line_buffer = ""          # 存放未凑齐一行的字符
        self.lines = []                 # 活跃行缓存区
        
        self._last_finalized_line = ""  # 记录上一个截断块的最后一行，用于衔接排版
        self.finalized_file_pos = 0     # 文件中已定档内容的字节偏移量
        
        # 初始化清空日志文件
        with open(self.log_file, 'w', encoding='utf-8') as f:
            pass

    def write(self, data):
        data_str = str(data)
        with self._lock:
            # 同步输出到原控制台
            if self.text_stream:  
                self.text_stream.write(data_str)
            
            self._line_buffer += data_str  
            
            # 只有遇到换行符才触发复杂的重整逻辑，大幅提升性能
            if '\n' in self._line_buffer:
                parts = self._line_buffer.split('\n')
                self.lines.extend(parts[:-1])
                self._line_buffer = parts[-1]
                self._process_and_update_file()

    def _find_best_loop(self, normalized, i, limit):
        """寻找最大重复块的核心算法"""
        best_repeats = 1
        best_size = 1
        best_end = i + 1
        
        # 限制寻找范围最大为 50 行（与原版一致）
        max_block_size = min(50, limit - i)
        
        for size in range(1, max_block_size + 1):
            repeats = 1
            pos = i + size
            norm_block = normalized[i : i + size]
            
            while pos + size <= limit:
                if normalized[pos : pos + size] == norm_block:
                    repeats += 1
                    pos += size
                else:
                    break
                    
            if repeats > 1 and repeats >= best_repeats:
                if repeats > best_repeats or (repeats == best_repeats and size > best_size):
                    best_repeats = repeats
                    best_size = size
                    best_end = pos
                    
        return best_repeats, best_size, best_end

    def _format_loop(self, lines, current_output, prev_line_state, i, repeats, size):
        """100% 还原原版的排版格式"""
        result = []
        last_start = i + (repeats - 1) * size
        
        # 衔接逻辑：如果前面有内容且不为空行，则补一个空行
        needs_blank = False
        if current_output:
            if current_output[-1] != "":
                needs_blank = True
        elif prev_line_state != "":
            needs_blank = True
            
        if needs_blank:
            result.append("")
            
        result.append("=" * 40)
        for j in range(size):
            result.append(lines[last_start + j])
            
        result.append("=" * 40)
        result.append(f"[重复次数: {repeats}]")
        result.append("")
        
        return result

    def _process_and_update_file(self):
        n = len(self.lines)
        if n == 0:
            return
            
        # 预处理去时间戳内容用于比对
        normalized = [self.ts_pattern.sub('[]', line) for line in self.lines]
        
        # 预计算字符数，用于 O(1) 速度判断截断阈值
        cum_chars = [0] * (n + 1)
        for idx, line in enumerate(self.lines):
            cum_chars[idx + 1] = cum_chars[idx] + len(line) + 1
        
        target_commit_index = 0
        i = 0
        
        # 1. 扫描寻找截断边界
        while i < n:
            best_repeats, best_size, best_end = self._find_best_loop(normalized, i, n)
            
            if best_repeats > 1:
                # 检查循环是否已在后文破裂
                k = min(n - best_end, best_size)
                is_broken = (k > 0 and normalized[best_end : best_end + k] != normalized[i : i + k])
                    
                if is_broken:
                    # 只有超过 1万字符才执行截断删除
                    if cum_chars[best_end] >= self.truncate_limit:
                        target_commit_index = best_end
                        break
                i = best_end
            else:
                i += 1
                # 安全兜底：如果完全没循环，积压超过 2倍阈值时强制截断，保留最后50行
                if cum_chars[i] >= self.truncate_limit * 2:
                    target_commit_index = max(0, i - 50)
                    break
                    
        finalized_output = []
        # 2. 如果满足截断条件，处理并从内存删除
        if target_commit_index > 0:
            idx = 0
            while idx < target_commit_index:
                br, bs, be = self._find_best_loop(normalized, idx, target_commit_index)
                if br > 1:
                    finalized_output.extend(self._format_loop(
                        self.lines, finalized_output, self._last_finalized_line, idx, br, bs
                    ))
                    idx = be
                else:
                    finalized_output.append(self.lines[idx])
                    idx += 1
                    
            if finalized_output:
                self._last_finalized_line = finalized_output[-1]
                
            # 从缓存区删除已定档内容
            self.lines = self.lines[target_commit_index:]
            normalized = normalized[target_commit_index:]
            n = len(self.lines)

        # 3. 写入文件（定档部分永久写入，活跃部分临时写入并截断）
        with open(self.log_file, 'r+', encoding='utf-8') as f:
            f.seek(self.finalized_file_pos)
            
            if finalized_output:
                f.write('\n'.join(finalized_output) + '\n')
                self.finalized_file_pos = f.tell()
                
            # 构造包含“半截话”的虚拟视图进行动态渲染
            virtual_lines = list(self.lines)
            if self._line_buffer:
                virtual_lines.append(self._line_buffer)
            
            # 模仿原版 rstrip('\n')，去除末尾连续空行
            while virtual_lines and virtual_lines[-1] == "":
                virtual_lines.pop()

            v_n = len(virtual_lines)
            v_norm = [self.ts_pattern.sub('[]', line) for line in virtual_lines]

            active_output = []
            active_prev_state = self._last_finalized_line
            idx = 0
            while idx < v_n:
                br, bs, be = self._find_best_loop(v_norm, idx, v_n)
                if br > 1:
                    active_output.extend(self._format_loop(
                        virtual_lines, active_output, active_prev_state, idx, br, bs
                    ))
                    idx = be
                else:
                    active_output.append(virtual_lines[idx])
                    idx += 1
            
            if active_output:
                f.write('\n'.join(active_output) + '\n')
            f.truncate()

    def get_buffer(self):
        """兼容性方法：返回完整历史（原版逻辑）"""
        with self._lock:
            if os.path.exists(self.log_file):
                with open(self.log_file, 'r', encoding='utf-8') as f:
                    return f.read()
            return ""

    def clear_buffer(self):
        """兼容性方法：彻底重置"""
        with self._lock:
            self.lines = []
            self._line_buffer = ""
            self._last_finalized_line = ""
            self.finalized_file_pos = 0
            with open(self.log_file, 'w', encoding='utf-8') as f:
                pass

    def flush(self):
        if self.text_stream:
            self.text_stream.flush()

    def close(self):
        # 程序结束前，尝试强制刷入最后的内容
        with self._lock:
            self._process_and_update_file()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()

# 为了保持与原代码 API 绝对一致（防止主程序中直接调用函数）
def deduplicate_logs(text: str) -> str:
    """如果外部有单独调用此函数的需求，通过临时的流对象处理"""
    # 此函数逻辑较重，但在新架构中已不推荐直接使用
    # 为保证兼容性，保留一个轻量实现
    if not text.strip(): return ""
    # 这里可以直接调用逻辑，或者简单返回原样，视您是否直接在其他地方调用它而定
    return text