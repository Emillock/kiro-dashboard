"""Tests for bcrypt + JWT security (PBT-02 round-trip, PBT-10 complementary)."""
from __future__ import annotations

from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from backend.core.auth.security import (
    TokenError,
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)


# --- Example-based tests ---

def test_hash_and_verify_correct_password():
    h = hash_password("strongpass1")
    assert verify_password("strongpass1", h) is True


def test_verify_wrong_password_fails():
    h = hash_password("correct")
    assert verify_password("wrong", h) is False


def test_jwt_round_trip():
    token = create_access_token(user_id=42, email="user1@example.com")
    data = decode_access_token(token)
    assert data.user_id == 42
    assert data.email == "user1@example.com"


def test_invalid_token_raises():
    try:
        decode_access_token("not.a.token")
        assert False, "expected TokenError"
    except TokenError:
        pass


def test_tampered_token_raises():
    token = create_access_token(1, "u@a.com")
    tampered = token[:-4] + "XXXX"
    try:
        decode_access_token(tampered)
        assert False, "expected TokenError"
    except TokenError:
        pass


# --- Property-based tests ---

# ASCII-only passwords keep byte length == char length, staying safely under bcrypt's 72-byte limit.
passwords = st.text(
    min_size=8,
    max_size=64,
    alphabet=st.characters(
        whitelist_categories=("Ll", "Lu", "Nd"),
        whitelist_characters="!@#$%",
        blacklist_categories=("Cs",),  # no surrogates
    ),
).filter(lambda p: len(p.encode("utf-8")) <= 72)

user_ids = st.integers(min_value=1, max_value=10_000)
emails = st.sampled_from(["user1@example.com", "user5@example.com", "user8@example.com"])


@settings(max_examples=10, deadline=None,
          suppress_health_check=[HealthCheck.too_slow])
@given(passwords)
def test_password_round_trip(pw):
    """Round-trip: hash then verify always returns True (PBT-02).
    max_examples kept low because bcrypt is intentionally slow."""
    assert verify_password(pw, hash_password(pw)) is True


@settings(max_examples=10, deadline=None,
          suppress_health_check=[HealthCheck.too_slow])
@given(passwords, passwords)
def test_different_passwords_dont_cross_verify(pw1, pw2):
    """Different plaintext passwords must not satisfy each other's hash (PBT-03 invariant)."""
    if pw1 == pw2:
        return
    h = hash_password(pw1)
    assert verify_password(pw2, h) is False


@settings(max_examples=30)
@given(user_ids, emails)
def test_jwt_encode_decode_round_trip(uid, email):
    """JWT encode→decode returns the same user_id and email (PBT-02)."""
    token = create_access_token(user_id=uid, email=email)
    data = decode_access_token(token)
    assert data.user_id == uid
    assert data.email == email
