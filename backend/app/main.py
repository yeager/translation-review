import os
from datetime import datetime
from typing import List
from fastapi import Depends, FastAPI, HTTPException, UploadFile, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from .database import get_db
from .models import (
    File, FileString, Project, Review, ReviewQueue,
    Terminology, Translation, TranslationMemory, TranslationString,
)
from .po_import import import_po_file
from .schemas import (
    ProjectOut, QueueOut, QualityCheckOut, TMMatch,
    ReviewItem, ReviewDecision, ReviewStats,
    TermIn, TermOut,
    DashboardOverview, DirtyFile, ActivityItem,
    StringDetail, StringSearchResult, FileUsage, TranslationOut, ReviewOut,
    TranslateIn, AIReviewBatch, AIStats,
    UntranslatedString, ReviewDecisionItem, ReviewSubmitBody,
)

app = FastAPI(title="Translation Review v2")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/search")
async def search_strings(q: str = Query(..., min_length=1), limit: int = Query(default=50, le=200), db: AsyncSession = Depends(get_db)):
    """Full-text search across msgid and msgstr."""
    search = f"%{q}%"
    results = await db.execute(
        select(TranslationString.id, TranslationString.msgid, Translation.msgstr, Translation.quality_level, Translation.updated_at)
        .join(Translation, Translation.string_id == TranslationString.id)
        .where(Translation.is_current == True)
        .where((TranslationString.msgid.ilike(search)) | (Translation.msgstr.ilike(search)))
        .order_by(TranslationString.id)
        .limit(limit)
    )
    return [{"string_id": r.id, "msgid": r.msgid, "msgstr": r.msgstr, "quality_level": r.quality_level, "updated_at": r.updated_at.isoformat() if r.updated_at else None} for r in results]


# ---------- Dashboard ----------

@app.get("/api/dashboard/overview")
async def dashboard_overview(db: AsyncSession = Depends(get_db)):
    total_projects = (await db.execute(select(func.count()).select_from(Project))).scalar() or 0
    total_files = (await db.execute(select(func.count()).select_from(File))).scalar() or 0
    total_strings = (await db.execute(select(func.count()).select_from(TranslationString))).scalar() or 0

    # Translated = strings with at least one current translation
    translated = (await db.execute(
        select(func.count(func.distinct(Translation.string_id)))
        .where(Translation.is_current == True)
    )).scalar() or 0

    # Approved
    approved = (await db.execute(
        select(func.count(func.distinct(Translation.string_id)))
        .where(Translation.is_current == True, Translation.is_approved == True)
    )).scalar() or 0

    # AI queue count (quality_level 3-5)
    ai_queue = (await db.execute(
        select(func.count(func.distinct(Translation.id)))
        .where(Translation.is_current == True, Translation.quality_level >= 3, Translation.quality_level <= 5)
    )).scalar() or 0

    # AI reviewed (reviewed by ai)
    ai_reviewed = (await db.execute(
        select(func.count(func.distinct(Review.translation_id)))
        .where(Review.reviewer_type == "ai")
    )).scalar() or 0

    # Human reviewed
    human_reviewed = (await db.execute(
        select(func.count(func.distinct(Review.translation_id)))
        .where(Review.reviewer_type == "human")
    )).scalar() or 0

    # Avg quality
    avg_q = (await db.execute(
        select(func.avg(Translation.quality_level))
        .where(Translation.is_current == True, Translation.quality_level > 0)
    )).scalar()

    untranslated = max(0, total_strings - translated)
    return DashboardOverview(
        total_projects=total_projects,
        total_files=total_files,
        total_strings=total_strings,
        translated_strings=translated,
        untranslated_strings=untranslated,
        approved_strings=approved,
        ai_reviewed=ai_queue,  # Show AI queue count instead
        human_reviewed=human_reviewed,
        avg_quality=round(avg_q, 2) if avg_q else None,
    )


@app.get("/api/dashboard/dirty")
async def dashboard_dirty(db: AsyncSession = Depends(get_db)):
    """Files where translations have been updated after last export."""
    # Find files with translations updated after last_export_at
    q = (
        select(
            File.id.label("file_id"),
            File.path.label("file_path"),
            Project.name.label("project_name"),
            File.last_export_at,
            func.count(func.distinct(Translation.id)).label("dirty_count"),
            func.max(Translation.updated_at).label("latest_translation_at"),
        )
        .select_from(File)
        .join(Project, File.project_id == Project.id, isouter=True)
        .join(FileString, FileString.file_id == File.id)
        .join(Translation, Translation.id == FileString.translation_id)
        .where(
            # Either never exported, or translation updated after export
            (File.last_export_at.is_(None)) | (Translation.updated_at > File.last_export_at)
        )
        .group_by(File.id, File.path, Project.name, File.last_export_at)
        .order_by(text("dirty_count DESC"))
    )
    rows = (await db.execute(q)).all()
    return [
        DirtyFile(
            file_id=r.file_id,
            file_path=r.file_path,
            project_name=r.project_name,
            dirty_count=r.dirty_count,
            last_export_at=r.last_export_at,
            latest_translation_at=r.latest_translation_at,
        )
        for r in rows
    ]


