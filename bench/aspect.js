'use strict';
// Aspect group of an image by its (reference) size: portrait (h > w), landscape (w > h), square (equal).
function aspectGroup(w, h) {
  return h > w ? 'portrait' : w > h ? 'landscape' : 'square';
}
module.exports = { aspectGroup };
