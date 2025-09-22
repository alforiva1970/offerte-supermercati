from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

# Create a router and register our viewsets with it.
router = DefaultRouter()
router.register(r'users', views.UserViewSet)
router.register(r'vehicles', views.VehicleViewSet)
router.register(r'prices', views.PriceListViewSet)
router.register(r'transfers', views.TransferViewSet)
router.register(r'requests', views.ServiceRequestViewSet)
router.register(r'reports', views.DailyReportViewSet)

# The API URLs are now determined automatically by the router.
urlpatterns = [
    path('current-user/', views.current_user_view),
    path('', include(router.urls)),
]
