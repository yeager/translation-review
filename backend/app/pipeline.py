"""
TR v2 Pipeline — the automation core.

Pipeline stages for a file:
  1. IMPORT     — parse PO/TS, store strings+translations
  2. TM_MATCH   — match untranslated/low-quality against Translation Memory
  3. DEEPL_FILL — translate remaining untranslated via DeepL
  4. QUALITY    — run review-po-v3 checks, tag issues
  5. AUTO_APPROVE — auto-approve strings that pass all checks + TM match ≥95%
  6. QUEUE      — remaining strings go to human review queue, worst first

Each stage updates quality_level:
  0 = untranslated
  1 = rejected
  2 = auto-fail (review-po-v3 fail)
  3 = machine-translated (DeepL, no review)
  5 = auto-pass (review-po-v3 pass, no human review)
  7 = TM-matched (≥95% TM match, auto-approved)
  9 = human-approved
  10 = human-approved + visually tested
"""

import os
import subprocess
import tempfile
import hashlib
import json
import asyncio
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select, func, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from .models import (
    File, FileString, Project, Translation, TranslationString,
    TranslationMemory, QualityCheck, QualityTag, Review, ReviewQueue,
)


async def run_pipeline(
    file_id: int,
    db: AsyncSession,
    stages: list[str] | None = None,
    deepl_api_key: str | None = None,
) -> dict:
    """
    Run the full pipeline (or selected stages) on a file.
    Returns summary of what happened.
    """
    allowed_stages = ["tm_match", "deepl_fill", "quality", "auto_approve", "queue"]
    if stages is None:
        stages = allowed_stages
    
    f = (await db.execute(select(File).where(File.id == file_id))).scalar()
    if not f:
        return {"error": "File not found"}
    
    result = {
        "file_id": file_id,
        "stages": {},
        "started_at": datetime.now(timezone.utc).isoformat(),
    }
    
    if "tm_match" in stages:
        result["stages"]["tm_match"] = await stage_tm_match(file_id, db)
    
    if "deepl_fill" in stages:
        key = deepl_api_key or os.environ.get("DEEPL_API_KEY", "")
        if key:
            result["stages"]["deepl_fill"] = await stage_deepl_fill(file_id, db, key)
        else:
            result["stages"]["deepl_fill"] = {"skipped": True, "reason": "No DeepL API key"}
    
    if "quality" in stages:
        result["stages"]["quality"] = await stage_quality_check(file_id, db)
    
    if "auto_approve" in stages:
        result["stages"]["auto_approve"] = await stage_auto_approve(file_id, db)
    
    if "queue" in stages:
        result["stages"]["queue"] = await stage_queue_for_review(file_id, db)
    
    result["completed_at"] = datetime.now(timezone.utc).isoformat()
    return result


async def stage_tm_match(file_id: int, db: AsyncSession) -> dict:
    """Match strings against Translation Memory. Update quality_level for good matches."""
    # Get strings needing TM match (quality < 5)
    q = text("""
        SELECT fs.id as fs_id, s.msgid, t.id as trans_id, t.msgstr, t.quality_level
        FROM file_strings fs
        JOIN strings s ON s.id = fs.string_id
        JOIN translations t ON t.id = fs.translation_id
        WHERE fs.file_id = :file_id AND t.quality_level < 7
    """)
    rows = (await db.execute(q, {"file_id": file_id})).mappings().all()
    
    if not rows:
        return {"matched": 0, "total": 0}
    
    # Get all TM entries
    tm_entries = (await db.execute(
        select(TranslationMemory).where(TranslationMemory.quality >= 0.8)
    )).scalars().all()
    
    if not tm_entries:
        return {"matched": 0, "total": len(rows), "reason": "No TM entries"}
    
    # Build TM lookup (exact match for now, fuzzy later)
    tm_map = {}
    for tm in tm_entries:
        tm_map[tm.source.strip().lower()] = (tm.target, tm.quality or 0.9)
    
    matched = 0
    for r in rows:
        key = r["msgid"].strip().lower()
        if key in tm_map:
            target, quality = tm_map[key]
            # Update translation if TM quality is better
            if r["quality_level"] < 7:
                await db.execute(
                    update(Translation)
                    .where(Translation.id == r["trans_id"])
                    .values(
                        msgstr=target,
                        quality_level=7,
                        source="tm",
                        source_detail=f"TM exact match (q={quality:.2f})",
                        updated_at=func.now(),
                    )
                )
                matched += 1
    
    if matched:
        await db.commit()
    return {"matched": matched, "total": len(rows)}


