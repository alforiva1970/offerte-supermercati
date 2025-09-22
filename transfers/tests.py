from django.test import TestCase
from django.core import mail
from django.utils import timezone
from rest_framework.test import APITestCase
from rest_framework import status
from .models import User, Vehicle, PriceList, Transfer, ServiceRequest
from decimal import Decimal

class TransferAppLogicTests(TestCase):
    def setUp(self):
        self.vehicle = Vehicle.objects.create(service_class='Auto', license_plate='TEST-123', capacity=4)
        self.pricelist = PriceList.objects.create(
            service_class='Auto',
            service_type='Disposizione Oraria',
            price_per_hour=Decimal('50.00'),
            operator_rate=Decimal('20.00')
        )
        self.client = User.objects.create_user(username='testclient', password='password123', role='Cliente', email='client@test.com')

    def test_transfer_pricing_calculation(self):
        """
        Test that a Transfer's price is calculated correctly on creation.
        """
        transfer = Transfer.objects.create(
            client=self.client,
            vehicle=self.vehicle,
            service_type='Disposizione Oraria',
            scheduled_duration_hours=Decimal('2.0'),
            start_location='A',
            end_location='B',
            scheduled_start_time=timezone.now()
        )
        self.assertEqual(transfer.service_value, Decimal('100.00')) # 2 hours * 50/hour
        self.assertEqual(transfer.service_cost, Decimal('20.00'))

    def test_email_notification_on_confirmation(self):
        """
        Test that an email is sent when a Transfer is confirmed.
        """
        transfer = Transfer.objects.create(
            client=self.client,
            vehicle=self.vehicle,
            service_type='Disposizione Oraria',
            scheduled_duration_hours=Decimal('2.0'),
            start_location='A',
            end_location='B',
            scheduled_start_time=timezone.now(),
            status='Richiesto' # Start as requested
        )

        transfer.status = 'Confermato'
        transfer.save()

        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].subject, f'Transfer {transfer.id} Confermato')
        self.assertIn('Il tuo transfer da A a B è stato confermato', mail.outbox[0].body)
        self.assertEqual(mail.outbox[0].to[0], 'client@test.com')


class TransferAppAPITests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser('admin', 'admin@test.com', 'password123')
        self.client1 = User.objects.create_user(username='client1', password='password123', role='Cliente')
        self.client2 = User.objects.create_user(username='client2', password='password123', role='Cliente')
        self.operator = User.objects.create_user(username='operator1', password='password123', role='Operatore')

        self.request1 = ServiceRequest.objects.create(requester=self.client1, start_location='A', end_location='B', requested_datetime=timezone.now())
        self.request2 = ServiceRequest.objects.create(requester=self.client2, start_location='C', end_location='D', requested_datetime=timezone.now())

    def test_client_can_only_see_own_requests(self):
        """
        Ensure that a client can only see their own service requests via the API.
        """
        # Log in as client1
        self.client.force_authenticate(user=self.client1)

        response = self.client.get('/api/requests/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Check that only request1 is in the response
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['id'], self.request1.id)
        self.assertNotEqual(response.data[0]['id'], self.request2.id)

    def test_unauthenticated_user_cannot_access_api(self):
        """
        Ensure unauthenticated users get a 401 Unauthorized error.
        """
        response = self.client.get('/api/vehicles/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
