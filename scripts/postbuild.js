import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const distDir = path.resolve(rootDir, "dist");
const assetsDir = path.join(distDir, "assets");

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

let jsFile = "";
let cssFile = "";

if (fs.existsSync(assetsDir)) {
  const files = fs.readdirSync(assetsDir);
  jsFile = files.find((f) => f.startsWith("index-") && f.endsWith(".js")) || "";
  cssFile = files.find((f) => f.startsWith("styles-") && f.endsWith(".css")) || "";
}

// Copy favicon and robots if in public
const publicDir = path.resolve(rootDir, "public");
if (fs.existsSync(publicDir)) {
  for (const item of fs.readdirSync(publicDir)) {
    const src = path.join(publicDir, item);
    const dest = path.join(distDir, item);
    if (!fs.existsSync(dest)) {
      fs.copyFileSync(src, dest);
    }
  }
}

const htmlContent = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Podium</title>
    <meta
      name="description"
      content="Central operating system for tracking speaking opportunities, conferences, awards, and submissions."
    />
    <meta property="og:title" content="Podium" />
    <meta
      property="og:description"
      content="Central operating system for tracking speaking opportunities, conferences, awards, and submissions."
    />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />
    <link rel="icon" href="/favicon.ico" type="image/x-icon" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap"
    />
    ${cssFile ? `<link rel="stylesheet" href="/assets/${cssFile}" />` : ""}
  </head>
  <body>
    <div id="root"></div>
    ${jsFile ? `<script type="module" src="/assets/${jsFile}"></script>` : ""}
  </body>
</html>
`;

fs.writeFileSync(path.join(distDir, "index.html"), htmlContent);
console.log("Postbuild completed: generated dist/index.html with assets.");
