"""Test all backend API endpoints after FAidLens updates"""
import json
import urllib.request
import urllib.parse
import os

BASE_URL = 'http://127.0.0.1:8000/api'

def test_endpoint(method, path, data=None, file_path=None):
    url = f'{BASE_URL}/{path}'
    print(f'\n{"="*60}')
    print(f'Testing: {method} {url}')
    print(f'{"="*60}')
    
    try:
        if method == 'GET':
            resp = urllib.request.urlopen(url, timeout=10)
            result = json.loads(resp.read())
            print(f'Status: {resp.status}')
            print(json.dumps(result, indent=2))
            return result
            
        elif method == 'POST' and file_path:
            # For file upload, use multipart
            import http.client
            import io
            import mimetypes
            
            # Read file
            with open(file_path, 'rb') as f:
                file_data = f.read()
            
            # Build multipart body manually
            boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW'
            body = []
            body.append(f'--{boundary}'.encode())
            body.append(b'Content-Disposition: form-data; name="image"; filename="test.jpg"'.encode())
            body.append(b'Content-Type: image/jpeg'.encode())
            body.append(b'')
            body.append(file_data)
            body.append(f'--{boundary}--'.encode())
            body.append(b'')
            
            request_body = b'\r\n'.join(body)
            
            req = urllib.request.Request(
                url,
                data=request_body,
                headers={
                    'Content-Type': f'multipart/form-data; boundary={boundary}',
                },
                method='POST'
            )
            resp = urllib.request.urlopen(req, timeout=30)
            result = json.loads(resp.read())
            print(f'Status: {resp.status}')
            print(json.dumps(result, indent=2))
            return result
            
    except urllib.error.HTTPError as e:
        print(f'HTTP Error: {e.code}')
        print(e.read().decode())
        return None
    except urllib.error.URLError as e:
        print(f'Connection Error: {e.reason}')
        print('Make sure the Django server is running!')
        return None
    except Exception as e:
        print(f'Error: {e}')
        return None


if __name__ == '__main__':
    print('FAidLens Backend API Tests')
    print('='*60)
    print('Make sure Django server is running:')
    print('  cd backend && python manage.py runserver')
    print('='*60)
    
    # Test 1: Health check
    test_endpoint('GET', 'test/')
    
    # Test 2: Check Bruise guidance
    test_endpoint('GET', 'guidance/Bruise/')
    
    # Test 3: Check Abrasion guidance
    test_endpoint('GET', 'guidance/Abrasion/')
    
    # Test 4: Check Burn guidance (existing)
    test_endpoint('GET', 'guidance/Burn/')
    
    # Test 5: Check Cut guidance (existing)
    test_endpoint('GET', 'guidance/Cut/')
    
    # Test 6: Try detection with an actual image from dataset
    test_img = r'D:\Savexa\Savexa\cv\aidsense\dataset\test\bruise\bruise_0000.jpg'
    if os.path.exists(test_img):
        test_endpoint('POST', 'detect/', file_path=test_img)
    else:
        # Find any test image
        import glob
        test_images = glob.glob(r'D:\Savexa\Savexa\cv\aidsense\dataset\test\**\*.jpg', recursive=True)
        if test_images:
            print(f'\nUsing test image: {test_images[0]}')
            test_endpoint('POST', 'detect/', file_path=test_images[0])
        else:
            print('\nNo test images found in dataset')
    
    print('\n' + '='*60)
    print('Tests complete!')
    print('='*60)