@app.get("/api/dashboard/activity")
async def dashboard_activity(db: AsyncSession = Depends(get_db)):
    """Recent reviews and translation changes (last 50)."""
    q = (
        select(Review)
        .options(selectinload(Review.translation).selectinload(Translation.string))
        .order_by(Review.created_at.desc())
        .limit(50)
    )
    reviews = (await db.execute(q)).scalars().all()
    items = []
    for r in reviews:
        items.append(ActivityItem(
            id=r.id,
            type="review",
            string_id=r.translation.string_id if r.translation else None,
            msgid=r.translation.string.msgid if r.translation and r.translation.string else None,
            action=r.action,
            reviewer=r.reviewer,
            reviewer_type=r.reviewer_type,
            notes=r.notes,
            created_at=r.created_at,
        ))
    return items


# ---------- Strings ----------

@app.get("/api/strings/search")
async def search_strings(q: str = Query(min_length=1), db: AsyncSession = Depends(get_db)):
    """Search strings by msgid or msgstr using ILIKE."""
    pattern = f"%{q}%"
    # Subquery for current translation
    trans_sub = (
        select(Translation.string_id, Translation.msgstr, Translation.quality_level)
        .where(Translation.is_current == True)
        .subquery()
    )
    query = (
        select(
            TranslationString.id,
            TranslationString.msgid,
            trans_sub.c.msgstr,
            trans_sub.c.quality_level,
            func.count(func.distinct(FileString.file_id)).label("file_count"),
        )
        .outerjoin(trans_sub, trans_sub.c.string_id == TranslationString.id)
        .outerjoin(FileString, FileString.string_id == TranslationString.id)
        .where(
            TranslationString.msgid.ilike(pattern) | trans_sub.c.msgstr.ilike(pattern)
        )
        .group_by(TranslationString.id, TranslationString.msgid, trans_sub.c.msgstr, trans_sub.c.quality_level)
        .order_by(TranslationString.id)
        .limit(100)
    )
    rows = (await db.execute(query)).all()
    return [
        StringSearchResult(
            id=r.id, msgid=r.msgid, msgstr=r.msgstr,
            quality_level=r.quality_level, file_count=r.file_count,
        )
        for r in rows
    ]


@app.get("/api/strings/untranslated")
async def untranslated_strings(limit: int = Query(default=50, le=500), db: AsyncSession = Depends(get_db)):
    """Strings without any current translation."""
    # Subquery: string_ids that have a current translation
    translated_ids = (
        select(Translation.string_id)
        .where(Translation.is_current == True)
        .subquery()
    )
    q = (
        select(
            TranslationString.id,
            TranslationString.msgid,
            TranslationString.msgid_plural,
            TranslationString.char_count,
            TranslationString.word_count,
            func.count(func.distinct(FileString.file_id)).label("file_count"),
        )
        .outerjoin(FileString, FileString.string_id == TranslationString.id)
        .where(TranslationString.id.notin_(select(translated_ids.c.string_id)))
        .group_by(TranslationString.id)
        .order_by(TranslationString.id)
        .limit(limit)
    )
    rows = (await db.execute(q)).all()
    return [
        UntranslatedString(
            id=r.id, msgid=r.msgid, msgid_plural=r.msgid_plural,
            char_count=r.char_count, word_count=r.word_count, file_count=r.file_count,
        )
        for r in rows
    ]


