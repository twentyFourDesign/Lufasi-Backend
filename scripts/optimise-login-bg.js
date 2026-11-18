// One-off: convert the existing uploads/branding/admin-login-bg.png into an optimised
// admin-login-bg.webp (max 1920px wide). Safe to re-run. Original png is moved to backup/.
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const dir = path.join(__dirname, "../uploads/branding");
const png = path.join(dir, "admin-login-bg.png");
const webp = path.join(dir, "admin-login-bg.webp");

(async () => {
    if (!fs.existsSync(png)) {
        console.log("No admin-login-bg.png found — nothing to do.");
        return;
    }
    const before = fs.statSync(png).size;
    await sharp(png).rotate().resize({ width: 1920, withoutEnlargement: true }).webp({ quality: 80 }).toFile(webp);
    const backup = path.join(dir, "backup");
    fs.mkdirSync(backup, { recursive: true });
    fs.renameSync(png, path.join(backup, `admin-login-bg-${Date.now()}.png`));
    console.log(`Done: ${(before / 1024).toFixed(0)} KB png -> ${(fs.statSync(webp).size / 1024).toFixed(0)} KB webp`);
})().catch((e) => { console.error(e); process.exit(1); });
