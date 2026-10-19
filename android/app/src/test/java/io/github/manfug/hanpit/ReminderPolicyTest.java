package io.github.manfug.hanpit;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.time.Duration;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import org.junit.Test;

public class ReminderPolicyTest {
    private static final ZoneId ROME = ZoneId.of("Europe/Rome");

    private static ZonedDateTime at(String local) {
        return java.time.LocalDateTime.parse(local).atZone(ROME);
    }

    @Test
    public void unvisitedDaySchedulesThisEvening() {
        assertEquals(at("2026-10-19T19:00"), ReminderPolicy.nextEvening(
                at("2026-10-19T08:00"), "2026-10-18", ""));
    }

    @Test
    public void visitAndRepeatedVisitSkipToday() {
        ZonedDateTime expected = at("2026-10-20T19:00");
        assertEquals(expected, ReminderPolicy.nextEvening(at("2026-10-19T08:00"), "2026-10-19", ""));
        assertEquals(expected, ReminderPolicy.nextEvening(at("2026-10-19T18:59"), "2026-10-19", ""));
        assertFalse(ReminderPolicy.shouldNotify(at("2026-10-19T19:03"),
                "2026-10-19", "2026-10-19", ""));
    }

    @Test
    public void alreadyNotifiedDaySkipsTodayAndRejectsDuplicateDelivery() {
        assertEquals(at("2026-10-20T19:00"), ReminderPolicy.nextEvening(
                at("2026-10-19T09:00"), "", "2026-10-19"));
        assertFalse(ReminderPolicy.shouldNotify(at("2026-10-19T19:04"),
                "2026-10-19", "", "2026-10-19"));
    }

    @Test
    public void eveningDelayWithinScheduledDateIsAllowed() {
        assertTrue(ReminderPolicy.shouldNotify(at("2026-10-19T19:00"), "2026-10-19", "", ""));
        assertTrue(ReminderPolicy.shouldNotify(at("2026-10-19T23:59:59"), "2026-10-19", "", ""));
    }

    @Test
    public void noCatchupWhenInitializedAtOrAfterEvening() {
        assertEquals(at("2026-10-20T19:00"), ReminderPolicy.nextEvening(at("2026-10-19T19:00"), "", ""));
        assertEquals(at("2026-10-20T19:00"), ReminderPolicy.nextEvening(at("2026-10-19T23:59"), "", ""));
    }

    @Test
    public void midnightRejectsYesterdayAlarmButCanScheduleNewEvening() {
        assertFalse(ReminderPolicy.shouldNotify(at("2026-10-20T00:00"), "2026-10-19", "", ""));
        assertFalse(ReminderPolicy.shouldNotify(at("2026-10-20T09:00"), "2026-10-19", "", ""));
        assertEquals(at("2026-10-20T19:00"), ReminderPolicy.nextEvening(
                at("2026-10-20T00:00"), "2026-10-19", "2026-10-19"));
    }

    @Test
    public void veryStaleAndMissingAlarmDatesAreRejectedEvenInEvening() {
        assertFalse(ReminderPolicy.shouldNotify(at("2026-10-20T20:00"), "2026-10-19", "", ""));
        assertFalse(ReminderPolicy.shouldNotify(at("2026-10-20T20:00"), null, "", ""));
    }

    @Test
    public void backwardClockBeforeEveningCannotDeliverEarly() {
        assertFalse(ReminderPolicy.shouldNotify(at("2026-10-19T18:59"), "2026-10-19", "", ""));
        assertEquals(at("2026-10-19T19:00"), ReminderPolicy.nextEvening(at("2026-10-19T18:59"), "", ""));
    }

    @Test
    public void springDstKeepsLocalEveningWithTwentyThreeHourGap() {
        ZonedDateTime now = at("2026-03-28T19:00");
        ZonedDateTime next = ReminderPolicy.nextEvening(now, "2026-03-28", "");
        assertEquals(at("2026-03-29T19:00"), next);
        assertEquals(23, Duration.between(now, next).toHours());
    }

    @Test
    public void autumnDstKeepsLocalEveningWithTwentyFiveHourGap() {
        ZonedDateTime now = at("2026-10-24T19:00");
        ZonedDateTime next = ReminderPolicy.nextEvening(now, "2026-10-24", "");
        assertEquals(at("2026-10-25T19:00"), next);
        assertEquals(25, Duration.between(now, next).toHours());
    }

    @Test
    public void zoneChangeUsesNewLocalDateAndEvening() {
        ZonedDateTime now = ZonedDateTime.parse("2026-10-19T23:30:00Z")
                .withZoneSameInstant(ZoneId.of("Asia/Shanghai"));
        ZonedDateTime next = ReminderPolicy.nextEvening(now, "2026-10-19", "2026-10-19");
        assertEquals("2026-10-20T19:00+08:00[Asia/Shanghai]", next.toString());
        assertFalse(ReminderPolicy.shouldNotify(now, "2026-10-19", "", ""));
    }

    @Test
    public void backwardCalendarCannotRepeatPreviouslyVisitedOrNotifiedDates() {
        ZonedDateTime now = at("2026-10-19T19:04");
        assertFalse(ReminderPolicy.shouldNotify(now, "2026-10-19", "2026-10-20", ""));
        assertFalse(ReminderPolicy.shouldNotify(now, "2026-10-19", "", "2026-10-20"));
        assertEquals(at("2026-10-21T19:00"), ReminderPolicy.nextEvening(now, "2026-10-20", ""));
        assertEquals(at("2026-10-21T19:00"), ReminderPolicy.nextEvening(now, "", "2026-10-20"));
    }

    @Test
    public void yearBoundaryUsesNextCalendarYear() {
        assertEquals(at("2027-01-01T19:00"), ReminderPolicy.nextEvening(
                at("2026-12-31T23:59"), "2026-12-31", ""));
    }
}
