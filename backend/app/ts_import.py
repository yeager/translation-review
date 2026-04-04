import xml.etree.ElementTree as ET
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from .models import File, FileString, Project, Translation, TranslationString
import hashlib

def hash_string(msgid: str, context: str = '') -> bytes:
    key = f"{context}\x04{msgid}" if context else msgid
    return hashlib.sha256(key.encode('utf-8')).digest()

async def import_ts_file(db: AsyncSession, content: bytes, filename: str, project_name: str = None):
    """Import a Qt .ts translation file."""
    root = ET.fromstring(content)
    language = root.get('language', 'sv')
    
    if not project_name:
        project_name = filename.replace('.ts', '').replace('_sv', '').replace('_' + language, '')
    
    # Get or create project
    project = (await db.execute(
        select(Project).where(Project.name == project_name)
    )).scalar_one_or_none()
    if not project:
        project = Project(name=project_name, slug=project_name.lower().replace(' ', '-'))
        db.add(project)
        await db.flush()
    
    # Get or create file
    file_rec = (await db.execute(
        select(File).where(File.project_id == project.id, File.path == filename)
    )).scalar_one_or_none()
    if not file_rec:
        file_rec = File(project_id=project.id, path=filename, format='ts')
        db.add(file_rec)
        await db.flush()
    
    imported = 0
    skipped = 0
    position = 0
    
    for context_elem in root.findall('.//context'):
        context_name = context_elem.findtext('name', '')
        
        for msg in context_elem.findall('message'):
            source = msg.findtext('source', '')
            trans_elem = msg.find('translation')
            translation_text = trans_elem.text or '' if trans_elem is not None else ''
            trans_type = trans_elem.get('type', '') if trans_elem is not None else ''
            
            if not source:
                continue
            
            # Skip vanished
            if trans_type == 'vanished':
                skipped += 1
                continue
            
            # Location info
            loc_elem = msg.find('location')
            location = ''
            if loc_elem is not None:
                loc_file = loc_elem.get('filename', '')
                loc_line = loc_elem.get('line', '')
                location = f"{loc_file}:{loc_line}" if loc_file else ''
            
            # Comment
            comment = msg.findtext('comment', '')
            
            # Hash includes context for uniqueness
            string_hash = hash_string(source, context_name)
            
            # Get or create string
            existing = (await db.execute(
                select(TranslationString).where(
                    TranslationString.hash == string_hash
                )
            )).scalar_one_or_none()
            
            if not existing:
                string_rec = TranslationString(
                    hash=string_hash, msgid=source, 
                    char_count=len(source), word_count=len(source.split())
                )
                db.add(string_rec)
                await db.flush()
                string_id = string_rec.id
            else:
                string_id = existing.id
            
            # Create or update translation
            existing_trans = (await db.execute(
                select(Translation).where(
                    Translation.string_id == string_id, Translation.is_current == True
                )
            )).scalar_one_or_none()
            
            quality_level = 1 if not translation_text else (3 if trans_type == 'unfinished' else 4)
            
            if existing_trans:
                if existing_trans.msgstr != translation_text:
                    existing_trans.msgstr = translation_text
                    existing_trans.quality_level = quality_level
                    existing_trans.updated_at = func.now()
                translation_id = existing_trans.id
            else:
                trans = Translation(
                    string_id=string_id, msgstr=translation_text,
                    quality_level=quality_level, source='ts_import',
                    is_current=True, is_approved=False
                )
                db.add(trans)
                await db.flush()
                translation_id = trans.id
            
            # Link to file
            existing_fs = (await db.execute(
                select(FileString).where(
                    FileString.file_id == file_rec.id,
                    FileString.string_id == string_id,
                    FileString.context == context_name
                )
            )).scalar_one_or_none()
            
            if not existing_fs:
                fs = FileString(
                    file_id=file_rec.id, string_id=string_id,
                    translation_id=translation_id, position=position,
                    context=context_name, location=location, comment=comment
                )
                db.add(fs)
            
            imported += 1
            position += 1
    
    file_rec.total_strings = position
    file_rec.translated_strings = imported
    await db.commit()
    
    return {
        "file_id": file_rec.id,
        "project": project_name,
        "imported": imported,
        "skipped": skipped,
        "language": language
    }