from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import User, Vehicle, PriceList, Transfer, ServiceRequest, DailyReport
from .serializers import (
    UserSerializer,
    VehicleSerializer,
    PriceListSerializer,
    TransferSerializer,
    ServiceRequestSerializer,
    DailyReportSerializer
)

# For now, we will use IsAuthenticated to protect all endpoints.
# We can define more granular permissions later.

class UserViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows users to be viewed or edited.
    """
    queryset = User.objects.all().order_by('-date_joined')
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAdminUser] # Only admins can manage users directly

class VehicleViewSet(viewsets.ModelViewSet):
    """
    API endpoint for vehicles.
    """
    queryset = Vehicle.objects.all()
    serializer_class = VehicleSerializer
    permission_classes = [permissions.IsAuthenticated]

class PriceListViewSet(viewsets.ModelViewSet):
    """
    API endpoint for price lists.
    """
    queryset = PriceList.objects.all()
    serializer_class = PriceListSerializer
    permission_classes = [permissions.IsAuthenticated]

class TransferViewSet(viewsets.ModelViewSet):
    """
    API endpoint for transfers.
    """
    serializer_class = TransferSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        """
        Filter transfers based on user role.
        - Admins see all transfers.
        - Clients see their own transfers.
        - Operators see their assigned transfers.
        """
        user = self.request.user
        if user.role == 'Amministratore':
            return Transfer.objects.all()
        elif user.role == 'Cliente':
            return Transfer.objects.filter(client=user)
        elif user.role == 'Operatore':
            return Transfer.objects.filter(operator=user)
        # Utilizzatori might not see any transfers directly, only their requests
        return Transfer.objects.none()

class ServiceRequestViewSet(viewsets.ModelViewSet):
    """
    API endpoint for service requests.
    """
    serializer_class = ServiceRequestSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        """
        This view should return a list of all the service requests
        for the currently authenticated user.
        """
        user = self.request.user
        if user.role == 'Amministratore':
            return ServiceRequest.objects.all()
        return ServiceRequest.objects.filter(requester=user)

    def perform_create(self, serializer):
        """
        Associate the request with the logged-in user.
        """
        serializer.save(requester=self.request.user)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """
        Approve a service request. This can be done by an Admin or the associated Client.
        """
        service_request = self.get_object()
        user = request.user

        if user.role == 'Amministratore':
            service_request.admin_approved = True
        elif user.role == 'Cliente' and service_request.requester.associated_client == user:
            service_request.client_approved = True
        else:
            return Response({'status': 'permission denied'}, status=status.HTTP_403_FORBIDDEN)

        # If both have approved, update the main status
        if service_request.admin_approved and service_request.client_approved:
            service_request.status = 'Approvato'

        service_request.save()
        return Response({'status': 'approval status updated'})

class DailyReportViewSet(viewsets.ModelViewSet):
    """
    API endpoint for daily reports.
    """
    queryset = DailyReport.objects.all()
    serializer_class = DailyReportSerializer
    permission_classes = [permissions.IsAuthenticated]


from rest_framework.decorators import api_view
from rest_framework.response import Response

@api_view(['GET'])
def current_user_view(request):
    """
    Determine the current user by their token, and return their data
    """
    serializer = UserSerializer(request.user)
    return Response(serializer.data)