async def stage_deepl_fill(file_id: int, db: AsyncSession, api_key: str) -> dict:
    """Translate untranslated strings via DeepL."""
    import httpx
    
    # Get untranslated or empty strings
    q = text("""
        SELECT fs.id, s.msgid, t.id as trans_id, t.msgstr, t.quality_level
        FROM file_strings fs
        JOIN strings s ON s.id = fs.string_id
        JOIN translations t ON t.id = fs.translation_id
        WHERE fs.file_id = :file_id AND (t.msgstr = '' OR t.msgstr IS NULL OR t.quality_level = 0)
    """)
    rows = (await db.execute(q, {"file_id": file_id})).mappings().all()
    
    if not rows:
        return {"translated": 0, "total": 0}
    
    # Batch translate via DeepL
    translated = 0
    batch_size = 50
    
    async with httpx.AsyncClient() as client:
        for i in range(0, len(rows), batch_size):
            batch = rows[i:i+batch_size]
            texts = [r["msgid"] for r in batch]
            
            try:
                resp = await client.post(
                    "https://api-free.deepl.com/v2/translate",
                    data={
                        "auth_key": api_key,
                        "text": texts,
                        "source_lang": "EN",
                        "target_lang": "SV",
                    },
                    timeout=30.0,
                )
                if resp.status_code != 200:
                    continue
                
                translations = resp.json().get("translations", [])
                for j, tr in enumerate(translations):
                    if j < len(batch):
                        await db.execute(
                            update(Translation)
                            .where(Translation.id == batch[j]["trans_id"])
                            .values(
                                msgstr=tr["text"],
                                quality_level=3,
                                source="deepl",
                                source_detail="DeepL API",
                                updated_at=func.now(),
                            )
                        )
                        translated += 1
            except Exception as e:
                continue  # Log but don't fail
    
    if translated:
        await db.commit()
    return {"translated": translated, "total": len(rows)}


async def generate_po_from_db(file_id: int, db: AsyncSession) -> str:
    """Generate a temporary PO file from database strings for quality checking."""
    q = text("""
        SELECT s.msgid, t.msgstr, fs.position, fs.context, fs.comment
        FROM file_strings fs
        JOIN strings s ON s.id = fs.string_id
        JOIN translations t ON t.id = fs.translation_id
        WHERE fs.file_id = :file_id
        ORDER BY fs.position
    """)
    rows = (await db.execute(q, {"file_id": file_id})).mappings().all()
    
    if not rows:
        return None
    
    # Build PO file content
    lines = []
    lines.append('msgid ""')
    lines.append('msgstr ""')
    lines.append('"Content-Type: text/plain; charset=UTF-8\\n"')
    lines.append('"Content-Transfer-Encoding: 8bit\\n"')
    lines.append('"Language: sv\\n"')
    lines.append('')
    
    for r in rows:
        if r["comment"]:
            lines.append(f'#. {r["comment"]}')
        if r["context"]:
            lines.append(f'msgctxt "{_po_escape(r["context"])}"')
        
        msgid = r["msgid"] or ""
        msgstr = r["msgstr"] or ""
        
        if '\n' in msgid:
            lines.append('msgid ""')
            for part in msgid.split('\n'):
                lines.append(f'"{_po_escape(part)}\\n"')
        else:
            lines.append(f'msgid "{_po_escape(msgid)}"')
        
        if '\n' in msgstr:
            lines.append('msgstr ""')
            for part in msgstr.split('\n'):
                lines.append(f'"{_po_escape(part)}\\n"')
        else:
            lines.append(f'msgstr "{_po_escape(msgstr)}"')
        lines.append('')
    
    tmp = tempfile.NamedTemporaryFile(suffix='.po', delete=False, mode='w', encoding='utf-8')
    tmp.write('\n'.join(lines))
    tmp.close()
    return tmp.name


def _po_escape(s):
    """Escape string for PO file."""
    return s.replace('\\', '\\\\').replace('"', '\\"').replace('\t', '\\t')


