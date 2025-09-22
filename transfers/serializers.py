from rest_framework import serializers
from .models import User, Vehicle, PriceList, Transfer, ServiceRequest, DailyReport

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'role', 'associated_client', 'password']
        # Make password write-only so it's not returned in responses
        extra_kwargs = {'password': {'write_only': True}}

    def create(self, validated_data):
        # Use the custom model's create_user method to ensure password is hashed
        user = User.objects.create_user(**validated_data)
        return user

class VehicleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Vehicle
        fields = '__all__'

class PriceListSerializer(serializers.ModelSerializer):
    class Meta:
        model = PriceList
        fields = '__all__'

class TransferSerializer(serializers.ModelSerializer):
    # Use nested serializers or string relations to provide more meaningful representations
    client = serializers.ReadOnlyField(source='client.username')
    operator = serializers.ReadOnlyField(source='operator.username', allow_null=True)
    end_user = serializers.ReadOnlyField(source='end_user.username', allow_null=True)
    vehicle = serializers.StringRelatedField()

    class Meta:
        model = Transfer
        fields = '__all__'

class ServiceRequestSerializer(serializers.ModelSerializer):
    requester = serializers.ReadOnlyField(source='requester.username')

    class Meta:
        model = ServiceRequest
        fields = '__all__'

class DailyReportSerializer(serializers.ModelSerializer):
    class Meta:
        model = DailyReport
        fields = '__all__'
