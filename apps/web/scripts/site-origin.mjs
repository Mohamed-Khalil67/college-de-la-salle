// The public address of the site this build is for: PUBLIC_WEB_URL when the build is given one (the Docker image
// takes it from deploy/.env), else the pack's profile.json `siteUrl`. Used by select-school.mjs (written into the
// generated profile, read by SiteHead for the absolute canonical and hreflang links) and by seo-files.mjs
// (robots.txt, sitemap.xml), so both always agree.
export function siteOrigin(profile) {
  const override = (process.env.PUBLIC_WEB_URL ?? '').trim().replace(/\/+$/, '');
  return override || profile.siteUrl;
}
