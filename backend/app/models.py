from datetime import datetime
from typing import Optional, List

from sqlalchemy import (
    Boolean, DateTime, Float, ForeignKey, Integer, BigInteger,
    SmallInteger, String, Text, LargeBinary, func, ARRAY,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    slug: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    platform: Mapped[Optional[str]] = mapped_column(Text)
    platform_id: Mapped[Optional[str]] = mapped_column(Text)
    url: Mapped[Optional[str]] = mapped_column(Text)
    description: Mapped[Optional[str]] = mapped_column(Text)
    domain: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now())

    files: Mapped[List["File"]] = relationship(back_populates="project")
    sync_history: Mapped[List["SyncHistory"]] = relationship(back_populates="project")


class File(Base):
    __tablename__ = "files"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[Optional[int]] = mapped_column(ForeignKey("projects.id"))
    path: Mapped[str] = mapped_column(Text, nullable=False)
    format: Mapped[str] = mapped_column(Text, nullable=False)
    upstream_url: Mapped[Optional[str]] = mapped_column(Text)
    total_strings: Mapped[Optional[int]] = mapped_column(Integer, default=0)
    translated_strings: Mapped[Optional[int]] = mapped_column(Integer, default=0)
    last_import_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    last_export_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now())

    project: Mapped[Optional[Project]] = relationship(back_populates="files")
    file_strings: Mapped[List["FileString"]] = relationship(back_populates="file")
    review_queue: Mapped[List["ReviewQueue"]] = relationship(back_populates="file")


class TranslationString(Base):
    __tablename__ = "strings"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    hash: Mapped[bytes] = mapped_column(LargeBinary, nullable=False, unique=True)
    msgid: Mapped[str] = mapped_column(Text, nullable=False)
    msgid_plural: Mapped[Optional[str]] = mapped_column(Text)
    char_count: Mapped[int] = mapped_column(Integer, nullable=False)
    word_count: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # tsv is a generated column, read-only

    file_strings: Mapped[List["FileString"]] = relationship(back_populates="string")
    translations: Mapped[List["Translation"]] = relationship(back_populates="string")


class FileString(Base):
    __tablename__ = "file_strings"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    file_id: Mapped[Optional[int]] = mapped_column(ForeignKey("files.id"))
    string_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("strings.id"))
    context: Mapped[Optional[str]] = mapped_column(Text, default="")
    comment: Mapped[Optional[str]] = mapped_column(Text)
    location: Mapped[Optional[str]] = mapped_column(Text)
    ui_type: Mapped[Optional[str]] = mapped_column(Text)
    translation_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("translations.id"))
    position: Mapped[Optional[int]] = mapped_column(Integer)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now())

    file: Mapped[Optional[File]] = relationship(back_populates="file_strings")
    string: Mapped[Optional[TranslationString]] = relationship(back_populates="file_strings")
    translation: Mapped[Optional["Translation"]] = relationship(foreign_keys=[translation_id])


class Translation(Base):
    __tablename__ = "translations"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    string_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("strings.id"))
    context_key: Mapped[Optional[str]] = mapped_column(Text)
    msgstr: Mapped[str] = mapped_column(Text, nullable=False)
    msgstr_plural: Mapped[Optional[list]] = mapped_column(ARRAY(Text))
    quality_level: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    confidence: Mapped[Optional[float]] = mapped_column(Float, default=0.0)
    source: Mapped[str] = mapped_column(Text, nullable=False)
    source_detail: Mapped[Optional[str]] = mapped_column(Text)
    is_approved: Mapped[Optional[bool]] = mapped_column(Boolean, default=False)
    is_current: Mapped[Optional[bool]] = mapped_column(Boolean, default=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now())
    created_by: Mapped[Optional[str]] = mapped_column(Text)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now())
    checked_out_by: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    checked_out_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    # tsv_target is a generated column, read-only

    string: Mapped[Optional[TranslationString]] = relationship(back_populates="translations")
    quality_checks: Mapped[List["QualityCheck"]] = relationship(back_populates="translation")
    quality_tags: Mapped[List["QualityTag"]] = relationship(back_populates="translation")
    reviews: Mapped[List["Review"]] = relationship(back_populates="translation")


