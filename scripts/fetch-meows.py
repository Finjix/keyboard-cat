"""Fetch 30 real CC0 cat recordings from Freesound and BigSoundBank.

No account, API token or runtime network access is required. Provenance is
checked against each sound's own page and recorded alongside the downloaded files.
"""
import concurrent.futures
import hashlib
import json
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlparse

import requests
from audio_credits import write_audio_credits

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "src/renderer/assets/meows"
SOUNDS = [110011, 508686, 795848, 732521, 412017, 763906, 479272, 534269,
          581532, 868095, 868094, 331626, 538527, 668816, 528197, 581534,
          372900, 264507, 138044, -1889, 454805, 845517, 866535, 859734,
          618900, 333916, 668632, -1890, 200344, 825631]
SAVED = json.loads((DEST / 'sources.json').read_text(encoding='utf-8')) if (DEST / 'sources.json').exists() else []
KNOWN = {r['freesound_id']: r['source'] for r in SAVED if 'freesound_id' in r}


class SoundPage(HTMLParser):
    def __init__(self):
        super().__init__()
        self.player = None
        self.meta = {}
        self.cc0 = False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if "data-sound-id" in a and "data-mp3" in a:
            self.player = a
        if tag == "meta" and "content" in a:
            self.meta[a.get("name", a.get("property", ""))] = a["content"]
        if tag == "a" and "creativecommons.org/publicdomain/zero/1.0" in a.get("href", ""):
            self.cc0 = True


def fetch(item):
    index, sound_id = item
    filename = f"meow-{index:02d}.mp3"
    for record in SAVED:
        if record.get('freesound_id', -record.get('bigsoundbank_id', 0)) == sound_id and record['file'] == filename:
            data = (DEST / filename).read_bytes()
            if hashlib.sha256(data).hexdigest() == record['sha256']:
                if sound_id > 0:
                    record['creator'] = unquote(urlparse(record['source']).path.split('/')[2])
                return record
    if sound_id < 0:
        number = -sound_id
        source = f'https://bigsoundbank.com/miaulement-chat-{number - 1888}-s{number}.html'
        page = requests.get(source, timeout=30)
        page.raise_for_status()
        assert 'CC0' in page.text and 'Joseph SARDIN' in page.text
        match = re.search(r'/UPLOAD/mp3/\d+\.mp3', page.text)
        assert match
        download = 'https://bigsoundbank.com' + match[0]
        response = requests.get(download, timeout=30)
        response.raise_for_status()
        assert len(response.content) > 2000
        (DEST / filename).write_bytes(response.content)
        return dict(file=filename, bigsoundbank_id=number, title=f'Meow Cat #{number - 1888}',
                    creator='Joseph SARDIN', source=source, download=download,
                    description='A meowing cat. Realistic indoor recording.',
                    license='CC0-1.0', license_url='https://creativecommons.org/publicdomain/zero/1.0/',
                    sha256=hashlib.sha256(response.content).hexdigest())
    source = KNOWN.get(sound_id, f"https://freesound.org/s/{sound_id}/")
    page = requests.get(source, timeout=30)
    page.raise_for_status()
    parsed = SoundPage()
    parsed.feed(page.text)
    assert parsed.cc0 and parsed.player, f"CC0 not verified: {source}"
    p = parsed.player
    assert int(p["data-sound-id"]) == sound_id
    download = p["data-mp3"].replace("-lq.mp3", "-hq.mp3")
    response = requests.get(download, timeout=30)
    response.raise_for_status()
    assert len(response.content) > 2000 and "audio" in response.headers.get("Content-Type", "")
    filename = f"meow-{index:02d}.mp3"
    (DEST / filename).write_bytes(response.content)
    return dict(file=filename, freesound_id=sound_id, title=p["data-title"],
                creator=unquote(urlparse(page.url).path.split('/')[2]), source=page.url, download=download,
                description=parsed.meta.get("twitter:description", ""),
                duration_seconds=float(p["data-duration"]), license="CC0-1.0",
                license_url="https://creativecommons.org/publicdomain/zero/1.0/",
                sha256=hashlib.sha256(response.content).hexdigest())


if __name__ == "__main__":
    DEST.mkdir(parents=True, exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        records = list(pool.map(fetch, enumerate(SOUNDS, 1)))
    assert len(records) == len({r["sha256"] for r in records}) == 30
    (DEST / "sources.json").write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_audio_credits()
    print(f"Downloaded {len(records)} unique recordings, {sum((DEST / r['file']).stat().st_size for r in records)} bytes.")
