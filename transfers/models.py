from django.db import models
from django.contrib.auth.models import AbstractUser
from django.conf import settings
from django.core.mail import send_mail

class User(AbstractUser):
    ROLE_CHOICES = (
        ('Amministratore', 'Amministratore'),
        ('Cliente', 'Cliente'),
        ('Utilizzatore', 'Utilizzatore'),
        ('Operatore', 'Operatore'),
    )
    role = models.CharField(max_length=15, choices=ROLE_CHOICES, default='Utilizzatore')
    # If a user is an 'Utilizzatore', they might be associated with a 'Cliente' company
    associated_client = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        limit_choices_to={'role': 'Cliente'}
    )

class Vehicle(models.Model):
    SERVICE_CLASS_CHOICES = (
        ('Auto', 'Auto'),
        ('Van', 'Van'),
        ('Minibus', 'Minibus'),
        ('Bus', 'Bus'),
    )
    service_class = models.CharField(max_length=10, choices=SERVICE_CLASS_CHOICES)
    license_plate = models.CharField(max_length=15, unique=True)
    capacity = models.PositiveIntegerField()

    def __str__(self):
        return f"{self.get_service_class_display()} - {self.license_plate}"

class PriceList(models.Model):
    SERVICE_TYPE_CHOICES = (
        ('Transfer A-B', 'Transfer A-B'),
        ('Disposizione Oraria', 'Disposizione Oraria'),
    )
    service_class = models.CharField(max_length=10, choices=Vehicle.SERVICE_CLASS_CHOICES)
    service_type = models.CharField(max_length=20, choices=SERVICE_TYPE_CHOICES)
    price_per_km = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    price_per_hour = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    operator_rate = models.DecimalField(max_digits=10, decimal_places=2, help_text="Compenso per l'operatore (es. per ora o a transfer)")

    def __str__(self):
        return f"Listino per {self.get_service_class_display()} - {self.get_service_type_display()}"

class Transfer(models.Model):
    STATUS_CHOICES = (
        ('Richiesto', 'Richiesto'),
        ('Confermato', 'Confermato'),
        ('In Corso', 'In Corso'),
        ('Completato', 'Completato'),
        ('Annullato', 'Annullato'),
    )
    SERVICE_TYPE_CHOICES = (
        ('Transfer A-B', 'Transfer A-B'),
        ('Disposizione Oraria', 'Disposizione Oraria'),
    )

    client = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='managed_transfers', limit_choices_to={'role': 'Cliente'})
    end_user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='used_transfers', help_text="Chi ha effettivamente usufruito del servizio")
    operator = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='assigned_transfers', limit_choices_to={'role': 'Operatore'})
    vehicle = models.ForeignKey(Vehicle, on_delete=models.SET_NULL, null=True, blank=True)

    service_type = models.CharField(max_length=20, choices=SERVICE_TYPE_CHOICES)
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default='Richiesto')

    start_location = models.CharField(max_length=255)
    end_location = models.CharField(max_length=255, null=True, blank=True)

    scheduled_start_time = models.DateTimeField()
    scheduled_duration_hours = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)

    actual_start_time = models.DateTimeField(null=True, blank=True)
    actual_end_time = models.DateTimeField(null=True, blank=True)

    notes = models.TextField(blank=True)
    deviations = models.TextField(blank=True)

    service_value = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True, help_text="Prezzo finale per il cliente")
    service_cost = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True, help_text="Compenso per l'operatore")

    def calculate_pricing(self):
        # Calculate pricing only if it hasn't been set yet and we have a vehicle
        if self.vehicle and (self.service_value is None or self.service_cost is None):
            try:
                price_info = PriceList.objects.get(
                    service_class=self.vehicle.service_class,
                    service_type=self.service_type
                )

                # Calculate service_value (for the client)
                if self.service_type == 'Disposizione Oraria' and self.scheduled_duration_hours and price_info.price_per_hour:
                    self.service_value = self.scheduled_duration_hours * price_info.price_per_hour
                elif self.service_type == 'Transfer A-B' and price_info.price_per_km:
                    # This is a placeholder for distance calculation.
                    # In a real app, you would use an external API like Google Maps.
                    # For now, we'll use a base fee + a dummy distance calculation.
                    base_fee = 25.00 # Example base fee
                    dummy_distance_km = 15.0 # Example distance
                    self.service_value = base_fee + (float(price_info.price_per_km) * dummy_distance_km)

                # Calculate service_cost (for the operator)
                self.service_cost = price_info.operator_rate

            except PriceList.DoesNotExist:
                # If no pricing is found, default to 0
                self.service_value = self.service_value or 0
                self.service_cost = self.service_cost or 0

    def save(self, *args, **kwargs):
        # Keep track of the original status to detect changes
        original_status = None
        if self.pk:
            try:
                original_status = Transfer.objects.get(pk=self.pk).status
            except Transfer.DoesNotExist:
                pass # Object is new, so no original status

        # Calculate pricing on creation
        if not self.pk:
            self.calculate_pricing()

        super().save(*args, **kwargs)

        # Send notification if status changed to 'Confermato'
        if self.status == 'Confermato' and original_status != 'Confermato':
            try:
                send_mail(
                    f'Transfer {self.id} Confermato',
                    f'Ciao {self.client.first_name},\n\nIl tuo transfer da {self.start_location} a {self.end_location} è stato confermato.\n\nGrazie.',
                    'noreply@transferapp.com',
                    [self.client.email],
                    fail_silently=False,
                )
            except Exception as e:
                # In a real app, log this error
                print(f"Failed to send confirmation email for Transfer {self.id}: {e}")

    def __str__(self):
        return f"Transfer {self.id} per {self.client.username} - {self.status}"

class ServiceRequest(models.Model):
    STATUS_CHOICES = (
        ('In Attesa', 'In Attesa'),
        ('Approvato', 'Approvato'),
        ('Rifiutato', 'Rifiutato'),
    )
    requester = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    start_location = models.CharField(max_length=255)
    end_location = models.CharField(max_length=255)
    requested_datetime = models.DateTimeField()
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default='In Attesa')
    # For dual approval
    client_approved = models.BooleanField(default=False)
    admin_approved = models.BooleanField(default=False)

    def __str__(self):
        return f"Richiesta da {self.requester.username} - {self.status}"

class DailyReport(models.Model):
    date = models.DateField(unique=True)
    completed_transfers = models.ManyToManyField(Transfer)
    total_value = models.DecimalField(max_digits=12, decimal_places=2)
    total_cost = models.DecimalField(max_digits=12, decimal_places=2)

    def __str__(self):
        return f"Report per il {self.date}"