class QualityCheck(Base):
    __tablename__ = "quality_checks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    translation_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("translations.id", ondelete="CASCADE"))
    check_name: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[str] = mapped_column(Text, nullable=False)
    message: Mapped[Optional[str]] = mapped_column(Text)
    auto_fixable: Mapped[Optional[bool]] = mapped_column(Boolean, default=False)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now())

    translation: Mapped[Optional[Translation]] = relationship(back_populates="quality_checks")


class QualityTag(Base):
    __tablename__ = "quality_tags"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    translation_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("translations.id"))
    tag: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[str] = mapped_column(Text, nullable=False)
    detail: Mapped[Optional[str]] = mapped_column(Text)
    auto_fixable: Mapped[Optional[bool]] = mapped_column(Boolean, default=False)
    suggested_fix: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now())
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    resolved_by: Mapped[Optional[str]] = mapped_column(Text)

    translation: Mapped[Optional[Translation]] = relationship(back_populates="quality_tags")


class Review(Base):
    __tablename__ = "reviews"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    translation_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("translations.id"))
    reviewer: Mapped[str] = mapped_column(Text, nullable=False)
    reviewer_type: Mapped[str] = mapped_column(Text, nullable=False)
    action: Mapped[str] = mapped_column(Text, nullable=False)  # approve, reject, edit
    old_msgstr: Mapped[Optional[str]] = mapped_column(Text)
    new_msgstr: Mapped[Optional[str]] = mapped_column(Text)
    quality_score: Mapped[Optional[float]] = mapped_column(Float)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now())

    translation: Mapped[Optional[Translation]] = relationship(back_populates="reviews")


class Terminology(Base):
    __tablename__ = "terminology"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    term_en: Mapped[str] = mapped_column(Text, nullable=False)
    term_sv: Mapped[str] = mapped_column(Text, nullable=False)
    domain: Mapped[Optional[str]] = mapped_column(Text, default="")
    context: Mapped[Optional[str]] = mapped_column(Text)
    note: Mapped[Optional[str]] = mapped_column(Text)
    source: Mapped[Optional[str]] = mapped_column(Text)
    is_forbidden: Mapped[Optional[bool]] = mapped_column(Boolean, default=False)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TranslationMemory(Base):
    __tablename__ = "translation_memory"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source: Mapped[str] = mapped_column(Text, nullable=False)
    target: Mapped[str] = mapped_column(Text, nullable=False)
    origin: Mapped[Optional[str]] = mapped_column(Text)
    quality: Mapped[Optional[float]] = mapped_column(Float)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SyncHistory(Base):
    __tablename__ = "sync_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[Optional[int]] = mapped_column(ForeignKey("projects.id"))
    file_id: Mapped[Optional[int]] = mapped_column(Integer)
    direction: Mapped[str] = mapped_column(Text, nullable=False)
    platform: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False)
    strings_affected: Mapped[Optional[int]] = mapped_column(Integer, default=0)
    detail: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now())

    project: Mapped[Optional[Project]] = relationship(back_populates="sync_history")


class ReviewQueue(Base):
    __tablename__ = "review_queue"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    file_id: Mapped[Optional[int]] = mapped_column(ForeignKey("files.id", ondelete="CASCADE"))
    status: Mapped[Optional[str]] = mapped_column(Text, default="waiting")
    total_strings: Mapped[Optional[int]] = mapped_column(Integer)
    reviewed_count: Mapped[Optional[int]] = mapped_column(Integer, default=0)
    approved_count: Mapped[Optional[int]] = mapped_column(Integer, default=0)
    rejected_count: Mapped[Optional[int]] = mapped_column(Integer, default=0)
    score: Mapped[Optional[float]] = mapped_column(Float)
    queue_type: Mapped[Optional[str]] = mapped_column(Text)  # human or ai
    priority: Mapped[Optional[int]] = mapped_column(Integer, default=0)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), server_default=func.now())

    file: Mapped[Optional[File]] = relationship(back_populates="review_queue")
