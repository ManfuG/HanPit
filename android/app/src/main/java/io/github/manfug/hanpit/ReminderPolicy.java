package io.github.manfug.hanpit;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZonedDateTime;

/** Calendar-based policy, independent of Android and of elapsed 24-hour durations. */
final class ReminderPolicy {
    private static final LocalTime EVENING = LocalTime.of(19, 0);

    private ReminderPolicy() {}

    static ZonedDateTime nextEvening(ZonedDateTime now, String visitedDay, String notifiedDay) {
        LocalDate day = now.toLocalDate();
        if (!now.toLocalTime().isBefore(EVENING)) day = day.plusDays(1);
        // High-water dates avoid a growing visit log and suppress duplicate reminders
        // when the device clock moves backwards, until the calendar catches up.
        if (visitedDay.compareTo(day.toString()) >= 0) day = LocalDate.parse(visitedDay).plusDays(1);
        if (notifiedDay.compareTo(day.toString()) >= 0) day = LocalDate.parse(notifiedDay).plusDays(1);
        return day.atTime(EVENING).atZone(now.getZone());
    }

    static boolean shouldNotify(ZonedDateTime now, String scheduledDay,
            String visitedDay, String notifiedDay) {
        String today = now.toLocalDate().toString();
        // An alarm delayed into another date must never become a morning catch-up.
        return today.equals(scheduledDay)
                && !now.toLocalTime().isBefore(EVENING)
                && today.compareTo(visitedDay) > 0
                && today.compareTo(notifiedDay) > 0;
    }
}
