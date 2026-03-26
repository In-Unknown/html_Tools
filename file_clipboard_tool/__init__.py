from flask import send_from_directory, make_response, request
import json
import os
import shutil
from pathlib import Path

def getDir() -> Path:
    print("getDir 函数未被注入！或调用位置在模块级别，请检查调用位置确保其在函数内。")

DOWNLOAD_DIR = Path(r"C:\D\00-Temp-Downloads\HtmlTools_Downloads")

def handle_request(path, request):
    base_dir = getDir()
    file_path = base_dir / path
    
    if path.startswith("api/"):
        return api_rt[path[4:]](request)
    
    if path and file_path.is_file():
        return send_from_directory(base_dir, path)
    
    return send_from_directory(base_dir, "index.html")

def upload_file(request):
    if 'file' not in request.files:
        return make_response(json.dumps({"error": "No file part"}), 400)
    
    file = request.files['file']
    if file.filename == '':
        return make_response(json.dumps({"error": "No selected file"}), 400)
    
    DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
    
    filename = file.filename
    save_path = DOWNLOAD_DIR / filename
    
    counter = 1
    while save_path.exists():
        name, ext = os.path.splitext(filename)
        save_path = DOWNLOAD_DIR / f"{name}_{counter}{ext}"
        counter += 1
    
    file.save(str(save_path))
    
    return make_response(json.dumps({
        "success": True,
        "filename": save_path.name,
        "path": str(save_path)
    }))

def set_clipboard(request):
    try:
        payload = request.get_json()
        if not payload:
            return make_response(json.dumps({"error": "Invalid JSON"}), 400)
        
        content = payload.get('content')
        if not content:
            return make_response(json.dumps({"error": "Content is required"}), 400)
        
        try:
            import win32clipboard
            import win32con
            
            win32clipboard.OpenClipboard()
            win32clipboard.EmptyClipboard()
            win32clipboard.SetClipboardText(content, win32con.CF_UNICODETEXT)
            win32clipboard.CloseClipboard()
            
            return make_response(json.dumps({
                "success": True,
                "content": content
            }))
        except ImportError:
            return make_response(json.dumps({
                "error": "win32clipboard module not installed. Please install pywin32."
            }), 500)
        except Exception as e:
            return make_response(json.dumps({
                "error": f"Failed to set clipboard: {str(e)}"
            }), 500)
    except Exception as e:
        return make_response(json.dumps({"error": str(e)}), 500)

def get_clipboard(request):
    try:
        import win32clipboard
        import win32con
        
        win32clipboard.OpenClipboard()
        try:
            content = win32clipboard.GetClipboardData(win32con.CF_UNICODETEXT)
        except Exception:
            content = ""
        win32clipboard.CloseClipboard()
        
        return make_response(json.dumps({
            "success": True,
            "content": content
        }))
    except ImportError:
        return make_response(json.dumps({
            "error": "win32clipboard module not installed. Please install pywin32."
        }), 500)
    except Exception as e:
        return make_response(json.dumps({
            "error": f"Failed to get clipboard: {str(e)}"
        }), 500)

def list_files(request):
    try:
        DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
        
        files = []
        for item in DOWNLOAD_DIR.iterdir():
            if item.is_file():
                stat = item.stat()
                files.append({
                    "name": item.name,
                    "size": stat.st_size,
                    "modified": stat.st_mtime
                })
        
        return make_response(json.dumps({
            "success": True,
            "files": files,
            "count": len(files),
            "directory": str(DOWNLOAD_DIR)
        }))
    except Exception as e:
        return make_response(json.dumps({
            "error": str(e)
        }), 500)

def delete_file(request):
    try:
        payload = request.get_json()
        if not payload:
            return make_response(json.dumps({"error": "Invalid JSON"}), 400)
        
        filename = payload.get('filename')
        if not filename:
            return make_response(json.dumps({"error": "Filename is required"}), 400)
        
        file_path = DOWNLOAD_DIR / filename
        if not file_path.exists():
            return make_response(json.dumps({
                "error": f"File not found: {filename}"
            }), 404)
        
        file_path.unlink()
        
        return make_response(json.dumps({
            "success": True,
            "filename": filename
        }))
    except Exception as e:
        return make_response(json.dumps({
            "error": str(e)
        }), 500)

def download_file(request):
    try:
        filename = request.args.get('filename')
        if not filename:
            return make_response(json.dumps({"error": "Filename is required"}), 400)
        
        file_path = DOWNLOAD_DIR / filename
        if not file_path.exists():
            return make_response(json.dumps({
                "error": f"File not found: {filename}"
            }), 404)
        
        return send_from_directory(str(DOWNLOAD_DIR), filename, as_attachment=True)
    except Exception as e:
        return make_response(json.dumps({
            "error": str(e)
        }), 500)

api_rt = {
    "upload": upload_file,
    "set_clipboard": set_clipboard,
    "get_clipboard": get_clipboard,
    "list_files": list_files,
    "delete_file": delete_file,
    "download_file": download_file,
}
