#!/usr/bin/env python3
import requests
import json

url = 'http://127.0.0.1:8000/api/detect/'
image_path = r'backend\media\injury_uploads\Screenshot_2026-05-22_102535.png'

with open(image_path, 'rb') as f:
    files = {'image': f}
    resp = requests.post(url, files=files)

print('Status:', resp.status_code)
print(json.dumps(resp.json(), indent=2))
