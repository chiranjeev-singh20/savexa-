from django.urls import path
from . import views

urlpatterns = [
    path('', views.index, name='index'),
    path('api/claude/', views.claude_proxy, name='claude_proxy'),
]