async def stage_quality_check(file_id: int, db: AsyncSession) -> dict:
    """Run review-po-v3 quality checks on the file."""
    review_script = os.path.expanduser("~/tools/review-po-v3/review-po-v3.py")
    if not os.path.exists(review_script):
        return {"error": "review-po-v3 not found", "path": review_script}
    
    # Generate PO file from DB
    po_path = await generate_po_from_db(file_id, db)
    if not po_path:
        return {"error": "No strings in file"}
    
    # Get string count for mode selection
    count_q = text("SELECT COUNT(*) FROM file_strings WHERE file_id = :fid")
    string_count = (await db.execute(count_q, {"fid": file_id})).scalar() or 0
    
    # Adaptive mode: ultra-quick for large files
    mode = "--ultra-quick" if string_count > 500 else "--quick"
    
    try:
        result = subprocess.run(
            ["python3", review_script, mode, "-f", "json", po_path],
            capture_output=True, timeout=300, text=True,
        )
        # Clean up temp file
        os.unlink(po_path)
        
        # review-po-v3 may exit non-zero when it finds issues, but still produces valid JSON on stdout
        stdout = result.stdout.strip()
        if not stdout:
            if result.returncode != 0:
                return {"error": f"review-po-v3 failed (no output): {result.stderr[:300]}"}
            return {"error": "review-po-v3 produced no output"}
        
        data = json.loads(stdout)
    except subprocess.TimeoutExpired:
        os.unlink(po_path)
        return {"error": "Quality check timed out (300s)"}
    except json.JSONDecodeError:
        return {"error": f"Invalid JSON from review-po-v3. stdout: {result.stdout[:200]}"}
    except Exception as e:
        if os.path.exists(po_path):
            os.unlink(po_path)
        return {"error": str(e)[:200]}
    
    # Process results — update quality levels based on check results
    issues = data.get("issues", [])
    passed = data.get("passed", 0)
    failed = data.get("failed", 0)
    
    # Map msgid -> issues
    issue_map = {}
    for issue in issues:
        msgid = issue.get("msgid", "")
        if msgid not in issue_map:
            issue_map[msgid] = []
        issue_map[msgid].append(issue)
    
    # Update translations based on results
    q = text("""
        SELECT s.msgid, t.id as trans_id, t.quality_level
        FROM file_strings fs
        JOIN strings s ON s.id = fs.string_id
        JOIN translations t ON t.id = fs.translation_id
        WHERE fs.file_id = :file_id
    """)
    rows = (await db.execute(q, {"file_id": file_id})).mappings().all()
    
    auto_fail = 0
    auto_pass = 0
    for r in rows:
        if r["msgid"] in issue_map:
            # Has issues — mark as fail if currently below pass
            if r["quality_level"] < 5:
                await db.execute(
                    update(Translation)
                    .where(Translation.id == r["trans_id"])
                    .values(quality_level=2, updated_at=func.now())
                )
                auto_fail += 1
        else:
            # No issues — mark as pass if currently just machine-translated
            if r["quality_level"] <= 3:
                await db.execute(
                    update(Translation)
                    .where(Translation.id == r["trans_id"])
                    .values(quality_level=5, updated_at=func.now())
                )
                auto_pass += 1
    
    if auto_fail or auto_pass:
        await db.commit()
    
    return {
        "total_checked": len(rows),
        "issues_found": len(issues),
        "auto_fail": auto_fail,
        "auto_pass": auto_pass,
        "mode": mode,
    }


async def stage_db_quality_checks(file_id: int, db: AsyncSession) -> dict:
    """Run DB-level quality checks that review-po-v3 might miss."""
    checks = {
        "newline_mismatch": """
            UPDATE translations SET quality_level = 2, is_approved = false
            WHERE id IN (
                SELECT t.id FROM file_strings fs
                JOIN strings s ON s.id = fs.string_id
                JOIN translations t ON t.id = fs.translation_id
                WHERE fs.file_id = :file_id
                AND t.quality_level >= 2
                AND (LENGTH(s.msgid) - LENGTH(REPLACE(s.msgid, E'\n', ''))) !=
                    (LENGTH(t.msgstr) - LENGTH(REPLACE(t.msgstr, E'\n', '')))
            )
        """,
        "plugin_untranslated": """
            UPDATE translations SET quality_level = 2, is_approved = false
            WHERE id IN (
                SELECT t.id FROM file_strings fs
                JOIN translations t ON t.id = fs.translation_id
                WHERE fs.file_id = :file_id
                AND t.quality_level >= 2
                AND (t.msgstr ILIKE '% plugin %' OR t.msgstr ILIKE '% plugins %'
                     OR t.msgstr ILIKE '%plugin.' OR t.msgstr ILIKE '%plugins.'
                     OR t.msgstr ILIKE '%plugin,' OR t.msgstr ILIKE '%plugins,')
            )
        """,
        "vanligen": """
            UPDATE translations SET quality_level = 2, is_approved = false
            WHERE id IN (
                SELECT t.id FROM file_strings fs
                JOIN translations t ON t.id = fs.translation_id
                WHERE fs.file_id = :file_id
                AND t.quality_level >= 2
                AND t.msgstr ILIKE '%vänligen%'
            )
        """,
        "format_mismatch": """
            UPDATE translations SET quality_level = 2, is_approved = false
            WHERE id IN (
                SELECT t.id FROM file_strings fs
                JOIN strings s ON s.id = fs.string_id
                JOIN translations t ON t.id = fs.translation_id
                WHERE fs.file_id = :file_id
                AND t.quality_level >= 2
                AND s.msgid LIKE '%\\%s%'
                AND (
                    (LENGTH(s.msgid) - LENGTH(REPLACE(s.msgid, '%s', ''))) / 2 !=
                    (LENGTH(t.msgstr) - LENGTH(REPLACE(t.msgstr, '%s', ''))) / 2
                )
            )
        """,
    }
    
    results = {}
    for name, sql in checks.items():
        r = await db.execute(text(sql), {"file_id": file_id})
        results[name] = r.rowcount
    
    await db.commit()
    total_failed = sum(results.values())
    return {"checks": results, "total_failed": total_failed}


