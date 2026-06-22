const uploadService = require("../services/uploadService");

function sortPodImages(images = []) {
  return [...images].sort((a, b) => {
    if (Boolean(a.isPrimary) !== Boolean(b.isPrimary)) {
      return a.isPrimary ? -1 : 1;
    }
    return (a.sortOrder || 0) - (b.sortOrder || 0);
  });
}

function formatPodImage(image) {
  if (!image) return image;
  const json = typeof image.toJSON === "function" ? image.toJSON() : image;
  return uploadService.formatImageRecord(json);
}

function formatPodWithImages(pod) {
  if (!pod) return pod;
  const json = typeof pod.toJSON === "function" ? pod.toJSON() : pod;
  return {
    ...json,
    images: sortPodImages(json.images || []).map(formatPodImage),
  };
}

function getPrimaryPodImageUrl(pod) {
  const images = sortPodImages(pod?.images || []);
  const primary = images[0];
  if (!primary?.imageUrl) return null;
  return uploadService.toFullUrl(primary.imageUrl);
}

module.exports = {
  sortPodImages,
  formatPodImage,
  formatPodWithImages,
  getPrimaryPodImageUrl,
};
