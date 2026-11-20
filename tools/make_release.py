"""Turn a checkout of main into the release site (run by tools/publish_release.sh).

- The website (option 2) becomes the home page at "/" and /option-2/ forwards there.
- The preview bar is removed.
- partner.* visitors to "/" go to the partner portal.
- The reviews section is left out while it still holds placeholder quotes.
- Google Tag Manager (GTM-N4DHV9J6) is added to the website, privacy, terms and ambassador-terms pages.
- The home page is indexable: the preview's robots noindex tag is removed and a canonical URL is added.
  Portal, admin and other mockup pages keep their noindex tags.
- robots.txt and sitemap.xml are written for the public pages.
"""
import re, pathlib

pub = pathlib.Path(__file__).resolve().parent.parent / 'public'
site = (pub / 'option-2' / 'index.html').read_text()

# preview bar and its script
site = re.sub(r'<div id="ltc-preview-bar".*?</div>\s*</div>\s*<script>.*?</script>\s*', '', site, count=1, flags=re.S)
site = re.sub(r'<title>[^<]*</title>', '<title>Liberty Tool Company</title>', site, count=1)

# the live home page must be indexable (option-2 carries the preview's noindex tag)
SITE_URL = 'https://libertytoolcompany.com'
site = re.sub(r'<meta name="robots"[^>]*>\s*', '', site)
if 'rel="canonical"' not in site:
    site = re.sub(r'(</title>)', r'\1\n<link rel="canonical" href="' + SITE_URL + '/">', site, count=1)

# placeholder reviews stay off the release site
if "[Approved" in site:
    site = re.sub(r'<!-- REVIEWS -->\s*<section id="reviews".*?</section>\s*', '', site, count=1, flags=re.S)

redirect = ("<script>if(/^partner\\./.test(location.hostname)){location.replace('/partner-portal/option-2/');}</script>")
site = site.replace('<meta charset="utf-8">', '<meta charset="utf-8">' + redirect, 1)

# Google Tag Manager (GA4 is set up inside the container). Release only, so preview
# traffic stays out of the data; skipped on partner.* (portal mockups).
GTM_ID = 'GTM-N4DHV9J6'
gtm_head = ("<!-- Google Tag Manager --><script>if(!/^partner\\./.test(location.hostname)){"
            "(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});"
            "var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;"
            "j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);"
            "})(window,document,'script','dataLayer','" + GTM_ID + "');}</script><!-- End Google Tag Manager -->")
gtm_body = ('<!-- Google Tag Manager (noscript) --><noscript><iframe src="https://www.googletagmanager.com/ns.html?id='
            + GTM_ID + '" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>'
            '<!-- End Google Tag Manager (noscript) -->')

def add_gtm(html):
    if GTM_ID in html:
        return html
    html = re.sub(r'(<head[^>]*>)', lambda m: m.group(1) + gtm_head, html, count=1)
    return re.sub(r'(<body[^>]*>)', lambda m: m.group(1) + gtm_body, html, count=1)

site = add_gtm(site)
(pub / 'index.html').write_text(site)
for page in ('privacy', 'terms', 'ambassador-terms'):
    p = pub / page / 'index.html'
    p.write_text(add_gtm(p.read_text()))
(pub / 'option-2' / 'index.html').write_text(
    '<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex">'
    '<script>location.replace("/"+location.hash);</script>'
    '<meta http-equiv="refresh" content="0; url=/"><link rel="canonical" href="/"><a href="/">Continue</a>\n')
import datetime
today = datetime.date.today().isoformat()
(pub / 'robots.txt').write_text('User-agent: *\nAllow: /\nDisallow: /admin/\n\nSitemap: ' + SITE_URL + '/sitemap.xml\n')
(pub / 'sitemap.xml').write_text(
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + ''.join('  <url><loc>%s%s</loc><lastmod>%s</lastmod></url>\n' % (SITE_URL, path, today)
              for path in ('/', '/privacy/', '/terms/', '/ambassador-terms/'))
    + '</urlset>\n')
assert 'noindex' not in site, 'release home page must not be noindex'
print('release build: home page =', len(site), 'bytes; reviews', 'removed' if 'id="reviews"' not in site else 'kept')
