import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


INITIAL_HISTORY_NOTE = (
    'Imported from an existing order. Earlier status timestamps are unavailable.'
)


def create_initial_status_history(apps, schema_editor):
    """Create one baseline history entry for every order that already exists.

    Existing databases do not contain the time of each previous transition, so
    this migration records only the order's current status. The entry uses the
    order's last update time and is clearly labelled as imported rather than
    pretending that a complete historical timeline is available.
    """

    Order = apps.get_model('orders', 'Order')
    OrderStatusHistory = apps.get_model('orders', 'OrderStatusHistory')
    database_alias = schema_editor.connection.alias

    orders = (
        Order.objects.using(database_alias)
        .only('id', 'status', 'created_at', 'updated_at')
        .iterator(chunk_size=500)
    )

    for order in orders:
        history = OrderStatusHistory.objects.using(database_alias).create(
            order_id=order.id,
            status=order.status,
            note=INITIAL_HISTORY_NOTE,
        )

        baseline_time = order.updated_at or order.created_at
        if baseline_time is not None:
            OrderStatusHistory.objects.using(database_alias).filter(
                pk=history.pk,
            ).update(
                created_at=baseline_time,
                updated_at=baseline_time,
            )


def remove_initial_status_history(apps, schema_editor):
    OrderStatusHistory = apps.get_model('orders', 'OrderStatusHistory')
    database_alias = schema_editor.connection.alias
    OrderStatusHistory.objects.using(database_alias).filter(
        note=INITIAL_HISTORY_NOTE,
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0003_chatmessage'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='OrderStatusHistory',
            fields=[
                (
                    'id',
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name='ID',
                    ),
                ),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                (
                    'status',
                    models.CharField(
                        choices=[
                            ('pending_payment', 'Pending card payment'),
                            ('pending_review', 'Pending prescription review'),
                            ('rejected', 'Rejected'),
                            ('accepted', 'Accepted'),
                            ('preparing', 'Preparing'),
                            ('ready_for_pickup', 'Ready for pickup'),
                            ('awaiting_agent', 'Awaiting delivery agent'),
                            ('picked_up', 'Picked up'),
                            ('out_for_delivery', 'Out for delivery'),
                            ('delivered', 'Delivered'),
                            ('cancelled', 'Cancelled'),
                            ('failed', 'Failed'),
                        ],
                        max_length=24,
                    ),
                ),
                ('note', models.TextField(blank=True)),
                (
                    'changed_by',
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name='+',
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    'order',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='status_history',
                        to='orders.order',
                    ),
                ),
            ],
            options={
                'ordering': ('created_at', 'id'),
                'indexes': [
                    models.Index(
                        fields=['order', 'created_at'],
                        name='orders_orde_order_i_1de1d7_idx',
                    ),
                ],
            },
        ),
        migrations.RunPython(
            create_initial_status_history,
            remove_initial_status_history,
        ),
    ]