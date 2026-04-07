import enum


class UserRole(str, enum.Enum):
    worker = "worker"
    admin = "admin"
    superadmin = "superadmin"
