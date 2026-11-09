"""Turn a checkout of main into the release site (run by tools/publish_release.sh).

- The website (option 2) becomes the home page at "/" and /option-2/ forwards there.
- The preview bar is removed.
- partner.* visitors to "/" go to the partner portal.
- The reviews section is left out while it still holds placeholder quotes.
"""
import re, pathlib

pub = pathlib.Path(__file__).resolve().parent.parent / 'public'
site = (pub / 'option-2' / 'index.html').read_text()

# preview bar and its script
site = re.sub(r'<div id="ltc-preview-bar".*?</div>\s*</div>\s*<script>.*?</script>\s*', '', site, count=1, flags=re.S)
site = re.sub(r'<title>[^<]*</title>', '<title>Liberty Tool Company</title>', site, count=1)

# placeholder reviews stay off the release site
if "[Approved" in site:
    site = re.sub(r'<!-- REVIEWS -->\s*<section id="reviews".*?</section>\s*', '', site, count=1, flags=re.S)

redirect = ("<script>if(/^partner\\./.test(location.hostname)){location.replace('/partner-portal/option-2/');}</script>")
site = site.replace('<meta charset="utf-8">', '<meta charset="utf-8">' + redirect, 1)

(pub / 'index.html').write_text(site)
(pub / 'option-2' / 'index.html').write_text(
    '<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex">'
    '<script>location.replace("/"+location.hash);</script>'
    '<meta http-equiv="refresh" content="0; url=/"><link rel="canonical" href="/"><a href="/">Continue</a>\n')
print('release build: home page =', len(site), 'bytes; reviews', 'removed' if 'id="reviews"' not in site else 'kept')
