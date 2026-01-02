"""
Database connection module for invoice creation.
This is a simplified version - use your existing database.py if you have one.
Just ensure it exports: get_db, Base, SessionLocal
"""
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from typing import Generator
import os

# Use your existing database URL configuration
DATABASE_URL = os.environ.get("DATABASE_URL") or os.environ.get("DATABASE_PRIVATE_URL")

if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is required")

# Fix postgres:// to postgresql:// for SQLAlchemy compatibility
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=300,
    pool_size=5,
    max_overflow=10,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db() -> Generator:
    """Database dependency for FastAPI"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

