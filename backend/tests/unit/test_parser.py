"""Tests for the dynamic CSV parser (US-DATA-03).

Includes example-based tests (concrete real-world samples) and property-based tests (Hypothesis)
for the invariants identified in the Unit 1 plan (PBT-01, PBT-02, PBT-03, PBT-10).
"""
from __future__ import annotations

import csv
import io

from hypothesis import given, settings
from hypothesis import strategies as st

from backend.core.ingestion.parser import discover_message_columns, parse_report

# --- Example-based tests ---

STABLE_HEADER = (
    "Date,UserId,Client_Type,Chat_Conversations,Credits_Used,Overage_Cap,"
    "Overage_Credits_Used,Overage_Enabled,ProfileId,Subscription_Tier,Total_Messages"
)


def test_parse_stable_only_row():
    csv_text = (
        STABLE_HEADER
        + "\n2026-04-09,user-1,KIRO_IDE,7,8.25,10000.0,0.0,true,arn:profile,PRO,38\n"
    )
    records = parse_report(csv_text)
    assert len(records) == 1
    r = records[0]
    assert r.user_id == "user-1"
    assert r.client_type == "KIRO_IDE"
    assert r.chat_conversations == 7
    assert r.total_messages == 38
    assert r.subscription_tier == "PRO"
    assert r.model_messages == {}


def test_parse_dynamic_model_columns():
    header = STABLE_HEADER + ",auto_messages,claude_opus_4.8_messages,New_User,User_Email"
    row = "2026-06-01,user-2,KIRO_IDE,3,10.0,10000.0,0.0,false,arn,PRO_PLUS,116,40,76,true,user1@example.com"
    records = parse_report(header + "\n" + row + "\n")
    assert len(records) == 1
    r = records[0]
    assert r.model_messages == {"auto_messages": 40, "claude_opus_4.8_messages": 76}
    assert r.user_email == "user1@example.com"
    assert r.new_user is True


def test_unknown_columns_ignored():
    header = STABLE_HEADER + ",some_future_column"
    row = "2026-06-01,user-3,KIRO_CLI,1,1.0,10000.0,0.0,false,arn,PRO,10,whatever"
    records = parse_report(header + "\n" + row + "\n")
    assert len(records) == 1
    assert records[0].total_messages == 10


def test_missing_values_default_to_zero():
    header = STABLE_HEADER + ",auto_messages"
    row = "2026-06-01,user-4,KIRO_IDE,,,,,,,,,"  # mostly empty
    records = parse_report(header + "\n" + row + "\n")
    assert len(records) == 1
    r = records[0]
    assert r.total_messages == 0
    assert r.chat_conversations == 0
    assert r.credits_used == 0.0


def test_rows_without_userid_or_date_skipped():
    header = STABLE_HEADER
    rows = (
        header
        + "\n,no-date-user,KIRO_IDE,1,1.0,1.0,0.0,false,arn,PRO,5"   # no date
        + "\n2026-06-01,,KIRO_IDE,1,1.0,1.0,0.0,false,arn,PRO,5\n"   # no user id
    )
    assert parse_report(rows) == []


def test_empty_input():
    assert parse_report("") == []
    assert parse_report("   ") == []


def test_discover_message_columns():
    header = ["Date", "UserId", "auto_messages", "claude_opus_4.8_messages", "Total_Messages"]
    # Total_Messages must NOT be treated as a per-model column.
    assert discover_message_columns(header) == ["auto_messages", "claude_opus_4.8_messages"]


# --- Property-based tests (Hypothesis) ---

@st.composite
def csv_documents(draw):
    """Generate a random-but-valid report CSV plus the set of message columns it contains."""
    base_cols = [
        "Date", "UserId", "Client_Type", "Chat_Conversations", "Credits_Used",
        "Overage_Cap", "Overage_Credits_Used", "Overage_Enabled", "ProfileId",
        "Subscription_Tier", "Total_Messages",
    ]
    model_cols = draw(
        st.lists(
            st.sampled_from(["auto_messages", "claude_opus_4.8_messages", "glm_5_messages"]),
            unique=True, min_size=0, max_size=3,
        )
    )
    extra_cols = draw(st.lists(st.sampled_from(["New_User", "User_Email"]), unique=True, max_size=2))
    header = base_cols + model_cols + extra_cols

    n_rows = draw(st.integers(min_value=1, max_value=6))
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(header)
    for i in range(n_rows):
        row = []
        for col in header:
            if col == "Date":
                row.append("2026-06-01")
            elif col == "UserId":
                row.append(f"user-{i}")
            elif col == "Client_Type":
                row.append("KIRO_IDE")
            elif col in ("Chat_Conversations", "Total_Messages") or col in model_cols:
                row.append(str(draw(st.integers(min_value=0, max_value=500))))
            elif col in ("Credits_Used", "Overage_Cap", "Overage_Credits_Used"):
                row.append("1.5")
            elif col == "Overage_Enabled":
                row.append("false")
            elif col == "New_User":
                row.append("true")
            elif col == "User_Email":
                row.append(f"user{i}@example.com")
            else:
                row.append("x")
        writer.writerow(row)
    return out.getvalue(), set(model_cols)


@settings(max_examples=100)
@given(csv_documents())
def test_parse_records_match_row_count_and_message_cols(doc):
    csv_text, model_cols = doc
    records = parse_report(csv_text)
    # Every data row produced a record (all rows have valid date + user id).
    assert len(records) == csv_text.strip().count("\n")  # header + n rows - 1 == n rows
    # Each record's model_messages keys are exactly the message columns in the doc.
    for r in records:
        assert set(r.model_messages.keys()) == model_cols


@settings(max_examples=100)
@given(csv_documents())
def test_parsed_counts_are_non_negative(doc):
    csv_text, _ = doc
    for r in parse_report(csv_text):
        assert r.total_messages >= 0
        assert r.chat_conversations >= 0
        assert all(v >= 0 for v in r.model_messages.values())
