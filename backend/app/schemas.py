from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel


# Projects
class ProjectOut(BaseModel):
    id: int
    name: str
    slug: str
    platform: Optional[str] = None
    url: Optional[str] = None
    description: Optional[str] = None
    total_strings: int = 0
    translated_strings: int = 0
    reviewed_strings: int = 0

    class Config:
        from_attributes = True


# Queue
class QueueOut(BaseModel):
    id: int
    file_id: Optional[int] = None
    file_path: Optional[str] = None
    project_name: Optional[str] = None
    status: Optional[str] = "waiting"
    total_strings: Optional[int] = 0
    reviewed_count: Optional[int] = 0
    approved_count: Optional[int] = 0
    rejected_count: Optional[int] = 0
    score: Optional[float] = None
    queue_type: Optional[str] = None
    priority: Optional[int] = 0

    class Config:
        from_attributes = True


# Quality checks for review
class QualityCheckOut(BaseModel):
    check_name: str
    severity: str
    message: Optional[str] = None
    auto_fixable: bool = False

    class Config:
        from_attributes = True


# TM match
class TMMatch(BaseModel):
    source: str
    target: str
    origin: Optional[str] = None
    quality: Optional[float] = None


# Review item (next string to review)
class ReviewItem(BaseModel):
    file_string_id: int
    string_id: int
    translation_id: Optional[int] = None
    msgid: str
    msgctxt: Optional[str] = None
    msgstr: Optional[str] = None
    comment: Optional[str] = None
    location: Optional[str] = None
    quality_checks: List[QualityCheckOut] = []
    tm_matches: List[TMMatch] = []
    position: Optional[int] = None
    total: int = 0
    current: int = 0


# Review decision
class ReviewDecision(BaseModel):
    file_string_id: int
    action: str  # approve, reject, edit
    new_msgstr: Optional[str] = None
    notes: Optional[str] = None


# Review stats
class ReviewStats(BaseModel):
    queue_id: int
    total: int
    reviewed: int
    approved: int
    rejected: int
    remaining: int
    score: Optional[float] = None
    status: str


# Terminology
class TermOut(BaseModel):
    id: int
    term_en: str
    term_sv: str
    domain: Optional[str] = None
    context: Optional[str] = None
    note: Optional[str] = None
    is_forbidden: bool = False

    class Config:
        from_attributes = True


class TermIn(BaseModel):
    term_en: str
    term_sv: str
    domain: Optional[str] = ""
    context: Optional[str] = None
    note: Optional[str] = None
    source: Optional[str] = None
    is_forbidden: bool = False


# --- New schemas for v2 endpoints ---

# Dashboard
class DashboardOverview(BaseModel):
    total_projects: int = 0
    total_files: int = 0
    total_strings: int = 0
    translated_strings: int = 0
    untranslated_strings: int = 0
    approved_strings: int = 0
    ai_reviewed: int = 0
    human_reviewed: int = 0
    avg_quality: Optional[float] = None


class DirtyFile(BaseModel):
    file_id: int
    file_path: str
    project_name: Optional[str] = None
    dirty_count: int = 0
    last_export_at: Optional[datetime] = None
    latest_translation_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ActivityItem(BaseModel):
    id: int
    type: str  # review, translation
    string_id: Optional[int] = None
    msgid: Optional[str] = None
    action: Optional[str] = None
    reviewer: Optional[str] = None
    reviewer_type: Optional[str] = None
    notes: Optional[str] = None
    created_at: Optional[datetime] = None


# String detail
class FileUsage(BaseModel):
    file_id: int
    file_path: str
    project_name: Optional[str] = None
    context: Optional[str] = None
    comment: Optional[str] = None
    location: Optional[str] = None

    class Config:
        from_attributes = True


class ReviewOut(BaseModel):
    id: int
    reviewer: str
    reviewer_type: str
    action: str
    old_msgstr: Optional[str] = None
    new_msgstr: Optional[str] = None
    quality_score: Optional[float] = None
    notes: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class TranslationOut(BaseModel):
    id: int
    msgstr: str
    msgstr_plural: Optional[List[str]] = None
    quality_level: int = 0
    confidence: Optional[float] = None
    source: str = ""
    source_detail: Optional[str] = None
    is_approved: bool = False
    is_current: bool = True
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    reviews: List[ReviewOut] = []

    class Config:
        from_attributes = True


class StringDetail(BaseModel):
    id: int
    msgid: str
    msgid_plural: Optional[str] = None
    char_count: int = 0
    word_count: int = 0
    files: List[FileUsage] = []
    translation: Optional[TranslationOut] = None


class StringSearchResult(BaseModel):
    id: int
    msgid: str
    msgstr: Optional[str] = None
    quality_level: Optional[int] = None
    file_count: int = 0


# Translate
class TranslateIn(BaseModel):
    msgstr: str
    source: str = "human"
    quality_level: Optional[int] = None


# AI review
class AIReviewItem(BaseModel):
    string_id: int
    action: str  # approve, reject, edit
    new_msgstr: Optional[str] = None
    notes: Optional[str] = None


class AIReviewBatch(BaseModel):
    reviews: List[AIReviewItem]


class AIStats(BaseModel):
    total_reviewed: int = 0
    approved: int = 0
    rejected: int = 0
    edited: int = 0
    pending: int = 0
    avg_quality: Optional[float] = None


# Untranslated
class UntranslatedString(BaseModel):
    id: int
    msgid: str
    msgid_plural: Optional[str] = None
    char_count: int = 0
    word_count: int = 0
    file_count: int = 0


# Review system
class ReviewDecisionItem(BaseModel):
    translation_id: int
    action: str  # approve/reject/edit
    edited_text: Optional[str] = None
    notes: Optional[str] = None


class ReviewSubmitBody(BaseModel):
    decisions: List[ReviewDecisionItem]
    reviewer: str = "anonymous"
