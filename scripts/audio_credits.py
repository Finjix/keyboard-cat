"""Write the combined attribution file included in portable distributions."""
import json
from pathlib import Path


def write_audio_credits():
    root = Path(__file__).resolve().parents[1]
    records = []
    for directory in ['meows', 'animals']:
        manifest = root / 'src/renderer/assets' / directory / 'sources.json'
        if manifest.exists():
            records.extend(json.loads(manifest.read_text(encoding='utf-8')))
    cats = sum(r.get('category', 'cat') == 'cat' for r in records)
    dogs = sum(r.get('category') == 'dog' for r in records)
    lines = [f'Mengshu sound pool: {len(records)} clips ({cats} cats, {dogs} dogs, {len(records) - cats - dogs} other animal/novelty sounds).',
             'Sources: Freesound public HQ MP3 previews BigSoundBank MP3 downloads, and Directory.audio public previews.',
             'License verified per recording: CC0-1.0',
             'https://creativecommons.org/publicdomain/zero/1.0/',
             'No pitch shifting. Extra animal clips are trimmed, converted to mono, and faded.', '']
    for record in records:
        lines.append(f"{record['file']} | {record['title']} | {record['creator']} | {record['source']}")
    (root / 'build/meow-audio-credits.txt').write_text('\n'.join(lines) + '\n', encoding='utf-8')
