package io.github.manfug.hanpit;

import android.Manifest;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.content.ContextCompat;
import java.time.ZonedDateTime;

/** One replaceable inexact alarm and one notification. All entry points run on the main thread. */
final class ReminderScheduler {
    private static final String PREFERENCES = "hanpit_reminders";
    private static final String CHANNEL = "evening_practice";
    private static final int ALARM_ID = 1900;
    private static final int NOTIFICATION_ID = 1900;
    private static boolean foreground;

    private ReminderScheduler() {}

    static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
    }

    static void initialize(Context context) {
        preferences(context).edit().putBoolean("initialized", true).apply();
        createChannel(context);
        schedule(context);
    }

    static void resume(Context context) {
        foreground = true;
        recordVisit(context);
        schedule(context);
    }

    static void pause(Context context) {
        // Covers crossing midnight while continuously open, then leaving before the alarm.
        recordVisit(context);
        foreground = false;
        schedule(context);
    }

    private static void recordVisit(Context context) {
        SharedPreferences prefs = preferences(context);
        String day = today();
        if (day.compareTo(prefs.getString("visited_day", "")) > 0) {
            prefs.edit().putString("visited_day", day).apply();
        }
        manager(context).cancel(NOTIFICATION_ID);
    }

    static void environmentChanged(Context context) {
        if (foreground) recordVisit(context);
        // Do not leave an old evening notification visible after a date/zone change.
        manager(context).cancel(NOTIFICATION_ID);
        schedule(context);
    }

    static boolean notificationsAllowed(Context context) {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context,
                Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return false;
        }
        NotificationManager notifications = manager(context);
        if (!notifications.areNotificationsEnabled()) return false;
        NotificationChannel channel = notifications.getNotificationChannel(CHANNEL);
        return channel == null || channel.getImportance() != NotificationManager.IMPORTANCE_NONE;
    }

    static void alarm(Context context, String scheduledDay) {
        if (foreground) recordVisit(context);
        SharedPreferences prefs = preferences(context);
        ZonedDateTime now = ZonedDateTime.now();
        String day = now.toLocalDate().toString();
        if (prefs.getBoolean("initialized", false) && notificationsAllowed(context)
                && ReminderPolicy.shouldNotify(now, scheduledDay,
                        prefs.getString("visited_day", ""), prefs.getString("notified_day", ""))) {
            // Persist before posting so process death or a duplicate delivery cannot notify twice.
            if (prefs.edit().putString("notified_day", day).commit()) {
                postNotification(context);
            }
        }
        schedule(context);
    }

    private static void schedule(Context context) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        PendingIntent previous = alarmIntent(context, null);
        alarms.cancel(previous);
        SharedPreferences prefs = preferences(context);
        if (!prefs.getBoolean("initialized", false) || !notificationsAllowed(context)) {
            manager(context).cancel(NOTIFICATION_ID);
            return;
        }
        ZonedDateTime now = ZonedDateTime.now();
        ZonedDateTime next = ReminderPolicy.nextEvening(now,
                prefs.getString("visited_day", ""), prefs.getString("notified_day", ""));
        // A calendar evening, not now + 24 hours: timezone changes and DST remain local.
        alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next.toInstant().toEpochMilli(),
                alarmIntent(context, next.toLocalDate().toString()));
    }

    private static PendingIntent alarmIntent(Context context, String day) {
        Intent intent = new Intent(context, ReminderReceiver.class)
                .setAction("io.github.manfug.hanpit.EVENING_REMINDER");
        if (day != null) intent.putExtra("scheduled_day", day);
        return PendingIntent.getBroadcast(context, ALARM_ID, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static void createChannel(Context context) {
        NotificationChannel channel = new NotificationChannel(CHANNEL,
                "Evening practice", NotificationManager.IMPORTANCE_DEFAULT);
        channel.setDescription("A gentle evening reminder on days you have not opened HanPit.");
        manager(context).createNotificationChannel(channel);
    }

    private static void postNotification(Context context) {
        createChannel(context);
        Intent launch = new Intent(context, MainActivity.class)
                .setAction(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(context, 0, launch,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder = new Notification.Builder(context, CHANNEL);
        Notification notification = builder.setSmallIcon(R.drawable.ic_notification)
                .setContentTitle("A little Chinese tonight?")
                .setContentText("Your flashcards are ready. A few words before dinner?")
                .setContentIntent(tap).setAutoCancel(true).setOnlyAlertOnce(true)
                .setVisibility(Notification.VISIBILITY_PRIVATE)
                .setColor(0xff142720).build();
        try {
            manager(context).notify(NOTIFICATION_ID, notification);
        } catch (SecurityException ignored) {
            // Permission can be revoked between checking it and posting; do not retry today.
        }
    }

    private static NotificationManager manager(Context context) {
        return (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    }

    private static String today() {
        return ZonedDateTime.now().toLocalDate().toString();
    }
}