@app.get("/api/strings/{string_id}")
async def get_string(string_id: int, db: AsyncSession = Depends(get_db)):
    """String details including all files using it, translation, and reviews."""
    s = await db.get(TranslationString, string_id)
    if not s:
        raise HTTPException(404, "String not found")

    # Files using this string
    fs_q = (
        select(FileString)
        .options(selectinload(FileString.file).selectinload(File.project))
        .where(FileString.string_id == string_id)
    )
    file_strings = (await db.execute(fs_q)).scalars().all()
    files = [
        FileUsage(
            file_id=fs.file_id,
            file_path=fs.file.path if fs.file else "",
            project_name=fs.file.project.name if fs.file and fs.file.project else None,
            context=fs.context,
            comment=fs.comment,
            location=fs.location,
        )
        for fs in file_strings
    ]

    # Current translation with reviews
    trans_q = (
        select(Translation)
        .options(selectinload(Translation.reviews))
        .where(Translation.string_id == string_id, Translation.is_current == True)
    )
    trans = (await db.execute(trans_q)).scalars().first()
    translation_out = None
    if trans:
        translation_out = TranslationOut(
            id=trans.id,
            msgstr=trans.msgstr,
            msgstr_plural=trans.msgstr_plural,
            quality_level=trans.quality_level,
            confidence=trans.confidence,
            source=trans.source,
            source_detail=trans.source_detail,
            is_approved=trans.is_approved or False,
            is_current=trans.is_current or True,
            created_at=trans.created_at,
            updated_at=trans.updated_at,
            reviews=[
                ReviewOut(
                    id=rv.id, reviewer=rv.reviewer, reviewer_type=rv.reviewer_type,
                    action=rv.action, old_msgstr=rv.old_msgstr, new_msgstr=rv.new_msgstr,
                    quality_score=rv.quality_score, notes=rv.notes, created_at=rv.created_at,
                )
                for rv in trans.reviews
            ],
        )

    return StringDetail(
        id=s.id, msgid=s.msgid, msgid_plural=s.msgid_plural,
        char_count=s.char_count, word_count=s.word_count,
        files=files, translation=translation_out,
    )


@app.put("/api/strings/{string_id}/translate")
async def translate_string(string_id: int, body: TranslateIn, db: AsyncSession = Depends(get_db)):
    """Update or create translation for a string. Propagates to all files automatically."""
    s = await db.get(TranslationString, string_id)
    if not s:
        raise HTTPException(404, "String not found")

    # Find current translation
    trans = (await db.execute(
        select(Translation).where(
            Translation.string_id == string_id,
            Translation.is_current == True,
        )
    )).scalars().first()

    if trans:
        # Update existing
        trans.msgstr = body.msgstr
        trans.source = body.source
        if body.quality_level is not None:
            trans.quality_level = body.quality_level
        trans.updated_at = func.now()
    else:
        # Create new
        ql = body.quality_level if body.quality_level is not None else (3 if body.source != "human" else 6)
        trans = Translation(
            string_id=string_id,
            msgstr=body.msgstr,
            quality_level=ql,
            source=body.source,
            is_current=True,
            is_approved=False,
            confidence=0.5,
        )
        db.add(trans)
        await db.flush()

        # Link to all file_strings that reference this string
        fs_q = select(FileString).where(
            FileString.string_id == string_id,
            FileString.translation_id.is_(None),
        )
        file_strings = (await db.execute(fs_q)).scalars().all()
        for fs in file_strings:
            fs.translation_id = trans.id

    await db.commit()
    await db.refresh(trans)

    # Count affected files
    affected = (await db.execute(
        select(func.count()).select_from(FileString).where(FileString.string_id == string_id)
    )).scalar() or 0

    return {
        "ok": True,
        "translation_id": trans.id,
        "msgstr": trans.msgstr,
        "quality_level": trans.quality_level,
        "affected_files": affected,
    }


# ---------- AI Queue & Review ----------

@app.get("/api/ai/queue")
async def ai_queue(limit: int = Query(default=50, le=500), db: AsyncSession = Depends(get_db)):
    """Strings needing AI review: quality_level 3-5, no AI review yet."""
    # Subquery: translation_ids already reviewed by AI
    ai_reviewed_ids = (
        select(Review.translation_id)
        .where(Review.reviewer_type == "ai")
        .subquery()
    )
    q = (
        select(
            TranslationString.id.label("string_id"),
            TranslationString.msgid,
            Translation.id.label("translation_id"),
            Translation.msgstr,
            Translation.quality_level,
            Translation.source,
        )
        .join(Translation, Translation.string_id == TranslationString.id)
        .where(
            Translation.is_current == True,
            Translation.quality_level >= 3,
            Translation.quality_level <= 5,
            Translation.id.notin_(select(ai_reviewed_ids.c.translation_id)),
        )
        .order_by(Translation.quality_level.asc(), TranslationString.id)
        .limit(limit)
    )
    rows = (await db.execute(q)).all()
    return [
        {
            "string_id": r.string_id,
            "msgid": r.msgid,
            "translation_id": r.translation_id,
            "msgstr": r.msgstr,
            "quality_level": r.quality_level,
            "source": r.source,
        }
        for r in rows
    ]


