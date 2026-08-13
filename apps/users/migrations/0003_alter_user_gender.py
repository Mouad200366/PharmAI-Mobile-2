from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0002_user_avatar'),
    ]

    operations = [
        migrations.AlterField(
            model_name='user',
            name='gender',
            field=models.CharField(
                choices=[
                    ('M', 'Male'),
                    ('F', 'Female'),
                ],
                max_length=1,
                verbose_name='gender',
            ),
        ),
    ]