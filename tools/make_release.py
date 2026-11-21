"""Turn a checkout of main into the release site (run by tools/publish_release.sh).

- The website (option 2) becomes the home page at "/" and /option-2/ forwards there.
- The preview bar is removed.
- partner.* visitors to "/" go to the partner portal.
- The reviews section is left out while it still holds placeholder quotes.
- Google Tag Manager (GTM-N4DHV9J6) is added to the website, privacy, terms and ambassador-terms pages.
- The home page is indexable: the preview's robots noindex tag is removed and a canonical URL is added.
  Portal, admin and other mockup pages keep their noindex tags.
- Title, meta description, Open Graph/Twitter tags and Organization/WebSite JSON-LD are added to the home page.
- The Installer Academy section and its nav links are left out while its videos are still Coming Soon.
- robots.txt, sitemap.xml and llms.txt are written for the public pages.
- tools/prerender.mjs then renders the home page so crawlers get real HTML (see that file).
"""
import re, pathlib

pub = pathlib.Path(__file__).resolve().parent.parent / 'public'
site = (pub / 'option-2' / 'index.html').read_text()

# preview bar and its script
site = re.sub(r'<div id="ltc-preview-bar".*?</div>\s*</div>\s*<script>.*?</script>\s*', '', site, count=1, flags=re.S)
import json
TITLE = 'Jobsite Tools for Installers | Tape Caddy & LTC Trowels'
DESC = ('Liberty Tool Company makes the Tape Caddy, LTC trowels and Broadcast Strap for installers and dealers. Veteran-owned, made in the USA, ships from San Dimas, CA.')
site = re.sub(r'<title>[^<]*</title>', '<title>' + TITLE + '</title>', site, count=1)

# the live home page must be indexable (option-2 carries the preview's noindex tag)
SITE_URL = 'https://libertytoolcompany.com'
site = re.sub(r'<meta name="robots"[^>]*>\s*', '', site)
if 'rel="canonical"' not in site:
    site = re.sub(r'(</title>)', r'\1\n<link rel="canonical" href="' + SITE_URL + '/">', site, count=1)

# search and social metadata + Organization / WebSite structured data
# (FAQPage and Product data are added by tools/prerender.mjs from the page's own data)
OG_IMG = SITE_URL + '/assets/og-home.jpg'
org = {
    '@context': 'https://schema.org',
    '@graph': [
        {
            '@type': 'Organization', '@id': SITE_URL + '/#org',
            'name': 'Liberty Tool Company', 'alternateName': 'LTC',
            'legalName': 'Liberty Industrial Coating Systems Inc.',
            'url': SITE_URL + '/', 'logo': SITE_URL + '/assets/logo-blue.png', 'image': OG_IMG,
            'description': DESC, 'slogan': 'For Installers. By Installers.',
            'email': 'sales@libertytoolcompany.com', 'telephone': '+1-239-744-8403',
            'address': {'@type': 'PostalAddress', 'streetAddress': '712 W. Cienega Ave, Unit A',
                        'addressLocality': 'San Dimas', 'addressRegion': 'CA', 'postalCode': '91773',
                        'addressCountry': 'US'},
            'contactPoint': {'@type': 'ContactPoint', 'contactType': 'sales', 'telephone': '+1-239-744-8403',
                             'email': 'sales@libertytoolcompany.com', 'areaServed': 'Worldwide',
                             'availableLanguage': 'English'},
            'areaServed': 'Worldwide',
            'knowsAbout': ['Tape Caddy', 'cove trowels', 'floor coating tools', 'jobsite tools for installers'],
            'brand': {'@type': 'Brand', 'name': 'The Tape Caddy'},
            'sameAs': ['https://www.instagram.com/liberty_tool_company/'],
        },
        {'@type': 'WebSite', '@id': SITE_URL + '/#site', 'url': SITE_URL + '/', 'name': 'Liberty Tool Company',
         'publisher': {'@id': SITE_URL + '/#org'}, 'inLanguage': 'en-US'},
    ],
}
head_meta = (
    '<meta name="description" content="' + DESC + '">\n'
    '<meta property="og:type" content="website">\n'
    '<meta property="og:site_name" content="Liberty Tool Company">\n'
    '<meta property="og:title" content="' + TITLE + '">\n'
    '<meta property="og:description" content="' + DESC + '">\n'
    '<meta property="og:url" content="' + SITE_URL + '/">\n'
    '<meta property="og:image" content="' + OG_IMG + '">\n'
    '<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n'
    '<meta property="og:image:alt" content="Liberty Tool Company founders Brandon and Dick Szymanski">\n'
    '<meta property="og:locale" content="en_US">\n'
    '<meta name="twitter:card" content="summary_large_image">\n'
    '<meta name="twitter:title" content="' + TITLE + '">\n'
    '<meta name="twitter:description" content="' + DESC + '">\n'
    '<meta name="twitter:image" content="' + OG_IMG + '">\n'
    '<script type="application/ld+json">' + json.dumps(org, separators=(',', ':')) + '</script>\n'
)
if 'name="description"' not in site:
    site = re.sub(r'(<link rel="canonical"[^>]*>)', lambda m: m.group(1) + '\n' + head_meta, site, count=1)

