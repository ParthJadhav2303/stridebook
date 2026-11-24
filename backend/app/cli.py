"""Admin commands, run inside the api container:

docker compose exec api python -m app.cli create-user --username mom --name "Mom" --role admin
"""

import argparse
import getpass
import sys

from sqlalchemy import select

from app.core.db import SessionLocal
from app.core.security import hash_password
from app.models import User


def create_user(args: argparse.Namespace) -> int:
    username = args.username.strip().lower()
    password = args.password or getpass.getpass("Password (min 8 characters): ")
    if len(password) < 8:
        print("Password must be at least 8 characters.")
        return 1
    with SessionLocal() as db:
        if db.scalar(select(User).where(User.username == username)):
            print(f"User '{username}' already exists.")
            return 1
        db.add(
            User(
                username=username,
                full_name=args.name,
                role=args.role,
                password_hash=hash_password(password),
                is_active=True,
                token_version=0,
            )
        )
        db.commit()
    print(f"Created {args.role} '{username}'.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("create-user", help="Create an admin or coach login")
    p.add_argument("--username", required=True)
    p.add_argument("--name", required=True)
    p.add_argument("--role", choices=["admin", "coach"], default="admin")
    p.add_argument("--password", help="Omit to be prompted (safer)")
    p.set_defaults(func=create_user)
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
