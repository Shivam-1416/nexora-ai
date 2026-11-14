"""Create the first NEXORA administrator before exposing the public reverse proxy.

Run inside the backend container:
    docker compose exec backend python bootstrap_admin.py

This command refuses to create an account if any user already exists.
It uses the same registration and password-hashing implementation as the API.
"""
from getpass import getpass

import main
from fastapi import HTTPException


def main_cli() -> None:
    with main.get_connection() as conn:
        existing_users = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]

    if existing_users:
        raise SystemExit(
            "Bootstrap refused: this database already contains user accounts. "
            "Use the existing Admin account to manage users."
        )

    print("Create the initial NEXORA AI administrator.")
    email = input("Admin email: ").strip()
    full_name = input("Admin full name: ").strip()
    password = getpass("Admin password (minimum 10 characters): ")
    confirmation = getpass("Confirm password: ")

    if password != confirmation:
        raise SystemExit("Passwords do not match.")
    if len(password) < 10:
        raise SystemExit("Password must contain at least 10 characters.")

    try:
        registration = main.register_user(
            main.RegisterRequest(
                email=email,
                full_name=full_name,
                password=password,
                role="Admin",
            )
        )
        # The API registration function creates a login session. This CLI
        # intentionally does not hand that token to a terminal, so revoke the
        # undisclosed bootstrap session and require a normal interactive login.
        token = registration.get("access_token")
        if token:
            with main.get_connection() as conn:
                conn.execute(
                    "DELETE FROM auth_sessions WHERE token_hash = ?",
                    (main._token_digest(token),),
                )
    except HTTPException as exc:
        detail = exc.detail if isinstance(exc.detail, str) else "Administrator creation failed."
        raise SystemExit(f"Bootstrap failed: {detail}") from None

    # Deliberately do not print or expose the one-time session token returned
    # by the registration function. Sign in through the normal login screen.
    print(f"Initial administrator created for {email}. Sign in through the NEXORA AI application.")


if __name__ == "__main__":
    main_cli()
