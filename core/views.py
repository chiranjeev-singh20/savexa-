import json
import requests
from django.shortcuts import render
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings


def index(request):
    """Serve the main AidSense application page."""
    return render(request, 'core/index.html')


@csrf_exempt
def claude_proxy(request):
    """
    Proxy POST requests to the Anthropic Claude API.
    Keeps the API key server-side; the browser POSTs to /api/claude/.
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)

    api_key = settings.ANTHROPIC_API_KEY
    if not api_key:
        # No key configured — return a structured error so the JS
        # falls back gracefully to the offline knowledge base.
        return JsonResponse(
            {'error': {'type': 'no_api_key', 'message': 'ANTHROPIC_API_KEY not set on server. Add it to .env to enable Claude AI.'}},
            status=200
        )

    try:
        body = json.loads(request.body)
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        return JsonResponse({'error': {'message': f'Invalid JSON: {e}'}}, status=400)

    try:
        resp = requests.post(
            'https://api.anthropic.com/v1/messages',
            headers={
                'Content-Type': 'application/json',
                'x-api-key': api_key,
                'anthropic-version': '2023-06-01',
            },
            json=body,
            timeout=30,
        )
        return JsonResponse(resp.json(), status=resp.status_code)
    except requests.Timeout:
        return JsonResponse({'error': {'message': 'Claude API timed out'}}, status=504)
    except requests.RequestException as e:
        return JsonResponse({'error': {'message': str(e)}}, status=502)
