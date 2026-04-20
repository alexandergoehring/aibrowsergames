#!/usr/bin/env python3
"""
Lädt die Fotos für das Deutsche-Städte-Quiz von Wikimedia Commons herunter.
Einmal ausführen, danach funktioniert das Quiz offline.

Verwendung:
    python3 bilder_herunterladen.py

Benötigt: Python 3 (keine externen Pakete nötig)
"""

import urllib.request
import urllib.parse
import json
import os
import time

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
IMAGE_DIR = os.path.join(SCRIPT_DIR, "images")

# Suchbegriffe für die Wikimedia Commons Such-API
LANDMARKS = [
    {
        "id": "berlin",
        "city": "Berlin",
        "search_terms": ["Brandenburger Tor abends", "Brandenburg Gate Berlin"],
    },
    {
        "id": "muenchen",
        "city": "München",
        "search_terms": ["Frauenkirche Munich", "München Frauenkirche"],
    },
    {
        "id": "hamburg",
        "city": "Hamburg",
        "search_terms": ["Elbphilharmonie Hamburg"],
    },
    {
        "id": "koeln",
        "city": "Köln",
        "search_terms": ["Kölner Dom", "Cologne Cathedral"],
    },
    {
        "id": "frankfurt",
        "city": "Frankfurt",
        "search_terms": ["Skyline Frankfurt am Main"],
    },
    {
        "id": "dresden",
        "city": "Dresden",
        "search_terms": ["Frauenkirche Dresden", "Dresden Frauenkirche"],
    },
    {
        "id": "heidelberg",
        "city": "Heidelberg",
        "search_terms": ["Heidelberg Schloss", "Heidelberg Castle"],
    },
    {
        "id": "duesseldorf",
        "city": "Düsseldorf",
        "search_terms": ["Rheinturm Düsseldorf", "Düsseldorf Rheinturm"],
    },
    {
        "id": "nuernberg",
        "city": "Nürnberg",
        "search_terms": ["Kaiserburg Nürnberg", "Nuremberg Castle"],
    },
    {
        "id": "leipzig",
        "city": "Leipzig",
        "search_terms": ["Völkerschlachtdenkmal Leipzig", "Battle of Nations monument Leipzig"],
    },
]

HEADERS = {"User-Agent": "StaedteQuiz/1.0 (Educational quiz game; Python urllib)"}


def api_request(params):
    """Sendet eine Anfrage an die Wikimedia Commons API."""
    api_url = "https://commons.wikimedia.org/w/api.php"
    params["format"] = "json"
    url = f"{api_url}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=15) as response:
        return json.loads(response.read().decode())


def search_image(search_term):
    """
    Sucht auf Wikimedia Commons nach einem Bild per Such-API.
    Gibt die URL des ersten JPEG/PNG-Treffers zurück (skaliert auf 1024px).
    """
    try:
        # Schritt 1: Suche nach Dateien
        data = api_request({
            "action": "query",
            "generator": "search",
            "gsrsearch": f"filetype:bitmap {search_term}",
            "gsrnamespace": "6",  # File namespace
            "gsrlimit": "5",
            "prop": "imageinfo",
            "iiprop": "url|size|mime",
            "iiurlwidth": "1024",
        })

        pages = data.get("query", {}).get("pages", {})
        if not pages:
            return None

        # Sortiere nach Index (Relevanz)
        sorted_pages = sorted(pages.values(), key=lambda p: p.get("index", 999))

        for page in sorted_pages:
            imageinfo = page.get("imageinfo", [])
            if not imageinfo:
                continue
            info = imageinfo[0]

            # Nur Bilder, keine SVGs/PDFs etc.
            mime = info.get("mime", "")
            if mime not in ("image/jpeg", "image/png"):
                continue

            # Mindestens 400px breit
            width = info.get("width", 0)
            if width < 400:
                continue

            # Bevorzuge Thumbnail (skaliert auf 1024px)
            thumb = info.get("thumburl")
            if thumb:
                return thumb
            return info.get("url")

    except Exception:
        pass
    return None


def download_image(url, filepath, retries=3):
    """Lädt ein Bild herunter. Wiederholt automatisch bei Rate-Limiting."""
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=30) as response:
                data = response.read()
                if len(data) < 5000:
                    return False
                with open(filepath, "wb") as f:
                    f.write(data)
                return True
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < retries - 1:
                wait = 4 * (attempt + 1)
                print(f"\n    ⏸ Rate-Limit, warte {wait}s...", end="", flush=True)
                time.sleep(wait)
                continue
            return False
        except Exception:
            return False
    return False


def main():
    os.makedirs(IMAGE_DIR, exist_ok=True)

    print("=" * 55)
    print("  Deutsche Städte Quiz — Bilder herunterladen")
    print("=" * 55)
    print()

    success_count = 0
    fail_list = []

    for idx, landmark in enumerate(LANDMARKS):
        city = landmark["city"]
        img_id = landmark["id"]
        filepath = os.path.join(IMAGE_DIR, f"{img_id}.jpg")

        # Überspringe bereits heruntergeladene Bilder
        if os.path.exists(filepath) and os.path.getsize(filepath) > 10000:
            print(f"  ✓ {city:15s} — bereits vorhanden")
            success_count += 1
            continue

        # Lösche evtl. kaputte Datei
        if os.path.exists(filepath):
            os.remove(filepath)

        # Pause zwischen Downloads
        if idx > 0:
            time.sleep(2)

        print(f"  ⏳ {city:15s} — suche Bild...", end="", flush=True)

        downloaded = False
        for search_term in landmark["search_terms"]:
            url = search_image(search_term)
            if url:
                print(f"\r  ⬇ {city:15s} — lade herunter...", end="", flush=True)
                if download_image(url, filepath):
                    print(f"\r  ✓ {city:15s} — heruntergeladen   ")
                    success_count += 1
                    downloaded = True
                    break
            time.sleep(1)  # Pause zwischen Suchanfragen

        if not downloaded:
            print(f"\r  ✗ {city:15s} — FEHLGESCHLAGEN")
            fail_list.append(city)

    print()
    print("-" * 55)
    print(f"  Ergebnis: {success_count}/10 Bilder erfolgreich geladen")

    if fail_list:
        print(f"  Fehlend: {', '.join(fail_list)}")
        print()
        print("  Tipp: Fehlende Bilder manuell als JPG in den")
        print(f"  Ordner '{IMAGE_DIR}' legen.")
        print("  Dateinamen: " + ", ".join(
            f"{l['id']}.jpg" for l in LANDMARKS if l["city"] in fail_list
        ))
    else:
        print()
        print("  Alle Bilder sind da! Öffne jetzt 'quiz.html'")
        print("  im Browser, um das Quiz zu spielen.")

    print("=" * 55)


if __name__ == "__main__":
    main()