async def stage_auto_approve(file_id: int, db: AsyncSession) -> dict:
    """Auto-approve strings that pass ALL quality checks (Q5+Q7 only, not Q3)."""
    # First run DB-level checks to catch what review-po-v3 missed
    db_results = await stage_db_quality_checks(file_id, db)
    
    # Only auto-approve Q7 (TM-matched) — Q5 needs human review
    result = await db.execute(text("""
        UPDATE translations SET
            quality_level = 9,
            is_approved = true,
            source = COALESCE(source, 'auto'),
            source_detail = COALESCE(source_detail, '') || ' [auto-approved]',
            updated_at = NOW()
        WHERE id IN (
            SELECT t.id FROM file_strings fs
            JOIN translations t ON t.id = fs.translation_id
            WHERE fs.file_id = :file_id
              AND t.quality_level = 7
              AND t.is_approved = false
        )
    """), {"file_id": file_id})
    
    approved = result.rowcount
    await db.commit()
    return {"auto_approved": approved, "db_checks": db_results}


async def stage_queue_for_review(file_id: int, db: AsyncSession) -> dict:
    """Queue strings that need human review (quality < 5, not approved)."""
    # Count strings needing review
    q = text("""
        SELECT COUNT(*) FROM file_strings fs
        JOIN translations t ON t.id = fs.translation_id
        WHERE fs.file_id = :file_id AND t.quality_level < 5 AND t.is_approved = false
    """)
    needs_review = (await db.execute(q, {"file_id": file_id})).scalar() or 0
    
    if needs_review == 0:
        return {"queued": 0, "message": "All strings approved or passing"}
    
    # Create or update review queue entry
    existing = (await db.execute(
        select(ReviewQueue).where(ReviewQueue.file_id == file_id, ReviewQueue.status != "completed")
    )).scalar()
    
    if existing:
        existing.total_strings = needs_review
        existing.status = "waiting"
    else:
        rq = ReviewQueue(
            file_id=file_id,
            status="waiting",
            total_strings=needs_review,
            queue_type="human",
            priority=needs_review,  # More strings = higher priority
        )
        db.add(rq)
    
    await db.commit()
    return {"queued": needs_review}


async def get_review_strings(
    file_id: int,
    db: AsyncSession,
    offset: int = 0,
    limit: int = 20,
) -> dict:
    """Get strings that need human review, worst quality first."""
    q = text("""
        SELECT s.msgid, t.id as translation_id, t.msgstr, t.quality_level,
               t.source, t.source_detail, fs.position, fs.context, fs.comment,
               s.char_count, s.word_count
        FROM file_strings fs
        JOIN strings s ON s.id = fs.string_id
        JOIN translations t ON t.id = fs.translation_id
        WHERE fs.file_id = :file_id
          AND t.quality_level < 5
          AND t.is_approved = false
        ORDER BY t.quality_level ASC, fs.position ASC
        OFFSET :offset LIMIT :limit
    """)
    rows = (await db.execute(q, {"file_id": file_id, "offset": offset, "limit": limit})).mappings().all()
    
    count_q = text("""
        SELECT COUNT(*) FROM file_strings fs
        JOIN translations t ON t.id = fs.translation_id
        WHERE fs.file_id = :file_id AND t.quality_level < 5 AND t.is_approved = false
    """)
    total = (await db.execute(count_q, {"file_id": file_id})).scalar() or 0
    
    # Get TM suggestions for each string
    result_strings = []
    for r in rows:
        # Find TM matches
        tm_q = text("""
            SELECT target, quality, origin FROM translation_memory
            WHERE LOWER(source) = LOWER(:msgid)
            ORDER BY quality DESC LIMIT 3
        """)
        tm_matches = (await db.execute(tm_q, {"msgid": r["msgid"]})).mappings().all()
        
        result_strings.append({
            "translation_id": r["translation_id"],
            "msgid": r["msgid"],
            "msgstr": r["msgstr"],
            "quality_level": r["quality_level"],
            "source": r["source"],
            "position": r["position"],
            "context": r["context"],
            "comment": r["comment"],
            "char_count": r["char_count"],
            "word_count": r["word_count"],
            "tm_suggestions": [
                {"target": m["target"], "quality": m["quality"], "origin": m["origin"]}
                for m in tm_matches
            ],
        })
    
    return {"total": total, "strings": result_strings}
