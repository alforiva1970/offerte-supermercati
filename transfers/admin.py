from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User, Vehicle, PriceList, Transfer, ServiceRequest, DailyReport

# We need to use a custom admin class for our custom user model
class CustomUserAdmin(UserAdmin):
    # Add our custom fields to the display and fieldsets
    model = User
    fieldsets = UserAdmin.fieldsets + (
        (None, {'fields': ('role', 'associated_client')}),
    )
    add_fieldsets = UserAdmin.add_fieldsets + (
        (None, {'fields': ('role', 'associated_client')}),
    )
    list_display = ['username', 'email', 'first_name', 'last_name', 'role', 'is_staff']


admin.site.register(User, CustomUserAdmin)
admin.site.register(Vehicle)
admin.site.register(PriceList)
admin.site.register(Transfer)
admin.site.register(ServiceRequest)
admin.site.register(DailyReport)