@app.post("/api/ai/review")
async def ai_review_batch(body: AIReviewBatch, db: AsyncSession = Depends(get_db)):
    """Batch AI review: approve/reject/edit translations."""
    results = []
    for item in body.reviews:
        # Find current translation for this string
        trans = (await db.execute(
            select(Translation).where(
                Translation.string_id == item.string_id,
                Translation.is_current == True,
            )
        )).scalars().first()
        if not trans:
            results.append({"string_id": item.string_id, "ok": False, "error": "No translation found"})
            continue

        old_msgstr = trans.msgstr

        if item.action == "edit" and item.new_msgstr:
            trans.msgstr = item.new_msgstr
            trans.updated_at = func.now()

        if item.action in ("approve", "edit"):
            trans.quality_level = max(trans.quality_level, 6)  # ai-reviewed
            if item.action == "approve":
                trans.is_approved = True

        review = Review(
            translation_id=trans.id,
            reviewer="ai",
            reviewer_type="ai",
            action=item.action,
            old_msgstr=old_msgstr if item.action == "edit" else None,
            new_msgstr=item.new_msgstr if item.action == "edit" else None,
            notes=item.notes,
        )
        db.add(review)
        results.append({"string_id": item.string_id, "ok": True, "action": item.action})

    await db.commit()
    return {"processed": len(results), "results": results}


@app.get("/api/ai/stats")
async def ai_stats(db: AsyncSession = Depends(get_db)):
    """AI review statistics."""
    total = (await db.execute(
        select(func.count()).select_from(Review).where(Review.reviewer_type == "ai")
    )).scalar() or 0

    approved = (await db.execute(
        select(func.count()).select_from(Review)
        .where(Review.reviewer_type == "ai", Review.action == "approve")
    )).scalar() or 0

    rejected = (await db.execute(
        select(func.count()).select_from(Review)
        .where(Review.reviewer_type == "ai", Review.action == "reject")
    )).scalar() or 0

    edited = (await db.execute(
        select(func.count()).select_from(Review)
        .where(Review.reviewer_type == "ai", Review.action == "edit")
    )).scalar() or 0

    # Pending: quality_level 3-5 with no AI review
    ai_reviewed_ids = (
        select(Review.translation_id)
        .where(Review.reviewer_type == "ai")
        .subquery()
    )
    pending = (await db.execute(
        select(func.count()).select_from(Translation)
        .where(
            Translation.is_current == True,
            Translation.quality_level >= 3,
            Translation.quality_level <= 5,
            Translation.id.notin_(select(ai_reviewed_ids.c.translation_id)),
        )
    )).scalar() or 0

    avg_q = (await db.execute(
        select(func.avg(Review.quality_score))
        .where(Review.reviewer_type == "ai", Review.quality_score.isnot(None))
    )).scalar()

    return AIStats(
        total_reviewed=total, approved=approved, rejected=rejected,
        edited=edited, pending=pending,
        avg_quality=round(avg_q, 2) if avg_q else None,
    )


# ---------- Export PO ----------

@app.post("/api/export/mark/{file_id}")
async def mark_exported(file_id: int, db: AsyncSession = Depends(get_db)):
    """Mark file as exported by setting last_export_at to now."""
    file_rec = await db.get(File, file_id)
    if not file_rec:
        raise HTTPException(404, "File not found")
    
    file_rec.last_export_at = func.now()
    await db.commit()
    
    return {"ok": True, "file_id": file_id, "marked_at": datetime.now()}


