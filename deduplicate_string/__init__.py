from flask import send_from_directory
import json
from flask import make_response, request
from pathlib import Path

def handle_request(path, request):
    base_dir = getDir()
    
    file_path = base_dir / path
    
    if path and file_path.is_file():
        return send_from_directory(base_dir, path)
    
    if path.startswith("api/"):
        return api_rt[path[4:]](request)
    
    return send_from_directory(base_dir, "index.html")

def json_read(request):

    filename = request.form.get('filename')
    if not filename:
        return make_response(json.dumps({"error": "Filename required"}), 400)
    
    data_dir = getDir() / "data"
    json_file = data_dir / f"{filename}.json"
    
    with open(json_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    return make_response(json.dumps(data))

def json_write(request):

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
        data = json.loads(json_data)
    
    try:
        with open(json_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return make_response(json.dumps({"ok": True}))
    except:
        return make_response(json.dumps({"error": "Failed to write file"}), 500)
    
# API路由表
api_rt = {
    "json/r": json_read,
    "json/w": json_write,
}