# Installer Academy stays off the release site while its videos are still Coming Soon
if '>Coming Soon</span>' in site:
    site = re.sub(r'<!-- ACADEMY -->\s*<section id="academy".*?</section>\s*', '', site, count=1, flags=re.S)
    site = re.sub(r'\s*<a href="#academy"[^>]*>[^<]*</a>', '', site)

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
(pub / 'llms.txt').write_text("""# Liberty Tool Company

> Liberty Tool Company (LTC) is a veteran-owned, family-operated maker of jobsite tools for flooring and coating installers, dealers and enterprise buyers. Tools include the Tape Caddy, LTC trowels, the Broadcast Strap and Crew Kits. Made in the USA and shipped from San Dimas, CA, to all 50 states and worldwide.

- Legal name: Liberty Industrial Coating Systems Inc. d/b/a Liberty Tool Company
- Address: 712 W. Cienega Ave, Unit A, San Dimas, CA 91773
- Phone (text or call 24/7): 239-744-8403
- Email: sales@libertytoolcompany.com
- Veteran-Owned · Family-Operated · Made In The USA
- Slogan: For Installers. By Installers.
- Instagram: https://www.instagram.com/liberty_tool_company/

## Our Story

Liberty Tool Company was founded by Dick Szymanski, a veteran, and his son Brandon. They have put down floors side by side in Southern California for more than ten years, and when the tools they needed didn't exist, they built them. Mission: help installers build better businesses.

## Pages

- [Home](""" + SITE_URL + """/): products, Tape Caddy sizes and Crew Kits, Tool Finder, dealer and company accounts, where we ship, FAQ
- [Ambassador Terms](""" + SITE_URL + """/ambassador-terms/): Affiliate & Brand Ambassador program ($10 per eligible Tape Caddy, paid monthly)
- [Privacy Policy](""" + SITE_URL + """/privacy/)
- [Terms & Conditions](""" + SITE_URL + """/terms/)

## Products and prices (USD, retail)

- The Tape Caddy holds masking tape at one fixed height so every line matches: Lowboy Caddy (4 mm) $89, 2-Inch Caddy $89, 4-Inch Caddy $99, 6-Inch Caddy $119
- Crew Kits: Cove System (4-Inch + 6-Inch) $205, Double Down Duo (Lowboy + 4-Inch) $180, Triple Threat (Lowboy, 4-Inch, 6-Inch) $295, 4-Score Complete Kit (all four) $389
- LTC trowels: 6" Snub Flat Hanging Trowel $39.99, 4" Standard Cove Trowel $28.99, 4" Standard Cove Trowel w/ 45° Taper $31.99, 6" Standard Cove Trowel $29.99, 6" Standard Cove Trowel w/ 45° Taper $32.99, 2" Cant Cove Trowel $34.99, 2" Cant Cove Trowel w/ 45° Taper $39.99, 8" Marginal Trowel $23.99, Patch Hawk $39.99
- Broadcast Strap $64.99: for even broadcasting of flake and aggregate
- Dealers, distributors and company accounts buy at partner pricing; contact sales@libertytoolcompany.com or 239-744-8403
""")
assert 'noindex' not in site, 'release home page must not be noindex'
print('release build: home page =', len(site), 'bytes; reviews', 'removed' if 'id="reviews"' not in site else 'kept')
