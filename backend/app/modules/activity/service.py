from typing import Any

from sqlalchemy.orm import Session

from app.models import AuditLog, User


def log(
    db: Session,
    user: User | None,
    action: str,
    entity: str,
    entity_id: int | None,
    summary: str,
    details: dict[str, Any] | None = None,
) -> None:
    """Record an action in the same transaction as the change itself."""
    db.add(
        AuditLog(
            user_id=user.id if user else None,
            action=action,
            entity=entity,
            entity_id=entity_id,
            summary=summary,
            details=details,
        )
    )


def rupees(n: int) -> str:
    """₹1,200 / ₹1,20,000 (Indian grouping)."""
    s = str(abs(n))
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        s = ",".join(groups) + "," + tail
    return f"{'-' if n < 0 else ''}₹{s}"
