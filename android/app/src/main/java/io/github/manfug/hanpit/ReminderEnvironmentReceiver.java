package io.github.manfug.hanpit;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** System broadcasts replace the pending alarm using the current local clock and zone. */
public final class ReminderEnvironmentReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action)
                || Intent.ACTION_TIME_CHANGED.equals(action)
                || Intent.ACTION_TIMEZONE_CHANGED.equals(action)
                || Intent.ACTION_DATE_CHANGED.equals(action)
                || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            ReminderScheduler.environmentChanged(context);
        }
    }
}
