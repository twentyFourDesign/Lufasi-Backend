/**
 * One-off maintenance: normalize pod_images.imageUrl to relative /uploads/pods/...
 * and remove rows that point to files which do not exist on disk.
 *
 * Usage: node scripts/repair-pod-image-urls.js
 */
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const fs = require("fs");
const path = require("path");
const db = require("../src/models");
const uploadService = require("../src/services/uploadService");

async function main() {
  const images = await db.PodImage.findAll({ order: [["sortOrder", "ASC"]] });
  let updated = 0;
  let removed = 0;
  let unchanged = 0;

  for (const image of images) {
    const original = image.imageUrl;
    const relative = uploadService.normalizeToRelativePath(original);

    if (!relative) {
      console.log(`[remove] ${image.id} — unresolvable URL: ${original}`);
      await image.destroy();
      removed += 1;
      continue;
    }

    const diskPath = path.join(
      uploadService.UPLOADS_DIR,
      relative.replace(/^\/uploads\/?/, ""),
    );

    if (!fs.existsSync(diskPath)) {
      console.log(`[remove] ${image.id} — file missing: ${relative}`);
      await image.destroy();
      removed += 1;
      continue;
    }

    if (original !== relative) {
      await image.update({ imageUrl: relative });
      console.log(`[fix] ${image.id} — ${original} -> ${relative}`);
      updated += 1;
    } else {
      unchanged += 1;
    }
  }

  console.log(
    `\nDone. updated=${updated}, removed=${removed}, unchanged=${unchanged}, total=${images.length}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
