"""Import a PO file into the database using the real schema with dedup."""
import hashlib
from io import BytesIO

import polib
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import (
    File, FileString, Project, TranslationString, Translation,
)


def _string_hash(msgid: str, msgctxt: str = "") -> bytes:
    """SHA-256 hash for deduplication."""
    key = f"{msgctxt}\x00{msgid}" if msgctxt else msgid
    return hashlib.sha256(key.encode("utf-8")).digest()


def _slugify(name: str) -> str:
    import re
    slug = name.lower().strip()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    return slug.strip("-")[:100]


async def import_po_file(
    db: AsyncSession,
    filename: str,
    content: bytes,
    project_name: str | None = None,
) -> dict:
    """Parse PO and upsert project → file → strings → translations."""
    po = polib.pofile(content.decode("utf-8", errors="replace"))

    # Project name from parameter or PO header or filename
    pname = project_name or po.metadata.get("Project-Id-Version", "").strip() or filename.replace(".po", "")
    slug = _slugify(pname)

    # Upsert project
    proj = (await db.execute(select(Project).where(Project.slug == slug))).scalar_one_or_none()
    if not proj:
        proj = Project(name=pname, slug=slug, platform="local")
        db.add(proj)
        await db.flush()

    # Upsert file
    file_rec = (await db.execute(
        select(File).where(File.project_id == proj.id, File.path == filename)
    )).scalar_one_or_none()
    if not file_rec:
        file_rec = File(project_id=proj.id, path=filename, format="po")
        db.add(file_rec)
        await db.flush()

    imported = 0
    translated = 0
    skipped = 0

    entries = [e for e in po if not e.obsolete]

    for pos, entry in enumerate(entries):
        msgid = entry.msgid
        msgctxt = entry.msgctxt or ""
        if not msgid:
            skipped += 1
            continue

        h = _string_hash(msgid, msgctxt)

        # Upsert string (global dedup by hash)
        string_rec = (await db.execute(
            select(TranslationString).where(TranslationString.hash == h)
        )).scalar_one_or_none()
        if not string_rec:
            string_rec = TranslationString(
                hash=h,
                msgid=msgid,
                msgid_plural=entry.msgid_plural or None,
                char_count=len(msgid),
                word_count=len(msgid.split()),
            )
            db.add(string_rec)
            await db.flush()

        # Upsert translation if msgstr exists
        translation_id = None
        if entry.msgstr and entry.msgstr.strip():
            trans = (await db.execute(
                select(Translation).where(
                    Translation.string_id == string_rec.id,
                    Translation.is_current == True,
                )
            )).scalar_one_or_none()
            if not trans:
                trans = Translation(
                    string_id=string_rec.id,
                    msgstr=entry.msgstr,
                    quality_level=3,  # imported = DeepL level
                    source="po-import",
                    is_current=True,
                    is_approved=False,
                    confidence=0.5,
                )
                db.add(trans)
                await db.flush()
            else:
                # Update existing
                trans.msgstr = entry.msgstr
                await db.flush()
            translation_id = trans.id
            translated += 1

        # Upsert file_string (link file ↔ string)
        fs = (await db.execute(
            select(FileString).where(
                FileString.file_id == file_rec.id,
                FileString.string_id == string_rec.id,
                FileString.context == msgctxt,
            )
        )).scalar_one_or_none()
        if not fs:
            fs = FileString(
                file_id=file_rec.id,
                string_id=string_rec.id,
                context=msgctxt,
                comment="\n".join(entry.comment.split("\n")) if entry.comment else None,
                location=", ".join(f"{f}:{l}" for f, l in entry.occurrences) if entry.occurrences else None,
                translation_id=translation_id,
                position=pos,
            )
            db.add(fs)
        else:
            fs.translation_id = translation_id
            fs.position = pos

        imported += 1

    # Update file stats
    file_rec.total_strings = imported
    file_rec.translated_strings = translated

    await db.commit()

    return {
        "project": pname,
        "file": filename,
        "imported": imported,
        "translated": translated,
        "skipped": skipped,
    }