@app.get("/api/export/po/{file_id}")
async def export_po(file_id: int, db: AsyncSession = Depends(get_db)):
    """Export file as downloadable PO with current translations."""
    file_rec = await db.get(File, file_id, options=[selectinload(File.project)])
    if not file_rec:
        raise HTTPException(404, "File not found")

    # Get all file_strings with their strings and translations
    q = (
        select(FileString)
        .options(
            selectinload(FileString.string),
            selectinload(FileString.translation),
        )
        .where(FileString.file_id == file_id)
        .order_by(FileString.position)
    )
    file_strings = (await db.execute(q)).scalars().all()

    import polib
    po = polib.POFile()
    po.metadata = {
        "Project-Id-Version": file_rec.project.name if file_rec.project else "",
        "Content-Type": "text/plain; charset=UTF-8",
        "Content-Transfer-Encoding": "8bit",
        "Language": "sv",
    }

    for fs in file_strings:
        if not fs.string:
            continue
        entry = polib.POEntry(
            msgid=fs.string.msgid,
            msgstr=fs.translation.msgstr if fs.translation else "",
            msgctxt=fs.context if fs.context else None,
            comment=fs.comment or "",
        )
        if fs.location:
            # Parse "file:line, file:line" back to occurrences
            occs = []
            for loc in fs.location.split(", "):
                parts = loc.rsplit(":", 1)
                if len(parts) == 2:
                    occs.append((parts[0], parts[1]))
                else:
                    occs.append((loc, ""))
            entry.occurrences = occs
        po.append(entry)

    # Update last_export_at
    file_rec.last_export_at = func.now()
    await db.commit()

    content = str(po).encode("utf-8")
    filename = file_rec.path or f"export_{file_id}.po"
    return Response(
        content=content,
        media_type="application/x-gettext",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------- Projects ----------

@app.get("/api/projects")
async def list_projects(db: AsyncSession = Depends(get_db)):
    q = select(Project).order_by(Project.name)
    projects = (await db.execute(q)).scalars().all()
    results = []
    for p in projects:
        # Get file stats
        stats = await db.execute(
            select(
                func.coalesce(func.sum(File.total_strings), 0),
                func.coalesce(func.sum(File.translated_strings), 0),
            ).where(File.project_id == p.id)
        )
        row = stats.one()
        results.append(ProjectOut(
            id=p.id, name=p.name, slug=p.slug,
            platform=p.platform, url=p.url, description=p.description,
            total_strings=row[0], translated_strings=row[1],
        ))
    return results


# ---------- Queue ----------

@app.get("/api/queue")
async def list_queue(db: AsyncSession = Depends(get_db)):
    q = (
        select(ReviewQueue)
        .options(selectinload(ReviewQueue.file).selectinload(File.project))
        .order_by(ReviewQueue.id.desc())
    )
    items = (await db.execute(q)).scalars().all()
    return [
        QueueOut(
            id=rq.id, file_id=rq.file_id,
            file_path=rq.file.path if rq.file else None,
            project_name=rq.file.project.name if rq.file and rq.file.project else None,
            status=rq.status,
            total_strings=rq.total_strings,
            reviewed_count=rq.reviewed_count,
            approved_count=rq.approved_count,
            rejected_count=rq.rejected_count,
            score=rq.score,
            queue_type=rq.queue_type,
            priority=rq.priority,
        )
        for rq in items
    ]


@app.post("/api/queue/{file_id}/start")
async def start_review(file_id: int, db: AsyncSession = Depends(get_db)):
    file_rec = await db.get(File, file_id, options=[selectinload(File.project)])
    if not file_rec:
        raise HTTPException(404, "File not found")

    # Count file_strings for this file
    total = (await db.execute(
        select(func.count()).select_from(FileString).where(FileString.file_id == file_id)
    )).scalar() or 0

    existing = (await db.execute(
        select(ReviewQueue).where(ReviewQueue.file_id == file_id)
    )).scalar_one_or_none()

    if existing:
        existing.status = "running"
        existing.total_strings = total
        await db.commit()
        await db.refresh(existing)
        rq = existing
    else:
        rq = ReviewQueue(file_id=file_id, status="running", total_strings=total)
        db.add(rq)
        await db.commit()
        await db.refresh(rq)

    return {"id": rq.id, "file_id": file_id, "status": rq.status, "total_strings": total}


# ---------- Review ----------

@app.get("/api/review/{queue_id}/next")
async def next_review_item(queue_id: int, db: AsyncSession = Depends(get_db)):
    rq = await db.get(ReviewQueue, queue_id)
    if not rq:
        raise HTTPException(404, "Queue not found")

    # Find next file_string that hasn't been reviewed
    q = (
        select(FileString)
        .options(
            selectinload(FileString.string),
            selectinload(FileString.translation).selectinload(Translation.quality_checks),
        )
        .where(FileString.file_id == rq.file_id)
        .where(FileString.translation_id.isnot(None))
    )
    all_fs = (await db.execute(q)).scalars().all()

    # Filter out already reviewed ones
    unreviewed = []
    for fs in all_fs:
        if fs.translation:
            has_review = (await db.execute(
                select(func.count()).select_from(Review)
                .where(Review.translation_id == fs.translation_id)
            )).scalar()
            if not has_review:
                unreviewed.append(fs)

    if not unreviewed:
        return None

    fs = unreviewed[0]
    total_with_translation = len(all_fs)
    current_pos = total_with_translation - len(unreviewed) + 1

    # TM search
    tm_matches = []
    if fs.string and fs.string.msgid:
        snippet = fs.string.msgid[:80]
        tm_q = select(TranslationMemory).where(
            TranslationMemory.source.ilike(f"%{snippet}%")
        ).limit(5)
        tm_rows = (await db.execute(tm_q)).scalars().all()
        tm_matches = [TMMatch(source=t.source, target=t.target, origin=t.origin, quality=t.quality) for t in tm_rows]

    checks = []
    if fs.translation:
        checks = [
            QualityCheckOut(
                check_name=qc.check_name, severity=qc.severity,
                message=qc.message, auto_fixable=qc.auto_fixable,
            )
            for qc in fs.translation.quality_checks
        ]

    return ReviewItem(
        file_string_id=fs.id,
        string_id=fs.string_id,
        translation_id=fs.translation_id,
        msgid=fs.string.msgid if fs.string else "",
        msgctxt=fs.context,
        msgstr=fs.translation.msgstr if fs.translation else None,
        comment=fs.comment,
        location=fs.location,
        quality_checks=checks,
        tm_matches=tm_matches,
        total=total_with_translation,
        current=current_pos,
        position=fs.position,
    )


@app.post("/api/review/{queue_id}/decide")
async def submit_decision(queue_id: int, body: ReviewDecision, db: AsyncSession = Depends(get_db)):
    rq = await db.get(ReviewQueue, queue_id)
    if not rq:
        raise HTTPException(404, "Queue not found")

    if body.action not in ("approve", "reject", "edit"):
        raise HTTPException(400, "Action must be approve, reject, or edit")

    # Get file_string to find translation
    fs = await db.get(FileString, body.file_string_id)
    if not fs or fs.file_id != rq.file_id:
        raise HTTPException(400, "String does not belong to this queue")

    if not fs.translation_id:
        raise HTTPException(400, "No translation for this string")

    # Create review
    old_translation = None
    if body.action == "edit":
        t = await db.get(Translation, fs.translation_id)
        if t:
            old_translation = t.msgstr
            t.msgstr = body.new_msgstr or t.msgstr
            t.is_approved = True
            t.quality_level = max(t.quality_level, 5)

    review = Review(
        translation_id=fs.translation_id,
        reviewer="human",
        reviewer_type="human",
        action=body.action,
        old_msgstr=old_translation,
        new_msgstr=body.new_msgstr if body.action == "edit" else None,
        notes=body.notes,
    )
    db.add(review)

    # If approve, mark translation
    if body.action == "approve":
        t = await db.get(Translation, fs.translation_id)
        if t:
            t.is_approved = True
            t.quality_level = max(t.quality_level, 7)

    # Update queue counters
    rq.reviewed_count = (rq.reviewed_count or 0) + 1
    if body.action in ("approve", "edit"):
        rq.approved_count = (rq.approved_count or 0) + 1
    elif body.action == "reject":
        rq.rejected_count = (rq.rejected_count or 0) + 1

    if rq.total_strings and rq.total_strings > 0:
        rq.score = round((rq.approved_count or 0) / rq.total_strings * 100, 1)
    if (rq.reviewed_count or 0) >= (rq.total_strings or 0):
        rq.status = "done"

    await db.commit()
    return {"ok": True, "reviewed": rq.reviewed_count, "remaining": (rq.total_strings or 0) - (rq.reviewed_count or 0)}


@app.get("/api/review/{queue_id}/stats")
async def review_stats(queue_id: int, db: AsyncSession = Depends(get_db)):
    rq = await db.get(ReviewQueue, queue_id)
    if not rq:
        raise HTTPException(404, "Queue not found")
    return ReviewStats(
        queue_id=rq.id, status=rq.status or "waiting",
        total=rq.total_strings or 0,
        reviewed=rq.reviewed_count or 0,
        approved=rq.approved_count or 0,
        rejected=rq.rejected_count or 0,
        remaining=(rq.total_strings or 0) - (rq.reviewed_count or 0),
        score=rq.score,
    )


# ---------- Import PO ----------

@app.post("/api/import/po")
async def import_po(file: UploadFile, project_name: str = Query(default=None), db: AsyncSession = Depends(get_db)):
    if not file.filename or not file.filename.endswith(".po"):
        raise HTTPException(400, "File must be .po")
    content = await file.read()
    result = await import_po_file(db, file.filename, content, project_name)
    return result


# ---------- Translation Memory ----------

@app.get("/api/tm/search")
async def search_tm(q: str = Query(min_length=2), db: AsyncSession = Depends(get_db)):
    query = (
        select(TranslationMemory)
        .where(TranslationMemory.source.ilike(f"%{q}%") | TranslationMemory.target.ilike(f"%{q}%"))
        .limit(50)
    )
    rows = (await db.execute(query)).scalars().all()
    return [TMMatch(source=r.source, target=r.target, origin=r.origin, quality=r.quality) for r in rows]


# ---------- Quality Control (review-po-v3) ----------

@app.post("/api/quality/run/{file_id}")
async def run_quality_check(file_id: int, db: AsyncSession = Depends(get_db)):
    """Run review-po-v3 quality check on exported PO file."""
    file_rec = await db.get(File, file_id, options=[selectinload(File.project)])
    if not file_rec:
        raise HTTPException(404, "File not found")
    
    # First export the file to a temporary location
    import tempfile
    import subprocess
    import json
    
    # Get all file_strings with their strings and translations
    q = (
        select(FileString)
        .options(
            selectinload(FileString.string),
            selectinload(FileString.translation),
        )
        .where(FileString.file_id == file_id)
        .order_by(FileString.position)
    )
    file_strings = (await db.execute(q)).scalars().all()
    
    if not file_strings:
        raise HTTPException(400, "No strings found for this file")
    
    # Create temporary PO file
    import polib
    po = polib.POFile()
    po.metadata = {
        "Project-Id-Version": file_rec.project.name if file_rec.project else "",
        "Content-Type": "text/plain; charset=UTF-8",
        "Content-Transfer-Encoding": "8bit",
        "Language": "sv",
    }
    
    for fs in file_strings:
        if not fs.string:
            continue
        entry = polib.POEntry(
            msgid=fs.string.msgid,
            msgstr=fs.translation.msgstr if fs.translation else "",
            msgctxt=fs.context if fs.context else None,
            comment=fs.comment or "",
        )
        po.append(entry)
    
    with tempfile.NamedTemporaryFile(mode='w', suffix='.po', delete=False) as temp_po:
        po.save(temp_po.name)
        temp_po_path = temp_po.name
    
    try:
        # Run review-po-v3 --quick on the temporary file
        review_po_path = os.environ.get("REVIEW_PO_PATH", os.path.expanduser("~/tools/review-po-v3/review-po-v3.py"))
        
        if not os.path.exists(review_po_path):
            raise HTTPException(500, "review-po-v3 script not found")
        
        # Use --ultra-quick for large files to avoid timeout
        string_count = len([fs for fs in file_strings if fs.string])
        quick_flag = "--ultra-quick" if string_count > 500 else "--quick"
        
        result = subprocess.run([
            "python3", review_po_path, temp_po_path, quick_flag, "-f", "json"
        ], capture_output=True, text=True, timeout=600)
        
        # review-po-v3 outputs progress to stderr and JSON to stdout
        # returncode may be non-zero even with usable output
        combined = result.stdout.strip()
        if not combined:
            combined = result.stderr.strip()
        
        # Try to extract JSON from output (may have non-JSON prefix)
        try:
            quality_data = json.loads(combined)
        except json.JSONDecodeError:
            # Try to find JSON array in output
            import re
            json_match = re.search(r'(\[.*\])', combined, re.DOTALL)
            if json_match:
                try:
                    quality_data = json.loads(json_match.group(1))
                except json.JSONDecodeError:
                    raise HTTPException(500, f"Failed to parse review-po-v3 output: {combined[:500]}")
            else:
                raise HTTPException(500, f"No JSON in review-po-v3 output: {combined[:500]}")
        
        # Clear existing quality checks for this file's translations
        await db.execute(text("""
            DELETE FROM quality_checks 
            WHERE translation_id IN (
                SELECT fs.translation_id 
                FROM file_strings fs 
                WHERE fs.file_id = :file_id AND fs.translation_id IS NOT NULL
            )
        """), {"file_id": file_id})
        
        # Insert new quality checks
        checks_added = 0
        quality_updated = 0
        
        # Mapping from entry number to FileString
        entry_to_fs = {i: fs for i, fs in enumerate(file_strings) if fs.translation}
        
        # review-po-v3 JSON uses 'verdicts' key (not 'entries')
        verdicts = quality_data.get('verdicts', quality_data.get('entries', []))
        
        for entry_data in verdicts:
            entry_idx = entry_data.get('entry_num', 0)
            fs = entry_to_fs.get(entry_idx)
            if not fs or not fs.translation:
                continue
                
            issues = entry_data.get('issues', [])
            verdict = entry_data.get('verdict', 'pass')
            
            # Insert quality checks for each issue
            for issue in issues:
                await db.execute(text("""
                    INSERT INTO quality_checks (translation_id, check_name, severity, message, auto_fixable)
                    VALUES (:translation_id, :check_name, :severity, :message, :auto_fixable)
                """), {
                    "translation_id": fs.translation_id,
                    "check_name": issue.get('type', issue.get('check', 'unknown')),
                    "severity": issue.get('severity', 'warning'),
                    "message": issue.get('message', issue.get('detail', '')),
                    "auto_fixable": issue.get('auto_fixable', False),
                })
                checks_added += 1
            
            # Update quality_level based on verdict
            new_quality_level = {
                'pass': 4,    # All checks passed
                'review': 3,  # Some issues, needs review
                'fail': 2,    # Serious issues
            }.get(verdict, 3)
            
            await db.execute(text("""
                UPDATE translations 
                SET quality_level = :quality_level
                WHERE id = :translation_id
            """), {
                "quality_level": new_quality_level,
                "translation_id": fs.translation_id,
            })
            quality_updated += 1
        
        await db.commit()
        
        # Summary stats from review-po-v3 'stats' key
        summary = quality_data.get('stats', quality_data.get('summary', {}))
        
        return {
            "ok": True,
            "file_id": file_id,
            "checks_added": checks_added,
            "translations_updated": quality_updated,
            "summary": {
                "total_entries": summary.get('total', 0),
                "passed": summary.get('pass', 0),
                "review_needed": summary.get('review', 0),
                "failed": summary.get('fail', 0),
                "score": summary.get('score', 0),
            }
        }
        
    finally:
        # Clean up temporary file
        try:
            os.unlink(temp_po_path)
        except OSError:
            pass


# ---------- Manual Review ----------

@app.get("/api/review/batch")
async def review_batch(limit: int = Query(default=50, le=500), db: AsyncSession = Depends(get_db)):
    """Get next batch of strings for human review."""
    q = (
        select(TranslationString.id.label("string_id"), TranslationString.msgid,
               Translation.id.label("translation_id"), Translation.msgstr,
               Translation.quality_level, Translation.source, Translation.updated_at)
        .join(Translation, Translation.string_id == TranslationString.id)
        .where(Translation.is_current == True, Translation.quality_level < 8,
               Translation.checked_out_by.is_(None))
        .order_by(Translation.quality_level.asc(), TranslationString.id)
        .limit(limit)
    )
    rows = (await db.execute(q)).all()
    return [{"string_id": r.string_id, "msgid": r.msgid, "translation_id": r.translation_id,
             "msgstr": r.msgstr, "quality_level": r.quality_level, "source": r.source,
             "updated_at": r.updated_at.isoformat() if r.updated_at else None} for r in rows]


@app.post("/api/review/submit")
async def review_submit(body: ReviewSubmitBody, db: AsyncSession = Depends(get_db)):
    results = []
    for d in body.decisions:
        trans = await db.get(Translation, d.translation_id)
        if not trans:
            results.append({"translation_id": d.translation_id, "error": "not found"})
            continue
        if d.action == "approve":
            trans.quality_level = max(trans.quality_level, 8)
            trans.is_approved = True
            trans.reviewed_at = func.now()
        elif d.action == "reject":
            trans.quality_level = 2
            trans.is_approved = False
            trans.reviewed_at = func.now()
        elif d.action == "edit" and d.edited_text:
            trans.msgstr = d.edited_text
            trans.quality_level = max(trans.quality_level, 7)
            trans.reviewed_at = func.now()
        trans.checked_out_by = None
        trans.checked_out_at = None
        # Create review record
        review = Review(translation_id=d.translation_id, reviewer_type="human",
                       reviewer=body.reviewer, action=d.action,
                       new_msgstr=d.edited_text, notes=d.notes, quality_score=trans.quality_level)
        db.add(review)
        results.append({"translation_id": d.translation_id, "action": d.action, "ok": True})
    await db.commit()
    return {"reviewed": len(results), "results": results}


@app.get("/api/review/stats")
async def review_stats(db: AsyncSession = Depends(get_db)):
    """Review statistics."""
    total = (await db.execute(select(func.count()).select_from(Review))).scalar() or 0
    today = (await db.execute(
        select(func.count()).select_from(Review).where(func.date(Review.created_at) == func.current_date())
    )).scalar() or 0
    by_type = (await db.execute(
        select(Review.reviewer_type, func.count()).select_from(Review).group_by(Review.reviewer_type)
    )).all()
    return {"total_reviews": total, "today": today,
            "by_type": {r[0]: r[1] for r in by_type}}


@app.post("/api/quality/run-batch")
async def run_quality_batch(file_ids: List[int], db: AsyncSession = Depends(get_db)):
    results = []
    for fid in file_ids[:10]:  # max 10 files at once
        try:
            r = await run_quality_check(fid, db)
            results.append(r)
        except Exception as e:
            results.append({"file_id": fid, "error": str(e)})
    return {"results": results}


# ---------- Terminology ----------

@app.get("/api/terminology")
async def list_terminology(db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(Terminology).order_by(Terminology.term_en))).scalars().all()
    return [TermOut(id=t.id, term_en=t.term_en, term_sv=t.term_sv, domain=t.domain, context=t.context, note=t.note, is_forbidden=t.is_forbidden or False) for t in rows]


@app.post("/api/terminology")
async def add_term(body: TermIn, db: AsyncSession = Depends(get_db)):
    term = Terminology(term_en=body.term_en, term_sv=body.term_sv, domain=body.domain, context=body.context, note=body.note, source=body.source, is_forbidden=body.is_forbidden)
    db.add(term)
    await db.commit()
    await db.refresh(term)
    return TermOut(id=term.id, term_en=term.term_en, term_sv=term.term_sv, domain=term.domain, context=term.context, note=term.note, is_forbidden=term.is_forbidden or False)
