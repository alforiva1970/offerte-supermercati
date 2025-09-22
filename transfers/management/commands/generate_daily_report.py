from django.core.management.base import BaseCommand
from django.utils import timezone
from decimal import Decimal
from transfers.models import Transfer, DailyReport

class Command(BaseCommand):
    help = 'Generates a daily report for completed transfers from the previous day.'

    def handle(self, *args, **options):
        # Report is for the day that just ended.
        target_date = timezone.now().date() - timezone.timedelta(days=1)

        # Check if a report for this date already exists
        if DailyReport.objects.filter(date=target_date).exists():
            self.stdout.write(self.style.WARNING(f'Report for {target_date} already exists. Skipping.'))
            return

        completed_transfers = Transfer.objects.filter(
            status='Completato',
            actual_end_time__date=target_date
        )

        if not completed_transfers.exists():
            self.stdout.write(self.style.SUCCESS(f'No completed transfers for {target_date}. No report generated.'))
            # Optional: create an empty report
            DailyReport.objects.create(
                date=target_date,
                total_value=Decimal('0.00'),
                total_cost=Decimal('0.00')
            )
            return

        total_value = sum(t.service_value for t in completed_transfers if t.service_value) or Decimal('0.00')
        total_cost = sum(t.service_cost for t in completed_transfers if t.service_cost) or Decimal('0.00')

        report = DailyReport.objects.create(
            date=target_date,
            total_value=total_value,
            total_cost=total_cost
        )
        report.completed_transfers.set(completed_transfers)

        self.stdout.write(self.style.SUCCESS(f'Successfully generated report for {target_date}.'))
