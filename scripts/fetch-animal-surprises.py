"""Download 1 dog sound and 8 other animal/novelty sounds (requests + FFmpeg)."""
import hashlib
import json
import re
import shutil
import subprocess
from html import unescape
from pathlib import Path

import requests
from audio_credits import write_audio_credits

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'src/renderer/assets/animals'
SOUNDS = [
    ('dog-01.mp3', 'dog', 'barking-of-a-spitz-s0682'),
    ('other-07.mp3', 'bird', 'eurasian-jay-1-s3453'),
    ('other-08.mp3', 'human-cat-imitation', 'cat-meow-made-with-mouth-s0926'),
    ('other-01.mp3', 'duck', 'ducks-s0276'),
    ('other-02.mp3', 'rooster', 'song-of-rooster-s0283'),
    ('other-03.mp3', 'cow', 'cow-moos-3-s2383'),
    ('other-04.mp3', 'sheep', 'sheep-1-s2343'),
    ('other-05.mp3', 'pig-imitation', 'grumpy-pig-1-s1658'),
    ('other-06.mp3', 'donkey', 'donkey-braying-2-s1550'),
]


def fetch(filename, category, slug, saved):
    source = f'https://bigsoundbank.com/{slug}.html'
    target = DEST / filename
    if filename in saved and target.exists():
        record = saved[filename]
        if record['source'] == source and hashlib.sha256(target.read_bytes()).hexdigest() == record['sha256']:
            return record
    page = requests.get(source, timeout=30)
    page.raise_for_status()
    text = unescape(re.sub('<[^>]+>', ' ', page.text))
    assert 'CC0 (public domain)' in text, f'CC0 not verified: {source}'
    title = unescape(re.sub('<[^>]+>', '', re.search(r'<h1[^>]*>(.*?)</h1>', page.text, re.S)[1])).strip()
    author = re.search(r'Author\s*:\s*(.*?)\s*Sound number', text, re.S)[1].strip()
    download = 'https://bigsoundbank.com' + re.search(r'/UPLOAD/mp3/\d+\.mp3', page.text)[0]
    audio = requests.get(download, timeout=30)
    audio.raise_for_status()
    filters = 'silenceremove=start_periods=1:start_duration=0.02:start_threshold=-40dB,afade=t=in:d=0.015,afade=t=out:st=2.7:d=0.1'
    subprocess.run([shutil.which('ffmpeg') or 'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
                    '-i', 'pipe:0', '-af', filters, '-t', '2.8', '-ac', '1', '-ar', '44100',
                    '-c:a', 'libmp3lame', '-b:a', '128k', str(target)], input=audio.content, check=True)
    return dict(file=filename, category=category, title=title, creator=author, source=source,
                download=download, license='CC0-1.0',
                license_url='https://creativecommons.org/publicdomain/zero/1.0/',
                original_sha256=hashlib.sha256(audio.content).hexdigest(),
                sha256=hashlib.sha256(target.read_bytes()).hexdigest(),
                edits='Remove leading silence (-40dB); retain first <=2.8s; mono 44100Hz MP3; 15ms fade-in and 100ms fade-out at 2.7s. No pitch shifting.')


if __name__ == '__main__':
    DEST.mkdir(parents=True, exist_ok=True)
    manifest = DEST / 'sources.json'
    saved = {r['file']: r for r in json.loads(manifest.read_text(encoding='utf-8'))} if manifest.exists() else {}
    records = [fetch(*item, saved) for item in SOUNDS]
    assert len(records) == len({r['sha256'] for r in records}) == 9
    manifest.write_text(json.dumps(records, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    write_audio_credits()
    print('Prepared 1 dog clip and 8 other animal/novelty clips.')
