import os
import re
import hashlib

class RenormalizedLogStream:
    def __init__(self, text_stream=None):
        self.text_stream = text_stream  # 可选的外部文本流，同时写入到这里
        self.buffer = ""  # 内存缓冲区，存储所有累积的文本
        log_file = os.path.join(os.path.dirname(__file__), 'output.log')  # 日志文件路径
        self.log_stream = open(log_file, 'w', encoding='utf-8')  # 以写入模式打开文件流

    def write(self, data):
        self.buffer += str(data)  # 将新数据追加到缓冲区
        self.log_stream.seek(0)  # 将文件指针移到文件开头
        self.log_stream.truncate()  # 清空文件内容（从当前位置删除所有内容）
        self.log_stream.write(deduplicate_logs(self.buffer))  # 将完整的缓冲区内容写入文件
        self.log_stream.flush()  # 立即将缓冲区内容写入磁盘，而不是等待系统自动刷新
        if self.text_stream:  # 如果提供了外部文本流
            self.text_stream.write(data)  # 同时写入到外部流

    def get_buffer(self):
        return self.buffer  # 返回当前缓冲区的完整内容

    def clear_buffer(self):
        self.buffer = ""  # 清空内存缓冲区

    def flush(self):
        pass  # 空实现，已由write方法中的flush处理

    def close(self):
        self.log_stream.close()  # 关闭日志文件流

    def __enter__(self):
        return self  # 上下文管理器进入，返回自身

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.log_stream.close()  # 上下文管理器退出时自动关闭文件流


def deduplicate_logs(text: str) -> str:
    if not text.strip():
        return ""
    lines = text.rstrip('\n').split('\n')
    n = len(lines)
    ts_pattern = r'\[\d{2}/\w{3}/\d{4} \d{2}:\d{2}:\d{2}\]'
    normalized = [re.sub(ts_pattern, '[]', line) for line in lines]
    
    hashes = [hashlib.md5(n.encode()).hexdigest() for n in normalized]
    
    result = []
    i = 0

    while i < n:
        best_repeats = 1
        best_size = 1
        best_end = i + 1
        
        for size in range(1, min(50, n - i) + 1):
            repeats = 1
            pos = i + size
            
            block_hash = hashes[i:i+size]
            
            while pos + size <= n:
                match = all(hashes[pos+k] == block_hash[k] for k in range(size))
                
                if match:
                    content_match = all(normalized[pos+k] == normalized[i+k] for k in range(size))
                    if content_match:
                        repeats += 1
                        pos += size
                        continue
                break
            
            if repeats > 1 and repeats >= best_repeats:
                if repeats > best_repeats or (repeats == best_repeats and size > best_size):
                    best_repeats = repeats
                    best_size = size
                    best_end = pos
        
        if best_repeats > 1:
            last_start = i + (best_repeats - 1) * best_size
            
            if result and result[-1] != "":
                result.append("")
            result.append("=" * 40)
            
            for k in range(best_size):
                result.append(lines[last_start + k])
            
            result.append("=" * 40)
            result.append(f"[重复次数: {best_repeats}]")
            result.append("")
            
            i = best_end
        else:
            result.append(lines[i])
            i += 1
    
    return '\n'.join(result)
