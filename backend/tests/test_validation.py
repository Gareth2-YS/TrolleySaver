from datetime import datetime, timedelta, timezone

import pytest

from common.validation import SGT, observed_too_old, parse_observed_at


def sgt(*args):
    return datetime(*args, tzinfo=SGT)


@pytest.mark.parametrize("now", [
    sgt(2026, 11, 6, 0, 1),    # just after midnight
    sgt(2026, 11, 6, 14, 0),   # mid-afternoon: the case that used to be refused
    sgt(2026, 11, 6, 23, 59),  # just before midnight
])
def test_earliest_date_the_form_offers_is_accepted_all_day(now):
    """The form's earliest date is today - 30 days in Singapore; it must pass whatever the time."""
    assert parse_observed_at("2026-10-07", now) == sgt(2026, 10, 7)


def test_a_date_one_day_older_is_refused():
    with pytest.raises(ValueError, match="within the last 30 days"):
        parse_observed_at("2026-10-06", sgt(2026, 11, 6, 0, 1))


def test_dates_use_the_singapore_day_not_utc():
    # 16:30 UTC on 5 Nov is already 6 Nov in Singapore, so 7 Oct is still the earliest day.
    now = datetime(2026, 11, 5, 16, 30, tzinfo=timezone.utc)
    assert parse_observed_at("2026-10-07", now)
    with pytest.raises(ValueError):
        parse_observed_at("2026-10-06", now)


def test_datetimes_are_still_checked_to_the_moment():
    now = sgt(2026, 11, 6, 14, 0)
    assert parse_observed_at((now - timedelta(days=30) + timedelta(minutes=1)).isoformat(), now)
    with pytest.raises(ValueError, match="within the last 30 days"):
        parse_observed_at((now - timedelta(days=30, minutes=1)).isoformat(), now)


def test_today_and_the_future():
    now = sgt(2026, 11, 6, 9, 0)
    assert parse_observed_at("2026-11-06", now) == sgt(2026, 11, 6)
    with pytest.raises(ValueError, match="future"):
        parse_observed_at("2026-11-07", now)


def test_observed_too_old_compares_singapore_days():
    now = sgt(2026, 11, 6, 23, 0)
    assert not observed_too_old(sgt(2026, 10, 7, 0, 0), now)
    assert observed_too_old(sgt(2026, 10, 6, 23, 59), now)
    # Stored observedAt values are UTC: 16:00Z on 6 Oct is midnight 7 Oct in Singapore.
    assert not observed_too_old(datetime(2026, 10, 6, 16, 0, tzinfo=timezone.utc), now)
