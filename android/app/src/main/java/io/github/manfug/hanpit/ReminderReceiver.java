package io.github.manfug.hanpit;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Explicit, unexported alarm destination. */
public final class ReminderReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if ("io.github.manfug.hanpit.EVENING_REMINDER".equals(intent.getAction())) {
            ReminderScheduler.alarm(context, intent.getStringExtra("scheduled_day"));
        }
    }
}
